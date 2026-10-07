import { describe, expect, it } from "vitest";
import {
  assessRisk,
  decodePunycode,
  FREE_MAIL_DOMAINS,
  isFreeMail,
  lookalikeOf,
  parseAuthenticationResults,
  registrableDomain,
  RISK_THRESHOLDS,
  skeleton,
  toUnicodeDomain,
} from "./index";

// ---------------------------------------------------------------------------
// Fixtures (realistic, anonymised)
// ---------------------------------------------------------------------------

const GMAIL_AR =
  "mx.google.com;\r\n       dkim=pass header.i=@acmecorp.com header.s=s1 header.b=Kx9fQ2aZ;\r\n" +
  "       spf=pass (google.com: domain of bounce+3f2a@mail.acmecorp.com designates 198.51.100.24 as permitted sender) smtp.mailfrom=bounce+3f2a@mail.acmecorp.com;\r\n" +
  "       dmarc=pass (p=NONE sp=NONE dis=NONE) header.from=acmecorp.com";

const M365_AR =
  "spf=pass (sender IP is 203.0.113.45) smtp.mailfrom=partner.example; dkim=pass (signature was verified) header.d=partner.example;dmarc=pass action=none header.from=partner.example;compauth=pass reason=100";

const HOSTINGER_AR =
  "mx1.hostinger.com; dkim=pass (2048-bit key; unprotected) header.d=vendor.example header.i=@vendor.example header.a=rsa-sha256 header.s=default header.b=Ab12Cd34; dkim-atps=neutral";

const HOSTINGER_RSPF =
  "Pass (mailfrom) identity=mailfrom; client-ip=192.0.2.10; helo=mail.vendor.example; envelope-from=billing@vendor.example; receiver=mx1.hostinger.com";

// ---------------------------------------------------------------------------
// parseAuthenticationResults
// ---------------------------------------------------------------------------

describe("parseAuthenticationResults: provider fixtures", () => {
  it("parses a Gmail header", () => {
    const r = parseAuthenticationResults(GMAIL_AR);
    expect(r.authservId).toBe("mx.google.com");
    expect(r.spf).toBe("pass");
    expect(r.dkim).toBe("pass");
    expect(r.dmarc).toBe("pass");
    expect(r.dmarcPolicy).toBe("none");
    expect(r.headerFrom).toBe("acmecorp.com");
    expect(r.spfDomain).toBe("mail.acmecorp.com");
    expect(r.dkimDomains).toEqual([{ domain: "acmecorp.com", result: "pass" }]);
    expect(r.raw).toHaveLength(1);
  });

  it("parses a Microsoft 365 header without authserv-id; ignores compauth/action", () => {
    const r = parseAuthenticationResults(M365_AR);
    expect(r.authservId).toBeUndefined();
    expect(r.spf).toBe("pass");
    expect(r.dkim).toBe("pass");
    expect(r.dmarc).toBe("pass");
    expect(r.headerFrom).toBe("partner.example");
    expect(r.spfDomain).toBe("partner.example");
    expect(r.dkimDomains[0]!.domain).toBe("partner.example");
    expect(r.raw[0]).toContain("compauth=pass");
  });

  it("parses a Hostinger/Dovecot-style header with Received-SPF fallback", () => {
    const r = parseAuthenticationResults({ authenticationResults: HOSTINGER_AR, receivedSpf: HOSTINGER_RSPF });
    expect(r.authservId).toBe("mx1.hostinger.com");
    expect(r.dkim).toBe("pass");
    expect(r.dkimDomains[0]!.domain).toBe("vendor.example");
    expect(r.spf).toBe("pass");
    expect(r.spfDomain).toBe("vendor.example");
    expect(r.dmarc).toBeNull();
    expect(r.raw).toHaveLength(2);
  });

  it("accepts a whole raw header block", () => {
    const block = [
      "Received: from mail.vendor.example (mail.vendor.example [192.0.2.10])",
      "\tby mx1.hostinger.com with ESMTPS id 1",
      `Authentication-Results: ${HOSTINGER_AR}`,
      `Received-SPF: ${HOSTINGER_RSPF}`,
      "From: Billing <billing@vendor.example>",
    ].join("\r\n");
    const r = parseAuthenticationResults(block);
    expect(r.authservId).toBe("mx1.hostinger.com");
    expect(r.spf).toBe("pass");
    expect(r.dkim).toBe("pass");
  });

  it("handles Gmail-style Received-SPF with a comment", () => {
    const r = parseAuthenticationResults({
      receivedSpf: "softfail (google.com: domain of transitioning x@shop.example does not designate 192.0.2.99 as permitted sender) client-ip=192.0.2.99;",
    });
    expect(r.spf).toBe("softfail");
    expect(r.spfDomain).toBe("shop.example");
  });

  it("does not use Received-SPF when the A-R header has spf=", () => {
    const r = parseAuthenticationResults({
      authenticationResults: "mx.example.org; spf=fail smtp.mailfrom=a.example",
      receivedSpf: "Pass (mailfrom) identity=mailfrom",
    });
    expect(r.spf).toBe("fail");
  });
});

