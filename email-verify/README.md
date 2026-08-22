<div align="center">

# @lacspace/email-verify

**Does this mailbox actually exist? — best-effort deliverability checks (MX + SMTP probe).**

[![npm version](https://img.shields.io/npm/v/@lacspace/email-verify?color=%23e11d48&label=npm)](https://www.npmjs.com/package/@lacspace/email-verify)
[![install size](https://packagephobia.com/badge?p=@lacspace/email-verify)](https://packagephobia.com/result?p=@lacspace/email-verify)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/email-verify?label=minzip)](https://bundlephobia.com/package/@lacspace/email-verify)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/email-verify)
[![license](https://img.shields.io/npm/l/@lacspace/email-verify?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Goes one step past syntax: resolves the domain's **MX records** and (optionally) runs a real **SMTP `RCPT TO` probe** to ask the receiving server whether the mailbox exists — **without ever sending a message**. Built on Node's `dns` + `net`.

- 🔎 Syntax + disposable (via [`@lacspace/email-validate`](https://www.npmjs.com/package/@lacspace/email-validate))
- 📇 MX record lookup, sorted by priority
- 📡 Optional SMTP RCPT probe → `deliverable` / `undeliverable` / `unknown`
- 🚫 No email is ever sent
- 🟢 Node 18+ · zero **npm** dependencies (only our own `email-validate`)

> ⚠️ **Read this.** Live SMTP verification is inherently unreliable. Many mail servers **greylist**, use **catch-all** (accept every address), or block probes outright — so `unknown` is common and a positive means *"likely deliverable"*, never a guarantee. Outbound port 25 is also blocked on many hosts (incl. most serverless/PaaS). Use it to catch obvious typos and dead domains, not as a hard gate.

## Install

```bash
npm install @lacspace/email-verify      # or pnpm add / yarn add / bun add
```

## Usage

```ts
import { verifyEmail } from "@lacspace/email-verify";

await verifyEmail("someone@gmail.com");
// {
//   email: "someone@gmail.com",
//   valid: true,
//   syntax: true,
//   disposable: false,
//   role: false,
//   mxFound: true,
//   mxRecords: [{ exchange: "gmail-smtp-in.l.google.com", priority: 5 }, …],
//   smtp: "unknown"   // Gmail greylists probes — expected
// }

// MX-only (fast, reliable, no port-25 needed) — great default in cloud/serverless
await verifyEmail(email, { checkSmtp: false });
```

## Lower-level helpers

```ts
import { resolveMx, smtpCheck } from "@lacspace/email-verify";

await resolveMx("lacspace.com");
// [{ exchange, priority }, …] (sorted best-first; [] if none)

await smtpCheck("user@example.com", "mx.example.com", { timeout: 8000 });
// "deliverable" | "undeliverable" | "unknown"
```

## Options

| Option | Default | Description |
| --- | --- | --- |
| `checkSmtp` | `true` | run the live RCPT probe (set `false` for MX-only) |
| `fromAddress` | `verify@<hostname>` | MAIL FROM used in the probe |
| `timeout` | `10000` | per-connection timeout (ms) |
| `extraDisposable` | — | extra throwaway domains |

## The Lacspace MailKit

| Package | For |
| --- | --- |
| [`@lacspace/mailer`](https://www.npmjs.com/package/@lacspace/mailer) | Send email over SMTP |
| [`@lacspace/email-templates`](https://www.npmjs.com/package/@lacspace/email-templates) | Build responsive HTML emails |
| [`@lacspace/email-validate`](https://www.npmjs.com/package/@lacspace/email-validate) | Validate & normalize addresses |
| **`@lacspace/email-verify`** | MX + SMTP deliverability checks (this package) |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
