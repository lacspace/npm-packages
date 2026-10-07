# @lacspace/bounce

Tell bounces, spam complaints and auto-replies apart, so campaigns and sequences can stop emailing bad addresses.

Give it a returned email. You get back what happened, who it happened to, and whether to stop sending. It reads:
- **RFC 3464** delivery status notifications (DSNs);
- **RFC 5965** ARF spam complaints (feedback loops);
- **RFC 3834** auto-replies and out-of-office notices;
- plain-text vendor bounces with no DSN part: Gmail, Outlook / Microsoft 365, Zoho, Hostinger / Titan, Postfix, Exim and qmail;
- challenge-response mail ("verify you're human to deliver").

It has no dependencies and runs anywhere: Node 18+, Deno, Bun, workers and browsers.

```ts
import { parseBounce, isBounce, isAutoReply, isBounceSender, classifyStatus } from "@lacspace/bounce";

// A whole raw message (string or Uint8Array)…
const report = parseBounce(rawEmail);

// …or the pieces your mail parser already decoded.
const report2 = parseBounce({
  headers: message.headerBlock,          // the full header block as text
  text: message.text,
  html: message.html,
  parts: [{ contentType: "message/delivery-status", body: "…" }],
});

// {
//   kind: "hard",
//   category: "mailbox_unknown",
//   recipients: [{ address: "ghost@gmail.com", action: "failed", status: "5.1.1",
//                  diagnostic: "550-5.1.1 The email account that you tried to reach does not exist…",
//                  remoteMta: "gmail-smtp-in.l.google.com" }],
//   reportingMta: "mx.google.com",
//   originalMessageId: "<camp-42@shop.example>",
//   originalSubject: "October deals",
//   confidence: 0.95,
//   reason: "The mailbox ghost@gmail.com does not exist or has been disabled (status 5.1.1). Stop sending to this address."
// }

if (report?.kind === "hard" || report?.kind === "complaint") {
  for (const r of report.recipients) suppress(r.address);
}
```

## What to do with each kind

| `kind` | Meaning | Suggested action |
|---|---|---|
| `hard` | The address is bad: the mailbox or domain does not exist. | Suppress the address. |
| `soft` | Delivery failed, but the address is probably fine. | Retry later. Suppress only after repeated soft bounces. |
| `complaint` | The recipient pressed "This is spam" (ARF). | Suppress the address at once. |
| `auto-reply` | An out-of-office or other automatic reply. The address works. | No action. A sequence may pause. |
| `unknown` | It looks like a bounce, but it could not be read. Challenge-response mail is also `unknown`, with `category: "challenge"`. | Review by hand. |

`null` means the message is clearly not a bounce, complaint or auto-reply.

### Blocks are soft on purpose

A 5.7.x rejection for spam, policy or authentication is a permanent SMTP error. It still comes back as `kind: "soft"`, with `category` set to `blocked_spam`, `blocked_policy` or `auth_failed`.

That's because the address isn't the problem. The receiving server refused **you**, the sender: your IP is on a blocklist, your content looked like spam, or SPF, DKIM or DMARC failed. If you suppressed the address, you would lose a good contact and the real problem would remain. Fix the sending setup instead, then send again.

Mailbox full (5.2.2) and too-large messages (5.3.4) are soft for the same reason.

## API

### `parseBounce(input): BounceReport | null`

`input` is one of:
- a whole RFC 822 message as a `string` or `Uint8Array`. A small built-in MIME splitter handles multipart boundaries, folded headers, quoted-printable and base64. CRLF and LF both work;
- `{ headers, text?, html?, parts? }`. `headers` is the full header block. `parts` are decoded MIME parts such as `message/delivery-status`, `message/feedback-report`, `text/rfc822-headers` and `message/rfc822`.

It never throws. Bad input returns `null`.

The checks run in this order:
1. **ARF complaint** (`message/feedback-report` part, or `report-type=feedback-report`). Gives `kind: "complaint"` with `feedbackType` (`abuse`, `fraud`, `virus`, `not-spam`, …) and `userAgent`. Recipients come from `Original-Rcpt-To`, or else from the `To` of the embedded message.
2. **DSN** (`message/delivery-status` part, or DSN fields found in the text). Reads `Reporting-MTA`, and per recipient `Final-Recipient`, `Original-Recipient`, `Action`, `Status`, `Diagnostic-Code` and `Remote-MTA`. When there are several recipients, `hard` wins over `soft`. A DSN where every recipient was `delivered`, `relayed` or `expanded` returns `null`.
3. **Challenge-response** mail gives `kind: "unknown"` and `category: "challenge"`.
4. **Text bounce**: a bounce-looking message with no DSN part. Recipients come from `X-Failed-Recipients` and the notice text. The status comes from the SMTP reply line.
5. **Auto-reply**: see `isAutoReply`.

The original `Message-ID` and `Subject` come from the embedded message or headers, or from quoted headers in a text bounce. If those are missing, `In-Reply-To` is used for the Message-ID.

