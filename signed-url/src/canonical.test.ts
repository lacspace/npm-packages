import { describe, test, expect } from "vitest";
import { createHmac } from "node:crypto";
import { signUrl, verifyUrl, signSecureUrl, verifySecureUrl } from "./index";

const secret = "k";
const NOW = 1_800_000_000;
// A link whose `name` the user chose. Decoding %26/%3D must not let it become two parameters.
const base = "https://files.example.com/dl?uid=7&name=" + encodeURIComponent("x&role=admin");
const forge = (signed: string) => signed.replace("name=x%26role%3Dadmin", "name=x&role=admin");

describe("query canonicalisation", () => {
  test("a value containing & and = cannot be split into extra parameters (signUrl)", async () => {
    const signed = await signUrl(base, { secret, expiresIn: 600, now: NOW });
    expect((await verifyUrl(signed, { secret, now: NOW })).valid).toBe(true);
    expect(await verifyUrl(forge(signed), { secret, now: NOW })).toMatchObject({ valid: false, reason: "bad-signature" });
  });

  test("the same holds for signSecureUrl", async () => {
    const signed = await signSecureUrl(base, { secret, expiresIn: 600, now: NOW });
    expect((await verifySecureUrl(signed, { secret, now: NOW })).valid).toBe(true);
    expect((await verifySecureUrl(forge(signed), { secret, now: NOW })).valid).toBe(false);
  });

  test("the signature covers the percent-encoded query (checked with node:crypto)", async () => {
    const signed = await signUrl("https://a.example/p?b=2&a=x%26y", { secret });
    const expected = createHmac("sha256", secret).update("https://a.example/p?a=x%26y&b=2").digest("base64url");
    expect(new URL(signed).searchParams.get("sig")).toBe(expected);
  });

  test("ordinary links, parameter order and Unicode still verify", async () => {
    const signed = await signUrl("https://a.example/f?z=1&a=héllo wörld&m=a+b", { secret, expiresIn: 60, now: NOW });
    const u = new URL(signed);
    const reordered = `${u.origin}${u.pathname}?${[...u.searchParams].reverse().map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}`;
    expect((await verifyUrl(reordered, { secret, now: NOW })).valid).toBe(true);
  });

  // Built exactly the way 1.1.x did: decoded values joined as-is.
  const legacyLink = (query: Record<string, string>) => {
    const url = new URL("https://a.example/f");
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const canon = [...url.searchParams].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join("&");
    url.searchParams.set("sig", createHmac("sha256", secret).update(`${url.origin}${url.pathname}?${canon}`).digest("base64url"));
    return url.toString();
  };

  test("pre-1.2.0 links with plain values still verify; their string is unchanged", async () => {
    const link = legacyLink({ uid: "7", file: "report-2026.pdf", exp: String(NOW + 60) });
    expect((await verifyUrl(link, { secret, now: NOW })).valid).toBe(true);
  });

  test("pre-1.2.0 links whose values need encoding need acceptLegacySignatures", async () => {
    const link = legacyLink({ uid: "7", name: "Q3 résumé.pdf", exp: String(NOW + 60) });
    expect((await verifyUrl(link, { secret, now: NOW })).valid).toBe(false);
    expect((await verifyUrl(link, { secret, now: NOW, acceptLegacySignatures: true })).valid).toBe(true);
    expect((await verifySecureUrl(link, { secret, now: NOW, acceptLegacySignatures: true })).valid).toBe(true);
  });
});
