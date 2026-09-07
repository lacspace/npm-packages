<div align="center">

# @lacspace/mailer

**Send email from Node with one line of setup — a zero-dependency SMTP client with provider presets.**

[![npm version](https://img.shields.io/npm/v/@lacspace/mailer?color=%23e11d48&label=npm)](https://www.npmjs.com/package/@lacspace/mailer)
[![install size](https://packagephobia.com/badge?p=@lacspace/mailer)](https://packagephobia.com/result?p=@lacspace/mailer)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/mailer?label=minzip)](https://bundlephobia.com/package/@lacspace/mailer)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/mailer)
[![license](https://img.shields.io/npm/l/@lacspace/mailer?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Implements SMTP — STARTTLS, `AUTH LOGIN`/`PLAIN`, MIME with attachments — directly over Node's built-in `net` / `tls` / `crypto`. **No npm dependencies.** Provider presets make Hostinger, Gmail, Outlook & friends a one-liner.

- 📮 `send({ to, cc, bcc, subject, html, text, attachments, replyTo })`
- 🏨 Presets: **Hostinger**, Gmail, Outlook/Office365, Zoho, Brevo, SMTP2GO, Mailgun, custom
- 🔒 Implicit TLS (465) **and** STARTTLS (587) · unicode subjects · bulletproof MIME
- 🌱 `mailerFromEnv()` reads `SMTP_*` — perfect for backends
- 🏊 `createMailerPool()` — connection pool with rate limiting for bulk/high-throughput sending
- ⚡ **Zero dependencies** · 🟢 Node 18+ (uses TCP sockets — server-side only)

> **New in 1.2.0** — a fluent [`createMessage()`](#compose-with-the-message-builder) MIME builder (inline CID images, alternatives, custom headers), exported [address helpers](#address-utilities) (`parseAddress` / `formatAddress` / `isValidEmail` + RFC 2047 `encodeMimeWord`), non-network [`createMemoryTransport()` / `createJsonTransport()`](#test-friendly-transports) for tests, [`sendBatch()`](#batch-sending-with-retry) with a concurrency cap + injectable retry/backoff, and [`htmlToText()` / `previewText()`](#htmltext-helpers) helpers. All additive — every 1.1.x API is unchanged.

## Install

```bash
npm install @lacspace/mailer      # or pnpm add / yarn add / bun add
```

## Hostinger in one line

```ts
import { createMailer, presets } from "@lacspace/mailer";

const mail = createMailer(
  presets.hostinger({ user: "no-reply@lacspace.com", pass: process.env.SMTP_PASS! }),
);

await mail.send({
  to: "customer@example.com",
  subject: "Welcome to Lacspace ✨",
  html: "<h1>You're in!</h1><p>Thanks for signing up.</p>",
  text: "You're in! Thanks for signing up.",
});
```

`presets.hostinger` → `smtp.hostinger.com:465` (implicit TLS). Other presets:

```ts
presets.gmail({ user, pass });      // smtp.gmail.com:465 — use an App Password
presets.outlook({ user, pass });    // smtp.office365.com:587 (STARTTLS)
presets.zoho({ user, pass });       // smtp.zoho.com:465
presets.brevo({ user, pass });      // smtp-relay.brevo.com:587
presets.smtp2go({ user, pass });
presets.mailgun({ user, pass });
```

## From environment variables

```ts
import { createMailer, mailerFromEnv } from "@lacspace/mailer";

// reads SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
const mail = createMailer(mailerFromEnv());
```

## Attachments, CC/BCC, reply-to

```ts
await mail.send({
  from: "Lacspace <no-reply@lacspace.com>",
  to: ["a@x.com", { name: "Bob", address: "bob@x.com" }],
  cc: "team@lacspace.com",
  bcc: "audit@lacspace.com",
  replyTo: "support@lacspace.com",
  subject: "Your invoice",
  html: "<p>Attached.</p>",
  attachments: [
    { filename: "invoice.pdf", content: pdfBuffer, contentType: "application/pdf" },
    { filename: "notes.txt", content: "plain text content" },
  ],
});
```

## Compose with the message builder

`createMessage()` is a fluent, typed builder that produces either a `Mail` (for `send()`) or a fully rendered MIME string (`toMime()`) — the same renderer the SMTP client uses, so the preview is what gets sent. It handles `multipart/alternative`, `multipart/mixed` and `multipart/related` (inline CID images) for you.

```ts
import { createMessage, createMailer, presets } from "@lacspace/mailer";

const mail = createMessage()
  .from("Lacspace <no-reply@lacspace.com>")
  .to("customer@example.com")
  .cc("team@lacspace.com")
  .replyTo("support@lacspace.com")
  .subject("Welcome ✨")
  .html('<h1>Hi!</h1><img src="cid:logo">')
  .inline({ filename: "logo.png", content: pngBytes, contentType: "image/png", cid: "logo" })
  .attach({ filename: "guide.pdf", content: pdfBuffer, contentType: "application/pdf" })
  .autoText()      // derive a text/plain part from the HTML for you
  .build();

await createMailer(presets.hostinger({ user, pass })).send(mail);

// …or render the MIME yourself:
const mime = createMessage().from("a@x.com").to("b@x.com").subject("Hi").text("hey").toMime();
```

Attachment `content` accepts a string, a base64 string (`encoding: "base64"`), a `Buffer`, or a `Uint8Array`.

## Test-friendly transports

`createMemoryTransport()` and `createJsonTransport()` implement the exact same `Transport` interface as `Mailer` — hand them to any code that takes a transport and no socket is ever opened.

```ts
import { createMemoryTransport } from "@lacspace/mailer";

const transport = createMemoryTransport();
await transport.send({ from: "a@x.com", to: "b@y.com", subject: "hi", text: "yo" });

expect(transport.messages).toHaveLength(1);
expect(transport.last.mime).toContain("Subject: hi");
```

`createJsonTransport(onMessage?)` returns a JSON envelope (with the rendered MIME) as the `response` — handy for logging or forwarding to an HTTP email API.

## Batch sending with retry

`sendBatch(transport, mails, options)` fans messages out through any transport with a concurrency cap and per-message retry + backoff. Timing is injectable, so tests never touch a real clock.

```ts
import { sendBatch, createMailerPool, presets } from "@lacspace/mailer";

const pool = createMailerPool(presets.gmail({ user, pass }));
const summary = await sendBatch(pool, messages, {
  concurrency: 5,           // at most 5 in flight
  retries: 3,               // retry a failed send up to 3×
  backoff: (n) => n * 500,  // ms before retry n (default: exponential)
  shouldRetry: (err) => true,
});
// summary → { total, sent, failed, results: [{ index, ok, attempts, result?, error? }] }
await pool.close();
```

## Address utilities

```ts
import { parseAddress, formatAddress, parseAddressList, isValidEmail, encodeMimeWord } from "@lacspace/mailer";

parseAddress('"Bob Smith" <bob@x.com>');       // { name: "Bob Smith", address: "bob@x.com" }
formatAddress({ name: "Añez", address: "a@x" }); // RFC 2047 encoded-word display name
parseAddressList('A <a@x>, b@y');                // [{ name:"A", address:"a@x" }, { address:"b@y" }]
isValidEmail("user@sub.example.com");            // true
encodeMimeWord("Welcome ✨");                    // =?UTF-8?B?…?=
```

## html→text helpers

```ts
import { htmlToText, previewText, preheader } from "@lacspace/mailer";

htmlToText("<h1>Hi</h1><p>Tom &amp; Jerry</p>"); // "Hi\nTom & Jerry"
previewText("<p>Hello   world</p>", 140);         // "Hello world"  (inbox preheader snippet)
preheader("Your code is 1234");                   // hidden <div> to prepend in an HTML body
```

## Pairs perfectly with

- [`@lacspace/email-templates`](https://www.npmjs.com/package/@lacspace/email-templates) — build the `html` you pass to `send()`
- [`@lacspace/email-validate`](https://www.npmjs.com/package/@lacspace/email-validate) — check the address before you send

```ts
import { otpEmail } from "@lacspace/email-templates";
await mail.send({ to, subject: "Your code", html: otpEmail({ code: "482913", brandName: "Lacspace" }) });
```

## Verify a connection

```ts
await mail.verify(); // resolves true if the server accepts the connection + credentials
```

## Custom server (e.g. MailHog in dev)

```ts
createMailer({ host: "127.0.0.1", port: 1025, secure: false, ignoreTLS: true });
```

## Bulk sending — a connection pool

Reuse a handful of SMTP connections and cap your send rate instead of opening a fresh socket per message. `MailerPool` implements the same `Transport` interface as `Mailer`, so `send()` / `verify()` are identical:

```ts
import { createMailerPool } from "@lacspace/mailer";

const pool = createMailerPool({
  ...presets.hostinger({ user, pass }),
  maxConnections: 5,   // simultaneous SMTP connections (default 5)
  rateLimit: 20,       // at most 20 messages started…
  rateDelta: 1000,     // …per 1000ms window
});

// Fan out — the pool queues and throttles for you
await Promise.all(recipients.map((to) =>
  pool.send({ to, subject: "Newsletter", html }),
));

await pool.close(); // drain and close all sockets when done
```

Prefer `createTransport(config)` when you want the config to decide: it returns a `MailerPool` when `pool: true` is set, otherwise a plain `Mailer` — both typed as `Transport`.

```ts
import { createTransport } from "@lacspace/mailer";
const mail = createTransport({ ...presets.gmail({ user, pass }), pool: true });
```

## API

| Member | Description |
| --- | --- |
| `createMailer(config)` | make a `Mailer` (one connection per send) |
| `createMailerPool(config)` | make a `MailerPool` — pooled connections + rate limiting |
| `createTransport(config)` | `MailerPool` when `config.pool`, else `Mailer` — typed `Transport` |
| `mail.send(message)` | send; returns `{ messageId, accepted, response }` |
| `mail.verify()` | test connection + auth → `boolean` |
| `mail.close()` | close sockets (pool: drain all connections) |
| `mailerFromEnv(env?)` | build config from `SMTP_*` vars |
| `presets.*` | one-line provider configs |
| `createMessage(init?)` | fluent MIME builder → `.build()` (a `Mail`) or `.toMime()` (a MIME string) |
| `buildMime(mail, from, id)` | render a `Mail` to a MIME string directly |
| `createMemoryTransport()` | `Transport` that captures messages in `.messages` (tests/previews) |
| `createJsonTransport(cb?)` | `Transport` that serialises each message to JSON |
| `sendBatch(transport, mails, opts?)` | concurrency-capped batch send with retry/backoff → summary |
| `parseAddress` / `parseAddressList` | parse RFC 5322 mailbox(es) → `Address` |
| `formatAddress` / `formatAddressList` | format `Address`(es) with quoting + RFC 2047 |
| `isValidEmail` / `invalidAddresses` | validate a mailbox / list the bad ones |
| `encodeMimeWord(str)` | RFC 2047 encoded-word for header values |
| `htmlToText(html)` | plaintext approximation of an HTML email |
| `previewText(src, max?)` / `preheader(text)` | inbox preheader snippet / hidden preheader `<div>` |

> **Node only.** This package opens TCP/TLS sockets, so it does not run in browsers. For validating or composing emails in any runtime, use the isomorphic siblings below.

## The Lacspace MailKit

| Package | For |
| --- | --- |
| **`@lacspace/mailer`** | Send email over SMTP (this package) |
| [`@lacspace/email-templates`](https://www.npmjs.com/package/@lacspace/email-templates) | Build responsive HTML emails |
| [`@lacspace/email-validate`](https://www.npmjs.com/package/@lacspace/email-validate) | Validate & normalize addresses |
| [`@lacspace/email-verify`](https://www.npmjs.com/package/@lacspace/email-verify) | MX + SMTP deliverability checks |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/mailer` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/mailer
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

