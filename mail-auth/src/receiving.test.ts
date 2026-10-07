import { describe, expect, it } from "vitest";
import { assessRisk, inferAuthservIds, parseAuthenticationResults, receivingServer } from "./index";

const gmail = [
  "Delivered-To: me@gmail.com",
  "Received: by 2002:a05:6a10:1234:b0:5e1:aaaa with SMTP id abc;",
  "        Tue, 6 Oct 2026 01:02:03 -0700 (PDT)",
  "ARC-Authentication-Results: i=1; mx.google.com; dkim=pass header.i=@bank.com; spf=pass smtp.mailfrom=bank.com; dmarc=pass (p=REJECT) header.from=bank.com",
  "Return-Path: <alerts@bank.com>",
  "Received: from mail.bank.com (mail.bank.com. [203.0.113.5])",
  "        by mx.google.com with ESMTPS id x1;",
  "Received-SPF: pass (google.com: domain of alerts@bank.com designates 203.0.113.5 as permitted sender) client-ip=203.0.113.5;",
  "Authentication-Results: mx.google.com; dkim=pass header.i=@bank.com; spf=pass smtp.mailfrom=alerts@bank.com; dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=bank.com",
  "Received: from app01.internal.bank.com by mail.bank.com; Tue, 6 Oct 2026",
  "Authentication-Results: forged.example; dmarc=fail",
  "From: Bank <alerts@bank.com>",
  "",
  "body",
].join("\r\n");

const m365 = [
  "Received: from SA1PR12MB0001.namprd12.prod.outlook.com (2603:10b6::1) by SA1PR12MB0002.namprd12.prod.outlook.com; Tue, 6 Oct 2026",
  "Authentication-Results: spf=fail (sender IP is 198.51.100.9) smtp.mailfrom=lacsp4ce.com; dkim=none (message not signed) header.d=none;dmarc=fail action=quarantine header.from=lacsp4ce.com;compauth=fail reason=000",
  "Received-SPF: Fail (protection.outlook.com: domain of lacsp4ce.com does not designate 198.51.100.9 as permitted sender)",
  "Received: from evil.example (198.51.100.9) by BN8NAM12FT066.mail.protection.outlook.com (10.13.1.1); Tue, 6 Oct 2026",
  "Authentication-Results: spf=pass smtp.mailfrom=lacsp4ce.com; dkim=pass header.d=lacsp4ce.com; dmarc=pass header.from=lacsp4ce.com",
  "From: Accounts <billing@lacsp4ce.com>",
  "",
].join("\r\n");

describe("receivingServer / auto trust (1.1.0)", () => {
  it("Gmail: keeps mx.google.com, ignores the forged header below the sender's hop", () => {
    const rs = receivingServer(gmail);
    expect(rs.domains).toEqual(["google.com"]);
    expect(rs.authservIds).toEqual(["mx.google.com"]);
    expect(rs.input.authenticationResults).toHaveLength(1);
    expect(rs.input.receivedSpf).toHaveLength(1);
    expect(inferAuthservIds(gmail)).toEqual(["mx.google.com"]);
    const r = parseAuthenticationResults(gmail, { trustedAuthservIds: "auto" });
    expect(r).toMatchObject({ spf: "pass", dkim: "pass", dmarc: "pass", dmarcPolicy: "reject", authservId: "mx.google.com" });
  });

  it("Microsoft 365: trusts the id-less header above the inbound hop, not the sender's forged pass", () => {
    const rs = receivingServer(m365);
    expect(rs.anonymous).toBe(true);
    expect(rs.authservIds).toEqual([]);
    expect(rs.input.authenticationResults).toHaveLength(1);
    const r = parseAuthenticationResults(m365, { trustedAuthservIds: "auto" });
    expect(r).toMatchObject({ spf: "fail", dmarc: "fail", headerFrom: "lacsp4ce.com" });
  });

  it("a forged header with no provider header above it is not trusted", () => {
    const h = [
      "Received: from evil.example by mx1.hostinger.com; Tue, 6 Oct 2026",
      "Authentication-Results: mx.evil.example; dmarc=pass header.from=bank.com",
      "Authentication-Results: dmarc=pass header.from=bank.com",
      "",
    ].join("\n");
    const rs = receivingServer(h, { mailboxHost: "imap.hostinger.com" });
    expect(rs.domains).toEqual(["hostinger.com"]);
    expect(rs.input.authenticationResults).toEqual([]);
    expect(parseAuthenticationResults(h, { trustedAuthservIds: "auto" })).toMatchObject({ spf: null, dkim: null, dmarc: null });
  });

  it("mailboxHost adds the provider domain; empty or junk input never throws", () => {
    const h = "Received: from x.example by smtp.titan.email; d\nAuthentication-Results: mx.titan.email; dmarc=pass header.from=a.com\n\n";
    expect(inferAuthservIds(h, { mailboxHost: "imap.titan.email" })).toEqual(["mx.titan.email"]);
    expect(receivingServer("").authservIds).toEqual([]);
    expect(receivingServer(undefined as unknown as string).domains).toEqual([]);
  });
});

describe("assessRisk options (1.1.0)", () => {
  const base = { from: { name: "Lacspace", address: "news@lacspace.mail" }, recipientDomain: "lacspace.com" };

  it("tldVariants 'context' ignores a different ending unless auth fails or it asks for money/sign-in", () => {
    expect(assessRisk(base).signals.map((s) => s.code)).toContain("lookalike.from");
    expect(assessRisk(base, { tldVariants: "context" }).signals.map((s) => s.code)).not.toContain("lookalike.from");
    const pay = { ...base, subject: "Our bank details have changed, please update before paying" };
    expect(assessRisk(pay, { tldVariants: "context" }).signals.map((s) => s.code)).toContain("lookalike.from");
    const failing = { ...base, auth: { spf: "fail" as const, dkim: "none" as const, dmarc: "fail" as const } };
    expect(assessRisk(failing, { tldVariants: "context" }).signals.map((s) => s.code)).toContain("lookalike.from");
    // A real lookalike name is still flagged in context mode.
    const typo = { from: { address: "billing@lacsp4ce.com" }, recipientDomain: "lacspace.com" };
    expect(assessRisk(typo, { tldVariants: "context" }).signals.map((s) => s.code)).toContain("lookalike.from");
  });

  it("mailingList discounts a different-domain Reply-To to 5", () => {
    const msg = { from: { address: "digest@news.example.org" }, replyTo: [{ address: "list@lists.other.net" }] };
    const sig = (m: object) => assessRisk(m as never).signals.find((s) => s.code === "reply_to.different_domain")?.weight;
    expect(sig(msg)).toBe(20);
    expect(sig({ ...msg, mailingList: true })).toBe(5);
    // free-mail Reply-To is not discounted
    const free = assessRisk({ ...msg, replyTo: [{ address: "x@gmail.com" }], mailingList: true });
    expect(free.signals.find((s) => s.code === "reply_to.free_mail")?.weight).toBe(30);
  });
});
