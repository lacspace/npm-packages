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
- ⚡ **Zero dependencies** · 🟢 Node 18+ (uses TCP sockets — server-side only)

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

## API

| Member | Description |
| --- | --- |
| `createMailer(config)` | make a `Mailer` |
| `mail.send(message)` | send; returns `{ messageId, accepted, response }` |
| `mail.verify()` | test connection + auth |
| `mailerFromEnv(env?)` | build config from `SMTP_*` vars |
| `presets.*` | one-line provider configs |

> **Node only.** This package opens TCP/TLS sockets, so it does not run in browsers. For validating or composing emails in any runtime, use the isomorphic siblings below.

## The Lacspace MailKit

| Package | For |
| --- | --- |
| **`@lacspace/mailer`** | Send email over SMTP (this package) |
| [`@lacspace/email-templates`](https://www.npmjs.com/package/@lacspace/email-templates) | Build responsive HTML emails |
| [`@lacspace/email-validate`](https://www.npmjs.com/package/@lacspace/email-validate) | Validate & normalize addresses |
| [`@lacspace/email-verify`](https://www.npmjs.com/package/@lacspace/email-verify) | MX + SMTP deliverability checks |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

---

<div align="center">

**Part of the Lacspace ecosystem — 35 zero-dependency, isomorphic TypeScript packages.**

[All packages ↗](https://lacspace.com/packages) · [npm org ↗](https://www.npmjs.com/org/lacspace) · [Licence Centre ↗](https://lacspace.com/licenses) · [GitHub ↗](https://github.com/lacspace/npm-packages)

</div>

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
