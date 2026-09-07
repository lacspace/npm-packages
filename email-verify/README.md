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

> **🆕 New in 1.1.0** — all additive, nothing changed:
> - **`verifyEmailDeep`** — everything `verifyEmail` does plus a `confidence` score, **catch-all detection**, and **MX ranking + fallback** (exposes the exact `mxHost` used).
> - **`scoreConfidence`** — pure aggregator turning the signals into `{ score: 0–100, risk, reasons[] }`.
> - **`detectCatchAll`** — probes a random recipient; if the server accepts it the domain is catch-all (so a positive result is untrustworthy).
> - **`verifyBatch`** — verify a list with a concurrency cap + per-domain de-dupe (one MX lookup / catch-all probe per domain).
> - `verifyEmail` gained optional injectable `resolveMxImpl` / `smtpCheckImpl` for testing. Every DNS/SMTP path is now injectable.

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

## Deep verify + confidence score (new in 1.1.0)

```ts
import { verifyEmailDeep } from "@lacspace/email-verify";

const r = await verifyEmailDeep("someone@gmail.com", { detectCatchAll: true });
// {
//   …everything verifyEmail returns…,
//   mxHost: "gmail-smtp-in.l.google.com",   // the exact MX host used
//   catchAll: false,
//   confidence: { score: 78, risk: "low", reasons: ["valid syntax", "domain has MX records", …] }
// }
```

`scoreConfidence` is a pure function — feed it signals, get a verdict (great for scoring rows you already have, no network):

```ts
import { scoreConfidence } from "@lacspace/email-verify";

scoreConfidence({ syntax: true, mxFound: true, disposable: false, role: false, smtp: "deliverable" });
// { score: 95, risk: "low", reasons: [...] }
```

## Batch verify (new in 1.1.0)

```ts
import { verifyBatch } from "@lacspace/email-verify";

const verdicts = await verifyBatch(emails, { concurrency: 10, detectCatchAll: true });
// per-email DeepVerifyResult[] — MX + catch-all resolved ONCE per unique domain
```

## Testing without the network

Every DNS/SMTP path is injectable, so tests never touch a real server:

```ts
await verifyEmailDeep("user@example.com", {
  resolveMxImpl: async () => [{ exchange: "mx.example.com", priority: 10 }],
  smtpCheckImpl: async () => "deliverable",
});
```

## Options

| Option | Default | Description |
| --- | --- | --- |
| `checkSmtp` | `true` | run the live RCPT probe (set `false` for MX-only) |
| `fromAddress` | `verify@<hostname>` | MAIL FROM used in the probe |
| `timeout` | `10000` | per-connection timeout (ms) |
| `extraDisposable` | — | extra throwaway domains |
| `resolveMxImpl` | built-in DNS | inject a custom MX resolver (testing) |
| `smtpCheckImpl` | built-in SMTP | inject a custom SMTP prober (testing) |

Extra options for `verifyEmailDeep` / `verifyBatch`: `detectCatchAll` (default `false`), `concurrency` (batch, default `5`), and `randomLocal` (inject the catch-all probe's local-part).

## API

| Export | Signature | Description |
| --- | --- | --- |
| `verifyEmail` | `(email, opts?) => Promise<VerifyResult>` | classic syntax → MX → SMTP verdict |
| `verifyEmailDeep` | `(email, opts?) => Promise<DeepVerifyResult>` | adds `confidence`, `catchAll`, `mxHost` + MX fallback |
| `verifyBatch` | `(emails[], opts?) => Promise<DeepVerifyResult[]>` | concurrency-capped, de-dupes by domain |
| `scoreConfidence` | `(signals) => { score, risk, reasons }` | pure aggregator, no network |
| `detectCatchAll` | `(domain, mxHost, opts?) => Promise<boolean>` | random-recipient catch-all probe |
| `resolveMx` | `(domain) => Promise<MxRecord[]>` | MX lookup, sorted best-first |
| `smtpCheck` | `(email, mxHost, opts?) => Promise<SmtpVerdict>` | raw SMTP RCPT probe |

## The Lacspace MailKit

| Package | For |
| --- | --- |
| [`@lacspace/mailer`](https://www.npmjs.com/package/@lacspace/mailer) | Send email over SMTP |
| [`@lacspace/email-templates`](https://www.npmjs.com/package/@lacspace/email-templates) | Build responsive HTML emails |
| [`@lacspace/email-validate`](https://www.npmjs.com/package/@lacspace/email-validate) | Validate & normalize addresses |
| **`@lacspace/email-verify`** | MX + SMTP deliverability checks (this package) |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/email-verify` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/email-verify
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

