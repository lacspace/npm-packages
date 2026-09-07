<div align="center">

# Lacspace Packages

**Small, sharp, open-source TypeScript packages for building on Lacspace — and for building in Nepal.**

[![packages](https://img.shields.io/badge/packages-95-blue)](https://developer.lacspace.com/packages)
[![types](https://img.shields.io/badge/types-included-blue)](https://developer.lacspace.com/packages)
[![licence](https://img.shields.io/badge/licence-Lacspace%20Free-green)](https://developer.lacspace.com/licenses/lacspace-free-1.0)

</div>

One monorepo, **95 published packages**. Most are **zero-dependency**, **isomorphic** (the same code runs on Node, edge runtimes and browsers), ship **dual ESM + CJS** builds with **TypeScript types included**, and — wherever money is involved — use **integer minor units** (paisa/cents) so you never lose a penny to floating point.

- 🧩 **Tiny & focused** — one job per package, no framework lock-in
- 🔒 **Correct by default** — real crypto over the Web Crypto API (never hand-rolled), injection-safe outputs, exhaustive tests
- 🌍 **Isomorphic** — Node 18+ (20+ for the Web-Crypto packages), edge, browsers, React Native
- 📦 **Dual build** — `import` and `require` both work, types bundled
- 🆓 **Free** — every package here ships under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** (permissive; use in personal & commercial work)

## 🌐 The Developer Platform

- 🗂️ **[All 95 packages](https://developer.lacspace.com/packages)** — searchable catalog with a docs page for every package
- 📖 **[Developer handbook](https://developer.lacspace.com/handbook)** — runnable, task-oriented recipes
- ⚡ **[create-lacspace-app](https://developer.lacspace.com/create-app)** — a gorgeous Next.js starter, batteries wired
- 🖼️ **[Live template gallery](https://templates.lacspace.com)** — every starter template, deployed

## 🚀 30-second example

```bash
npm install @lacspace/sdk
```

```ts
import { createClient } from "@lacspace/sdk";

const lac = createClient({ baseUrl: "https://api.lacspace.com" });

// auth + api + analytics + e-commerce, one typed client
await lac.auth.login({ email, password });
const products = await lac.ecommerce.getProducts();
lac.analytics.track("viewed_products", { count: products.length });
```

## More, in a few lines each

**Build a checkout** — cart → shipping → tax → order, all in integer paisa:

```ts
import { createCart, addItem, cartTotals } from "@lacspace/cart";
import { cheapestQuote } from "@lacspace/shipping";
import { createOrder } from "@lacspace/order";

let cart = addItem(createCart("NPR"), { sku: "NP-1", name: "Dhaka Topi", unitPrice: 120000, qty: 2 });
const totals = cartTotals(cart);                 // exact, integer minor units
const order = createOrder({ currency: "NPR", lines: cart.items, shipping: 10000 });
```

**Ship SEO for a page** — metadata + JSON-LD in one call:

```ts
import { defineSite } from "@lacspace/seo";

const site = defineSite({ name: "Acme", url: "https://acme.com" });
export const metadata = site.page({ title: "Pricing", path: "/pricing" }).metadata;
```

**Lock down an endpoint** — hashed API keys + rate limiting:

```ts
import { verifyKey } from "@lacspace/apikey";
import { rateLimit } from "@lacspace/rate-limit";

const ok = await rateLimit(req, { limit: 60, window: "1m" });
const key = await verifyKey(req.headers.get("x-api-key"), store);
```

## 📦 Packages

Every package links to its own README with a full, explained example. Version badges are live from npm.

<!-- PACKAGE-TABLES:START -->
### Core & Platform SDK

| Package | Version | What it does |
| --- | --- | --- |
| [`@lacspace/sdk`](./sdk) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fsdk?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/sdk) | High-level TypeScript SDK for Lacspace |
| [`@lacspace/api`](./api) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fapi?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/api) | Lightweight, zero-dependency, isomorphic TypeScript HTTP client for Lacspace APIs |
| [`@lacspace/auth`](./auth) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fauth?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/auth) | Authentication flows (login, register, token, refresh) for Lacspace APIs |
| [`@lacspace/analytics`](./analytics) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fanalytics?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/analytics) | Event tracking for Lacspace platforms |

### React Kit

| Package | Version | What it does |
| --- | --- | --- |
| [`@lacspace/react`](./react) | [![v](https://img.shields.io/npm/v/%40lacspace%2Freact?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/react) | React hooks and provider for the Lacspace SDK |
| [`@lacspace/hooks`](./hooks) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fhooks?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/hooks) | Essential, SSR-safe React hooks |
| [`@lacspace/store`](./store) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fstore?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/store) | Minimal global state for React in ~1KB |
| [`@lacspace/query`](./query) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fquery?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/query) | Tiny data fetching for React with a shared cache & request de-duplication |
| [`@lacspace/theme`](./theme) | [![v](https://img.shields.io/npm/v/%40lacspace%2Ftheme?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/theme) | SSR-safe dark / light / system theme for React |
| [`@lacspace/hotkeys`](./hotkeys) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fhotkeys?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/hotkeys) | Ergonomic keyboard shortcuts for React |
| [`@lacspace/virtual`](./virtual) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fvirtual?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/virtual) | Headless list virtualization for React |
| [`@lacspace/ui`](./ui) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fui?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/ui) | A tiny, dependency-free React kit that makes a page feel alive |

### Web Kit

| Package | Version | What it does |
| --- | --- | --- |
| [`@lacspace/env`](./env) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fenv?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/env) | Typed, validated environment variables |
| [`@lacspace/next`](./next) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fnext?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/next) | Next.js App Router integration for the Lacspace SDK |
| [`@lacspace/headers`](./headers) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fheaders?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/headers) | Secure HTTP headers & a typed Content-Security-Policy builder |
| [`@lacspace/rate-limit`](./rate-limit) | [![v](https://img.shields.io/npm/v/%40lacspace%2Frate-limit?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/rate-limit) | Framework-agnostic rate limiting |
| [`@lacspace/flags`](./flags) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fflags?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/flags) | Feature flags & A/B experiments with no SaaS and no infrastructure |
| [`@lacspace/idempotency`](./idempotency) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fidempotency?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/idempotency) | Make any operation exactly-once with an idempotency key |
| [`@lacspace/signed-url`](./signed-url) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fsigned-url?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/signed-url) | HMAC-signed, expiring URLs & tokens over Web Crypto |
| [`@lacspace/webhooks`](./webhooks) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fwebhooks?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/webhooks) | The webhook toolkit for both directions (sign & verify) |

