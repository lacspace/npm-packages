import { beforeAll, describe, expect, it } from "vitest";
import {
  canonicalizeBody,
  canonicalizeHeader,
  chunkTxt,
  dkimDnsRecord,
  DkimError,
  ed25519SeedToPkcs8,
  generateKeyPair,
  parseDkimKey,
  parseDkimSignature,
  signHeader,
  signMessage,
  stripSignatureValue,
  toPem,
  verifyMessage,
  type DkimKeyPair,
  type ResolveTxt,
} from "./index";

// ---------- helpers ----------

type Zone = Record<string, string | string[]>;
function fakeDns(zone: Zone): ResolveTxt {
  return async (name) => {
    if (name === "servfail._domainkey.example.com") {
      throw Object.assign(new Error("queryTxt ESERVFAIL"), { code: "ESERVFAIL" });
    }
    const rec = zone[name.toLowerCase()];
    if (rec === undefined) throw Object.assign(new Error(`queryTxt ENOTFOUND ${name}`), { code: "ENOTFOUND" });
    return [Array.isArray(rec) ? rec : [rec]];
  };
}

function b64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

const MSG =
  "From: Joe SixPack <joe@football.example.com>\r\n" +
  "To: Suzie Q <suzie@shopping.example.net>\r\n" +
  "Subject: Is dinner ready?\r\n" +
  "Date: Fri, 11 Jul 2003 21:00:37 -0700 (PDT)\r\n" +
  "Message-ID: <20030712040037.46341.5F8J@football.example.com>\r\n" +
  "\r\n" +
  "Hi.\r\n" +
  "\r\n" +
  "We lost the game.  Are you hungry yet?\r\n" +
  "\r\n" +
  "Joe.\r\n";

let rsa: DkimKeyPair;
let ed: DkimKeyPair;
let zone: Zone;
let dns: ResolveTxt;

beforeAll(async () => {
  rsa = await generateKeyPair({ algorithm: "rsa-sha256", modulusLength: 2048, selector: "rsa", domain: "football.example.com" });
  ed = await generateKeyPair({ algorithm: "ed25519-sha256", selector: "ed", domain: "football.example.com" });
  zone = {
    [rsa.dnsRecord.name]: rsa.dnsRecord.chunks,
    [ed.dnsRecord.name]: ed.dnsRecord.chunks,
  };
  dns = fakeDns(zone);
});

const signRsa = (raw: string, extra: Record<string, unknown> = {}) =>
  signMessage(raw, { domain: "football.example.com", selector: "rsa", privateKey: rsa.privateKeyPem, ...extra });

// ---------- RFC 6376 §3.4.6 canonicalization example ----------

describe("canonicalization (RFC 6376 §3.4.6 example)", () => {
  // Header: "A: X\r\nB : Y\t\r\n\tZ  \r\n"   Body: " C \r\nD \t E\r\n\r\n\r\n"
  const body = " C \r\nD \t E\r\n\r\n\r\n";

  it("relaxed header", () => {
    expect(canonicalizeHeader("A", " X", "relaxed")).toBe("a:X\r\n");
    expect(canonicalizeHeader("B ", " Y\t\r\n\tZ  ", "relaxed")).toBe("b:Y Z\r\n");
  });

  it("simple header (unchanged)", () => {
    expect(canonicalizeHeader("A", " X", "simple")).toBe("A: X\r\n");
    expect(canonicalizeHeader("B ", " Y\t\r\n\tZ  ", "simple")).toBe("B : Y\t\r\n\tZ  \r\n");
  });

  it("relaxed body", () => {
    expect(canonicalizeBody(body, "relaxed")).toBe(" C\r\nD E\r\n");
  });

  it("simple body", () => {
    expect(canonicalizeBody(body, "simple")).toBe(" C \r\nD \t E\r\n");
  });

  it("empty body: simple → CRLF, relaxed → empty", () => {
    expect(canonicalizeBody("", "simple")).toBe("\r\n");
    expect(canonicalizeBody("\r\n\r\n", "simple")).toBe("\r\n");
    expect(canonicalizeBody("", "relaxed")).toBe("");
    expect(canonicalizeBody("\r\n \r\n", "relaxed")).toBe("");
  });

  it("adds a missing final CRLF and normalises bare LF", () => {
    expect(canonicalizeBody("a\nb", "simple")).toBe("a\r\nb\r\n");
    expect(canonicalizeBody("a  b\t\n", "relaxed")).toBe("a b\r\n");
  });

  it("length truncation (l=)", () => {
    expect(canonicalizeBody("Hello world\r\n", "relaxed", 5)).toBe("Hello");
    expect(canonicalizeBody("Hi\r\n", "relaxed", 100)).toBe("Hi\r\n");
  });

  it("relaxed header lower-cases the name only", () => {
    expect(canonicalizeHeader("SUBJECT", "  Mixed   CASE  ", "relaxed")).toBe("subject:Mixed CASE\r\n");
  });
});

