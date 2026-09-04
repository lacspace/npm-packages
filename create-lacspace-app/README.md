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
```

You choose the *kind* of site you're building. It writes a **real Next.js 15 + React 19 + Tailwind v4 app** — not a hello-world, but a polished, dark-themed, responsive site with **every page filled in**, an SEO stack wired end-to-end, and a **26-component UI kit** you can drop in anywhere.

---

## ⚡ Benchmarks — honest and reproducible

Same machine, both CLIs run **binary-direct, scaffold-only**, median of 7 runs:

| | create-next-app **16.3.4** | create-lacspace-app **1.14** |
| --- | --- | --- |
| **Scaffold time** | 0.29s | **0.15s** ⚡ (~1.9× faster) |
| **Files produced** | 18 | **70** |
| **Pages** | 1 (blank) | **11** (finished, 5–6 sections each) |
| **Prebuilt components** | 0 | **37** (incl. a 26-component UI kit) |
| **Templates** | 1 | **8** |
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

- 🧩 **8 templates**, each a complete site — `personal`, `business`, `ecommerce`, `saas`, `blog`, `docs`, `dashboard`, `restaurant`.
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

## Templates

| Key | What you get |
| --- | --- |
| **personal** | Developer/portfolio — projects, uses, work, about, blog |
| **business** | Agency/company — services, work (case studies), pricing, team |
| **ecommerce** | Storefront — shop, cart (working, persisted), collections |
| **saas** | Landing — features, pricing, integrations, changelog |
| **blog** | Real Markdown blog — posts, topics, newsletter |
| **docs** | Docs site — guides, API reference, changelog, search |
| **dashboard** | App shell — sidebar, stat cards, charts, settings, analytics |
| **restaurant** | Menu, reservations, gallery, private events |

Every template is Next.js 15 App Router + React 19 + Tailwind v4 — dark, modern, responsive, with a themeable gradient accent.

## Options

| Flag | Meaning |
| --- | --- |
| `-t, --template <key>` | `personal` · `business` · `ecommerce` · `saas` · `blog` · `docs` · `dashboard` · `restaurant` |
| `--pm <npm\|pnpm\|yarn\|bun>` | package manager (default `npm`) |
| `--no-install` | skip installing dependencies |
| `--no-git` | skip git init |
| `-y, --yes` | accept defaults (needs a project name) |

## Licensing

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; the apps you generate are entirely yours.

---

<div align="center">

**Part of the Lacspace ecosystem — 60+ zero-dependency, isomorphic TypeScript packages.**

[All packages ↗](https://lacspace.com/packages) · [Docs ↗](https://lacspace.com/docs) · [npm org ↗](https://www.npmjs.com/org/lacspace) · [GitHub ↗](https://github.com/lacspace/npm-packages)

</div>

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence</sub></div>