### SEO Kit

| Package | Version | What it does |
| --- | --- | --- |
| [`@lacspace/seo`](./seo) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fseo?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/seo) | Typed metadata + JSON-LD for modern web apps |
| [`@lacspace/sitemap`](./sitemap) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fsitemap?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/sitemap) | Generate sitemap.xml, sitemap indexes and Next.js sitemaps |
| [`@lacspace/robots`](./robots) | [![v](https://img.shields.io/npm/v/%40lacspace%2Frobots?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/robots) | Build and parse robots.txt |
| [`@lacspace/llms-txt`](./llms-txt) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fllms-txt?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/llms-txt) | Generate and parse llms.txt / llms-full.txt (the llmstxt.org standard) |
| [`@lacspace/site-verify`](./site-verify) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fsite-verify?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/site-verify) | Search-engine site verification |
| [`@lacspace/rss`](./rss) | [![v](https://img.shields.io/npm/v/%40lacspace%2Frss?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/rss) | Generate RSS 2.0, Atom 1.0 and JSON Feed 1.1 from one set of items |
| [`@lacspace/slugify`](./slugify) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fslugify?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/slugify) | Turn any text into a clean, SEO-friendly URL slug |
| [`@lacspace/og`](./og) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fog?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/og) | Dynamic Open Graph images |

### Security Kit

