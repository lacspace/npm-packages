<div align="center">

# create-lacspace-app

**`create-next-app` gives you a blank page. This gives you a finished, SEO-complete app — in one command.**

[![npm version](https://img.shields.io/npm/v/create-lacspace-app?color=%2316a34a&label=npm)](https://www.npmjs.com/package/create-lacspace-app)
[![install size](https://img.shields.io/badge/scaffold-~0.15s-16a34a)](#-benchmarks-honest-and-reproducible)
[![license](https://img.shields.io/npm/l/create-lacspace-app?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

```bash
npm create lacspace-app@latest my-app
# or pick a template up front
npx create-lacspace-app my-app --template saas
# or scaffold a full-stack app (frontend + real API)
npx create-lacspace-app my-app --template saas --fullstack
```

You choose the *kind* of site you're building. It writes a **real Next.js 15 + React 19 + Tailwind v4 app** — not a hello-world, but a genuinely **polished, modern site**: a fluid `clamp()` type scale, tight display headings, a refined light **and** dark palette, glass chrome, soft layered shadows, a smooth logo marquee, animated counters, scroll reveals and a shimmering primary CTA — every page filled in, an SEO stack wired end-to-end, and a **26-component UI kit** you can drop in anywhere.

> **New in v2.10 — three more add-ons (11 total).**
> - **`uploads`** — authenticated file uploads stored in MongoDB, served via **signed, expiring URLs** (`@lacspace/signed-url`) — no S3 required.
> - **`i18n`** — multi-language UI: a tiny dependency-free `t()` translator + a language switcher, with English + Nepali locales and an `i18n:check` lint script.
> - **`quality`** — one-command quality gates from the Lacspace dev-tools (bundle-size budget, dependency audit, fake fixtures) **plus a ready GitHub Actions CI workflow** (dropped at the repo root, monorepo-aware).

> **New in v2.9 — guided & discoverable.** Made for newcomers:
> - **Guided start** — the interactive prompt now offers a **recipe** first ("what are you building?"), so you can ship a whole product without knowing the flags.
> - **`list`** — `npx create-lacspace-app list` shows every template, add-on and recipe. **`explain <name>`** describes what any add-on or recipe gives you (packages, next steps, docs link).
> - **`--dry-run`** prints the exact files a command would create without writing anything. `--brand "#hex"` is an alias for `--theme`.

> **New in v2.8 — recipes.** Scaffold a whole *kind of product* in one command with `--recipe <key>` (a curated template + full-stack mode + add-on stack):
> - **`ai-saas`** → SaaS + accounts + payments + AI chat + analytics
> - **`store`** → e-commerce + eSewa/Khalti checkout + email + analytics
> - **`blog`** → blog + content + search · **`docs-ai`** → docs + RAG + search · **`internal-tool`** → dashboard + auth + analytics + email
>
> `npx create-lacspace-app my-app --recipe ai-saas`. Explicit `--template`/`--with`/`--fullstack` still merge on top. Also on the lib API: `listRecipes()` / `getRecipe()`.

> **New in v2.7 — payments & email add-ons.**
> - **`payments`** — a checkout wired to **eSewa & Khalti**: orders, integer-safe money (`@lacspace/money`), and the signed eSewa flow that **works end-to-end in test mode with NO credentials**. Khalti activates when you add `KHALTI_SECRET`.
> - **`email`** — transactional email: a ready mail service (`@lacspace/mailer`) with beautiful templates (`@lacspace/email-templates`) + address validation. **Logs emails to the console until you add SMTP** — so it runs out-of-the-box, then delivers for real with one env change.

> **New in v2.6 — full-stack add-ons.** Add-ons can now wire the **backend** too. Requesting one automatically upgrades your project to full-stack (`--fullstack`):
> - **`auth-pages`** — account management on top of the built-in login/register: edit profile, change password, and **TOTP two-factor auth (2FA)** with backup codes (`@lacspace/otp`), plus a settings page.
> - **`analytics`** — **privacy-first, cookieless** web analytics (`@lacspace/analytics-lite`): a tracker, a MongoDB collector, and a dashboard. No cookies, no personal data.
>
> Under the hood the backend gained a **route manifest** (`routes/index.ts`) that add-ons register into — so every add-on's API routes, models, deps and env compose cleanly. `payments` and `email` are next.

> **New in v2.5 — more prebuilt add-ons.** The `--with` catalog grows beyond AI:
> - **`content`** — a Markdown content section (`/updates`) for *any* template, with an auto-generated **RSS feed** and **`llms.txt`**. Drop `.md` files in, get pages.
> - **`search`** — **instant, keyless full-text search** (BM25) over your Markdown — a search box, a `/search` page and an API route. No API key, no service, no Ollama required.
>
> More add-ons (auth, payments, email, analytics…) are on the way — same rules: additive, keyless, free-first.

> **New in v2.4 — static *or* full-stack.** Now the interactive prompt (after you pick a template) asks what *kind* of app you want:
> - **Static / frontend only** *(default)* — today's single Next.js app, unchanged.
> - **Dynamic / full-stack** (`--fullstack`) — an npm-workspaces **monorepo**: a `frontend/` Next.js app **+** a `backend/` **Node · Express · MongoDB · Redis · TypeScript** API **+** a shared `types/` package the two both import (so the API contract can't drift), plus a root `docker-compose.yml` (Mongo + Redis) and **one** `npm install` / `npm run dev` for the whole thing.
>
> The backend boots as a **real app**, not a stub: working **JWT auth** (`register` / `login` / `me`) and an example **CRUD** resource, all built on zero-dep `@lacspace/*` packages — passwords via `@lacspace/password`, tokens via `@lacspace/jwt`, request validation via `@lacspace/validate`, typed env via `@lacspace/env`, auth rate-limiting via `@lacspace/rate-limit`, and a **Redis cache that's optional** (no `REDIS_URL`? it falls back to an in-memory cache via `@lacspace/cache`, so it runs with zero infra). The frontend ships a typed API client + `/login`, `/register` and a protected `/account` page already wired to it. Every generated file carries `// how this works` teaching comments. **The static scaffold is byte-for-byte unchanged**, and the CLI stays **zero runtime dependencies** (all backend deps land in the *generated* app).

> **New in v2.3 — composable feature add-ons + flagship AI.** Layer optional, self-contained add-ons onto *any* template with `--with <a,b>` (or pick them in the interactive prompt, or `add` them later). Two ship today — both **free, keyless and local by default** (Ollama, no API key):
> - **`ai-chat`** — a streaming AI chat route (`/api/chat`) + a clean chat UI (`/chat`), guarded against prompt injection, built on the Lacspace AI Kit.
> - **`rag`** — "chat with your docs": index your markdown/text (`npm run rag:index`), then ask grounded, source-cited questions at `/ask`.
>
> Everything stays **strictly additive** — a scaffold with no features is byte-for-byte the same as before, and the CLI remains **zero runtime dependencies**.

> **New in v2.1 — a design-quality pass.** Every template was rebuilt around a real design system: cohesive tokens (`--accent`, surfaces, hairlines, shadows), reusable utilities (`.glass`, `.card`, `.gradient-text`, `.grid-bg`/`.dot-bg`, `.shimmer`), a sticky glass header that shrinks on scroll, a richer multi-column footer with a newsletter island, a soft gradient-mesh backdrop, and confident, specific copy per template — all `prefers-reduced-motion`-aware. The signature sites ship as **LSFolio · LSStudio · LSStore · LSCloud · LSBlogs · LSDocs · LSAdmin · LSResto · LSBazaar**.

---

## ⚡ Benchmarks — honest and reproducible

Same machine, both CLIs run **binary-direct, scaffold-only**, median of 7 runs:

| | create-next-app **16.3.4** | create-lacspace-app **2.1** |
| --- | --- | --- |
| **Scaffold time** | 0.29s | **0.15s** ⚡ (~1.9× faster) |
| **Files produced** | 18 | **70** |
| **Pages** | 1 (blank) | **11** (finished, 5–6 sections each) |
| **Prebuilt components** | 0 | **37** (incl. a 26-component UI kit) |
| **Templates** | 1 | **9** |
| SEO metadata + JSON-LD | ✗ | ✓ |
| Dynamic OG images (`/og`) | ✗ | ✓ |
| `sitemap.xml` + `robots.txt` | ✗ | ✓ |
| Security headers (HSTS/CSP…) | ✗ | ✓ |
| PWA manifest + styled 404 | ✗ | ✓ |
| SEO regression CI gate | ✗ | ✓ |

> It's faster *and* you get a finished app instead of a blank one. Don't take our word for it — **[reproduce it in 60 seconds](./BENCHMARKS.md)**.

*(Numbers are scaffold-only. The honest headline isn't the milliseconds — both are sub-second — it's that one produces a blank page and the other produces a running, SEO-complete, multi-page app.)*

---

## 🎁 What you actually get

Every generated app arrives **done**, not started:

- 🧩 **9 templates**, each a complete site — `personal`, `business`, `ecommerce`, `saas`, `blog`, `docs`, `dashboard`, `restaurant`, `marketplace`.
- 📄 **Every page is filled** — home, about, pricing, services, features, FAQ, careers, work/case-studies, collections, integrations, changelog, gallery, reservations, and more. Each is **5–6 real sections** (hero → feature split with illustration → stat band → feature grid → showcase → CTA), personalised with your project name. No "coming soon" stubs.
- 🎨 **A 26-component UI kit** (`components/ui/`): `Section`, `Hero`, `FeatureCard`, `FeatureSplit`, `Bento`, `PricingTable`, `Testimonial`, `StatBand`, `Timeline`, `Steps`, `Tabs`, `Accordion`, `FAQ`, `Gallery`, `TeamGrid`, `LogoCloud`, `CTABand`, `Newsletter`, `AreaChart`, `Badge`, `Callout`, `Rating`, `Progress`, `Breadcrumbs`, `Avatar` … all theme-aware, dependency-free, server-first.
- 🔎 **SEO, done for you** — one [`@lacspace/seo`](https://www.npmjs.com/package/@lacspace/seo) `defineSite()` config drives `<title>`, canonical, Open Graph, Twitter, and JSON-LD across every route.
- ✨ **Dynamic OG images** at `/og` — a social-share card per page, no design tool.
- 🛡️ **Security headers** (HSTS, CSP, X-Frame-Options…) via [`@lacspace/headers`](https://www.npmjs.com/package/@lacspace/headers).
- 🗺️ **`sitemap.xml` + `robots.txt`** generated from your config.
- 🌗 **Dark / light / system theme** with a no-flash script, global header + footer, ⌘K command palette, and a mobile menu — all prewired.
- 🤖 **An SEO CI gate** (`.github/workflows/seo.yml`) that fails your build the moment SEO regresses.

Edit `lib/site.ts` (your site config) and `app/page.tsx` — you're off.

---

## 🧩 Grow your app anytime — `add`

Unlike every other `create-*` tool, `create-lacspace-app` doesn't stop after day one. Drop **prebuilt, themed sections** into an existing app whenever you need them:

```bash
npx create-lacspace-app add pricing faq testimonials
```

That writes ready-to-use sections into `components/sections/` (and installs the UI kit automatically if it's missing — so it works in **any** Next.js app, not just ones we scaffolded). Then:

```tsx
import { PricingSection } from "@/components/sections/pricing";
// …drop <PricingSection /> anywhere in your JSX.
```

**Available sections:** `hero` · `features` · `pricing` · `faq` · `testimonials` · `team` · `stats` · `timeline` · `gallery` · `logos` · `cta` · `bento` · `steps` · `feature-split` · `banner`. Run `add` with no arguments to list them.

`add` also accepts a **feature add-on** key (below) — it drops the feature's files into your project (skipping any that already exist) and prints the exact deps, env vars and next-steps to wire up:

```bash
npx create-lacspace-app add ai-chat      # drops app/api/chat/route.ts + app/chat/page.tsx
```

## 🤖 Feature add-ons — `--with`

Feature add-ons are optional, self-contained bundles you can layer onto **any** template: they contribute their own files (namespaced under their own routes), dependencies, `package.json` scripts, `.env.example` entries and an onboarding checklist (`LEARN.md`). They **compose** (order-independent, no collisions) and are **strictly additive** — leave them off and you get today's scaffold, unchanged.

```bash
# scaffold with one or both, free & keyless (local Ollama by default)
npx create-lacspace-app my-app --template saas --with ai-chat
npx create-lacspace-app my-app --template saas --with ai-chat,rag   # (alias: --features)
```

In the interactive flow, after you pick a template you're offered the same list as a numbered picker — enter comma-separated numbers, or press Enter for none. (Non-TTY or `--yes` → uses your flags/defaults, no prompt.)

| Feature | What it adds | Packages (keyless) |
| --- | --- | --- |
| **`ai-chat`** | A streaming chat route `app/api/chat/route.ts` + a chat UI `app/chat/page.tsx`. Reads provider config from env, runs input through a prompt-injection guard, and streams the reply. | `@lacspace/ai` `@lacspace/prompt` `@lacspace/stream` `@lacspace/providers` `@lacspace/memory` `@lacspace/moderation` |
| **`rag`** | "Chat with your docs": `content/welcome.md`, an indexer `scripts/index-content.mjs` (+ `rag:index` script), a retrieval+rerank answer route `app/api/ask/route.ts`, and an ask UI `app/ask/page.tsx`. | `@lacspace/rag` `@lacspace/embeddings` `@lacspace/vector` `@lacspace/chunk` `@lacspace/rerank` `@lacspace/providers` `@lacspace/ai` |

### 🆓 Free & local by default — no API key

Both AI add-ons default to **[Ollama](https://ollama.com)**, so they run **entirely on your machine — free, offline and keyless**. One-time setup:

```bash
# ai-chat
ollama pull llama3.2 && npm run dev        # then open /chat

# rag (adds an embedding model)
ollama pull nomic-embed-text && ollama pull llama3.2
npm run rag:index && npm run dev           # then open /ask
```

Prefer a hosted model? Set `LACSPACE_AI_*` in `.env` (e.g. `LACSPACE_AI_PROVIDER=groq` + `LACSPACE_AI_API_KEY=…`) — the same code path works against any OpenAI-compatible provider. The generated `LEARN.md` walks you through every step.

## Templates

| Key | Ships as | What you get |
| --- | --- | --- |
| **personal** | LSFolio | Developer/portfolio — projects, uses, work, about, blog |
| **business** | LSStudio | Agency/company — services, work (case studies), pricing, team |
| **ecommerce** | LSStore | Storefront — shop, cart (working, persisted), collections |
| **saas** | LSCloud | Landing — features, pricing, integrations, changelog |
| **blog** | LSBlogs | Real Markdown blog — posts, topics, newsletter |
| **docs** | LSDocs | Docs site — guides, API reference, changelog, search |
| **dashboard** | LSAdmin | App shell — sidebar, stat cards, charts, settings, analytics |
| **restaurant** | LSResto | Menu, reservations, gallery, private events |
| **marketplace** | LSBazaar | Real commerce — cart, product pages, checkout, tax + shipping, orders/invoices, eSewa & Khalti payments |

Every template is Next.js 15 App Router + React 19 + Tailwind v4 — dark, modern, responsive, with a themeable gradient accent.

## Options

| Flag | Meaning |
| --- | --- |
| `-t, --template <key>` | `personal` · `business` · `ecommerce` · `saas` · `blog` · `docs` · `dashboard` · `restaurant` · `marketplace` |
| `--with <a,b>` | feature add-ons, comma-separated — `ai-chat` · `rag` (alias `--features`) |
| `--theme <name\|hex>` | accent gradient — a preset, a `"#hex"`, or `"from,to"` (see below) |
| `--pm <npm\|pnpm\|yarn\|bun>` | package manager (default `npm`) |
| `--no-install` | skip installing dependencies |
| `--no-git` | skip git init |
| `-y, --yes` | accept defaults (needs a project name) |

### 🎨 Themes

Recolour the whole app — gradient, OG images, favicon and PWA theme colour — at scaffold time with `--theme`:

```bash
npx create-lacspace-app my-app --template saas --theme lacspace   # a named preset
npx create-lacspace-app my-app --theme "#ff6a00"                   # one colour → auto gradient
npx create-lacspace-app my-app --theme "#0bb9d9,#7c3aed"           # an exact from → to pair
```

**Presets:** `lacspace` · `violet` · `indigo` · `blue` · `cyan` · `sky` · `teal` · `emerald` · `green` · `lime` · `amber` · `orange` · `red` · `rose` · `pink` · `fuchsia` · `purple` · `slate` · `sunset` · `ocean` · `forest` · `aurora` · `gold`. Give a single hex and the CLI derives a matching second stop for you.

## 📦 Use it as a library

The same generator is exported as a programmatic API, so you can scaffold Lacspace projects from your own code — build tools, custom CLIs, CI jobs, tests, a playground, or a server-side **"download as ZIP"** button. It ships dual **ESM + CJS** with full TypeScript types.

```ts
import {
  generateProject,   // pure: returns an in-memory file map — no disk I/O
  scaffold,          // Node: writes a project to disk
  listTemplates,     // the 9 templates + their metadata
  listSections,      // the 15 prebuilt sections
  listFeatures,      // the composable feature add-ons (ai-chat, rag)
} from "create-lacspace-app";

// 1. Pure — get the whole project as { "path": "contents" }. Runs anywhere.
const files = generateProject({ name: "acme", template: "saas", theme: "#ff6a00" });

// Layer feature add-ons on — strictly additive, order-independent.
const ai = generateProject({ name: "acme", template: "saas", features: ["ai-chat", "rag"] });
ai["app/api/chat/route.ts"];  // → the streaming chat route source
files["app/page.tsx"];        // → the generated home page source
Object.keys(files).length;    // → ~70 files

// 2. Write it to disk (Node).
const { dir, files: written } = await scaffold({ name: "acme", template: "saas" });
console.log(`Scaffolded ${written.length} files → ${dir}`);
```

`generateProject` is **pure** (no I/O), so it's perfect for previews, snapshot tests, zipping in a server route, or post-processing files before you write them. `scaffold` is the thin Node wrapper that writes the map to disk.

| Export | What it does |
| --- | --- |
| `generateProject(options)` | Returns the project as an in-memory `{ path: contents }` map. Pure, isomorphic. |
| `scaffold(options)` | Generates **and writes** the project to disk (`options.dir`, or `<cwd>/<name>`). Node only. |
| `listTemplates()` / `templates` | The built-in templates with metadata (`key`, `label`, `description`, `accent`, defaults). |
| `getTemplate(key)` | One template's metadata, or `undefined`. |
| `listSections()` / `getSection(name)` | The prebuilt section names, and one section's source. |
| `listFeatures()` / `getFeature(key)` | The composable feature add-ons (`FeatureDef[]`), and one feature's definition. |
| `templateKeys` | Every valid `template` key. |

`options`: `{ name?, template?, theme?, features? }` — the same choices as the CLI flags above (`features` mirrors `--with`; unknown keys are ignored, duplicates de-duped).

## ❓ FAQ

More questions — about the packages, tools and this CLI — are answered at **[developer.lacspace.com/faq](https://developer.lacspace.com/faq)**.

**What is create-lacspace-app?**
A scaffolding CLI that writes a complete, production-ready **Next.js 15 + Tailwind** app in seconds — pre-wired with Lacspace SEO, security headers, robots.txt, a sitemap, a working contact form, a ⌘K command palette, dynamic Open Graph images and a CI workflow.

**How do I scaffold a new app?**
`npx create-lacspace-app`, or pass a name and template up front: `npx create-lacspace-app my-site --template saas`. It installs dependencies and hands you a running app.

**Which templates are included?**
Personal, business, ecommerce, SaaS, blog (a real Markdown blog), docs (a real Markdown docs site) and marketplace — each a complete, deployable Next.js app. Preview them all at [templates.lacspace.com](https://templates.lacspace.com).

**What comes pre-wired in a generated app?**
SEO metadata + JSON-LD via `@lacspace/seo`, a dynamic OG image endpoint via `@lacspace/og`, security headers, `robots.txt` and a sitemap, a typed contact form with a honeypot, a ⌘K command palette, and a GitHub Actions workflow that gates on an SEO crawl grade.

**Do I need to know the Lacspace packages to use it?**
No — the generated app works out of the box and you can build normally. The packages are wired in where they help; lean on them as much or as little as you like.

**Which Node version do I need?**
Node.js **20 or newer**.

**Is it really free — for commercial projects too?**
Yes. It's free under the permissive **Lacspace Free Licence v1.0**, commercial use included, and the apps you generate are entirely yours.

**Where do I report a bug or request a feature?**
Open an issue at [github.com/lacspace/npm-packages/issues](https://github.com/lacspace/npm-packages/issues).

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; the apps you generate are entirely yours.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`create-lacspace-app` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

