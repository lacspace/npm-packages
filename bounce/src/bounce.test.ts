import { describe, expect, it } from "vitest";
import { classifyStatus, isAutoReply, isBounce, isBounceSender, parseBounce } from "./index";

const CRLF = (lines: string[]) => lines.join("\r\n");
const LF = (lines: string[]) => lines.join("\n");

/* ------------------------------------------------------------------ */
/* Fixtures (synthetic, modelled on real vendor output)               */
/* ------------------------------------------------------------------ */

const ORIGINAL_HEADERS = [
  "Return-Path: <news@shop.example>",
  "From: Shop News <news@shop.example>",
  "To: ghost@gmail.example",
  "Subject: October deals",
  "Message-ID: <camp-42.r-7@shop.example>",
  "Date: Mon, 5 Oct 2026 10:00:00 +0000",
];

function dsnMessage(opts: {
  from?: string;
  subject?: string;
  perRecipient: string[][];
  reportingMta?: string;
  notice?: string;
  original?: "rfc822" | "headers" | "none";
}): string[] {
  const b = "BOUND_dsn_1";
  const lines = [
    `From: ${opts.from ?? "Mail Delivery Subsystem <mailer-daemon@googlemail.com>"}`,
    "To: news@shop.example",
    `Subject: ${opts.subject ?? "Delivery Status Notification (Failure)"}`,
    "Auto-Submitted: auto-replied",
    "MIME-Version: 1.0",
    `Content-Type: multipart/report; report-type=delivery-status;`,
    `\tboundary="${b}"`,
    "",
    `--${b}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    opts.notice ?? "Your message could not be delivered.",
    "",
    `--${b}`,
    "Content-Type: message/delivery-status",
    "",
    `Reporting-MTA: dns; ${opts.reportingMta ?? "mx.google.com"}`,
    "Arrival-Date: Mon, 05 Oct 2026 10:00:01 -0700",
    "",
  ];
  for (const r of opts.perRecipient) lines.push(...r, "");
  const orig = opts.original ?? "rfc822";
  if (orig !== "none") {
    lines.push(`--${b}`, `Content-Type: ${orig === "rfc822" ? "message/rfc822" : "text/rfc822-headers"}`, "", ...ORIGINAL_HEADERS, "");
    if (orig === "rfc822") lines.push("Hello! Big deals inside. This body mentions user unknown but must be ignored.", "");
  }
  lines.push(`--${b}--`, "");
  return lines;
}

const gmailDsn = dsnMessage({
  notice: "** Address not found **\n\nYour message wasn't delivered to ghost@gmail.example because the address couldn't be found.",
  perRecipient: [
    [
      "Final-Recipient: rfc822; ghost@gmail.example",
      "Action: failed",
      "Status: 5.1.1",
      "Remote-MTA: dns; gmail-smtp-in.l.google.com. (142.250.0.27, the server for the domain gmail.example.)",
      "Diagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach does not exist. Please try",
      "    550-5.1.1 double-checking the recipient's email address for typos or",
      "    550 5.1.1 https://support.google.com/mail/?p=NoSuchUser",
      "Last-Attempt-Date: Mon, 05 Oct 2026 10:00:02 -0700",
    ],
  ],
});

const normalEmail = CRLF([
  "From: Alice <alice@example.com>",
  "To: bob@example.org",
  "Subject: Lunch tomorrow?",
  "Message-ID: <abc123@example.com>",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Hey Bob, are you free for lunch tomorrow? The new place does not exist yet, ha.",
  "",
]);

/* ------------------------------------------------------------------ */
/* RFC 3464 DSN                                                       */
/* ------------------------------------------------------------------ */

describe("RFC 3464 delivery status notifications", () => {
  it("parses a Gmail DSN (5.1.1) from a raw CRLF message", () => {
    const r = parseBounce(CRLF(gmailDsn));
    expect(r).not.toBeNull();
    expect(r!.kind).toBe("hard");
    expect(r!.category).toBe("mailbox_unknown");
    expect(r!.reportingMta).toBe("mx.google.com");
    expect(r!.recipients).toHaveLength(1);
    const rc = r!.recipients[0]!;
    expect(rc.address).toBe("ghost@gmail.example");
    expect(rc.action).toBe("failed");
    expect(rc.status).toBe("5.1.1");
    expect(rc.diagnostic).toContain("does not exist");
    expect(rc.remoteMta).toContain("gmail-smtp-in.l.google.com");
    expect(r!.originalMessageId).toBe("<camp-42.r-7@shop.example>");
    expect(r!.originalSubject).toBe("October deals");
    expect(r!.confidence).toBeGreaterThanOrEqual(0.9);
    expect(r!.reason).toMatch(/does not exist/);
  });

  it("gives the same result for LF line endings", () => {
    const a = parseBounce(CRLF(gmailDsn));
    const b = parseBounce(LF(gmailDsn));
    expect(b).toEqual(a);
  });

  it("accepts Uint8Array input", () => {
    const bytes = new TextEncoder().encode(CRLF(gmailDsn));
    const r = parseBounce(bytes);
    expect(r?.kind).toBe("hard");
    expect(r?.recipients[0]?.address).toBe("ghost@gmail.example");
  });

  it("treats Action: delayed as soft / temporary", () => {
    const r = parseBounce(
      CRLF(
        dsnMessage({
          subject: "Delivery Status Notification (Delay)",
          perRecipient: [
            [
              "Final-Recipient: rfc822; slow@corp.example",
              "Action: delayed",
              "Status: 4.4.7",
              "Diagnostic-Code: smtp; 451 4.4.7 Message delayed, will retry",
              "Will-Retry-Until: Wed, 07 Oct 2026 10:00:00 -0700",
            ],
          ],
        }),
      ),
    );
    expect(r?.kind).toBe("soft");
    expect(r?.category).toBe("temporary");
    expect(r?.recipients[0]?.action).toBe("delayed");
    expect(r?.reason).toMatch(/delayed/);
  });

  it("delayed with a 5.x.x status is still soft", () => {
    const r = parseBounce(
      LF(
        dsnMessage({
          perRecipient: [["Final-Recipient: rfc822; later@corp.example", "Action: delayed", "Status: 5.0.0"]],
        }),
      ),
    );
    expect(r?.kind).toBe("soft");
  });

  it("maps 5.2.2 mailbox full to soft", () => {
    const r = parseBounce(
      CRLF(
        dsnMessage({
          perRecipient: [
            [
              "Final-Recipient: rfc822;full@yahoo.example",
              "Action: failed",
              "Status: 5.2.2",
              "Diagnostic-Code: smtp; 552 5.2.2 Mailbox over quota",
            ],
          ],
        }),
      ),
    );
    expect(r?.kind).toBe("soft");
    expect(r?.category).toBe("mailbox_full");
  });

  it("maps 4.2.2 mailbox full to soft", () => {
    const r = parseBounce(
      CRLF(dsnMessage({ perRecipient: [["Final-Recipient: rfc822; f2@x.example", "Action: delayed", "Status: 4.2.2"]] })),
    );
    expect(r?.category).toBe("mailbox_full");
    expect(r?.kind).toBe("soft");
  });

  it("5.7.1 Spamhaus block is soft blocked_spam", () => {
    const r = parseBounce(
      CRLF(
        dsnMessage({
          perRecipient: [
            [
              "Final-Recipient: rfc822; ceo@bank.example",
              "Action: failed",
              "Status: 5.7.1",
              "Diagnostic-Code: smtp; 554 5.7.1 Service unavailable; Client host [203.0.113.9] blocked using zen.spamhaus.org",
            ],
          ],
        }),
      ),
    );
    expect(r?.kind).toBe("soft");
    expect(r?.category).toBe("blocked_spam");
    expect(r?.reason).toMatch(/sender is the problem/);
  });

  it("5.7.26 DMARC failure is soft auth_failed", () => {
    const r = parseBounce(
      CRLF(
        dsnMessage({
          perRecipient: [
            [
              "Final-Recipient: rfc822; user@gmail.example",
              "Action: failed",
              "Status: 5.7.26",
              "Diagnostic-Code: smtp; 550-5.7.26 Unauthenticated email from shop.example is not accepted due to domain's DMARC policy.",
            ],
          ],
        }),
      ),
    );
    expect(r?.kind).toBe("soft");
    expect(r?.category).toBe("auth_failed");
  });

  it("5.7.1 policy rejection is soft blocked_policy", () => {
    const r = parseBounce(
      CRLF(
        dsnMessage({
          perRecipient: [
            [
              "Final-Recipient: rfc822; staff@gov.example",
              "Action: failed",
              "Status: 5.7.1",
              "Diagnostic-Code: smtp; 550 5.7.1 Message rejected by recipient policy: external senders not allowed",
            ],
          ],
        }),
      ),
    );
    expect(r?.kind).toBe("soft");
    expect(r?.category).toBe("blocked_policy");
  });

  it("5.3.4 is message_too_large", () => {
    const r = parseBounce(
      CRLF(
        dsnMessage({
          perRecipient: [
            [
              "Final-Recipient: rfc822; big@corp.example",
              "Action: failed",
              "Status: 5.3.4",
              "Diagnostic-Code: smtp; 552 5.3.4 Message size exceeds fixed maximum message size",
            ],
          ],
        }),
      ),
    );
    expect(r?.category).toBe("message_too_large");
    expect(r?.kind).toBe("soft");
  });

  it("4.7.28 unusual rate is rate_limited", () => {
    const r = parseBounce(
      CRLF(
        dsnMessage({
          perRecipient: [
            [
              "Final-Recipient: rfc822; a@gmail.example",
              "Action: delayed",
              "Status: 4.7.28",
              "Diagnostic-Code: smtp; 421-4.7.28 Gmail has detected an unusual rate of unsolicited mail",
            ],
          ],
        }),
      ),
    );
    expect(r?.category).toBe("rate_limited");
    expect(r?.kind).toBe("soft");
  });

  it("5.1.2 is domain_unknown hard", () => {
    const r = parseBounce(
      CRLF(dsnMessage({ perRecipient: [["Final-Recipient: rfc822; a@nope.example", "Action: failed", "Status: 5.1.2"]] })),
    );
    expect(r?.category).toBe("domain_unknown");
    expect(r?.kind).toBe("hard");
  });

  it("several recipients: hard wins over delayed", () => {
    const r = parseBounce(
      CRLF(
        dsnMessage({
          perRecipient: [
            ["Final-Recipient: rfc822; wait@a.example", "Action: delayed", "Status: 4.4.1"],
            ["Original-Recipient: rfc822; Gone@B.example", "Final-Recipient: rfc822; gone@b.example", "Action: failed", "Status: 5.1.1"],
          ],
        }),
      ),
    );
    expect(r?.kind).toBe("hard");
    expect(r?.recipients.map((x) => x.address)).toEqual(["wait@a.example", "gone@b.example"]);
  });

  it("returns null for a success-only DSN", () => {
    const r = parseBounce(
      CRLF(
        dsnMessage({
          subject: "Delivery Status Notification (Success)",
          perRecipient: [["Final-Recipient: rfc822; ok@a.example", "Action: delivered", "Status: 2.0.0"]],
        }),
      ),
    );
    expect(r).toBeNull();
  });

  it("reads original Message-ID and Subject from text/rfc822-headers", () => {
    const r = parseBounce(
      CRLF(
        dsnMessage({
          original: "headers",
          perRecipient: [["Final-Recipient: rfc822; x@y.example", "Action: failed", "Status: 5.1.1"]],
        }),
      ),
    );
    expect(r?.originalMessageId).toBe("<camp-42.r-7@shop.example>");
    expect(r?.originalSubject).toBe("October deals");
  });

  it("decodes a base64 delivery-status part and quoted-printable notice", () => {
    const dsn = "Reporting-MTA: dns; mx.zoho.example\r\n\r\nFinal-Recipient: rfc822; b64@z.example\r\nAction: failed\r\nStatus: 5.1.1\r\n";
    const b64 = btoaUtf8(dsn).replace(/(.{60})/g, "$1\r\n");
    const raw = CRLF([
      "From: MAILER-DAEMON@mx.zoho.example",
      "To: news@shop.example",
      "Subject: Undelivered Mail Returned to Sender",
      'Content-Type: multipart/report; report-type=delivery-status; boundary="zz"',
      "",
      "--zz",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "Delivery failed =E2=80=94 address not f=",
      "ound.",
      "--zz",
      "Content-Type: message/delivery-status",
      "Content-Transfer-Encoding: base64",
      "",
      b64,
      "--zz--",
    ]);
    const r = parseBounce(raw);
    expect(r?.kind).toBe("hard");
    expect(r?.reportingMta).toBe("mx.zoho.example");
    expect(r?.recipients[0]?.address).toBe("b64@z.example");
  });

  it("structured input with a delivery-status part", () => {
    const r = parseBounce({
      headers: "From: postmaster@mail.example\r\nSubject: Returned mail\r\nTo: news@shop.example\r\n",
      text: "The following message could not be delivered.",
      parts: [
        {
          contentType: "message/delivery-status",
          body: "Reporting-MTA: dns; mail.example\n\nFinal-Recipient: rfc822;<Nobody@Mail.Example>\nAction: failed\nStatus: 5.1.1\nDiagnostic-Code: smtp; 550 5.1.1 <nobody@mail.example>: Recipient address rejected: User unknown",
        },
        { contentType: "text/rfc822-headers", body: ORIGINAL_HEADERS.join("\n") },
      ],
    });
    expect(r?.kind).toBe("hard");
    expect(r?.recipients[0]?.address).toBe("nobody@mail.example");
    expect(r?.originalMessageId).toBe("<camp-42.r-7@shop.example>");
  });

  it("DSN fields flattened into the text body are still parsed", () => {
    const r = parseBounce({
      headers: "From: MAILER-DAEMON@relay.example\nSubject: Undelivered Mail Returned to Sender\n",
      text: "This is the mail system.\n\nReporting-MTA: dns; relay.example\n\nFinal-Recipient: rfc822; flat@x.example\nAction: failed\nStatus: 5.1.1\n",
    });
    expect(r?.kind).toBe("hard");
    expect(r?.recipients[0]?.address).toBe("flat@x.example");
  });
});

/* ------------------------------------------------------------------ */
/* Vendor text bounces without a DSN part                             */
/* ------------------------------------------------------------------ */

describe("vendor text bounces", () => {
  it("Gmail: Address not found", () => {
    const r = parseBounce({
      headers: CRLF([
        "From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
        "To: news@shop.example",
        "Subject: Delivery Status Notification (Failure)",
        "In-Reply-To: <camp-42.r-7@shop.example>",
      ]),
      text: [
        "** Address not found **",
        "",
        "Your message wasn't delivered to nosuch@gmail.example because the address couldn't be found, or is unable to receive mail.",
        "",
        "Learn more here: https://support.google.com/mail/?p=NoSuchUser",
        "",
        "The response was:",
        "",
        "550 5.1.1 The email account that you tried to reach does not exist. Please try double-checking the recipient's email address for typos or unnecessary spaces.",
      ].join("\n"),
    });
    expect(r?.kind).toBe("hard");
    expect(r?.category).toBe("mailbox_unknown");
    expect(r?.recipients[0]?.address).toBe("nosuch@gmail.example");
    expect(r?.recipients[0]?.status).toBe("5.1.1");
    expect(r?.originalMessageId).toBe("<camp-42.r-7@shop.example>");
  });

  it("Gmail: domain not found (DNS error)", () => {
    const r = parseBounce({
      headers: "From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>\nTo: news@shop.example\nSubject: Delivery Status Notification (Failure)\n",
      text: "** Address not found **\n\nYour message wasn't delivered to sales@typo-domain.example because the domain typo-domain.example couldn't be found. Check for typos or unnecessary spaces and try again.\n\nThe response was:\n\nDNS Error: DNS type 'mx' lookup of typo-domain.example responded with code NXDOMAIN Domain name not found: typo-domain.example",
    });
    expect(r?.kind).toBe("hard");
    expect(r?.category).toBe("domain_unknown");
    expect(r?.recipients[0]?.address).toBe("sales@typo-domain.example");
  });

  it("Gmail: delay notice", () => {
    const r = parseBounce({
      headers: "From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>\nTo: news@shop.example\nSubject: Delivery Status Notification (Delay)\n",
      text: "** Delivery incomplete **\n\nThere was a temporary problem delivering your message to busy@corp.example. Gmail will retry for 46 more hours. You'll be notified if the delivery fails permanently.\n\nThe response was:\n\n421 4.7.0 Try again later, closing connection.",
    });
    expect(r?.kind).toBe("soft");
    expect(r?.category).toBe("temporary");
    expect(r?.recipients[0]).toMatchObject({ address: "busy@corp.example", action: "delayed", status: "4.7.0" });
  });

  it("Gmail: blocked as spam (5.7.1 text)", () => {
    const r = parseBounce({
      headers: "From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>\nTo: news@shop.example\nSubject: Delivery Status Notification (Failure)\n",
      text: "** Message blocked **\n\nYour message to friend@gmail.example has been blocked. See technical details below for more information.\n\nThe response was:\n\n550 5.7.1 Our system has detected that this message is likely unsolicited mail. To reduce the amount of spam sent to Gmail, this message has been blocked.",
    });
    expect(r?.kind).toBe("soft");
    expect(r?.category).toBe("blocked_spam");
  });

  it("Outlook / Microsoft 365: Undeliverable (5.1.10)", () => {
    const r = parseBounce({
      headers: CRLF([
        "From: Microsoft Outlook <postmaster@contoso.example>",
        "To: news@shop.example",
        "Subject: Undeliverable: October deals",
        "X-MS-Exchange-Message-Is-Ndr: true",
      ]),
      text: [
        "Your message to old.employee@contoso.example couldn't be delivered.",
        "old.employee wasn't found at contoso.example.",
        "",
        "news    Office 365    old.employee",
        "Action Required                 Recipient",
        "Unknown To address",
        "",
        "Diagnostic information for administrators:",
        "Generating server: AM0PR01MB1234.eurprd01.prod.outlook.com",
        "old.employee@contoso.example",
        "Remote Server returned '550 5.1.10 RESOLVER.ADR.RecipientNotFound; Recipient not found by SMTP address lookup'",
        "",
        "Original message headers:",
        "Message-ID: <camp-42.r-7@shop.example>",
        "Subject: October deals",
      ].join("\r\n"),
    });
    expect(r?.kind).toBe("hard");
    expect(r?.category).toBe("mailbox_unknown");
    expect(r?.recipients.map((x) => x.address)).toEqual(["old.employee@contoso.example"]);
    expect(r?.recipients[0]?.status).toBe("5.1.10");
    expect(r?.originalMessageId).toBe("<camp-42.r-7@shop.example>");
    expect(r?.originalSubject).toBe("October deals");
  });

  it("Outlook: DMARC rejection 5.7.509 is auth_failed", () => {
    const r = parseBounce({
      headers: "From: postmaster@outlook.example\nTo: news@shop.example\nSubject: Undeliverable: October deals\n",
      text: "Your message to person@outlook.example couldn't be delivered.\n\nRemote Server returned '550 5.7.509 Access denied, sending domain shop.example does not pass DMARC verification and has a DMARC policy of reject.'",
    });
    expect(r?.kind).toBe("soft");
    expect(r?.category).toBe("auth_failed");
  });

  it("Zoho: user unknown", () => {
    const r = parseBounce({
      headers: "From: mailer-daemon@mx.zoho.example\nTo: news@shop.example\nSubject: Undelivered Mail Returned to Sender\n",
      text: "This message was created automatically by mail delivery software.\nA message that you sent could not be delivered to one or more of its recipients. This is a permanent error.\n\nThe following address(es) failed:\n\nmissing@zoho-user.example, ERROR CODE :550 - 5.1.1 user unknown\n",
    });
    expect(r?.kind).toBe("hard");
    expect(r?.category).toBe("mailbox_unknown");
    expect(r?.recipients[0]?.address).toBe("missing@zoho-user.example");
  });

  it("Zoho: mailbox quota exceeded", () => {
    const r = parseBounce({
      headers: "From: mailer-daemon@mx.zoho.example\nTo: news@shop.example\nSubject: Undelivered Mail Returned to Sender\n",
      text: "This message was created automatically by mail delivery software.\n\nThe following address(es) failed:\n\nstuffed@zoho-user.example, ERROR CODE :552 - 5.2.2 Mailbox quota exceeded\n",
    });
    expect(r?.kind).toBe("soft");
    expect(r?.category).toBe("mailbox_full");
  });

  it("Postfix: Undelivered Mail Returned to Sender (text only)", () => {
    const r = parseBounce(
      LF([
        "From: MAILER-DAEMON@mail.example (Mail Delivery System)",
        "To: news@shop.example",
        "Subject: Undelivered Mail Returned to Sender",
        "Content-Type: text/plain; charset=us-ascii",
        "",
        "This is the mail system at host mail.example.",
        "",
        "I'm sorry to have to inform you that your message could not",
        "be delivered to one or more recipients.",
        "",
        "                   The mail system",
        "",
        "<typo@dest.example>: host mx.dest.example[198.51.100.7] said: 550 5.1.1",
        "    <typo@dest.example>: Recipient address rejected: User unknown in virtual",
        "    mailbox table (in reply to RCPT TO command)",
        "",
      ]),
    );
    expect(r?.kind).toBe("hard");
    expect(r?.category).toBe("mailbox_unknown");
    expect(r?.recipients).toHaveLength(1);
    expect(r?.recipients[0]?.address).toBe("typo@dest.example");
    expect(r?.recipients[0]?.diagnostic).toContain("User unknown");
  });

  it("Postfix: full multipart/report", () => {
    const r = parseBounce(
      CRLF(
        dsnMessage({
          from: "MAILER-DAEMON@mail.example (Mail Delivery System)",
          subject: "Undelivered Mail Returned to Sender",
          reportingMta: "mail.example",
          perRecipient: [
            [
              "Final-Recipient: rfc822; typo@dest.example",
              "Original-Recipient: rfc822;typo@dest.example",
              "Action: failed",
              "Status: 5.1.1",
              "Remote-MTA: dns; mx.dest.example",
              "Diagnostic-Code: smtp; 550 5.1.1 <typo@dest.example>: Recipient address",
              "    rejected: User unknown in virtual mailbox table",
            ],
          ],
        }),
      ),
    );
    expect(r?.kind).toBe("hard");
    expect(r?.recipients[0]?.remoteMta).toBe("mx.dest.example");
    expect(r?.recipients[0]?.diagnostic).toContain("rejected: User unknown");
  });

  it("Hostinger / Titan: Postfix-style bounce", () => {
    const r = parseBounce({
      headers: "From: Mail Delivery System <MAILER-DAEMON@mx1.titan.example>\nTo: hello@client.example\nSubject: Undelivered Mail Returned to Sender\n",
      text: "This is the mail system at host mx1.titan.example.\n\nI'm sorry to have to inform you that your message could not\nbe delivered to one or more recipients.\n\n<info@closed-business.example>: host mx.closed-business.example[192.0.2.10] said:\n    550 5.2.1 <info@closed-business.example>: Mailbox disabled for this recipient\n    (in reply to RCPT TO command)\n",
    });
    expect(r?.kind).toBe("hard");
    expect(r?.category).toBe("mailbox_unknown");
    expect(r?.recipients[0]?.address).toBe("info@closed-business.example");
    expect(r?.recipients[0]?.status).toBe("5.2.1");
  });

  it("Hostinger shared hosting: Exim 'Mail delivery failed'", () => {
    const r = parseBounce({
      headers: "From: Mail Delivery System <Mailer-Daemon@srv123.hstgr.example>\nTo: hello@client.example\nSubject: Mail delivery failed: returning message to sender\nX-Failed-Recipients: overfull@isp.example\nAuto-Submitted: auto-replied\n",
      text: "This message was created automatically by mail delivery software.\n\nA message that you sent could not be delivered to one or more of its\nrecipients. This is a permanent error. The following address(es) failed:\n\n  overfull@isp.example\n    host mx.isp.example [198.51.100.20]\n    SMTP error from remote mail server after RCPT TO:<overfull@isp.example>:\n    552 5.2.2 Mailbox full\n",
    });
    expect(r?.kind).toBe("soft");
    expect(r?.category).toBe("mailbox_full");
    expect(r?.recipients[0]?.address).toBe("overfull@isp.example");
  });

  it("Exim: user unknown with X-Failed-Recipients", () => {
    const raw = LF([
      "From: Mail Delivery System <Mailer-Daemon@mx.sender.example>",
      "To: news@shop.example",
      "Subject: Mail delivery failed: returning message to sender",
      "X-Failed-Recipients: left@company.example",
      "Auto-Submitted: auto-replied",
      "",
      "This message was created automatically by mail delivery software.",
      "",
      "A message that you sent could not be delivered to one or more of its",
      "recipients. This is a permanent error. The following address(es) failed:",
      "",
      "  left@company.example",
      "    host mx.company.example [203.0.113.5]",
      "    SMTP error from remote mail server after RCPT TO:<left@company.example>:",
      "    550 5.1.1 <left@company.example>: Recipient address rejected: User unknown",
      "",
      "------ This is a copy of the message, including all the headers. ------",
      "",
      ...ORIGINAL_HEADERS,
      "",
      "Body with spam words that should be ignored.",
    ]);
    const r = parseBounce(raw);
    expect(r?.kind).toBe("hard");
    expect(r?.category).toBe("mailbox_unknown");
    expect(r?.recipients.map((x) => x.address)).toEqual(["left@company.example"]);
    expect(r?.originalMessageId).toBe("<camp-42.r-7@shop.example>");
    expect(r?.originalSubject).toBe("October deals");
  });

  it("Exim: unrouteable address is domain_unknown", () => {
    const r = parseBounce({
      headers: "From: Mail Delivery System <Mailer-Daemon@mx.sender.example>\nTo: news@shop.example\nSubject: Mail delivery failed: returning message to sender\nX-Failed-Recipients: bob@no-such-domain.example\n",
      text: "This message was created automatically by mail delivery software.\n\nA message that you sent could not be delivered to one or more of its\nrecipients. This is a permanent error. The following address(es) failed:\n\n  bob@no-such-domain.example\n    Unrouteable address\n",
    });
    expect(r?.kind).toBe("hard");
    expect(r?.category).toBe("domain_unknown");
  });

  it("qmail: failure notice", () => {
    const r = parseBounce(
      CRLF([
        "From: MAILER-DAEMON@mx.qmail.example",
        "To: news@shop.example",
        "Subject: failure notice",
        "",
        "Hi. This is the qmail-send program at mx.qmail.example.",
        "I'm afraid I wasn't able to deliver your message to the following addresses.",
        "This is a permanent error; I've given up. Sorry it didn't work out.",
        "",
        "<nouser@qdest.example>:",
        "198.51.100.30 does not like recipient.",
        "Remote host said: 550 5.1.1 <nouser@qdest.example>... User unknown",
        "Giving up on 198.51.100.30.",
        "",
        "--- Below this line is a copy of the message.",
        "",
        ...ORIGINAL_HEADERS,
      ]),
    );
    expect(r?.kind).toBe("hard");
    expect(r?.category).toBe("mailbox_unknown");
    expect(r?.recipients[0]?.address).toBe("nouser@qdest.example");
    expect(r?.originalMessageId).toBe("<camp-42.r-7@shop.example>");
  });

  it("quoted-printable text/plain inside multipart/alternative", () => {
    const raw = CRLF([
      "From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>",
      "To: news@shop.example",
      "Subject: Delivery Status Notification (Failure)",
      'Content-Type: multipart/alternative; boundary="alt"',
      "",
      "--alt",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "Your message wasn't delivered to qp-user@gmail.example because the address c=",
      "ouldn't be found.",
      "",
      "550 5.1.1 The email account that you tried to reach does not exist=2E",
      "--alt",
      "Content-Type: text/html; charset=UTF-8",
      "",
      "<p>HTML copy</p>",
      "--alt--",
    ]);
    const r = parseBounce(raw);
    expect(r?.kind).toBe("hard");
    expect(r?.recipients[0]?.address).toBe("qp-user@gmail.example");
  });

  it("HTML-only bounce body", () => {
    const r = parseBounce({
      headers: "From: postmaster@mail.example\nTo: news@shop.example\nSubject: Undeliverable: hi\n",
      html: "<html><body><p>Your message to <b>gone@mail.example</b> couldn't be delivered.</p><p>Remote Server returned &#39;550 5.1.1 User unknown&#39;</p></body></html>",
    });
    expect(r?.kind).toBe("hard");
    expect(r?.recipients[0]?.address).toBe("gone@mail.example");
  });

  it("bounce-shaped mail that can't be read is kind 'unknown'", () => {
    const r = parseBounce({
      headers: "From: MAILER-DAEMON@mx.example\nTo: news@shop.example\nSubject: Returned mail: see transcript for details\n",
      text: "Something went wrong.",
    });
    expect(r?.kind).toBe("unknown");
    expect(r?.confidence).toBeLessThan(0.5);
  });

  it("Exim bounce with Auto-Submitted is a bounce, not an auto-reply", () => {
    const r = parseBounce({
      headers: "From: Mail Delivery System <Mailer-Daemon@mx.example>\nTo: news@shop.example\nSubject: Mail delivery failed: returning message to sender\nAuto-Submitted: auto-replied\n",
      text: "The following address(es) failed:\n\n  gone@x.example\n    550 5.1.1 No such user\n",
    });
    expect(r?.kind).toBe("hard");
  });
});

/* ------------------------------------------------------------------ */
/* ARF complaints                                                     */
/* ------------------------------------------------------------------ */

function arf(opts: { rcptTo?: boolean; type?: string }): string {
  return CRLF([
    "From: Yahoo! Mail AntiSpam Feedback <feedback@arf.mail.yahoo.example>",
    "To: fbl@shop.example",
    "Subject: FW: October deals",
    'Content-Type: multipart/report; report-type=feedback-report; boundary="arf"',
    "",
    "--arf",
    "Content-Type: text/plain",
    "",
    "This is an email abuse report for an email message received from IP 203.0.113.9.",
    "",
    "--arf",
    "Content-Type: message/feedback-report",
    "",
    `Feedback-Type: ${opts.type ?? "abuse"}`,
    "User-Agent: Yahoo!-Mail-Feedback/2.0",
    "Version: 0.1",
    "Original-Mail-From: <bounce@shop.example>",
    ...(opts.rcptTo ? ["Original-Rcpt-To: <angry@yahoo.example>"] : []),
    "Arrival-Date: Mon, 05 Oct 2026 10:00:00 +0000",
    "Reported-Domain: shop.example",
    "",
    "--arf",
    "Content-Type: message/rfc822",
    "",
    "From: news@shop.example",
    "To: Angry Reader <reader@yahoo.example>",
    "Subject: October deals",
    "Message-ID: <camp-42.r-9@shop.example>",
    "",
    "Deals!",
    "--arf--",
  ]);
}

describe("ARF complaints", () => {
  it("Yahoo-style ARF with Original-Rcpt-To", () => {
    const r = parseBounce(arf({ rcptTo: true }));
    expect(r?.kind).toBe("complaint");
    expect(r?.feedbackType).toBe("abuse");
    expect(r?.userAgent).toBe("Yahoo!-Mail-Feedback/2.0");
    expect(r?.recipients).toEqual([{ address: "angry@yahoo.example" }]);
    expect(r?.originalMessageId).toBe("<camp-42.r-9@shop.example>");
    expect(r?.originalSubject).toBe("October deals");
    expect(r?.confidence).toBeGreaterThan(0.9);
  });

  it("ARF without Original-Rcpt-To falls back to the embedded To", () => {
    const r = parseBounce(arf({}));
    expect(r?.recipients).toEqual([{ address: "reader@yahoo.example" }]);
  });

  it("ARF feedback types pass through", () => {
    expect(parseBounce(arf({ type: "fraud", rcptTo: true }))?.feedbackType).toBe("fraud");
  });

  it("ARF as structured parts", () => {
    const r = parseBounce({
      headers: 'From: fbl@isp.example\nSubject: complaint\nContent-Type: multipart/report; report-type=feedback-report; boundary="x"\n',
      parts: [
        { contentType: "message/feedback-report", body: "Feedback-Type: abuse\nUser-Agent: SomeISP/1.0\nVersion: 1\nOriginal-Rcpt-To: user@isp.example\n" },
        { contentType: "text/rfc822-headers", body: "Message-ID: <m1@shop.example>\nSubject: Hi\nTo: user@isp.example\n" },
      ],
    });
    expect(r?.kind).toBe("complaint");
    expect(r?.recipients[0]?.address).toBe("user@isp.example");
    expect(r?.originalMessageId).toBe("<m1@shop.example>");
  });
});

/* ------------------------------------------------------------------ */
/* Auto-replies and challenges                                        */
/* ------------------------------------------------------------------ */

describe("auto-replies", () => {
  it("Auto-Submitted: auto-replied (headers only)", () => {
    const r = parseBounce({
      headers: "From: Dana <dana@corp.example>\nTo: news@shop.example\nSubject: Re: October deals\nAuto-Submitted: auto-replied\nIn-Reply-To: <camp-42.r-7@shop.example>\n",
    });
    expect(r?.kind).toBe("auto-reply");
    expect(r?.recipients).toEqual([{ address: "dana@corp.example" }]);
    expect(r?.originalMessageId).toBe("<camp-42.r-7@shop.example>");
    expect(r?.originalSubject).toBe("October deals");
    expect(r?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("X-Autoreply: yes", () => {
    expect(parseBounce({ headers: "From: a@b.example\nSubject: hi\nX-Autoreply: yes\n" })?.kind).toBe("auto-reply");
  });

  it("X-Autorespond", () => {
    expect(parseBounce({ headers: "From: a@b.example\nSubject: hi\nX-Autorespond: Vacation\n" })?.kind).toBe("auto-reply");
  });

  it("Precedence: auto_reply", () => {
    expect(parseBounce({ headers: "From: a@b.example\nSubject: Thanks\nPrecedence: auto_reply\n" })?.kind).toBe("auto-reply");
  });

  it("Exchange inbox rules loop + Automatic reply subject", () => {
    const r = parseBounce({
      headers: "From: Sam <sam@contoso.example>\r\nSubject: Automatic reply: October deals\r\nX-MS-Exchange-Inbox-Rules-Loop: sam@contoso.example\r\n",
      text: "I am out of the office until Monday.",
    });
    expect(r?.kind).toBe("auto-reply");
    expect(r?.originalSubject).toBe("October deals");
  });

  it("Out of Office subject alone (lower confidence)", () => {
    const r = parseBounce({ headers: "From: lee@x.example\nSubject: Out of Office: Meeting\n" });
    expect(r?.kind).toBe("auto-reply");
    expect(r?.confidence).toBeLessThan(0.9);
  });

  it("RFC 2047 encoded Automatic reply subject", () => {
    const r = parseBounce({ headers: "From: kim@x.example\nSubject: =?utf-8?Q?Automatic_reply:_Hello?=\n" });
    expect(r?.kind).toBe("auto-reply");
    expect(r?.originalSubject).toBe("Hello");
  });

  it("isAutoReply on headers", () => {
    expect(isAutoReply({ "Auto-Submitted": "auto-generated" })).toBe(true);
    expect(isAutoReply({ "auto-submitted": "no" })).toBe(false);
    expect(isAutoReply("Subject: Hello\nFrom: a@b.example\n")).toBe(false);
    expect(isAutoReply({ Subject: "Automatic reply: hi" })).toBe(true);
    expect(isAutoReply({ Precedence: "bulk" })).toBe(false);
    expect(isAutoReply({ "X-Autoreply": ["yes"] })).toBe(true);
  });
});

describe("challenge-response", () => {
  it("verify-you're-human challenge is unknown/challenge", () => {
    const r = parseBounce({
      headers: "From: Pat <pat@private.example>\nTo: news@shop.example\nSubject: Please verify your email\n",
      text: "Hello! I protect my inbox from spam. Please click the link below to verify you're a human so your message can be delivered.\nhttps://verify.example/abc",
    });
    expect(r?.kind).toBe("unknown");
    expect(r?.category).toBe("challenge");
    expect(r?.recipients[0]?.address).toBe("pat@private.example");
  });

  it("Boxbe-style challenge", () => {
    const r = parseBounce({
      headers: "From: Boxbe <notify@boxbe.example>\nTo: news@shop.example\nSubject: Request to join my Guest List\nAuto-Submitted: auto-replied\n",
      text: "Hello, your message is waiting for verification. Boxbe protects pat@private.example from unknown senders.",
    });
    expect(r?.category).toBe("challenge");
  });

  it("weak wording only counts with auto-reply headers", () => {
    const r = parseBounce({
      headers: "From: x@y.example\nSubject: Re: your mail\nAuto-Submitted: auto-replied\n",
      text: "Your message is held until you are added to my approved senders list.",
    });
    expect(r?.category).toBe("challenge");
  });
});

/* ------------------------------------------------------------------ */
/* Not a bounce / garbage                                             */
/* ------------------------------------------------------------------ */

describe("non-bounces and garbage", () => {
  it("returns null for a normal email", () => {
    expect(parseBounce(normalEmail)).toBeNull();
    expect(parseBounce(new TextEncoder().encode(normalEmail))).toBeNull();
  });

  it("returns null for a normal email mentioning whitelists", () => {
    expect(
      parseBounce({ headers: "From: it@corp.example\nSubject: Firewall\n", text: "Please add our IP to the whitelist." }),
    ).toBeNull();
  });

  it("never throws on garbage", () => {
    const bad: unknown[] = [
      "",
      "garbage!!",
      "\r\n\r\n\r\n",
      ":::\n:::",
      new Uint8Array([0, 255, 254, 1, 2, 3, 0x80, 0xc3]),
      new Uint8Array(0),
      null,
      undefined,
      42,
      {},
      { headers: 123 },
      { headers: "Content-Type: multipart/report; boundary=", parts: "nope" },
      { headers: "From: MAILER-DAEMON@x", parts: [null, { contentType: 1, body: 2 }] },
      'Content-Type: multipart/mixed; boundary="a"\n\n--a\n--a\n--a--',
      "From: mailer-daemon@x.example\nContent-Type: multipart/report; report-type=delivery-status; boundary=b\n\n--b\nContent-Type: message/delivery-status\nContent-Transfer-Encoding: base64\n\n!!!!\n--b--",
    ];
    for (const b of bad) {
      expect(() => parseBounce(b as never)).not.toThrow();
    }
    expect(parseBounce("")).toBeNull();
    expect(parseBounce("garbage!!")).toBeNull();
    expect(parseBounce(null as never)).toBeNull();
    expect(parseBounce(new Uint8Array(0))).toBeNull();
  });

  it("helpers never throw on garbage", () => {
    expect(isBounceSender(null as never)).toBe(false);
    expect(isBounce(null as never)).toBe(false);
    expect(isAutoReply(undefined as never)).toBe(false);
    expect(classifyStatus(undefined as never)).toEqual({ kind: "soft", category: "other" });
  });
});

/* ------------------------------------------------------------------ */
/* Header helpers                                                     */
/* ------------------------------------------------------------------ */

describe("isBounceSender", () => {
  it.each([
    ["MAILER-DAEMON@mx.example.com", true],
    ["Mail Delivery Subsystem <mailer-daemon@googlemail.com>", true],
    ["postmaster@outlook.com", true],
    ['"Postmaster" <PostMaster@corp.example>', true],
    ["bounces@lists.example", true],
    ["bounce-12345-abc@mail.example", true],
    ["bounces+u123@em.example", true],
    ["MAILER-DAEMON", true],
    ["Mail Delivery System <Mailer-Daemon@srv.example>", true],
    ["alice@example.com", false],
    ["Bounce Fitness <hello@bouncefit.example>", false],
    ["postmaster-fan@example.com", false],
    ["", false],
  ])("%s → %s", (from, expected) => {
    expect(isBounceSender(from)).toBe(expected);
  });
});

describe("isBounce", () => {
  it("detects multipart/report delivery-status", () => {
    expect(isBounce('Content-Type: multipart/report; report-type="delivery-status"; boundary=x\n')).toBe(true);
  });
  it("detects X-Failed-Recipients and daemon From via a record", () => {
    expect(isBounce({ "X-Failed-Recipients": "a@b.example" })).toBe(true);
    expect(isBounce({ From: "MAILER-DAEMON@x.example" })).toBe(true);
  });
  it("detects bounce subject with null Return-Path", () => {
    expect(isBounce("Return-Path: <>\nFrom: system@x.example\nSubject: Undeliverable: hi\n")).toBe(true);
  });
  it("is false for normal mail", () => {
    expect(isBounce(normalEmail)).toBe(false);
    expect(isBounce({ From: "alice@example.com", Subject: "Undeliverable pizza joke" })).toBe(false);
  });
});

describe("classifyStatus", () => {
  it.each([
    ["5.1.1", undefined, "hard", "mailbox_unknown"],
    ["550", "Requested action not taken: mailbox unavailable", "hard", "mailbox_unknown"],
    ["550", "No such user here", "hard", "mailbox_unknown"],
    ["551", undefined, "hard", "mailbox_unknown"],
    ["553", undefined, "hard", "mailbox_unknown"],
    ["5.2.2", undefined, "soft", "mailbox_full"],
    ["552", "Quota exceeded", "soft", "mailbox_full"],
    ["552", "Message too large", "soft", "message_too_large"],
    ["5.1.2", undefined, "hard", "domain_unknown"],
    ["554", "rejected because 203.0.113.1 is listed by Spamhaus", "soft", "blocked_spam"],
    ["550 5.7.1", "Email blocked by policy", "soft", "blocked_policy"],
    ["5.7.1", "SPF check failed", "soft", "auth_failed"],
    ["5.7.26", undefined, "soft", "auth_failed"],
    ["421", "Rate limit exceeded, slow down", "soft", "rate_limited"],
    ["450", "Mailbox busy, try again later", "soft", "temporary"],
    ["451", undefined, "soft", "temporary"],
    ["452", "Insufficient system storage", "soft", "mailbox_full"],
    ["4.2.2", undefined, "soft", "mailbox_full"],
    ["450 4.1.1", "user unknown", "soft", "mailbox_unknown"],
    ["", "user unknown", "hard", "mailbox_unknown"],
    ["", "", "soft", "other"],
    ["554", undefined, "hard", "other"],
    ["5.4.7", "delivery time expired", "soft", "temporary"],
  ] as const)("%s / %s → %s %s", (code, diag, kind, category) => {
    expect(classifyStatus(code, diag)).toEqual({ kind, category });
  });

  it("finds the code inside the diagnostic when code is empty", () => {
    expect(classifyStatus("", "smtp; 550 5.1.1 <x@y>: Recipient address rejected")).toEqual({
      kind: "hard",
      category: "mailbox_unknown",
    });
  });
});

/* ------------------------------------------------------------------ */

function btoaUtf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += A[(n >> 18) & 63]! + A[(n >> 12) & 63]! + (b === undefined ? "=" : A[(n >> 6) & 63]!) + (c === undefined ? "=" : A[n & 63]!);
  }
  return out;
}