`BounceReport`:

| Field | Notes |
|---|---|
| `kind` | `"hard" \| "soft" \| "complaint" \| "auto-reply" \| "unknown"` |
| `recipients` | `{ address, action?, status?, diagnostic?, remoteMta? }[]`. Addresses are lower-cased. For auto-replies and challenges, this is the sender of the reply. |
| `category` | `mailbox_unknown`, `mailbox_full`, `domain_unknown`, `blocked_spam`, `blocked_policy`, `auth_failed`, `message_too_large`, `rate_limited`, `temporary`, `challenge` or `other`. Not set for complaints and auto-replies. |
| `confidence` | 0 to 1. About 0.95 for a DSN with a status code, up to 0.9 for a text bounce, 0.3 for `unknown`. |
| `reason` | One or two plain-English sentences. |
| `originalMessageId`, `originalSubject`, `reportingMta`, `feedbackType`, `userAgent` | Set when found. |

### `classifyStatus(code, diagnostic?): { kind: "hard" | "soft"; category }`

Maps a status to hard or soft plus a category. `code` can be an enhanced code (`"5.1.1"`), a basic SMTP code (`"550"`), both (`"550 5.1.1"`) or empty. If `code` is empty, a code inside `diagnostic` is used.

- **RFC 3463 codes.** Specific codes decide on their own: 5.1.1, 5.1.10 and 5.2.1 are `mailbox_unknown`; 5.1.2 and 5.4.4 are `domain_unknown`; x.2.2 is `mailbox_full`; 5.3.4 is `message_too_large`; 5.7.23, 5.7.26, 5.7.509 and similar are `auth_failed`; 4.7.28 is `rate_limited`.
- **Generic codes** (5.7.1, 5.0.0, a bare 550 or 554) are refined by the diagnostic text. For example "user unknown", "no such user", "mailbox unavailable", "quota exceeded", "mailbox full", "spamhaus", "blocked", "DMARC", "SPF", "too large", "rate limit" and "try again later".
- **Basic codes** without helpful text: 550, 551 and 553 are `mailbox_unknown`; 552 is `mailbox_full`; 421, 450, 451 and 452 are `temporary`.
- Any 4xx or 4.x.x is soft. `mailbox_unknown`, `domain_unknown` and an unclassified 5xx are hard. Everything else is soft. With no code and no matching text, the result is `{ kind: "soft", category: "other" }`.

### `isBounce(headers): boolean`

True for delivery failure reports and ARF complaint reports. It checks:
- `multipart/report` with `report-type` `delivery-status` or `feedback-report`;
- `X-Failed-Recipients`;
- `X-MS-Exchange-Message-Is-Ndr: true`;
- a bounce sender in `From`;
- a bounce subject with a null `Return-Path: <>` or an `Auto-Submitted` header.

### `isAutoReply(headers): boolean`

True for:
- `Auto-Submitted` with any value other than `no` (RFC 3834);
- `X-Autoreply`, `X-Autorespond`, `X-Autoresponder` or `X-Autogenerated: Reply`;
- `Precedence: auto_reply`;
- `X-MS-Exchange-Inbox-Rules-Loop`;
- an out-of-office or "Automatic reply" subject, in English and a few European languages.

Bounces often carry `Auto-Submitted` too. `parseBounce` checks for a bounce first, so a bounce is never reported as an auto-reply.

### `isBounceSender(from): boolean`

True for `mailer-daemon`, `postmaster`, `bounces@`, `bounce-*@`, `bounces+*@` and similar local parts. It accepts `"Name <addr>"` and a bare `MAILER-DAEMON`.

`headers` for `isBounce` and `isAutoReply` can be a raw header block or a plain object (`Record<string, string | string[]>`). Object keys are matched case-insensitively.

Also exported: `categoryFromText`, `findEnhancedStatus`, `findBasicCode` and `extractAddress`.

## Limits

- Text bounces are read with patterns, not a full grammar. Unusual wording may give `kind: "unknown"`, or a lower `confidence`. Treat `unknown` as "needs a human".
- Recipients in a text bounce are found by wording and position. If none match, any address in the notice that isn't the sender or a daemon is used. This fallback can be wrong, and `confidence` is lower when it is used.
- The status and diagnostic of a text bounce come from the first SMTP reply line. If the bounce lists several recipients with different errors, they all get that one status.
- Diagnostic text is matched in English only. Out-of-office subjects are matched in English and a few European languages.
- Challenge-response detection uses common wording and known services (Boxbe, SpamArrest, MailInBlack). Others may be missed.
- Complaints have no `category`. Act on `kind: "complaint"`.
- It does not check DKIM or SPF on the bounce itself, so a forged bounce is classified like a real one. Match `originalMessageId` against mail you actually sent before you suppress an address.
- Charsets the runtime's `TextDecoder` doesn't know fall back to UTF-8.

Built by [Lacspace](https://lacspace.com). Licensed under the Lacspace Free Licence v1.0 (see LICENSE).