| Package | Version | What it does |
| --- | --- | --- |
| [`@lacspace/crypto`](./crypto) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fcrypto?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/crypto) | Safe, boring cryptography over Web Crypto (AES-256-GCM, KDF, hashing) |
| [`@lacspace/password`](./password) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fpassword?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/password) | Password hashing & verification |
| [`@lacspace/jwt`](./jwt) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fjwt?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/jwt) | JSON Web Tokens (HS256/384/512) with strict expiry/issuer/audience checks |
| [`@lacspace/apikey`](./apikey) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fapikey?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/apikey) | Issue & verify API keys the right way |
| [`@lacspace/otp`](./otp) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fotp?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/otp) | TOTP & HOTP two-factor auth, Google Authenticator compatible |
| [`@lacspace/webauthn`](./webauthn) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fwebauthn?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/webauthn) | Passkeys / biometric (FaceID, fingerprint, security keys) |
| [`@lacspace/mfa`](./mfa) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fmfa?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/mfa) | Orchestrate multi-factor auth |
| [`@lacspace/lock`](./lock) | [![v](https://img.shields.io/npm/v/%40lacspace%2Flock?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/lock) | Account lockout & brute-force protection |
| [`@lacspace/redact`](./redact) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fredact?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/redact) | Redact secrets & PII from strings and objects before logging |

### Commerce & Ledger

| Package | Version | What it does |
| --- | --- | --- |
| [`@lacspace/cart`](./cart) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fcart?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/cart) | Headless, framework-agnostic shopping-cart engine |
| [`@lacspace/inventory`](./inventory) | [![v](https://img.shields.io/npm/v/%40lacspace%2Finventory?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/inventory) | Stock-tracking engine that prevents overselling |
| [`@lacspace/order`](./order) | [![v](https://img.shields.io/npm/v/%40lacspace%2Forder?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/order) | Headless order-lifecycle engine (state machine + price snapshots) |
| [`@lacspace/refund`](./refund) | [![v](https://img.shields.io/npm/v/%40lacspace%2Frefund?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/refund) | Returns / RMA workflow and refund-calculation engine |
| [`@lacspace/shipping`](./shipping) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fshipping?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/shipping) | Checkout-time shipping-rate calculator |
| [`@lacspace/invoice`](./invoice) | [![v](https://img.shields.io/npm/v/%40lacspace%2Finvoice?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/invoice) | Invoice model, numbering and tax-rollup engine |
| [`@lacspace/commission`](./commission) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fcommission?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/commission) | Commission & payout calculation engine |
| [`@lacspace/settlement`](./settlement) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fsettlement?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/settlement) | Settlement, netting & reconciliation for multi-party payouts |
| [`@lacspace/coupon`](./coupon) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fcoupon?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/coupon) | Discount & coupon engine |
| [`@lacspace/tax`](./tax) | [![v](https://img.shields.io/npm/v/%40lacspace%2Ftax?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/tax) | VAT & sales-tax done right (inclusive/exclusive, integer minor units) |
| [`@lacspace/ledger`](./ledger) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fledger?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/ledger) | A tiny double-entry ledger & wallet |
| [`@lacspace/audit-log`](./audit-log) | [![v](https://img.shields.io/npm/v/%40lacspace%2Faudit-log?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/audit-log) | Structured audit trail + tamper-evident SHA-256 hash chain |
| [`@lacspace/courier`](./courier) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fcourier?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/courier) | Courier / last-mile delivery toolkit (Pathao adapter + webhooks) |

### Nepal Payments

| Package | Version | What it does |
| --- | --- | --- |
| [`@lacspace/esewa`](./esewa) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fesewa?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/esewa) | eSewa ePay v2 (Nepal) payment gateway toolkit over Web Crypto |
| [`@lacspace/khalti`](./khalti) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fkhalti?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/khalti) | Khalti KPG-2 (ePayment API v2, Nepal) client |
| [`@lacspace/connectips`](./connectips) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fconnectips?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/connectips) | Connect IPS (Nepal) merchant integration over Web Crypto |
| [`@lacspace/fonepay`](./fonepay) | [![v](https://img.shields.io/npm/v/%40lacspace%2Ffonepay?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/fonepay) | Fonepay (Nepal) merchant redirect / Request-To-Pay over Web Crypto |

### Mail Kit

| Package | Version | What it does |
| --- | --- | --- |
| [`@lacspace/mailer`](./mailer) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fmailer?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/mailer) | A tiny zero-dependency SMTP client for Node backends |
| [`@lacspace/email-templates`](./email-templates) | [![v](https://img.shields.io/npm/v/%40lacspace%2Femail-templates?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/email-templates) | Compose bulletproof, responsive, dark-mode-aware HTML emails |
| [`@lacspace/email-validate`](./email-validate) | [![v](https://img.shields.io/npm/v/%40lacspace%2Femail-validate?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/email-validate) | Smart email validation |
| [`@lacspace/email-verify`](./email-verify) | [![v](https://img.shields.io/npm/v/%40lacspace%2Femail-verify?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/email-verify) | Best-effort email deliverability checks for Node |

### Stock Kit

| Package | Version | What it does |
| --- | --- | --- |
| [`@lacspace/indicators`](./indicators) | [![v](https://img.shields.io/npm/v/%40lacspace%2Findicators?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/indicators) | Streaming technical indicators (RSI, MACD, EMA, Bollinger, ATR, ADX, VWAP…) |
| [`@lacspace/market`](./market) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fmarket?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/market) | Stock-market money math |
| [`@lacspace/market-clock`](./market-clock) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fmarket-clock?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/market-clock) | Holiday-aware, timezone-correct trading clock |
| [`@lacspace/paper-trade`](./paper-trade) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fpaper-trade?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/paper-trade) | Headless paper-trading engine |

### Data Kit

| Package | Version | What it does |
| --- | --- | --- |
| [`@lacspace/csv`](./csv) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fcsv?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/csv) | Correct, RFC 4180 CSV parsing & stringifying |
| [`@lacspace/xlsx`](./xlsx) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fxlsx?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/xlsx) | Read & write real Excel (.xlsx) with zero deps, no headless browser |
| [`@lacspace/money`](./money) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fmoney?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/money) | Money done right (integer minor units, allocation, Intl formatting) |
| [`@lacspace/markdown`](./markdown) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fmarkdown?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/markdown) | A small, safe Markdown → HTML renderer |
| [`@lacspace/cache`](./cache) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fcache?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/cache) | A tiny in-memory cache (LRU + TTL + stale-while-revalidate) |

### Forms & PDF

| Package | Version | What it does |
| --- | --- | --- |
| [`@lacspace/validate`](./validate) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fvalidate?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/validate) | A tiny, typed schema validator |
| [`@lacspace/form`](./form) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fform?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/form) | End-to-end form handling for the server |
| [`@lacspace/pdf`](./pdf) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fpdf?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/pdf) | Generate real PDFs with zero dependencies |

### DX & Utilities

| Package | Version | What it does |
| --- | --- | --- |
| [`@lacspace/humanize`](./humanize) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fhumanize?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/humanize) | Turn machine values into human-readable text (bytes, durations, relative time…) |
| [`@lacspace/color`](./color) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fcolor?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/color) | Parse, convert, manipulate and check colours |
| [`@lacspace/id`](./id) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fid?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/id) | Unique IDs done right (UUID, nanoid-style, sortable) |
| [`@lacspace/retry`](./retry) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fretry?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/retry) | Resilience for flaky calls (backoff, timeout, circuit breaker) |
| [`@lacspace/case`](./case) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fcase?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/case) | Convert strings between cases |
| [`@lacspace/analytics-lite`](./analytics-lite) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fanalytics-lite?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/analytics-lite) | Privacy-first, cookieless web analytics |

