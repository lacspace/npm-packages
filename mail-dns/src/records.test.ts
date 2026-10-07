import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildDkim, normalizeDkimPublicKey, parseDkimKey } from "./dkim.js";
import { externalReportDomains, parseDmarc } from "./dmarc.js";
import { generateRecords, toZoneFile } from "./generate.js";
import { buildMtaStsPolicy, mxMatchesPattern, parseMtaStsPolicy, parseMtaStsTxt, parseTlsRpt, uncoveredMx } from "./policy.js";
import { detectProviders, providerMx, PROVIDERS } from "./providers.js";
import { parseDohAnswer, parseTxtData } from "./resolver.js";
import { isNullMx } from "./mx.js";

const codes = (ps: { code: string }[]) => ps.map((x) => x.code);
const spki = (bits: number) =>
  generateKeyPairSync("rsa", { modulusLength: bits }).publicKey.export({ type: "spki", format: "der" }).toString("base64");

describe("parseDmarc", () => {
  it("parses all tags", () => {
    const d = parseDmarc("v=DMARC1; p=quarantine; sp=reject; pct=50; rua=mailto:a@x.com,mailto:b@y.com!10m; ruf=mailto:f@x.com; adkim=s; aspf=r; fo=1:d; ri=3600");
    expect(d.valid).toBe(true);
    expect(d).toMatchObject({ p: "quarantine", sp: "reject", pct: 50, adkim: "s", aspf: "r", fo: ["1", "d"], ri: 3600 });
    expect(d.rua).toEqual(["mailto:a@x.com", "mailto:b@y.com!10m"]);
  });
  it("applies defaults", () => {
    const d = parseDmarc("v=DMARC1; p=none");
    expect(d).toMatchObject({ pct: 100, adkim: "r", aspf: "r", rua: [] });
  });
  it("rejects bad version, policy, pct and alignment", () => {
    expect(codes(parseDmarc("p=none; v=DMARC1").problems)).toContain("dmarc-version");
    expect(codes(parseDmarc("v=DMARC1; p=block").problems)).toContain("dmarc-bad-policy");
    expect(codes(parseDmarc("v=DMARC1; p=none; pct=150").problems)).toContain("dmarc-bad-pct");
    expect(codes(parseDmarc("v=DMARC1; p=none; adkim=x").problems)).toContain("dmarc-bad-adkim");
    expect(codes(parseDmarc("v=DMARC1; p=none; rua=a@x.com").problems)).toContain("dmarc-bad-rua");
    expect(codes(parseDmarc("v=DMARC1").problems)).toContain("dmarc-no-policy");
  });
  it("treats a missing p= with rua as none (RFC 7489 §6.6.3)", () => {
    const d = parseDmarc("v=DMARC1; rua=mailto:r@x.com");
    expect(d.p).toBe("none");
    expect(d.valid).toBe(true);
  });
  it("finds external report domains by organisational domain", () => {
    expect(externalReportDomains("shop.example.com", ["mailto:d@example.com", "mailto:r@dmarc.vendor.io"])).toEqual(["dmarc.vendor.io"]);
    expect(externalReportDomains("example.co.uk", ["mailto:d@mail.example.co.uk"])).toEqual([]);
  });
});

describe("parseDkimKey", () => {
  it("reads an exact 2048-bit RSA key size from the DER", () => {
    const k = parseDkimKey(`v=DKIM1; k=rsa; p=${spki(2048)}`);
    expect(k.valid).toBe(true);
    expect(k.keyBits).toBe(2048);
    expect(k.keyBitsEstimated).toBeUndefined();
  });
  it("flags 1024-bit as info and 512-bit as weak", () => {
    expect(codes(parseDkimKey(`p=${spki(1024)}`).problems)).toEqual(["dkim-1024"]);
    const weak = parseDkimKey(`v=DKIM1; p=${spki(512)}`);
    expect(weak.keyBits).toBe(512);
    expect(codes(weak.problems)).toContain("dkim-weak-key");
  });
  it("detects revoked keys, testing flag and sha1-only", () => {
    expect(parseDkimKey("v=DKIM1; p=").revoked).toBe(true);
    const t = parseDkimKey(`v=DKIM1; t=y:s; h=sha1; p=${spki(2048)}`);
    expect(t.testing).toBe(true);
    expect(t.strict).toBe(true);
    expect(codes(t.problems)).toEqual(expect.arrayContaining(["dkim-testing", "dkim-sha1"]));
  });
  it("rejects damaged base64 and missing p=", () => {
    expect(codes(parseDkimKey("v=DKIM1; p=MIIB!!notbase64").problems)).toContain("dkim-bad-key");
    expect(codes(parseDkimKey("v=DKIM1; k=rsa").problems)).toContain("dkim-no-key");
  });
  it("normalises PEM, bare and full-record keys", () => {
    const key = spki(1024);
    const pem = `-----BEGIN PUBLIC KEY-----\n${key.match(/.{1,64}/g)!.join("\n")}\n-----END PUBLIC KEY-----`;
    expect(normalizeDkimPublicKey(pem)).toBe(key);
    expect(normalizeDkimPublicKey(`v=DKIM1; k=rsa; p=${key}`)).toBe(key);
    expect(buildDkim(key)).toBe(`v=DKIM1; k=rsa; p=${key}`);
  });
});