// ---------- parsing ----------

describe("parsing", () => {
  it("parses a folded DKIM-Signature", () => {
    const s = parseDkimSignature(
      " v=1; a=rsa-sha256; c=relaxed;\r\n d=Example.COM; s=sel; t=100; x=200;\r\n h=From : To :\r\n Subject; l=10;\r\n bh=abc\r\n def=; b=AAA\r\n BBB",
    );
    expect(s.domain).toBe("example.com");
    expect(s.canonicalization).toEqual({ header: "relaxed", body: "simple" });
    expect(s.headers).toEqual(["from", "to", "subject"]);
    expect(s.bodyHash).toBe("abcdef=");
    expect(s.signature).toBe("AAABBB");
    expect(s.identity).toBe("@example.com");
    expect([s.timestamp, s.expires, s.bodyLength]).toEqual([100, 200, 10]);
  });

  it("rejects duplicate tags and missing required tags", () => {
    expect(() => parseDkimSignature("v=1; a=rsa-sha256; a=rsa-sha256; b=; bh=; d=x; h=from; s=s")).toThrow(DkimError);
    expect(() => parseDkimSignature("v=1; a=rsa-sha256; d=x; h=from; s=s")).toThrow(/b=/);
  });

  it("joins TXT records split into several strings", () => {
    const k = parseDkimKey(["v=DKIM1; k=rsa; p=MIIBIj", "ANBgkq"]);
    expect(k.publicKey).toBe("MIIBIjANBgkq");
    expect(k.keyType).toBe("rsa");
  });

  it("detects a revoked key and flags", () => {
    const k = parseDkimKey("v=DKIM1; k=ed25519; t=y:s; p=");
    expect(k.revoked).toBe(true);
    expect(k.testing).toBe(true);
    expect(k.strict).toBe(true);
  });

  it("strips the b= value but keeps the tag name (and leaves bh= alone)", () => {
    expect(stripSignatureValue(" v=1; bh=XYZ=; b=abc\r\n def")).toBe(" v=1; bh=XYZ=; b=");
    expect(stripSignatureValue(" b = abc ; d=x")).toBe(" b =; d=x");
  });
});

// ---------- RFC 8463 Appendix A test vector ----------

