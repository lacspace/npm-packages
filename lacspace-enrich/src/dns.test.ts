import { describe, it, expect } from "vitest";
import { parseSpf, parseDmarc, mailProviderFromMx, catchAllHint, emailFormatValid, emailDomain } from "./dns.js";

describe("parseSpf", () => {
  it("reads the record and the all-qualifier policy", () => {
    expect(parseSpf(["v=spf1 include:_spf.google.com ~all"])).toEqual({ spf: "v=spf1 include:_spf.google.com ~all", spfPolicy: "softfail" });
    expect(parseSpf(["v=spf1 -all"]).spfPolicy).toBe("fail");
    expect(parseSpf(["v=spf1 +all"]).spfPolicy).toBe("pass");
    expect(parseSpf(["v=spf1 ?all"]).spfPolicy).toBe("neutral");
  });
  it("ignores unrelated TXT and missing all", () => {
    expect(parseSpf(["google-site-verification=abc"])).toEqual({});
    expect(parseSpf(["v=spf1 include:x.com"])).toEqual({ spf: "v=spf1 include:x.com" });
  });
});

describe("parseDmarc", () => {
  it("reads the enforcement policy", () => {
    expect(parseDmarc(["v=DMARC1; p=reject; rua=mailto:a@b.com"])).toMatchObject({ dmarcPolicy: "reject" });
    expect(parseDmarc(["v=DMARC1; p=quarantine"]).dmarcPolicy).toBe("quarantine");
    expect(parseDmarc(["v=DMARC1; p=none"]).dmarcPolicy).toBe("none");
    expect(parseDmarc(["nothing here"])).toEqual({});
  });
});

describe("mailProviderFromMx", () => {
  it("maps common MX hosts to providers", () => {
    expect(mailProviderFromMx(["aspmx.l.google.com"])).toBe("Google Workspace");
    expect(mailProviderFromMx(["acme-com.mail.protection.outlook.com"])).toBe("Microsoft 365");
    expect(mailProviderFromMx(["mx.zoho.com"])).toBe("Zoho Mail");
    expect(mailProviderFromMx(["unknown-host.example.net"])).toBeUndefined();
  });
});

describe("catchAllHint", () => {
  it("flags permissive SPF and forwarders", () => {
    expect(catchAllHint("pass", undefined)).toBe(true);
    expect(catchAllHint("neutral", undefined)).toBe(true);
    expect(catchAllHint("fail", "Google Workspace")).toBe(false);
    expect(catchAllHint("softfail", "ImprovMX")).toBe(true);
  });
});

describe("email helpers", () => {
  it("validates shape and extracts domain", () => {
    expect(emailFormatValid("a@b.com")).toBe(true);
    expect(emailFormatValid("nope")).toBe(false);
    expect(emailDomain("Jane@Acme.COM")).toBe("acme.com");
    expect(emailDomain("bad")).toBeUndefined();
  });
});