describe("MX helpers", () => {
  it("detects null MX", () => {
    expect(isNullMx([{ exchange: ".", priority: 0 }])).toBe(true);
    expect(isNullMx([{ exchange: "", priority: 0 }])).toBe(true);
    expect(isNullMx([{ exchange: "mx.example.com", priority: 0 }])).toBe(false);
  });
});

describe("MTA-STS & TLS-RPT parsing", () => {
  it("parses a policy file with CRLF or LF", () => {
    const p = parseMtaStsPolicy("version: STSv1\r\nmode: enforce\r\nmx: mx1.example.com\r\nmx: *.backup.example.com\r\nmax_age: 604800\r\n");
    expect(p).toMatchObject({ valid: true, mode: "enforce", maxAge: 604800, mx: ["mx1.example.com", "*.backup.example.com"] });
    expect(parseMtaStsPolicy("version: STSv1\nmode: testing\nmx: a.b\nmax_age: 86400").valid).toBe(true);
  });
  it("rejects bad policy files", () => {
    expect(codes(parseMtaStsPolicy("version: STSv1\nmode: strict\nmx: a\nmax_age: 1").problems)).toContain("mta-sts-policy-mode");
    expect(codes(parseMtaStsPolicy("mode: enforce\nmx: a\nmax_age: 1").problems)).toContain("mta-sts-policy-version");
    expect(codes(parseMtaStsPolicy("version: STSv1\nmode: enforce\nmax_age: 99999999999").problems)).toEqual(expect.arrayContaining(["mta-sts-policy-max-age", "mta-sts-policy-mx"]));
  });
  it("matches wildcard patterns one label deep only", () => {
    expect(mxMatchesPattern("mx1.mail.example.com", "*.mail.example.com")).toBe(true);
    expect(mxMatchesPattern("a.mx1.mail.example.com", "*.mail.example.com")).toBe(false);
    expect(mxMatchesPattern("mail.example.com", "*.mail.example.com")).toBe(false);
    expect(mxMatchesPattern("MX1.Example.com.", "mx1.example.com")).toBe(true);
    expect(uncoveredMx(["mx1.x.com", "mx2.y.com"], ["*.x.com"])).toEqual(["mx2.y.com"]);
  });
  it("parses the _mta-sts TXT and TLS-RPT records", () => {
    expect(parseMtaStsTxt("v=STSv1; id=20190429T010101;").id).toBe("20190429T010101");
    expect(parseMtaStsTxt("v=STSv1; id=bad-id!").valid).toBe(false);
    expect(parseTlsRpt("v=TLSRPTv1;rua=mailto:sts-reports@google.com").rua).toEqual(["mailto:sts-reports@google.com"]);
    expect(codes(parseTlsRpt("v=TLSRPTv1").problems)).toContain("tls-rpt-no-rua");
  });
});

describe("generateRecords", () => {
  const key = spki(2048);
  const out = generateRecords({
    domain: "Acme.com.",
    mailHost: "mx1.mail.lacspace.com",
    spfInclude: ["_spf.mail.lacspace.com"],
    dkim: { selector: "lac1", publicKey: key },
    dmarc: { policy: "none", rua: ["dmarc@acme.com", "reports@dmarc.lacspace.com"] },
    mtaSts: { mode: "testing", policyHost: "mta-sts.mail.lacspace.com" },
    tlsRpt: { rua: ["tls@acme.com"] },
  });
  const by = (name: string, type = "TXT") => out.records.find((r) => r.name === name && r.type === type)!;

  it("emits MX, SPF, DKIM, DMARC with relative and FQDN names", () => {
    expect(by("@", "MX")).toMatchObject({ value: "mx1.mail.lacspace.com", priority: 10, fqdn: "acme.com", required: true, ttl: 3600 });
    expect(by("@").value).toBe("v=spf1 include:_spf.mail.lacspace.com ~all");
    expect(by("lac1._domainkey")).toMatchObject({ fqdn: "lac1._domainkey.acme.com", value: `v=DKIM1; k=rsa; p=${key}` });
    expect(by("lac1._domainkey").chunks!.every((c) => c.length <= 255)).toBe(true);
    expect(by("_dmarc").value).toBe("v=DMARC1; p=none; rua=mailto:dmarc@acme.com,mailto:reports@dmarc.lacspace.com");
  });
  it("emits optional MTA-STS (TXT + CNAME + policy file) and TLS-RPT", () => {
    expect(by("_mta-sts").value).toMatch(/^v=STSv1; id=[a-f0-9]{1,32}$/);
    expect(by("mta-sts", "CNAME")).toMatchObject({ value: "mta-sts.mail.lacspace.com", required: false });
    expect(out.mtaStsPolicyFile).toEqual({
      url: "https://mta-sts.acme.com/.well-known/mta-sts.txt",
      body: buildMtaStsPolicy("testing", ["mx1.mail.lacspace.com"], 86400),
      contentType: "text/plain",
    });
    expect(by("_smtp._tls").value).toBe("v=TLSRPTv1; rua=mailto:tls@acme.com");
  });
  it("notes external DMARC report authorization and the -all progression", () => {
    expect(out.notes.join("\n")).toMatch(/acme\.com\._report\._dmarc\.dmarc\.lacspace\.com/);
    expect(out.notes.join("\n")).toMatch(/-all/);
  });
  it("supports multiple MX hosts, IPs, -all and stable ids", () => {
    const g = generateRecords({ domain: "b.io", mailHost: "x", mxHosts: [{ host: "mx1.l.com", priority: 10 }, { host: "mx2.l.com", priority: 20 }], spfIp4: ["203.0.113.5"], spfAll: "-all", mtaSts: { mode: "enforce", mx: ["*.l.com"] } });
    expect(g.records.filter((r) => r.type === "MX").map((r) => r.priority)).toEqual([10, 20]);
    expect(g.records.find((r) => r.name === "@" && r.type === "TXT")!.value).toBe("v=spf1 ip4:203.0.113.5 -all");
    expect(g.mtaStsPolicyFile!.body).toContain("max_age: 604800");
    const again = generateRecords({ domain: "b.io", mailHost: "x", mxHosts: [{ host: "mx1.l.com", priority: 10 }, { host: "mx2.l.com", priority: 20 }], mtaSts: { mode: "enforce", mx: ["*.l.com"] } });
    expect(again.records.find((r) => r.name === "_mta-sts")!.value).toBe(g.records.find((r) => r.name === "_mta-sts")!.value);
  });
  it("renders a zone file", () => {
    const z = toZoneFile(out.records);
    expect(z).toContain("acme.com.\t3600\tIN\tMX\t10 mx1.mail.lacspace.com.");
    expect(z).toContain('_dmarc.acme.com.\t3600\tIN\tTXT\t"v=DMARC1; p=none;');
  });
});

