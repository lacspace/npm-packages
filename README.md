<div align="center">

# Lacspace Packages

**Small, sharp, open-source TypeScript packages for building on Lacspace — and for building in Nepal.**

Zero-dependency · isomorphic (Node 18+, browsers, edge, React Native) · dual **ESM + CJS** · fully typed · MIT

[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/~thelacspace)
[![npm org](https://img.shields.io/badge/npm-%40lacspace-%230b76ef)](https://www.npmjs.com/~thelacspace)

</div>

---

## 📦 Packages

### Core SDK — talk to the Lacspace platform

| Package | Version | Description |
| --- | --- | --- |
| [`@lacspace/sdk`](./sdk) | [![v](https://img.shields.io/npm/v/@lacspace/sdk?label=%20)](https://www.npmjs.com/package/@lacspace/sdk) | **Start here.** api + auth + analytics + e-commerce in one client |
| [`@lacspace/api`](./api) | [![v](https://img.shields.io/npm/v/@lacspace/api?label=%20)](https://www.npmjs.com/package/@lacspace/api) | The zero-dependency HTTP client everything builds on |
| [`@lacspace/auth`](./auth) | [![v](https://img.shields.io/npm/v/@lacspace/auth?label=%20)](https://www.npmjs.com/package/@lacspace/auth) | Login, register, current user, token refresh |
| [`@lacspace/analytics`](./analytics) | [![v](https://img.shields.io/npm/v/@lacspace/analytics?label=%20)](https://www.npmjs.com/package/@lacspace/analytics) | Event tracking with batching + offline queue |

### React

| Package | Version | Description |
| --- | --- | --- |
| [`@lacspace/react`](./react) | [![v](https://img.shields.io/npm/v/@lacspace/react?label=%20)](https://www.npmjs.com/package/@lacspace/react) | `useAuth`, `useQuery`, `useLacspace` hooks + provider |

### WebKit — for web apps & backends

| Package | Version | Description |
| --- | --- | --- |
| [`@lacspace/seo`](./seo) | [![v](https://img.shields.io/npm/v/@lacspace/seo?label=%20)](https://www.npmjs.com/package/@lacspace/seo) | Typed metadata + schema.org JSON-LD builders + Next.js Metadata helper |
| [`@lacspace/env`](./env) | [![v](https://img.shields.io/npm/v/@lacspace/env?label=%20)](https://www.npmjs.com/package/@lacspace/env) | Typed, validated env variables — fail fast at boot (t3-env/envalid alternative) |
| [`@lacspace/rate-limit`](./rate-limit) | [![v](https://img.shields.io/npm/v/@lacspace/rate-limit?label=%20)](https://www.npmjs.com/package/@lacspace/rate-limit) | Fixed/sliding/token-bucket rate limiting over a pluggable store |
| [`@lacspace/otp`](./otp) | [![v](https://img.shields.io/npm/v/@lacspace/otp?label=%20)](https://www.npmjs.com/package/@lacspace/otp) | TOTP/HOTP 2FA over Web Crypto — Authenticator-compatible, otpauth:// URIs |
| [`@lacspace/next`](./next) | [![v](https://img.shields.io/npm/v/@lacspace/next?label=%20)](https://www.npmjs.com/package/@lacspace/next) | Next.js App Router SDK integration — server client, route/action wrappers, guard |

### Nepal toolkit — useful to everyone, not just Lacspace

| Package | Version | Description |
| --- | --- | --- |
| [`@lacspace/nepali-date`](./nepali-date) | [![v](https://img.shields.io/npm/v/@lacspace/nepali-date?label=%20)](https://www.npmjs.com/package/@lacspace/nepali-date) | Bikram Sambat ↔ Gregorian dates, Nepali formatting |
| [`@lacspace/nepali-utils`](./nepali-utils) | [![v](https://img.shields.io/npm/v/@lacspace/nepali-utils?label=%20)](https://www.npmjs.com/package/@lacspace/nepali-utils) | NPR formatting, amount-in-words, validators, provinces |

### StockKit — build stock-market software fast (powers [StockYatra](https://stockyatra.com))

| Package | Version | Description |
| --- | --- | --- |
| [`@lacspace/indicators`](./indicators) | [![v](https://img.shields.io/npm/v/@lacspace/indicators?label=%20)](https://www.npmjs.com/package/@lacspace/indicators) | Streaming technical indicators (RSI/MACD/Bollinger/Supertrend…) — O(1) per tick |
| [`@lacspace/market`](./market) | [![v](https://img.shields.io/npm/v/@lacspace/market?label=%20)](https://www.npmjs.com/package/@lacspace/market) | P&L, CAGR, XIRR, position sizing + Indian brokerage & charges calculator |
| [`@lacspace/market-clock`](./market-clock) | [![v](https://img.shields.io/npm/v/@lacspace/market-clock?label=%20)](https://www.npmjs.com/package/@lacspace/market-clock) | Holiday-aware NSE/BSE trading clock — is the market open? next open/close |
| [`@lacspace/paper-trade`](./paper-trade) | [![v](https://img.shields.io/npm/v/@lacspace/paper-trade?label=%20)](https://www.npmjs.com/package/@lacspace/paper-trade) | Headless paper-trading engine — wallet, orders, positions, live P&L |

### MailKit — email toolkit for backends

| Package | Version | Description |
| --- | --- | --- |
| [`@lacspace/mailer`](./mailer) | [![v](https://img.shields.io/npm/v/@lacspace/mailer?label=%20)](https://www.npmjs.com/package/@lacspace/mailer) | Zero-dependency SMTP client (Node) — send mail with Hostinger/Gmail/Outlook presets |
| [`@lacspace/email-templates`](./email-templates) | [![v](https://img.shields.io/npm/v/@lacspace/email-templates?label=%20)](https://www.npmjs.com/package/@lacspace/email-templates) | Bulletproof responsive HTML emails from blocks + OTP/welcome/invoice templates |
| [`@lacspace/email-validate`](./email-validate) | [![v](https://img.shields.io/npm/v/@lacspace/email-validate?label=%20)](https://www.npmjs.com/package/@lacspace/email-validate) | Validation with disposable detection, typo suggestions & normalization |
| [`@lacspace/email-verify`](./email-verify) | [![v](https://img.shields.io/npm/v/@lacspace/email-verify?label=%20)](https://www.npmjs.com/package/@lacspace/email-verify) | MX lookup + SMTP deliverability probe (Node) |

## 🚀 30-second example

```bash
npm install @lacspace/sdk
```

```ts
import { LacspaceSDK } from "@lacspace/sdk";

const lac = new LacspaceSDK({ baseURL: "https://api.lacspace.com/api" });

await lac.auth.login({ email: "you@shop.com", password: "••••••••" });
const products = await lac.ecommerce.getProducts();
await lac.analytics.track("product_viewed", { id: products[0]?.id });
```

And a couple of Nepal helpers, standalone:

```ts
import { NepaliDate } from "@lacspace/nepali-date";
import { formatNPR } from "@lacspace/nepali-utils";

new NepaliDate().formatNepali(); // "२०८३ भदौ ६, शनिबार"
formatNPR(1234567.5);            // "Rs. 12,34,567.50"
```

And a taste of StockKit:

```ts
import { RSI } from "@lacspace/indicators";
import { charges } from "@lacspace/market";
import { PaperAccount } from "@lacspace/paper-trade";

const rsi = new RSI(14);
ticks.forEach((p) => rsi.next(p));           // O(1) per live tick
charges({ segment: "intraday", buy: 100, sell: 102, qty: 500 }).netPnl; // 946.34

const acct = new PaperAccount({ cash: 100000 });
acct.mark({ RELIANCE: 2900 });
acct.buy("RELIANCE", { qty: 10 });
acct.mark({ RELIANCE: 2950 });
acct.unrealizedPnl;                          // 500
```

And sending email from a backend, in two lines:

```ts
import { createMailer, presets } from "@lacspace/mailer";
import { otpEmail } from "@lacspace/email-templates";

const mail = createMailer(presets.hostinger({ user: "no-reply@lacspace.com", pass: process.env.SMTP_PASS! }));
await mail.send({ to: "user@x.com", subject: "Your code", html: otpEmail({ code: "482913", brandName: "Lacspace" }) });
```

Typed env + 2FA in a backend:

```ts
import { createEnv, port, url } from "@lacspace/env";
import { generateSecret, verifyTotp } from "@lacspace/otp";

export const env = createEnv({ PORT: port({ default: 3000 }), DATABASE_URL: url() }); // fails fast if misconfigured
const ok = await verifyTotp(userCode, userSecret); // ±1 step drift; null = invalid
```

## ✨ Why these packages

- **Zero runtime dependencies** in the core — built on the platform `fetch`. Tiny installs, clean supply chain.
- **Isomorphic** — one codebase for server, browser, edge and native.
- **Typed & dual-format** — full `.d.ts`, shipped as ESM and CJS with a proper `exports` map.
- **No surprises** — configure in code, no config files written to disk, no import-time side effects.
- **Free & MIT** — use them anywhere, commercial or not.

## 🛠️ Local development

npm-workspaces monorepo built with [tsup](https://tsup.egoist.dev).

```bash
git clone https://github.com/lacspace/npm-packages.git
cd npm-packages
npm install     # links the workspace packages
npm run build   # core: api → auth → analytics → sdk
npm run build:new   # nepali-date, nepali-utils, react
npm run build:stock # indicators, market, market-clock, paper-trade
npm run build:mail  # email-validate, email-templates, mailer, email-verify
npm run build:web   # seo, env, rate-limit, otp, next
```

## 🌐 Links

- Website → **[lacspace.com/packages](https://lacspace.com/packages)**
- npm → **[npmjs.com/~thelacspace](https://www.npmjs.com/~thelacspace)**

## License

MIT © [Lacspace](https://lacspace.com)