### Nepal toolkit

| Package | Version | What it does |
| --- | --- | --- |
| [`@lacspace/nepali-date`](./nepali-date) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fnepali-date?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/nepali-date) | Bikram Sambat (BS) ↔ Gregorian (AD) date conversion |
| [`@lacspace/nepali-utils`](./nepali-utils) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fnepali-utils?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/nepali-utils) | Everyday Nepal helpers (NPR words, phone, PAN/VAT, provinces…) |

### AI Kit

Zero-dependency, provider-agnostic, keyless building blocks for LLM apps — bring your own key.

| Package | Version | What it does |
| --- | --- | --- |
| [`@lacspace/ai`](./ai) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fai?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/ai) | One `chat()`/`stream()` API over OpenAI, Anthropic, Gemini & any OpenAI-compatible endpoint |
| [`@lacspace/prompt`](./prompt) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fprompt?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/prompt) | Typed prompt templates — variable names inferred from the string, so `.render()` is type-checked |
| [`@lacspace/tokenizer`](./tokenizer) | [![v](https://img.shields.io/npm/v/%40lacspace%2Ftokenizer?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/tokenizer) | Token estimator, LLM cost calculator & context-budget manager (no 3 MB wasm) |
| [`@lacspace/json-repair`](./json-repair) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fjson-repair?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/json-repair) | Extract & repair JSON from messy LLM output (fences, trailing commas, truncation) |
| [`@lacspace/chunk`](./chunk) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fchunk?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/chunk) | RAG text splitter — recursive/markdown/code/sentence with a token-aware `lengthFn` |
| [`@lacspace/stream`](./stream) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fstream?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/stream) | SSE + streaming-LLM parser → async iterator, normalized across OpenAI & Anthropic |
| [`@lacspace/ai-tools`](./ai-tools) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fai-tools?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/ai-tools) | Define function-calling tools once → any provider spec + validated runtime dispatch |