describe("parseAuthenticationResults: RFC 8601 details", () => {
  it("picks the best of several DKIM signatures", () => {
    const r = parseAuthenticationResults(
      "mx.example.org; dkim=fail (bad signature) header.d=a.example; dkim=pass header.d=esp.example; dkim=neutral header.d=b.example",
    );
    expect(r.dkim).toBe("pass");
    expect(r.dkimDomains.map((d) => d.result)).toEqual(["fail", "pass", "neutral"]);
  });

  it("picks the strongest failure when no DKIM signature passed", () => {
    const r = parseAuthenticationResults("mx.example.org; dkim=neutral header.d=a.example; dkim=fail header.d=b.example; dkim=temperror header.d=c.example");
    expect(r.dkim).toBe("fail");
  });

  it("handles nested comments, quoted reason, and a version number", () => {
    const r = parseAuthenticationResults(
      'mx.example.org 1; dkim=fail reason="signature verification failed (body hash; mismatch)" (outer (nested; comment) here) header.d=x.example; spf=neutral smtp.mailfrom=x.example',
    );
    expect(r.authservId).toBe("mx.example.org");
    expect(r.dkim).toBe("fail");
    expect(r.spf).toBe("neutral");
    expect(r.dkimDomains[0]!.domain).toBe("x.example");
  });

  it("falls back to header.i for the DKIM domain", () => {
    const r = parseAuthenticationResults("mx.example.org; dkim=pass header.i=@news.shop.example");
    expect(r.dkimDomains[0]!.domain).toBe("news.shop.example");
  });

  it("reads dmarc policy=reject from the comment", () => {
    const r = parseAuthenticationResults("mx.google.com; dmarc=fail (p=REJECT sp=REJECT dis=QUARANTINE) header.from=bank.example");
    expect(r.dmarc).toBe("fail");
    expect(r.dmarcPolicy).toBe("reject");
    expect(r.headerFrom).toBe("bank.example");
  });

  it("tolerates spaces around '=' and upper-case results", () => {
    const r = parseAuthenticationResults("mx.example.org; spf = PASS smtp.mailfrom = a.example; dmarc=Fail header.from=a.example");
    expect(r.spf).toBe("pass");
    expect(r.dmarc).toBe("fail");
  });

  it("recovers results missing a semicolon", () => {
    const r = parseAuthenticationResults("mx.example.org; spf=pass smtp.mailfrom=a.example dkim=pass header.d=a.example");
    expect(r.spf).toBe("pass");
    expect(r.dkim).toBe("pass");
  });

  it("maps hardfail to fail and unknown results to null", () => {
    expect(parseAuthenticationResults("mx.example.org; spf=hardfail").spf).toBe("fail");
    expect(parseAuthenticationResults("mx.example.org; spf=weird").spf).toBeNull();
  });

  it("returns all-null for a no-result header", () => {
    const r = parseAuthenticationResults("mx.example.org; none");
    expect(r).toMatchObject({ spf: null, dkim: null, dmarc: null, authservId: "mx.example.org" });
  });

  it("merges consecutive headers from the same server", () => {
    const r = parseAuthenticationResults([
      "mail.example.org; dkim=pass header.d=a.example",
      "mail.example.org; dmarc=pass (p=quarantine) header.from=a.example",
      "mail.example.org; spf=pass smtp.mailfrom=a.example",
    ]);
    expect(r).toMatchObject({ spf: "pass", dkim: "pass", dmarc: "pass", dmarcPolicy: "quarantine" });
    expect(r.raw).toHaveLength(3);
  });
});

