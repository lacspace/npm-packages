import { describe, expect, it } from "vitest";
import {
  PRESETS,
  PROVIDER_KEYS,
  domainOf,
  isProviderKey,
  normalizeMx,
  presetFor,
  providerFromDomain,
  providerFromMx,
  providerFromMxHost,
  serverCandidates,
} from "./index";

describe("PRESETS", () => {
  it("covers the eight providers", () => {
    expect([...PROVIDER_KEYS].sort()).toEqual(["gmail", "godaddy", "hostinger", "icloud", "outlook", "titan", "yahoo", "zoho"]);
  });
  it("uses the well-known hosts and ports", () => {
    const hp = (k: keyof typeof PRESETS) => [PRESETS[k].imap.host, PRESETS[k].imap.port, PRESETS[k].smtp.host, PRESETS[k].smtp.port];
    expect(hp("gmail")).toEqual(["imap.gmail.com", 993, "smtp.gmail.com", 465]);
    expect(hp("outlook")).toEqual(["outlook.office365.com", 993, "smtp.office365.com", 587]);
    expect(hp("hostinger")).toEqual(["imap.hostinger.com", 993, "smtp.hostinger.com", 465]);
    expect(hp("titan")).toEqual(["imap.titan.email", 993, "smtp.titan.email", 465]);
    expect(hp("zoho")).toEqual(["imap.zoho.com", 993, "smtp.zoho.com", 465]);
    expect(hp("yahoo")).toEqual(["imap.mail.yahoo.com", 993, "smtp.mail.yahoo.com", 465]);
    expect(hp("icloud")).toEqual(["imap.mail.me.com", 993, "smtp.mail.me.com", 587]);
    expect(hp("godaddy")).toEqual(["imap.secureserver.net", 993, "smtpout.secureserver.net", 465]);
  });
  it("secure matches the port (465/993 implicit TLS, 587 STARTTLS)", () => {
    for (const k of PROVIDER_KEYS) {
      const p = PRESETS[k];
      expect(p.imap.secure).toBe(true);
      expect(p.smtp.secure).toBe(p.smtp.port === 465);
    }
  });
  it("never invents send limits", () => {
    for (const k of PROVIDER_KEYS) {
      expect(PRESETS[k].limits).toEqual({ perHour: "unknown", perDay: "unknown" });
      expect(PRESETS[k].limits.source).toBeUndefined();
    }
  });
  it("presets are frozen", () => {
    expect(Object.isFrozen(PRESETS)).toBe(true);
    expect(Object.isFrozen(PRESETS.gmail.imap)).toBe(true);
  });
  it("presetFor / isProviderKey", () => {
    expect(presetFor("zoho")?.name).toBe("Zoho Mail");
    expect(presetFor("custom")).toBeNull();
    expect(presetFor("toString")).toBeNull();
    expect(isProviderKey("gmail")).toBe(true);
    expect(isProviderKey(1)).toBe(false);
  });
});

describe("providerFromMx", () => {
  it.each([
    ["mx1.hostinger.com", "hostinger"],
    ["mx1.titan.email", "titan"],
    ["mailstore1.secureserver.net", "godaddy"],
    ["aspmx.l.google.com", "gmail"],
    ["smtp.google.com", "gmail"],
    ["alt1.aspmx.l.googlemail.com", "gmail"],
    ["acme-com.mail.protection.outlook.com", "outlook"],
    ["mx.zoho.com", "zoho"],
    ["mx.zoho.eu", "zoho"],
    ["mx.zoho.com.au", "zoho"],
    ["mta5.am0.yahoodns.net", "yahoo"],
    ["mx01.mail.icloud.com", "icloud"],
  ])("%s → %s", (host, key) => expect(providerFromMx([host])).toBe(key));
  it("handles a trailing dot and upper case", () => expect(providerFromMx(["ASPMX.L.GOOGLE.COM."])).toBe("gmail"));
  it("does not match lookalike domains", () => {
    expect(providerFromMxHost("mx.evilhostinger.com")).toBeNull();
    expect(providerFromMxHost("google.com.evil.net")).toBeNull();
  });
  it("first recognised host wins", () => expect(providerFromMx(["mx.unknown.net", "mx1.titan.email", "aspmx.l.google.com"])).toBe("titan"));
  it("unknown or empty gives null", () => {
    expect(providerFromMx(["mx.mycompany.net"])).toBeNull();
    expect(providerFromMx([])).toBeNull();
    expect(providerFromMx(null)).toBeNull();
    expect(providerFromMx([42 as unknown as string])).toBeNull();
  });
  it("accepts Node resolveMx records and sorts them by priority", () => {
    const recs = [{ exchange: "aspmx.l.google.com", priority: 20 }, { exchange: "mx1.hostinger.com", priority: 5 }];
    expect(normalizeMx(recs)).toEqual(["mx1.hostinger.com", "aspmx.l.google.com"]);
    expect(providerFromMx(recs)).toBe("hostinger");
  });
});

