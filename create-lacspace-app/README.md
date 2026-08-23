<div align="center">

# create-lacspace-app

**Scaffold a beautiful, production-ready Next.js app in one command — pick a template, start gorgeous.**

[![npm version](https://img.shields.io/npm/v/create-lacspace-app?color=%2316a34a&label=npm)](https://www.npmjs.com/package/create-lacspace-app)
[![license](https://img.shields.io/npm/l/create-lacspace-app?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> `create-next-app` gives you a blank page. This gives you a **finished-looking app** — a polished template, styled with Tailwind, already wired with the Lacspace libraries (SEO metadata + JSON-LD, security headers, sitemap & robots). Choose your kind of site and you're running in seconds.

## Use it

```bash
npm create lacspace-app@latest my-app
# or
npx create-lacspace-app my-app --template business
```

It asks for a project name and a template, scaffolds the project, installs dependencies and initialises git.

## Templates

| Key | What you get |
| --- | --- |
| **personal** | A sleek personal / developer portfolio with a projects grid |
| **business** | A professional company / agency site with services + CTA |
| **ecommerce** | A modern storefront home with a featured product grid |
| **saas** | A high-converting SaaS landing page with features + pricing |

Every template is a real Next.js 15 App Router + Tailwind v4 project — dark, modern, responsive, with a gradient accent you can theme.

## Batteries already wired

- **`lib/site.ts`** — one [`@lacspace/seo`](https://www.npmjs.com/package/@lacspace/seo) `defineSite()` config drives your `<title>`, canonical, Open Graph, Twitter card and JSON-LD
- **`next.config.mjs`** — hardened security headers via [`@lacspace/headers`](https://www.npmjs.com/package/@lacspace/headers)
- **`app/robots.txt` + `app/sitemap.xml`** — generated from your site config with [`@lacspace/robots`](https://www.npmjs.com/package/@lacspace/robots) & [`@lacspace/sitemap`](https://www.npmjs.com/package/@lacspace/sitemap)

Edit `lib/site.ts` and `app/page.tsx` and you're off.

## Options

| Flag | Meaning |
| --- | --- |
| `-t, --template <key>` | `personal` \| `business` \| `ecommerce` \| `saas` |
| `--pm <npm\|pnpm\|yarn\|bun>` | package manager (default npm) |
| `--no-install` | skip installing dependencies |
| `--no-git` | skip git init |
| `-y, --yes` | accept defaults (needs a project name) |

## Licensing

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice. The apps you generate are yours. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

---

<div align="center">

**Part of the Lacspace ecosystem — zero-dependency, isomorphic TypeScript packages.**

[All packages ↗](https://lacspace.com/packages) · [npm org ↗](https://www.npmjs.com/org/lacspace) · [Licence Centre ↗](https://lacspace.com/licenses) · [GitHub ↗](https://github.com/lacspace/npm-packages)

</div>

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