describe("parseAuthenticationResults: trust and forgery", () => {
  const forged = "mx.google.com; dkim=pass header.d=bank.example; spf=pass smtp.mailfrom=bank.example; dmarc=pass header.from=bank.example";
  const own = "mx1.hostinger.com; dkim=none; spf=fail smtp.mailfrom=bank.example; dmarc=fail (p=reject) header.from=bank.example";

  it("uses the topmost header by default", () => {
    const r = parseAuthenticationResults([own, forged]);
    expect(r.dmarc).toBe("fail");
    expect(r.authservId).toBe("mx1.hostinger.com");
  });

  it("ignores a forged header below the trusted one", () => {
    const r = parseAuthenticationResults([own, forged], { trustedAuthservIds: ["mx1.hostinger.com"] });
    expect(r.dmarc).toBe("fail");
    expect(r.spf).toBe("fail");
  });

  it("skips untrusted headers above the trusted one", () => {
    const r = parseAuthenticationResults([forged, own], { trustedAuthservIds: ["hostinger.com"] });
    expect(r.authservId).toBe("mx1.hostinger.com");
    expect(r.dmarc).toBe("fail");
  });

  it("returns null verdicts when only forged headers exist", () => {
    const r = parseAuthenticationResults([forged], { trustedAuthservIds: ["mx.lacspace.com"] });
    expect(r).toMatchObject({ spf: null, dkim: null, dmarc: null });
    expect(r.raw).toEqual([]);
  });

  it("does not merge a forged header that follows with a different id", () => {
    const r = parseAuthenticationResults(["mx.lacspace.com; spf=fail smtp.mailfrom=x.example", forged], {
      trustedAuthservIds: ["mx.lacspace.com"],
    });
    expect(r.dkim).toBeNull();
    expect(r.dmarc).toBeNull();
  });
});

describe("parseAuthenticationResults: ARC", () => {
  it("reads arc= from the main header", () => {
    const r = parseAuthenticationResults(
      "mx.google.com; arc=pass (i=1 spf=pass spfdomain=list.example dkim=pass dkdomain=list.example); dkim=pass header.d=list.example",
    );
    expect(r.arc).toBe("pass");
  });

  it("parses ARC-Authentication-Results (newest instance)", () => {
    const r = parseAuthenticationResults({
      authenticationResults: "mx.example.org; dkim=fail header.d=orig.example; spf=fail smtp.mailfrom=list.example",
      arcAuthenticationResults: [
        "i=2; relay.list.example; dkim=pass header.d=orig.example; dmarc=pass header.from=orig.example",
        "i=1; mx.orig.example; dkim=pass header.d=orig.example; dmarc=fail header.from=orig.example",
      ],
    });
    expect(r.arc).toBe("pass");
    expect(r.dkim).toBe("fail");
  });

  it("leaves arc undefined without ARC information", () => {
    expect(parseAuthenticationResults(GMAIL_AR).arc).toBeUndefined();
  });
});

