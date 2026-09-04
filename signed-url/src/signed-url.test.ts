import { test, expect } from "vitest";
import { sign, verify, signUrl, verifyUrl } from "./index";

const secret = "link-secret";

test("token sign → verify roundtrip", async () => {
  const token = await sign({ userId: 42, action: "reset" }, { secret });
  const r = await verify<{ userId: number; action: string }>(token, { secret });
  expect(r.valid).toBe(true);
  expect(r.data?.userId).toBe(42);
  expect(r.data?.action).toBe("reset");
});

test("tampered token payload fails signature", async () => {
  const token = await sign({ userId: 42 }, { secret });
  const [payload, sig] = token.split(".");
  // Flip a character in the payload; signature no longer matches.
  const bad = `${payload!.slice(0, -1)}${payload!.endsWith("A") ? "B" : "A"}.${sig}`;
  const r = await verify(bad, { secret });
  expect(r.valid).toBe(false);
  expect(r.reason).toBe("bad-signature");
});

test("wrong secret fails", async () => {
  const token = await sign({ a: 1 }, { secret });
  const r = await verify(token, { secret: "other" });
  expect(r.valid).toBe(false);
  expect(r.reason).toBe("bad-signature");
});

test("expired token fails", async () => {
  const token = await sign({ a: 1 }, { secret, expiresAt: 1000 });
  const r = await verify(token, { secret, now: 2000 });
  expect(r.valid).toBe(false);
  expect(r.reason).toBe("expired");
  // Not-yet-expired verifies.
  expect((await verify(token, { secret, now: 500 })).valid).toBe(true);
});

test("signed URL roundtrip; tamper & expiry", async () => {
  const link = await signUrl("https://cdn.me/files/report.pdf?uid=42", { secret, expiresAt: 5000 });
  expect((await verifyUrl(link, { secret, now: 1000 })).valid).toBe(true);

  // Tamper a query param → signature breaks.
  const tampered = link.replace("uid=42", "uid=99");
  expect((await verifyUrl(tampered, { secret, now: 1000 })).valid).toBe(false);

  // Past expiry.
  const late = await verifyUrl(link, { secret, now: 9999 });
  expect(late.valid).toBe(false);
  expect(late.reason).toBe("expired");
});

test("URL query-param order does not affect verification", async () => {
  const link = await signUrl("https://cdn.me/x?b=2&a=1", { secret });
  const u = new URL(link);
  const sig = u.searchParams.get("sig")!;
  // Rebuild with reordered params.
  const reordered = `https://cdn.me/x?a=1&b=2&sig=${encodeURIComponent(sig)}`;
  expect((await verifyUrl(reordered, { secret })).valid).toBe(true);
});