describe("domains", () => {
  it("domainOf", () => {
    expect(domainOf("Anita@Acme.COM")).toBe("acme.com");
    expect(domainOf("Anita <anita@acme.com>")).toBe("acme.com");
    expect(domainOf("nope")).toBe("");
    expect(domainOf("a@localhost")).toBe("");
    expect(domainOf(null)).toBe("");
  });
  it("providerFromDomain", () => {
    expect(providerFromDomain("gmail.com")).toBe("gmail");
    expect(providerFromDomain("hotmail.com")).toBe("outlook");
    expect(providerFromDomain("me.com")).toBe("icloud");
    expect(providerFromDomain("acme.com")).toBeNull();
    expect(providerFromDomain("constructor")).toBeNull();
  });
});

describe("serverCandidates", () => {
  it("returns the MX provider with the user filled in", () => {
    const c = serverCandidates("me@acme.com", ["aspmx.l.google.com"]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ provider: "gmail", reason: "mx", imap: { host: "imap.gmail.com", port: 993, secure: true, user: "me@acme.com" } });
  });
  it("pairs Hostinger and Titan", () => {
    expect(serverCandidates("a@x.com", ["mx1.hostinger.com"]).map((c) => c.provider)).toEqual(["hostinger", "titan"]);
    expect(serverCandidates("a@x.com", ["mx1.titan.email"]).map((c) => c.provider)).toEqual(["titan", "hostinger"]);
  });
  it("prefer goes first and is not duplicated", () => {
    const c = serverCandidates("a@x.com", ["aspmx.l.google.com", "mx1.hostinger.com"], { prefer: ["hostinger", "titan"] });
    expect(c.map((x) => [x.provider, x.reason])).toEqual([["hostinger", "preferred"], ["titan", "preferred"], ["gmail", "mx"]]);
  });
  it("follows MX order", () => expect(serverCandidates("a@x.com", ["mx.zoho.com", "aspmx.l.google.com"]).map((c) => c.provider)).toEqual(["zoho", "gmail"]));
  it("falls back to imap./smtp. then mail.<domain>", () => {
    const c = serverCandidates("a@shop.np", ["mx.shop.np"]);
    expect(c.map((x) => [x.provider, x.imap.host, x.smtp.host, x.smtp.port])).toEqual([
      ["custom", "imap.shop.np", "smtp.shop.np", 465],
      ["custom", "mail.shop.np", "mail.shop.np", 465],
    ]);
    expect(c[0]!.limits).toEqual({ perHour: "unknown", perDay: "unknown" });
  });
  it("without MX uses well-known consumer domains", () => {
    expect(serverCandidates("me@gmail.com").map((c) => [c.provider, c.reason])).toEqual([["gmail", "domain"]]);
  });
  it("without MX and an unknown domain gives fallbacks", () => expect(serverCandidates("me@acme.com").every((c) => c.provider === "custom")).toBe(true));
  it("alwaysFallback adds guesses after recognised providers", () => {
    const c = serverCandidates("a@x.com", ["aspmx.l.google.com"], { alwaysFallback: true });
    expect(c.map((x) => x.provider)).toEqual(["gmail", "custom", "custom"]);
  });
  it("candidates are copies, not the frozen presets", () => {
    const c = serverCandidates("a@x.com", ["aspmx.l.google.com"]);
    c[0]!.imap.port = 1;
    expect(PRESETS.gmail.imap.port).toBe(993);
  });
  it("invalid addresses give []", () => {
    expect(serverCandidates("no-at-sign")).toEqual([]);
    expect(serverCandidates(undefined as unknown as string)).toEqual([]);
    expect(serverCandidates("a@x.com", "junk" as unknown as string[])).toHaveLength(2);
  });
  it("ignores unknown prefer keys", () => expect(serverCandidates("a@x.com", ["aspmx.l.google.com"], { prefer: ["nope" as "gmail"] }).map((c) => c.provider)).toEqual(["gmail"]));
});