describe("parseAuthenticationResults: malformed input never throws", () => {
  const junk: unknown[] = [
    "",
    ";;;",
    "(((unclosed",
    '"unterminated quote; spf=pass',
    "=====",
    "spf=",
    "\u0000￿",
    null,
    undefined,
    42,
    [null, 7, "mx.example.org; dkim=pass"],
    { authenticationResults: 5 },
  ];
  for (const j of junk) {
    it(`handles ${JSON.stringify(j)}`, () => {
      expect(() => parseAuthenticationResults(j as string)).not.toThrow();
      const r = parseAuthenticationResults(j as string);
      expect(Array.isArray(r.raw)).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe("domain helpers", () => {
  it("decodes punycode (RFC 3492)", () => {
    expect(decodePunycode("xn--mnchen-3ya")).toBe("münchen");
    expect(decodePunycode("mnchen-3ya")).toBe("münchen");
    expect(decodePunycode("xn--l2bey1c2b")).toBe("नेपाल");
    expect(decodePunycode("xn--!!!")).toBe("xn--!!!");
  });

  it("converts a host to Unicode", () => {
    expect(toUnicodeDomain("XN--LACSPCE-6FG.com.")).toBe("lacspаce.com");
    expect(toUnicodeDomain("mail.example.com")).toBe("mail.example.com");
  });

  it("finds the registrable domain", () => {
    expect(registrableDomain("mail.lacspace.com")).toBe("lacspace.com");
    expect(registrableDomain("a.b.shop.com.np")).toBe("shop.com.np");
    expect(registrableDomain("x.co.uk")).toBe("x.co.uk");
    expect(registrableDomain("deep.x.co.in")).toBe("x.co.in");
    expect(registrableDomain("192.0.2.1")).toBe("192.0.2.1");
    expect(registrableDomain("user@Mail.Example.ORG")).toBe("example.org");
  });

  it("builds homoglyph skeletons", () => {
    expect(skeleton("rnicrosoft")).toBe(skeleton("microsoft"));
    expect(skeleton("lacspаce")).toBe(skeleton("lacspace"));
    expect(skeleton("paypa1")).toBe(skeleton("paypal"));
    expect(skeleton("g00gle")).toBe(skeleton("google"));
    expect(skeleton("vvalmart")).toBe(skeleton("walmart"));
  });

  it("detects free mail", () => {
    expect(isFreeMail("gmail.com")).toBe(true);
    expect(isFreeMail("GMAIL.com")).toBe(true);
    expect(isFreeMail("lacspace.com")).toBe(false);
    expect(isFreeMail("corp.example", ["corp.example"])).toBe(true);
    expect(FREE_MAIL_DOMAINS).toContain("proton.me");
  });

  describe("lookalikeOf", () => {
    const c = ["lacspace.com"];
    it.each([
      ["lacsp4ce.com"],
      ["lacspаce.com"],
      ["xn--lacspce-6fg.com"],
      ["lacspace.co"],
      ["lacspace.com.evil.io"],
      ["lacspace-support.com"],
      ["secure-lacspace.com"],
      ["lacpsace.com"],
    ])("%s imitates lacspace.com", (d) => {
      expect(lookalikeOf(d, c)).toBe("lacspace.com");
    });

    it("flags rn→m (rnicrosoft)", () => {
      expect(lookalikeOf("rnicrosoft.com", ["microsoft.com"])).toBe("microsoft.com");
    });

    it("never flags the same domain or its subdomains", () => {
      expect(lookalikeOf("lacspace.com", c)).toBeNull();
      expect(lookalikeOf("mail.lacspace.com", c)).toBeNull();
    });

    it("does not flag unrelated domains", () => {
      expect(lookalikeOf("airspace.com", c)).toBeNull();
      expect(lookalikeOf("gitlab.com", ["github.com"])).toBeNull();
      expect(lookalikeOf("example.org", c)).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// assessRisk
// ---------------------------------------------------------------------------

const ok = parseAuthenticationResults(GMAIL_AR);
const codes = (r: ReturnType<typeof assessRisk>) => r.signals.map((s) => s.code);

describe("assessRisk", () => {
  it("exports thresholds", () => {
    expect(RISK_THRESHOLDS).toEqual({ low: 20, high: 50 });
  });

  it("clean mail from a known contact → none", () => {
    const r = assessRisk({
      from: { name: "Sita Rai", address: "sita@acmecorp.com" },
      subject: "Notes from today's call",
      snippet: "Hi, attaching the notes we discussed.",
      auth: ok,
      recipientDomain: "lacspace.com",
      knownContacts: [{ name: "Sita Rai", address: "sita@acmecorp.com" }],
    });
    expect(r.level).toBe("none");
    expect(r.score).toBe(0);
    expect(r.reasons).toEqual([]);
    expect(codes(r)).toContain("known_contact");
  });

  it("DMARC fail → high", () => {
    const r = assessRisk({
      from: { name: "Accounts", address: "accounts@bank.example" },
      auth: { spf: "fail", dkim: "none", dmarc: "fail" },
    });
    expect(r.level).toBe("high");
    expect(codes(r)).toContain("auth.dmarc_fail");
    expect(r.reasons[0]).toMatch(/DMARC/);
  });

  it("DMARC pass ignores SPF failures (forwarding)", () => {
    const r = assessRisk({ from: { address: "a@shop.example" }, auth: { spf: "fail", dkim: "pass", dmarc: "pass" } });
    expect(codes(r)).not.toContain("auth.spf_fail");
    expect(r.level).toBe("none");
  });

  it("no authentication at all → weak signal only", () => {
    const r = assessRisk({ from: { address: "a@shop.example" }, auth: { spf: "none", dkim: "none", dmarc: "none" } });
    expect(codes(r)).toContain("auth.unauthenticated");
    expect(r.level).toBe("none");
  });

  it("reply-to on another domain → low", () => {
    const r = assessRisk({
      from: { address: "orders@shop.example" },
      replyTo: [{ address: "orders@shop-orders.example" }],
    });
    expect(r.level).toBe("low");
    expect(codes(r)).toContain("reply_to.different_domain");
    expect(r.reasons[0]).toMatch(/Replies would go to/);
  });

  it("reply-to on free mail from a company domain is stronger", () => {
    const r = assessRisk({ from: { address: "ceo@acmecorp.com" }, replyTo: [{ address: "acme.ceo@gmail.com" }] });
    expect(codes(r)).toContain("reply_to.free_mail");
    expect(r.score).toBeGreaterThanOrEqual(30);
  });

  it("display name containing another email address → flagged", () => {
    const r = assessRisk({
      from: { name: "support@lacspace.com", address: "x9@mailer.example" },
      recipientDomain: "lacspace.com",
    });
    expect(codes(r)).toContain("display_name.other_address");
    expect(r.reasons.join(" ")).toContain("support@lacspace.com");
  });

  it("display name equal to the real address is fine", () => {
    const r = assessRisk({ from: { name: "a@shop.example", address: "a@shop.example" } });
    expect(r.level).toBe("none");
  });

  it("CEO impersonation via gmail → high", () => {
    const r = assessRisk({
      from: { name: "Chandan Sharma (CEO)", address: "chandan.ceo.office@gmail.com" },
      subject: "Quick favour",
      snippet: "Are you at your desk? I need you to buy gift cards urgently for a client.",
      auth: { spf: "pass", dkim: "pass", dmarc: "pass" },
      recipientDomain: "lacspace.com",
      knownContacts: [{ name: "Chandan Sharma", address: "chandan@lacspace.com" }],
    });
    expect(r.level).toBe("high");
    expect(codes(r)).toEqual(expect.arrayContaining(["impersonation.known_contact", "content.payment_request"]));
    expect(codes(r)).not.toContain("auth.dmarc_pass");
  });

  it("free-mail sender claiming a brand", () => {
    const r = assessRisk({ from: { name: "Microsoft Support", address: "ms.support.team@outlook.com" } });
    expect(codes(r)).toContain("free_mail.brand");
    expect(r.level).toBe("low");
  });

  it("free-mail sender claiming a role or your organisation", () => {
    expect(codes(assessRisk({ from: { name: "IT Department", address: "itdept@gmail.com" } }))).toContain("free_mail.role");
    expect(codes(assessRisk({ from: { name: "Lacspace HR", address: "hr.team@gmail.com" }, recipientDomain: "lacspace.com" }))).toContain("free_mail.brand");
  });

  it("custom brandNames", () => {
    const r = assessRisk({ from: { name: "Himal Bikas Support", address: "x@yahoo.com" } }, { brandNames: ["Himal Bikas"] });
    expect(codes(r)).toContain("free_mail.brand");
  });

  it("ordinary person on free mail → none", () => {
    expect(assessRisk({ from: { name: "Ram Thapa", address: "ramthapa@gmail.com" } }).level).toBe("none");
  });

  it.each([
    ["support@lacsp4ce.com"],
    ["support@lacspаce.com"],
    ["support@xn--lacspce-6fg.com"],
    ["billing@lacspace.com.evil.io"],
    ["help@lacspace-support.com"],
  ])("lookalike sender %s → high even with DMARC pass", (address) => {
    const r = assessRisk({
      from: { name: "Lacspace Support", address },
      auth: { spf: "pass", dkim: "pass", dmarc: "pass" },
      recipientDomain: "lacspace.com",
    });
    expect(r.level).toBe("high");
    expect(codes(r)).toContain("lookalike.from");
  });

  it("explains the lookalike in plain English", () => {
    const r = assessRisk({ from: { address: "support@lacsp4ce.com" }, recipientDomain: "lacspace.com" });
    expect(r.reasons[0]).toBe("The sender's address (support@lacsp4ce.com) looks like lacspace.com but is a different domain.");
  });

  it("rn→m lookalike of a trusted domain", () => {
    const r = assessRisk({ from: { address: "security@rnicrosoft.com" }, trustedDomains: ["microsoft.com"] });
    expect(codes(r)).toContain("lookalike.from");
  });

  it("mixed-script domain is flagged", () => {
    const r = assessRisk({ from: { address: "a@lacspаce.com" }, recipientDomain: "lacspace.com" });
    expect(codes(r)).toContain("domain.mixed_script");
  });

  it("lookalike of a known contact's domain", () => {
    const r = assessRisk({
      from: { address: "finance@acmecorrp.com" },
      knownContacts: [{ address: "finance@acmecorp.com" }],
    });
    expect(codes(r)).toContain("lookalike.from");
  });

  it("own domain is never a lookalike", () => {
    const r = assessRisk({ from: { address: "noreply@mail.lacspace.com" }, recipientDomain: "lacspace.com", auth: ok });
    expect(codes(r)).not.toContain("lookalike.from");
    expect(r.level).toBe("none");
  });

  it.each(["[EXTERNAL] Quarterly report", "[EXT] Quarterly report", "External: Quarterly report", "*EXTERNAL* Quarterly report"])(
    "subject tag %s does not raise risk",
    (subject) => {
      const r = assessRisk({ from: { address: "a@partner.example" }, subject, snippet: "Please find the report." });
      expect(r.score).toBe(0);
      expect(r.level).toBe("none");
    },
  );

  it("payment-change wording (English)", () => {
    const r = assessRisk({
      from: { address: "accounts@vendor.example" },
      subject: "Updated remittance info",
      snippet: "Our bank details have changed. Please pay the attached invoice urgently to the new account.",
    });
    expect(codes(r)).toContain("content.payment_request");
    expect(r.signals.find((s) => s.code === "content.payment_request")!.weight).toBe(35);
    expect(r.level).toBe("low");
  });

  it("payment-change wording (Nepali)", () => {
    const r = assessRisk({
      from: { address: "lekha@vendor.example" },
      subject: "तुरुन्तै भुक्तानी गर्नुहोस्",
      snippet: "हाम्रो नयाँ खाता नम्बर तल दिइएको छ।",
    });
    expect(codes(r)).toContain("content.payment_request");
  });

  it("payment wording (romanised Nepali)", () => {
    const r = assessRisk({ from: { address: "a@vendor.example" }, snippet: "turuntai paisa pathaunu hola, naya khata ma" });
    expect(r.signals.find((s) => s.code === "content.payment_request")?.weight).toBe(35);
  });

  it("credential lure", () => {
    const r = assessRisk({
      from: { address: "it@helpdesk-mail.example" },
      subject: "Your password expires today",
      snippet: "Verify your account within 24 hours or it will be suspended.",
    });
    expect(codes(r)).toContain("content.credential_request");
  });

  it("a single money word is only a weak cue", () => {
    const r = assessRisk({ from: { address: "a@shop.example" }, subject: "Your invoice for October" });
    expect(codes(r)).toEqual(["content.cue"]);
    expect(r.level).toBe("none");
  });

  it("link text shows a different domain than the href", () => {
    const r = assessRisk({
      from: { address: "a@shop.example" },
      links: [{ href: "https://login-check.example.net/x", text: "https://www.lacspace.com/login" }],
    });
    expect(codes(r)).toContain("link.text_mismatch");
    expect(r.reasons[0]).toMatch(/shows www\.lacspace\.com but actually goes to login-check\.example\.net/);
  });

  it("link tricks: IP, @ userinfo, punycode, lookalike", () => {
    const r = assessRisk({
      from: { address: "a@shop.example" },
      recipientDomain: "lacspace.com",
      links: [
        { href: "http://192.0.2.55/login", text: "Sign in" },
        { href: "https://lacspace.com@evil.example/", text: "Open" },
        { href: "https://xn--lacspce-6fg.com/", text: "Portal" },
      ],
    });
    expect(codes(r)).toEqual(expect.arrayContaining(["link.ip_address", "link.userinfo", "link.punycode", "link.lookalike"]));
    expect(r.level).toBe("high");
  });

  it("matching link text is fine; mailto and file names are ignored", () => {
    const r = assessRisk({
      from: { address: "a@shop.example" },
      links: [
        { href: "https://www.shop.example/sale", text: "shop.example/sale" },
        { href: "mailto:help@shop.example", text: "help@shop.example" },
        { href: "https://cdn.files.example/x", text: "invoice.pdf" },
      ],
    });
    expect(r.signals).toEqual([]);
  });

  it("false-positive guard: ESP newsletter with DMARC pass and same-org reply-to → none", () => {
    const auth = parseAuthenticationResults(
      "mx.lacspace.com; dkim=pass header.d=acmecorp.com; dkim=pass header.d=esp-mailer.example; spf=pass smtp.mailfrom=bounces.esp-mailer.example; dmarc=pass (p=quarantine) header.from=acmecorp.com",
      { trustedAuthservIds: ["mx.lacspace.com"] },
    );
    const r = assessRisk({
      from: { name: "Acme Corp Newsletter", address: "news@acmecorp.com" },
      replyTo: [{ address: "support@help.acmecorp.com" }],
      returnPath: "bounce-123@bounces.esp-mailer.example",
      subject: "[EXTERNAL] October product update",
      snippet: "New features, a webinar invite and our latest guides.",
      auth,
      recipientDomain: "lacspace.com",
    });
    expect(r.level).toBe("none");
    expect(r.reasons).toEqual([]);
  });

  it("reasons are de-duplicated, ≤ 5, ≤ 120 chars, strongest first", () => {
    const r = assessRisk({
      from: { name: "ceo@lacspace.com", address: "a-very-long-mailbox-name-for-testing-purposes@lacspace-payments-department.example" },
      replyTo: [{ address: "someone@gmail.com" }],
      subject: "URGENT wire transfer",
      snippet: "Our bank details have changed. Verify your account within 24 hours.",
      auth: { spf: "fail", dkim: "fail", dmarc: "fail" },
      recipientDomain: "lacspace.com",
      links: [{ href: "http://192.0.2.1/", text: "lacspace.com" }],
    });
    expect(r.reasons.length).toBeLessThanOrEqual(5);
    expect(new Set(r.reasons).size).toBe(r.reasons.length);
    for (const reason of r.reasons) expect(reason.length).toBeLessThanOrEqual(120);
    const weights = r.signals.map((s) => s.weight);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
    expect(r.score).toBe(100);
    expect(r.level).toBe("high");
  });

  it("never throws on junk", () => {
    expect(() => assessRisk({} as never)).not.toThrow();
    expect(() => assessRisk({ from: { address: 5 as never }, links: [null as never], replyTo: [null as never] })).not.toThrow();
    expect(assessRisk({} as never).level).toBe("none");
  });
});