describe("RFC 8463 Appendix A", () => {
  const RFC8463 =
    "DKIM-Signature: v=1; a=ed25519-sha256; c=relaxed/relaxed;\r\n" +
    " d=football.example.com; i=@football.example.com;\r\n" +
    " q=dns/txt; s=brisbane; t=1528637909; h=from : to :\r\n" +
    " subject : date : message-id : from : subject : date;\r\n" +
    " bh=2jUSOH9NhtVGCQWNr9BrIAPreKQjO6Sn7XIkfJVOzv8=;\r\n" +
    " b=/gCrinpcQOoIfuHNQIbq4pgh9kyIK3AQUdt9OdqQehSwhEIug4D11Bus\r\n" +
    " Fa3bT3FY5OsU7ZbnKELq+eXdp1Q1Dw==\r\n" +
    "DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed;\r\n" +
    " d=football.example.com; i=@football.example.com;\r\n" +
    " q=dns/txt; s=test; t=1528637909; h=from : to : subject :\r\n" +
    " date : message-id : from : subject : date;\r\n" +
    " bh=2jUSOH9NhtVGCQWNr9BrIAPreKQjO6Sn7XIkfJVOzv8=;\r\n" +
    " b=F45dVWDfMbQDGHJFlXUNB2HKfbCeLRyhDXgFpEL8GwpsRe0IeIixNTe3\r\n" +
    " DhCVlUrSjV4BwcVcOF6+FF3Zo9Rpo1tFOeS9mPYQTnGdaSGsgeefOsk2Jz\r\n" +
    " dA+L10TeYt9BgDfQNZtKdN1WO//KgIqXP7OdEFE4LjFYNcUxZQ4FADY+8=\r\n" +
    MSG;
  const rfcDns = fakeDns({
    "brisbane._domainkey.football.example.com": "v=DKIM1; k=ed25519; p=11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=",
    "test._domainkey.football.example.com": [
      "v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDkHlOQoBTzWRiGs5V6NpP3idY6Wk08a5qhdR6wy5bdOKb2jLQiY/",
      "J16JYi0Qvx/byYzCNb3W91y3FutACDfzwQ/BC/e/8uBsCR+yz1Lxj+PL6lHvqMKrM3rG4hstT5QjvHO9PzoxZyVYLzBfO2EeC3Ip3G+2kryOTIKT+l/K4w3QIDAQAB",
    ],
  });
  const now = 1528637909 * 1000 + 60_000;

  it("Ed25519 signature passes", async () => {
    const r = await verifyMessage(RFC8463, { resolveTxt: rfcDns, now });
    const e = r.results.find((x) => x.algorithm === "ed25519-sha256")!;
    expect(e.reason).toBeUndefined();
    expect(e).toMatchObject({ status: "pass", bodyHashOk: true, keyBits: 256, aligned: true, selector: "brisbane" });
  });

  it("RSA (1024-bit) signature passes", async () => {
    const r = await verifyMessage(RFC8463, { resolveTxt: rfcDns, now });
    const e = r.results.find((x) => x.algorithm === "rsa-sha256")!;
    expect(e).toMatchObject({ status: "pass", keyBits: 1024 });
    expect(r.pass).toBe(true);
    expect(r.fromDomain).toBe("football.example.com");
  });

  it("RFC private key derives the published public key and its DNS record", async () => {
    const seed = Uint8Array.from(Buffer.from("nWGxne/9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A=", "base64"));
    const subtle = globalThis.crypto.subtle;
    const priv = await subtle.importKey("pkcs8", ed25519SeedToPkcs8(seed) as BufferSource, { name: "Ed25519" }, true, ["sign"]);
    const jwk = await subtle.exportKey("jwk", priv);
    const pub = await subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: jwk.x! }, { name: "Ed25519" }, true, ["verify"]);
    const rec = await dkimDnsRecord(pub, { selector: "brisbane", domain: "football.example.com" });
    expect(rec.value).toBe("v=DKIM1; k=ed25519; p=11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=");

    // Re-sign the RFC message with the RFC key and verify it against the RFC DNS record.
    const pem = toPem("PRIVATE KEY", ed25519SeedToPkcs8(seed));
    const signed = await signMessage(MSG, {
      domain: "football.example.com",
      selector: "brisbane",
      privateKey: pem,
      time: 1528637909000,
    });
    const v = await verifyMessage(signed, { resolveTxt: rfcDns, now });
    expect(v.results[0]!.status).toBe("pass");
    expect(signed).toContain("bh=2jUSOH9NhtVGCQWNr9BrIAPreKQjO6Sn7XIkfJVOzv8=");
  });

  it("tampering with the RFC message fails both signatures", async () => {
    const r = await verifyMessage(RFC8463.replace("Is dinner ready?", "Is lunch ready?"), { resolveTxt: rfcDns, now });
    expect(r.results.map((x) => x.status)).toEqual(["fail", "fail"]);
    expect(r.pass).toBe(false);
  });
});

// ---------- sign → verify ----------