describe("DoH JSON parsing", () => {
  it("parses Cloudflare-style quoted multi-string TXT", () => {
    const cf = {
      Status: 0,
      Answer: [
        { name: "amazonses.com", type: 16, TTL: 263, data: '"v=spf1 ip4:199.255.192.0/22 " "ip4:98.77.0.0/16 -all"' },
        { name: "amazonses.com", type: 16, TTL: 263, data: '"say \\"hi\\"\\059"' },
      ],
    };
    expect(parseDohAnswer(cf, "TXT")).toEqual([["v=spf1 ip4:199.255.192.0/22 ", "ip4:98.77.0.0/16 -all"], ['say "hi";']]);
  });
  it("parses Google-style unquoted TXT, skipping CNAME answers", () => {
    const g = {
      Status: 0,
      Answer: [
        { name: "hostingermail-a._domainkey.lacspace.com.", type: 5, data: "hostingermail-a.dkim.mail.hostinger.com." },
        { name: "hostingermail-a.dkim.mail.hostinger.com.", type: 16, data: "v=DKIM1;k=rsa;p=MIIB" },
      ],
    };
    expect(parseDohAnswer(g, "TXT")).toEqual([["v=DKIM1;k=rsa;p=MIIB"]]);
    expect(parseDohAnswer(g, "CNAME")).toEqual(["hostingermail-a.dkim.mail.hostinger.com"]);
  });
  it("parses MX and maps NXDOMAIN / empty answers to node error codes", () => {
    expect(parseDohAnswer({ Status: 0, Answer: [{ type: 15, data: "5 gmail-smtp-in.l.google.com." }] }, "MX")).toEqual([{ priority: 5, exchange: "gmail-smtp-in.l.google.com" }]);
    expect(() => parseDohAnswer({ Status: 3 }, "TXT")).toThrow(expect.objectContaining({ code: "ENOTFOUND" }));
    expect(() => parseDohAnswer({ Status: 0, Answer: [] }, "A")).toThrow(expect.objectContaining({ code: "ENODATA" }));
    expect(() => parseDohAnswer({ Status: 2 }, "A")).toThrow(expect.objectContaining({ code: "ESERVFAIL" }));
    expect(parseTxtData("plain text")).toEqual(["plain text"]);
  });
});

describe("providers", () => {
  it("detects Hostinger and Google from records", () => {
    expect(detectProviders({ mx: ["mx1.hostinger.com."], spfIncludes: ["_spf.mail.hostinger.com"] })[0]).toMatchObject({ id: "hostinger" });
    expect(detectProviders({ mx: ["aspmx.l.google.com"], spfIncludes: ["_spf.google.com"] }).map((p) => p.id)).toEqual(["google"]);
    expect(detectProviders({ spfIncludes: ["spf.sendinblue.com"] }).map((p) => p.id)).toEqual(["brevo"]);
  });
  it("fills Microsoft 365 MX placeholders and records verification", () => {
    expect(providerMx("microsoft365", "acme.co.uk")).toEqual([{ host: "acme-co-uk.mail.protection.outlook.com", priority: 0 }]);
    for (const p of Object.values(PROVIDERS)) expect(p.verified.spf).toBeDefined();
  });
});