### Testing Kit

Zero-dependency, isomorphic, runner-agnostic testing primitives — work in vitest/jest/node:test or standalone.

| Package | Version | What it does |
| --- | --- | --- |
| [`@lacspace/expect`](./expect) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fexpect?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/expect) | Fluent assertions — deep-equal, async, asymmetric & `expect.extend` custom matchers |
| [`@lacspace/spy`](./spy) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fspy?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/spy) | Spies, stubs, `spyOn` & deterministic fake timers |
| [`@lacspace/fixtures`](./fixtures) | [![v](https://img.shields.io/npm/v/%40lacspace%2Ffixtures?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/fixtures) | Typed, seeded test-data factories — sequences, traits, associations |
| [`@lacspace/snapshot`](./snapshot) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fsnapshot?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/snapshot) | Stable serializer + inline & file (`.snap`) snapshot matchers |

### Dates & Time Kit

Date math, durations, timezones and time ranges — a tiny date toolkit that complements `@lacspace/humanize` (display) and `@lacspace/nepali-date` (BS↔AD).

| Package | Version | What it does |
| --- | --- | --- |
| [`@lacspace/datetime`](./datetime) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fdatetime?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/datetime) | Immutable date math, token `format`/`parse`, diff & comparisons — a tiny date-fns |
| [`@lacspace/duration`](./duration) | [![v](https://img.shields.io/npm/v/%40lacspace%2Fduration?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/duration) | ISO-8601 duration type — parse, normalize & arithmetic, calendar-honest |
| [`@lacspace/timezone`](./timezone) | [![v](https://img.shields.io/npm/v/%40lacspace%2Ftimezone?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/timezone) | IANA offsets & zoned↔UTC conversion via `Intl`, DST-aware, no bundled tz data |
| [`@lacspace/interval`](./interval) | [![v](https://img.shields.io/npm/v/%40lacspace%2Finterval?label=%20&color=blue)](https://www.npmjs.com/package/@lacspace/interval) | Time ranges, merge/free-busy, date iteration & business-day math |

### CLIs & tools

| Package | Version | What it does |
| --- | --- | --- |
| [`create-lacspace-app`](./create-lacspace-app) | [![v](https://img.shields.io/npm/v/create-lacspace-app?label=%20&color=blue)](https://www.npmjs.com/package/create-lacspace-app) | Scaffold a beautiful, production-ready Next.js app — also a library |
| [`create-lacspace-seo`](./create-lacspace-seo) | [![v](https://img.shields.io/npm/v/create-lacspace-seo?label=%20&color=blue)](https://www.npmjs.com/package/create-lacspace-seo) | Scaffold a complete SEO setup into a Next.js App Router app in seconds |
| [`lacspace-leads`](./lacspace-leads) | [![v](https://img.shields.io/npm/v/lacspace-leads?label=%20&color=blue)](https://www.npmjs.com/package/lacspace-leads) | Free, open-source local-business lead finder (Google Maps → JSON/CSV/Excel) |
<!-- PACKAGE-TABLES:END -->

## ✨ Conventions

Every `@lacspace/*` package follows the same rules, so once you've learned one you've learned them all:

- **Zero runtime dependencies** (the two CLIs `create-lacspace-app` and `lacspace-leads` are the deliberate exceptions).
- **Isomorphic** — Node, edge and browsers. Crypto is always the **Web Crypto API**, never hand-rolled. Web-Crypto packages require **Node 20+**; the rest support **Node 18+**.
- **Dual build** — `dist/index.js` (ESM) + `dist/index.cjs` (CJS) + `dist/index.d.ts` types, from [`tsup`](https://tsup.egoist.dev).
- **Money is integer minor units** — paisa, cents, satoshi — never a float.
- **Immutable & serializable** where it makes sense — pure functions return new objects you can `JSON.stringify` and persist.

## 🛠️ Local development

```bash
git clone https://github.com/lacspace/npm-packages.git
cd npm-packages
npm install            # links the workspace packages
npm test               # vitest across every package
npm run typecheck      # tsc over the whole monorepo
```

Each package lives in its own folder with a `package.json`, `src/`, `tsup.config.ts` and `tsconfig.json` extending `tsconfig.base.json`. Build one with `npm run build -w <name>`.

> **Note:** `lacspace-leads` lives in this repo but is **not** a zero-dep workspace member (it needs Playwright), so it is excluded from the root `workspaces`, tests and typecheck, and builds/tests independently from its own folder.

## ❓ Frequently asked questions

More answers — and rich, searchable versions — at **[developer.lacspace.com/faq](https://developer.lacspace.com/faq)**.

### Getting started

**What is the Lacspace developer platform?**
A free ecosystem for JavaScript and TypeScript developers: a library of 85+ zero-dependency `@lacspace` packages, a set of standalone command-line tools, and `create-lacspace-app` — a CLI that scaffolds a finished Next.js app. Everything is documented at developer.lacspace.com and published openly to npm.

**Are the Lacspace packages and tools really free?**
Yes. Every open package and tool is published under the permissive **Lacspace Free Licence v1.0** — free to use, ship, modify and use commercially, with no fees, seats or usage metering.

**Do I need an API key, account or sign-up?**
No. There are no API keys, tokens, accounts or dashboards. Install a package or run a tool with `npx` and it works offline.

**What's the difference between the packages, the tools and create-lacspace-app?**
The `@lacspace/*` packages are libraries you import into your code. The tools are standalone programs you run from your terminal. `create-lacspace-app` scaffolds a complete Next.js project pre-wired with the best of both.

**Which runtimes are supported?**
The `@lacspace` libraries are isomorphic — Node.js, the browser, edge runtimes and serverless. The command-line tools and CLIs need **Node.js 20+**.

**Are the packages written in TypeScript and fully typed?**
Yes — strict TypeScript with hand-checked type declarations, so you get autocomplete and type safety whether you write TS or JS.

**Do the packages add dependencies or bloat my bundle?**
The `@lacspace` libraries are zero-dependency and tree-shakeable. The tools keep dependencies minimal too — most are zero-dependency; a few build on the shared scraper engine, and only `lacspace-leads` drives a real browser.

**ESM or CommonJS?**
Both — every library ships a dual ESM + CommonJS build with correct `exports` maps.

### The @lacspace packages

**How many packages are there and what do they cover?**
93+ packages, grouped into kits: Core, Security, SEO, React, App & Utils, Backend, Data, Commerce & Ledger, Stock, Mail, Web, the AI Kit, the Testing Kit, the Dates & Time Kit and regional payments — covering auth, JWTs, crypto, validation, forms, SEO, sitemaps, OG images, money, dates, CSV/Excel, caching, rate-limiting, LLM chat & streaming, prompt engineering, token counting, RAG chunking and more.

**How do I install a package?**
`npm i @lacspace/seo` (or `pnpm add` / `yarn add`). Each package page on the site shows the exact command, API and examples.

**Which package should I use for a given job?**
The handbook and per-package reference at developer.lacspace.com/docs include a "which package for what" guide.

**Are the packages production-ready?**
Yes — semver-versioned, tested, and already powering Lacspace's own products and this platform (which dogfoods the SEO, OG, sitemap, robots and RSS packages).

**Do they work with Next.js, React and other frameworks?**
Yes — framework-agnostic and isomorphic, so they work with Next.js, Remix, Astro, SvelteKit, Express, plain Node and the browser. The React Kit adds React hooks/components; a dedicated Next.js helper exists too.

**Is there documentation for each package?**
Yes — a reference page per package, a full handbook with runnable recipes, a downloadable PDF handbook, and a live in-browser playground, all at developer.lacspace.com/docs.

**How do they compare to popular alternatives?**
Many are focused, zero-dependency takes on well-known libraries (a Zod-style validator, a Dinero-style money package, an SWR-style data hook, a jsonwebtoken-style JWT package). The /compare page lines them up side by side.

### The developer tools

**What developer tools does Lacspace offer?**
Twelve free, keyless tools: `lacspace-leads`, `lacspace-scraper`, `lacspace-monitor`, `lacspace-enrich`, `lacspace-extract`, `lacspace-sql`, `lacspace-inspect`, `lacspace-cron`, `lacspace-dotenv`, `lacspace-webhook`, `lacspace-har` and `lacspace-icon`.

**How do I run a tool without installing it?**
Use `npx`, e.g. `npx lacspace-inspect example.com`. Each tool's page lists its commands; you can also `npm i -g <tool>`.

**Are the tools a CLI or a library?**
Both — a command-line program and a fully-typed library sharing the same engine.

**Which formats can they export?**
JSON, NDJSON, CSV and Excel, with a built-in converter between all four. Several also emit Markdown, HTML reports, `.ics` calendars or images.

**Can I try a tool without installing anything?**
Yes — the scraper has a hosted live tester at developer.lacspace.com/tools/scraper/try that runs in your browser exactly as it would locally.

**Do the tools send my data anywhere?**
No — they run on your machine, use only the open web and open data, and have no telemetry or accounts.

**Why is lacspace-leads local-only?**
It drives a real browser over Google Maps, so it runs on your own machine — hosting it publicly would breach Google's Terms and can't run in a serverless function.

**Is scraping and lead-finding done responsibly?**
The tools are robots.txt-aware where it matters and support polite delays, jitter, rate-limits, retries and a custom User-Agent. You're responsible for using them within each site's terms and applicable law.

**Can I use the tools in CI/CD?**
Yes — `lacspace-inspect` has `--min-grade`/`--budget`, `lacspace-har` has budgets, `lacspace-monitor` has `--fail-on-change`, and `lacspace-dotenv` has a `check` gate and pre-commit hook, all exiting non-zero on failure.

### create-lacspace-app

**What is create-lacspace-app?**
A scaffolding CLI that writes a complete, production-ready Next.js 15 + Tailwind app in seconds — pre-wired with Lacspace SEO, security headers, robots.txt, a sitemap, a contact form, a ⌘K palette, dynamic OG images and a CI workflow.

**How do I scaffold a new app?**
`npx create-lacspace-app`, or pass a name and template: `npx create-lacspace-app my-site --template saas`.

**What templates are included?**
Personal, business, ecommerce, SaaS, blog (a real Markdown blog), docs (a real Markdown docs site) and marketplace — each a complete, deployable Next.js app.

**What comes pre-wired?**
SEO metadata + JSON-LD (@lacspace/seo), a dynamic OG endpoint (@lacspace/og), security headers, robots.txt and sitemap, a typed contact form with honeypot, a ⌘K palette, and a GitHub Actions workflow that gates on an SEO crawl grade.

**Do I need to know the Lacspace packages to use it?**
No — the app works out of the box; the packages are wired in where they help and you can lean on them as much or as little as you like.

### Licensing & usage

**What licence are the packages and tools under?**
The **Lacspace Free Licence v1.0** — short, permissive and own-branded. Full text: developer.lacspace.com/licenses/lacspace-free-1.0.

**Can I use them in commercial and closed-source projects?**
Yes — commercial, private, closed-source, modification and redistribution are all permitted, royalty-free. Just keep the licence notice.

**How does it compare to MIT?**
Permissive in the same spirit as MIT and BSD — use, modify and ship freely, including commercially — but it's Lacspace's own branded licence. In practice it imposes no more restrictions than a typical permissive open-source licence.

**Will Lacspace start charging later?**
No — the open packages and tools are free, and a published version stays under the licence it shipped with.

### Support & staying updated

**Where are the docs and source code?**
Docs at developer.lacspace.com/docs (plus a PDF handbook); source at github.com/lacspace/npm-packages.

**How do I report a bug or request a feature?**
Open an issue at github.com/lacspace/npm-packages/issues with the package/tool name, version and a minimal reproduction.

**How do I keep up with new packages and versions?**
Watch the GitHub repo, follow the [@lacspace org on npm](https://www.npmjs.com/org/lacspace), and check the developer platform.

**Can I contribute or suggest a new package or tool?**
Yes — ideas and contributions are welcome via GitHub issues and pull requests.

## 🌐 Links

- Developer platform → **[developer.lacspace.com](https://developer.lacspace.com)**
- Package catalog → **[developer.lacspace.com/packages](https://developer.lacspace.com/packages)**
- Templates gallery → **[templates.lacspace.com](https://templates.lacspace.com)**
- Company → **[lacspace.com](https://lacspace.com)**

## Licence

The packages in this repository are **free**, published under the **[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms for personal and commercial use. See each package's `LICENSE` file.

Lacspace also ships **Client-specific** and **Private** (proprietary) packages under separate terms — those are not in this repository.