describe("sign and verify round trips", () => {
  it("RSA-2048 relaxed/relaxed", async () => {
    const signed = await signRsa(MSG);
    const r = await verifyMessage(signed, { resolveTxt: dns });
    expect(r.pass).toBe(true);
    expect(r.results[0]).toMatchObject({
      status: "pass",
      algorithm: "rsa-sha256",
      keyBits: 2048,
      aligned: true,
      canonicalization: "relaxed/relaxed",
      bodyHashOk: true,
    });
    expect(r.results[0]!.signedHeaders).toEqual(["from", "to", "subject", "date", "message-id", "from"]);
  });

  it("Ed25519", async () => {
    const signed = await signMessage(MSG, { domain: "football.example.com", selector: "ed", privateKey: ed.privateKeyPem });
    expect(signed).toMatch(/a=ed25519-sha256/);
    const r = await verifyMessage(signed, { resolveTxt: dns });
    expect(r.results[0]).toMatchObject({ status: "pass", keyBits: 256 });
  });

  it("simple/simple", async () => {
    const signed = await signRsa(MSG, { headerCanon: "simple", bodyCanon: "simple" });
    const r = await verifyMessage(signed, { resolveTxt: dns });
    expect(r.results[0]).toMatchObject({ status: "pass", canonicalization: "simple/simple" });
  });

  it("accepts a CryptoKey and signHeader returns only the header", async () => {
    const key = await globalThis.crypto.subtle.importKey(
      "pkcs8",
      Buffer.from(rsa.privateKeyPem.replace(/-----[^-]+-----|\s/g, ""), "base64"),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const h = await signHeader(MSG, { domain: "football.example.com", selector: "rsa", privateKey: key });
    expect(h.startsWith("DKIM-Signature: v=1; a=rsa-sha256;")).toBe(true);
    expect(h.endsWith("\r\n")).toBe(false);
    for (const line of h.split("\r\n")) expect(line.length).toBeLessThanOrEqual(78);
    const r = await verifyMessage(h + "\r\n" + MSG, { resolveTxt: dns });
    expect(r.pass).toBe(true);
  });

  it("t= and x= tags", async () => {
    const signed = await signRsa(MSG, { time: 1_700_000_000_000, expiresInSec: 3600 });
    expect(signed).toMatch(/t=1700000000;/);
    expect(signed).toMatch(/x=1700003600;/);
    const ok = await verifyMessage(signed, { resolveTxt: dns, now: 1_700_000_100_000 });
    expect(ok.results[0]!.status).toBe("pass");
    const expired = await verifyMessage(signed, { resolveTxt: dns, now: 1_700_004_000_000 });
    expect(expired.results[0]).toMatchObject({ status: "fail", reason: "signature expired (x=)" });
  });

  it("timestamp in the future beyond tolerance → policy", async () => {
    const signed = await signRsa(MSG, { time: 1_700_001_000_000 });
    const within = await verifyMessage(signed, { resolveTxt: dns, now: 1_700_000_900_000 });
    expect(within.results[0]!.status).toBe("pass");
    const r = await verifyMessage(signed, { resolveTxt: dns, now: 1_700_000_000_000 });
    expect(r.results[0]!.status).toBe("policy");
  });

  it("keeps LF line endings when the input uses them", async () => {
    const lf = MSG.replace(/\r\n/g, "\n");
    const signed = await signRsa(lf);
    expect(signed.includes("\r")).toBe(false);
    const r = await verifyMessage(signed, { resolveTxt: dns });
    expect(r.pass).toBe(true);
  });

  it("i= identity, and refuses one outside d=", async () => {
    const signed = await signRsa(MSG, { identity: "joe@mail.football.example.com" });
    const r = await verifyMessage(signed, { resolveTxt: dns });
    expect(r.results[0]).toMatchObject({ status: "pass", identity: "joe@mail.football.example.com" });
    await expect(signRsa(MSG, { identity: "joe@evil.example" })).rejects.toThrow(DkimError);
  });

  it("UTF-8 content signs and verifies byte-exactly (string and Uint8Array)", async () => {
    const m = MSG.replace("Is dinner ready?", "=?UTF-8?Q?Kh=C4=81na?=").replace("Joe.", "नमस्ते — Joe.");
    const signed = await signRsa(m);
    expect((await verifyMessage(signed, { resolveTxt: dns })).pass).toBe(true);
    expect((await verifyMessage(new TextEncoder().encode(signed), { resolveTxt: dns })).pass).toBe(true);
  });
});

// ---------- tampering and canonicalization tolerance ----------

describe("tamper detection", () => {
  it("changed header → fail, body hash still ok", async () => {
    const signed = await signRsa(MSG);
    const r = await verifyMessage(signed.replace("Is dinner ready?", "Wire me money"), { resolveTxt: dns });
    expect(r.results[0]).toMatchObject({ status: "fail", bodyHashOk: true, reason: "signature did not verify" });
    expect(r.pass).toBe(false);
  });

  it("changed body → fail with body hash reason", async () => {
    const signed = await signRsa(MSG);
    const r = await verifyMessage(signed.replace("hungry", "angry"), { resolveTxt: dns });
    expect(r.results[0]).toMatchObject({ status: "fail", bodyHashOk: false, reason: "body hash did not verify" });
  });

  it("relaxed tolerates whitespace, refolding and header-name case", async () => {
    const signed = await signRsa(MSG);
    const mangled = signed
      .replace("Subject: Is dinner ready?", "subject:   Is dinner\r\n\tready?  ")
      .replace("We lost the game.  Are", "We lost the game.\t Are   ")
      .replace(/Joe\.\r\n$/, "Joe.\r\n\r\n\r\n");
    const r = await verifyMessage(mangled, { resolveTxt: dns });
    expect(r.results[0]!.status).toBe("pass");
  });

  it("simple does not tolerate whitespace changes", async () => {
    const signed = await signRsa(MSG, { headerCanon: "simple", bodyCanon: "simple" });
    const h = await verifyMessage(signed.replace("Subject: Is", "Subject:  Is"), { resolveTxt: dns });
    expect(h.results[0]!.status).toBe("fail");
    const b = await verifyMessage(signed.replace("game.  Are", "game. Are"), { resolveTxt: dns });
    expect(b.results[0]!.reason).toBe("body hash did not verify");
    // ...but trailing empty lines are still ignored under simple
    const t = await verifyMessage(signed + "\r\n\r\n", { resolveTxt: dns });
    expect(t.results[0]!.status).toBe("pass");
  });

  it("over-signed From: a prepended second From breaks the signature", async () => {
    const signed = await signRsa(MSG);
    const i = signed.indexOf("From:");
    const evil = signed.slice(0, i) + "From: ceo@football.example.com\r\n" + signed.slice(i);
    const r = await verifyMessage(evil, { resolveTxt: dns });
    expect(r.results[0]!.status).toBe("fail");
    expect(r.pass).toBe(false);
  });

  it("repeated headers in h= are taken bottom-up", async () => {
    const m = "X-Tag: one\r\n" + "X-Tag: two\r\n" + MSG;
    const signed = await signRsa(m, { headers: ["x-tag", "subject"] });
    expect(signed.replace(/\r\n /g, "")).toMatch(/h=from:x-tag:x-tag:subject:from;/);
    expect((await verifyMessage(signed, { resolveTxt: dns })).results[0]!.status).toBe("pass");
    // Swapping the order of the two instances changes the hash
    const swapped = signed.replace("X-Tag: one\r\nX-Tag: two", "X-Tag: two\r\nX-Tag: one");
    expect((await verifyMessage(swapped, { resolveTxt: dns })).results[0]!.status).toBe("fail");
    // Adding a third X-Tag on top is fine (bottom two still selected)…
    const added = signed.replace("X-Tag: one", "X-Tag: zero\r\nX-Tag: one");
    expect((await verifyMessage(added, { resolveTxt: dns })).results[0]!.status).toBe("pass");
  });

  it("explicitly listed absent headers are protected from being added", async () => {
    const signed = await signRsa(MSG, { headers: ["reply-to"] });
    expect(signed.replace(/\r\n /g, "")).toMatch(/h=from:reply-to:from;/);
    const added = signed.replace("To: Suzie", "Reply-To: phish@evil.example\r\nTo: Suzie");
    expect((await verifyMessage(added, { resolveTxt: dns })).results[0]!.status).toBe("fail");
  });
});

// ---------- l= ----------

describe("body length l=", () => {
  it("content appended after l= still passes (with a reason); allowBodyLength:false → policy", async () => {
    const signed = await signRsa(MSG, { bodyLength: true });
    expect(signed).toMatch(/l=\d+;/);
    const appended = signed + "P.S. click here\r\n";
    const r = await verifyMessage(appended, { resolveTxt: dns });
    expect(r.results[0]!.status).toBe("pass");
    expect(r.results[0]!.reason).toMatch(/l=/);
    const strict = await verifyMessage(appended, { resolveTxt: dns, allowBodyLength: false });
    expect(strict.results[0]!.status).toBe("policy");
  });

  it("numeric l= truncates; a body shorter than l= fails", async () => {
    const signed = await signRsa(MSG, { bodyLength: 10 });
    expect(signed).toMatch(/l=10;/);
    expect((await verifyMessage(signed.replace("Joe.", "Bob."), { resolveTxt: dns })).results[0]!.status).toBe("pass");
    const cut = signed.replace(/\r\n\r\nHi\.[\s\S]*$/, "\r\n\r\nHi.\r\n");
    const r = await verifyMessage(cut, { resolveTxt: dns });
    expect(r.results[0]).toMatchObject({ status: "fail", reason: "l= is longer than the body" });
  });
});

// ---------- keys and DNS ----------

describe("key problems", () => {
  it("missing key → permerror; DNS failure → temperror", async () => {
    const signed = await signRsa(MSG);
    const r = await verifyMessage(signed, { resolveTxt: fakeDns({}) });
    expect(r.results[0]!.status).toBe("permerror");
    const empty = await verifyMessage(signed, { resolveTxt: async () => [] });
    expect(empty.results[0]!.status).toBe("permerror");
    const sf = await verifyMessage(signed.replace("s=rsa;", "s=servfail;").replace("d=football.example.com", "d=example.com"), {
      resolveTxt: dns,
    });
    expect(sf.results[0]!.status).toBe("temperror");
  });

  it("revoked key (empty p=) → permerror", async () => {
    const signed = await signRsa(MSG);
    const r = await verifyMessage(signed, { resolveTxt: fakeDns({ "rsa._domainkey.football.example.com": "v=DKIM1; k=rsa; p=" }) });
    expect(r.results[0]).toMatchObject({ status: "permerror", reason: "key revoked (empty p=)" });
  });

  it("RSA key shorter than 1024 bits → permerror", async () => {
    const subtle = globalThis.crypto.subtle;
    const pair = (await subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 512, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const signed = await signMessage(MSG, { domain: "football.example.com", selector: "weak", privateKey: pair.privateKey });
    const rec = await dkimDnsRecord(pair.publicKey, { selector: "weak", domain: "football.example.com" });
    const r = await verifyMessage(signed, { resolveTxt: fakeDns({ [rec.name]: rec.value }) });
    expect(r.results[0]!.status).toBe("permerror");
    expect(r.results[0]!.reason).toMatch(/too short \(512/);
    // A stricter floor rejects 2048 too
    const s2 = await signRsa(MSG);
    expect((await verifyMessage(s2, { resolveTxt: dns, minRsaBits: 4096 })).results[0]!.status).toBe("permerror");
  });

  it("rsa-sha1 → permerror (RFC 8301)", async () => {
    const signed = (await signRsa(MSG)).replace("a=rsa-sha256", "a=rsa-sha1");
    const r = await verifyMessage(signed, { resolveTxt: dns });
    expect(r.results[0]).toMatchObject({ status: "permerror", algorithm: "rsa-sha1" });
    expect(r.results[0]!.reason).toMatch(/8301/);
  });

  it("key type mismatch and h=sha1-only keys → permerror", async () => {
    const signed = await signRsa(MSG);
    const k = parseDkimKey(rsa.dnsRecord.value).publicKey;
    const wrongK = await verifyMessage(signed, {
      resolveTxt: fakeDns({ "rsa._domainkey.football.example.com": `v=DKIM1; k=ed25519; p=${k}` }),
    });
    expect(wrongK.results[0]!.reason).toMatch(/does not match/);
    const sha1Only = await verifyMessage(signed, {
      resolveTxt: fakeDns({ "rsa._domainkey.football.example.com": `v=DKIM1; h=sha1; k=rsa; p=${k}` }),
    });
    expect(sha1Only.results[0]!.status).toBe("permerror");
  });

  it("t=y on the key is reported as testing", async () => {
    const rec = await dkimDnsRecord(rsa.publicKeyPem, { selector: "rsa", domain: "football.example.com", testing: true });
    expect(rec.value).toMatch(/t=y;/);
    const r = await verifyMessage(await signRsa(MSG), { resolveTxt: fakeDns({ [rec.name]: rec.chunks }) });
    expect(r.results[0]).toMatchObject({ status: "pass", testing: true });
  });

  it("From missing from h= → permerror", async () => {
    const signed = (await signRsa(MSG)).replace(/h=from:/, "h=x-none:").replace(/:from;/, ":x-none;");
    const r = await verifyMessage(signed, { resolveTxt: dns });
    expect(r.results[0]).toMatchObject({ status: "permerror", reason: "From is not in h=" });
  });
});

// ---------- multiple signatures & alignment ----------

describe("multiple signatures and alignment", () => {
  it("evaluates each signature; one aligned pass is enough", async () => {
    const once = await signMessage(MSG, { domain: "football.example.com", selector: "ed", privateKey: ed.privateKeyPem });
    const twice = await signMessage(once, { domain: "football.example.com", selector: "nokey", privateKey: rsa.privateKeyPem });
    const r = await verifyMessage(twice, { resolveTxt: dns });
    expect(r.results.map((x) => [x.selector, x.status])).toEqual([
      ["nokey", "permerror"],
      ["ed", "pass"],
    ]);
    expect(r.pass).toBe(true);
  });

  it("maxSignatures caps the work", async () => {
    let m = MSG;
    for (let i = 0; i < 4; i++) m = await signRsa(m);
    expect((await verifyMessage(m, { resolveTxt: dns })).results).toHaveLength(4);
    expect((await verifyMessage(m, { resolveTxt: dns, maxSignatures: 2 })).results).toHaveLength(2);
  });

  it("d= parent of the From subdomain is aligned (relaxed)", async () => {
    const m = MSG.replace("joe@football.example.com>", "joe@news.football.example.com>");
    const r = await verifyMessage(await signRsa(m), { resolveTxt: dns });
    expect(r.fromDomain).toBe("news.football.example.com");
    expect(r.results[0]).toMatchObject({ status: "pass", aligned: true });
    expect(r.pass).toBe(true);
  });

  it("unrelated d= passes but is not aligned, so overall pass is false", async () => {
    const m = MSG.replace("joe@football.example.com>", "joe@bank.example.org>");
    const r = await verifyMessage(await signRsa(m), { resolveTxt: dns });
    expect(r.results[0]).toMatchObject({ status: "pass", aligned: false });
    expect(r.pass).toBe(false);
  });

  it("custom organizationalDomain is used for alignment", async () => {
    const m = MSG.replace("joe@football.example.com>", "joe@example.com>");
    const signed = await signRsa(m);
    const org = (d: string) => d.split(".").slice(-2).join(".");
    expect((await verifyMessage(signed, { resolveTxt: dns, organizationalDomain: org })).pass).toBe(true);
    expect((await verifyMessage(signed, { resolveTxt: dns, organizationalDomain: (d) => d })).pass).toBe(false);
  });

  it("no signature → empty results, pass false; malformed signature → permerror", async () => {
    expect(await verifyMessage(MSG, { resolveTxt: dns })).toMatchObject({ results: [], pass: false });
    const r = await verifyMessage("DKIM-Signature: v=1; d=x.com; s=a\r\n" + MSG, { resolveTxt: dns });
    expect(r.results[0]).toMatchObject({ status: "permerror", domain: "x.com", selector: "a" });
  });
});

// ---------- DNS records ----------

describe("DNS record helpers", () => {
  it("RSA-2048 record is chunked into ≤255-char strings", () => {
    const rec = rsa.dnsRecord;
    expect(rec.name).toBe("rsa._domainkey.football.example.com");
    expect(rec.type).toBe("TXT");
    expect(rec.value.startsWith("v=DKIM1; k=rsa; p=MIIB")).toBe(true);
    expect(rec.value.length).toBeGreaterThan(255);
    expect(rec.chunks.length).toBe(2);
    for (const c of rec.chunks) expect(c.length).toBeLessThanOrEqual(255);
    expect(rec.chunks.join("")).toBe(rec.value);
    expect(rec.zone).toMatch(/^rsa\._domainkey\.football\.example\.com\. IN TXT \( "v=DKIM1; k=rsa; p=.+" ".+" \)$/);
  });

  it("Ed25519 record publishes the raw 32-byte key", () => {
    const p = parseDkimKey(ed.dnsRecord.value);
    expect(p.keyType).toBe("ed25519");
    expect(Buffer.from(p.publicKey, "base64").length).toBe(32);
    expect(ed.dnsRecord.chunks).toHaveLength(1);
    expect(ed.privateKeyPem).toMatch(/^-----BEGIN PRIVATE KEY-----\n/);
  });

  it("placeholders when selector/domain are omitted; chunkTxt edge cases", async () => {
    const rec = await dkimDnsRecord(ed.publicKeyPem);
    expect(rec.name).toBe("<selector>._domainkey.<domain>");
    expect(chunkTxt("a".repeat(600)).map((c) => c.length)).toEqual([255, 255, 90]);
    expect(chunkTxt("")).toEqual([""]);
  });

  it("refuses modulusLength below 1024", async () => {
    await expect(generateKeyPair({ modulusLength: 512 })).rejects.toThrow(/1024/);
  });

  it("dkimDnsRecord base64 matches the SPKI DER of the PEM", async () => {
    const der = Buffer.from(rsa.publicKeyPem.replace(/-----[^-]+-----|\s/g, ""), "base64");
    expect(rsa.dnsRecord.value.endsWith("p=" + b64(der))).toBe(true);
  });
});
