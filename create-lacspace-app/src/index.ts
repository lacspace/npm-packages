/**
 * create-lacspace-app
 *
 * Scaffold a new, production-ready Next.js app from a beautiful Lacspace
 * template — personal portfolio, business site, e-commerce or SaaS landing —
 * pre-wired with the Lacspace libraries (SEO metadata + JSON-LD, security
 * headers, sitemap & robots). Like create-next-app, but you start at "gorgeous".
 *
 *   npm create lacspace-app@latest my-app
 *   npx create-lacspace-app my-app --template business
 *
 * Zero runtime dependencies — Node built-ins only.
 */
import { existsSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, argv, cwd, exit } from "node:process";
import { spawnSync } from "node:child_process";

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m",
};
const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;

/* ------------------------------ templates ------------------------------ */

interface TemplateDef {
  key: string;
  label: string;
  description: string;
  /** Tailwind gradient accent (from → to). */
  accent: [string, string];
  siteName: string;
  siteDescription: string;
}

const TEMPLATES: TemplateDef[] = [
  { key: "personal", label: "Personal portfolio", description: "A sleek personal / developer portfolio with projects and contact.", accent: ["#6366f1", "#a855f7"], siteName: "Your Name", siteDescription: "Developer, designer & maker. Selected work and writing." },
  { key: "business", label: "Business site", description: "A professional company / agency site with services and a CTA.", accent: ["#2563eb", "#06b6d4"], siteName: "Acme Studio", siteDescription: "We design and build digital products that grow businesses." },
  { key: "ecommerce", label: "E-commerce storefront", description: "A modern product storefront home with a featured grid.", accent: ["#0d9488", "#84cc16"], siteName: "Acme Store", siteDescription: "Beautiful things, thoughtfully made. Free shipping worldwide." },
  { key: "saas", label: "SaaS landing", description: "A high-converting SaaS landing page with features and pricing.", accent: ["#7c3aed", "#ec4899"], siteName: "Acme Cloud", siteDescription: "The all-in-one platform your team will love. Ship faster." },
  { key: "blog", label: "Blog / magazine", description: "A clean editorial blog home with a featured post and a grid.", accent: ["#f97316", "#ef4444"], siteName: "The Journal", siteDescription: "Essays, notes and stories on building things that matter." },
  { key: "docs", label: "Documentation", description: "A docs landing with quick-start and feature cards.", accent: ["#0ea5e9", "#6366f1"], siteName: "Acme Docs", siteDescription: "Everything you need to build with Acme — guides, API and examples." },
  { key: "dashboard", label: "Admin dashboard", description: "An app dashboard shell with stat cards and a table.", accent: ["#10b981", "#14b8a6"], siteName: "Acme Admin", siteDescription: "Your control center — metrics, activity and management in one place." },
  { key: "restaurant", label: "Restaurant / cafe", description: "A warm restaurant home with menu highlights and reservations.", accent: ["#e11d48", "#f59e0b"], siteName: "Olive & Ember", siteDescription: "Seasonal plates, natural wine and a warm room. Book a table." },
];

/* ------------------------------ shared files ------------------------------ */

interface Ctx { name: string; template: TemplateDef; }

const pkgJson = (ctx: Ctx): string => JSON.stringify({
  name: ctx.name,
  version: "0.1.0",
  private: true,
  scripts: { dev: "next dev", build: "next build", start: "next start", lint: "next lint" },
  dependencies: {
    next: "^15.1.0",
    react: "^19.0.0",
    "react-dom": "^19.0.0",
    "@lacspace/seo": "^1.6.0",
    "@lacspace/headers": "^1.1.1",
    "@lacspace/robots": "^1.2.0",
    "@lacspace/sitemap": "^1.1.0",
    "@lacspace/og": "^1.0.0",
    "@lacspace/ui": "^1.0.0",
    "@lacspace/form": "^1.0.0",
    "@lacspace/validate": "^1.0.0",
    // The blog & docs templates render Markdown with @lacspace/markdown.
    ...(ctx.template.key === "blog" || ctx.template.key === "docs" ? { "@lacspace/markdown": "^1.0.0" } : {}),
  },
  devDependencies: {
    typescript: "^5.7.0",
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    tailwindcss: "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    postcss: "^8.4.49",
  },
}, null, 2) + "\n";

const tsconfig = (): string => JSON.stringify({
  compilerOptions: {
    target: "ES2022", lib: ["dom", "dom.iterable", "esnext"], allowJs: true, skipLibCheck: true,
    strict: true, noEmit: true, esModuleInterop: true, module: "esnext", moduleResolution: "bundler",
    resolveJsonModule: true, isolatedModules: true, jsx: "preserve", incremental: true,
    plugins: [{ name: "next" }], paths: { "@/*": ["./*"] },
  },
  include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  exclude: ["node_modules"],
}, null, 2) + "\n";

const nextConfig = (): string => `import { toNextHeaders } from "@lacspace/headers";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    // Hardened security headers (HSTS, CSP, X-Frame-Options, …) from @lacspace/headers
    return toNextHeaders();
  },
};

export default nextConfig;
`;

const postcss = (): string => `export default {\n  plugins: { "@tailwindcss/postcss": {} },\n};\n`;

const gitignore = (): string => `node_modules\n.next\nout\n.env*\n!.env.example\n*.log\n.DS_Store\n`;

const globalsCss = (ctx: Ctx): string => `@import "tailwindcss";

:root {
  --accent-from: ${ctx.template.accent[0]};
  --accent-to: ${ctx.template.accent[1]};
  --bg: #0a0a0f;
  --fg: #e5e7eb;
}

* { border-color: rgb(255 255 255 / 0.08); }
html { scroll-behavior: smooth; }
body {
  background: var(--bg);
  color: var(--fg);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

::selection { background: var(--accent-to); color: #0a0a0f; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: rgb(255 255 255 / 0.12); border-radius: 8px; }
:focus-visible { outline: 2px solid var(--accent-to); outline-offset: 2px; border-radius: 4px; }

.gradient-text {
  background: linear-gradient(120deg, var(--accent-from), var(--accent-to));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.gradient-bg { background: linear-gradient(120deg, var(--accent-from), var(--accent-to)); }

/* soft entrance for content */
@keyframes rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
main > section, main > * { animation: rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) both; }
@media (prefers-reduced-motion: reduce) { *, ::before, ::after { animation: none !important; scroll-behavior: auto; } }
${ctx.template.key === "blog" || ctx.template.key === "docs" ? BLOG_PROSE_CSS : ""}`;

// Readable long-form styles for Markdown-rendered blog posts (the .prose wrapper).
const BLOG_PROSE_CSS = `
/* article typography for Markdown posts */
.prose { line-height: 1.75; color: rgb(229 231 235 / 0.9); }
.prose > * + * { margin-top: 1.25em; }
.prose h1, .prose h2, .prose h3 { font-weight: 700; line-height: 1.25; margin-top: 2em; color: #fff; }
.prose h2 { font-size: 1.6rem; } .prose h3 { font-size: 1.3rem; }
.prose a { color: var(--accent-to); text-decoration: underline; text-underline-offset: 3px; }
.prose strong { color: #fff; }
.prose ul, .prose ol { padding-left: 1.4em; }
.prose ul { list-style: disc; } .prose ol { list-style: decimal; }
.prose li { margin-top: 0.4em; }
.prose blockquote { border-left: 3px solid var(--accent-to); padding-left: 1em; color: rgb(229 231 235 / 0.7); font-style: italic; }
.prose code { background: rgb(255 255 255 / 0.08); padding: 0.15em 0.4em; border-radius: 6px; font-size: 0.9em; }
.prose pre { background: #0f0f16; border: 1px solid rgb(255 255 255 / 0.1); border-radius: 12px; padding: 1.1em; overflow-x: auto; }
.prose pre code { background: none; padding: 0; }
.prose img { border-radius: 12px; max-width: 100%; height: auto; }
.prose table { width: 100%; border-collapse: collapse; }
.prose th, .prose td { border: 1px solid rgb(255 255 255 / 0.12); padding: 0.5em 0.75em; text-align: left; }
.prose hr { border: none; border-top: 1px solid rgb(255 255 255 / 0.12); }
`;

const siteTs = (ctx: Ctx): string => `import { defineSite } from "@lacspace/seo";

/** Your site's SEO configuration — set once, used everywhere. */
export const site = defineSite({
  name: ${JSON.stringify(ctx.template.siteName)},
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com",
  description: ${JSON.stringify(ctx.template.siteDescription)},
  // twitter: "yourhandle",
  ogImage: "/og", // ✨ auto social-share images — see app/og/route.tsx
});
`;

const layout = (ctx: Ctx): string => `import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { site } from "@/lib/site";
import { CommandMenu } from "@/components/command-menu";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = site.meta({ title: ${JSON.stringify(ctx.template.siteName)} });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className}>
      <body className="antialiased">
        {/* ✨ Press ⌘K / Ctrl-K anywhere — powered by @lacspace/ui */}
        <CommandMenu />
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(site.rootJsonLd()) }}
        />
      </body>
    </html>
  );
}
`;

const ogRoute = (ctx: Ctx): string => `import { ImageResponse } from "next/og";
import { ogCard } from "@lacspace/og";
import { site } from "@/lib/site";

// ✨ Dynamic Open Graph images — every page gets a gorgeous, auto-fitting social
// card at /og?title=Your+Page+Title, designed by @lacspace/og. No design tool.
export const runtime = "edge";

export function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title") ?? site.config.name;
  const eyebrow = searchParams.get("eyebrow") ?? undefined;

  return new ImageResponse(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ogCard({
      title,
      eyebrow,
      subtitle: site.config.name,
      footer: site.config.url.replace(/^https?:\\/\\//, ""),
      logo: "${ctx.template.siteName.trim().charAt(0).toUpperCase()}",
      from: "${ctx.template.accent[0]}",
      to: "${ctx.template.accent[1]}",
    }) as any,
    { width: 1200, height: 630 },
  );
}
`;

const notFound = (): string => `import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="text-8xl font-black gradient-text">404</div>
      <p className="text-lg text-white/60">This page wandered off.</p>
      <Link href="/" className="gradient-bg rounded-full px-6 py-3 font-semibold text-black">Back home</Link>
    </main>
  );
}
`;

const manifestTs = (ctx: Ctx): string => `import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: site.config.name,
    short_name: site.config.name,
    description: site.config.description,
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0f",
    theme_color: "${ctx.template.accent[0]}",
  };
}
`;

const envExample = (): string => `# Your production URL — powers canonical URLs, sitemap, robots and OG images.
NEXT_PUBLIC_SITE_URL=https://example.com
`;

const welcomeMd = (ctx: Ctx): string => `# 🎁 Welcome to ${ctx.name}

You didn't get a blank page — you got a running, good-looking **${ctx.template.label}** with the
boring-but-essential stuff already done. Here's what's in the box.

## ✅ Already set up for you

- **Beautiful home page** — styled with Tailwind v4, Inter font, dark theme + gradient accent.
- **SEO** — metadata, Open Graph, Twitter cards & JSON-LD, all from one file (\`lib/site.ts\`).
- **✨ Dynamic OG images** — every page auto-generates a social-share card at \`/og\` (\`@lacspace/og\`, auto-fitting titles). Share a link and see.
- **✨ A working contact form** — \`/contact\` is live, typed, validated and spam-protected (honeypot + timing) via \`@lacspace/form\` + \`@lacspace/validate\`. Just point it at your inbox.
- **✨ A ⌘K command palette** — press \`⌘K\` / \`Ctrl-K\` anywhere, powered by \`@lacspace/ui\`. Also try \`<Reveal>\`, \`<Counter>\`, \`<GradientText>\`, \`<TiltCard>\`, \`<Marquee>\`, \`<Typewriter>\`.
- **✨ Per-page SEO** — see \`app/about\` & \`app/contact\`: one \`site.meta()\` call gives each route its own title, canonical & OG image.
- **✨ An SEO CI gate** — \`.github/workflows/seo.yml\` audits every page on each push and fails below grade A, so SEO can never regress.
- **Security headers** — HSTS, CSP, X-Frame-Options and more, via \`next.config.mjs\`.
- **robots.txt + sitemap.xml** — generated from your site config. No hand-editing.
- **A styled 404**, a **PWA manifest**, and **auto favicon + Apple icon** — the finishing touches most starters skip.

## 🚀 Run it

\`\`\`bash
npm run dev      # http://localhost:3000
\`\`\`

## 🎨 Make it yours (start here)

1. Edit **\`lib/site.ts\`** — your name, URL and description flow into SEO, sitemap, robots and OG.
2. Edit **\`app/page.tsx\`** — your home page.
3. Set **\`NEXT_PUBLIC_SITE_URL\`** in \`.env\` before deploying (copy \`.env.example\`).

## 🎉 Surprise: 50+ more Lacspace packages, one install away

Your app is wired for the whole ecosystem. Drop any of these in — all zero-dependency:

\`\`\`bash
npm i @lacspace/id          # uuidv7, nanoid, short ids
npm i @lacspace/pdf         # invoices & receipts, no headless browser
npm i @lacspace/signed-url  # magic-login & expiring download links
npm i @lacspace/webhooks    # sign / verify / deliver webhooks
npm i @lacspace/flags       # feature flags & A/B, no SaaS
npm i @lacspace/humanize    # "1.5 KB", "3 hours ago", "1.2M"
\`\`\`

Browse them all → **https://lacspace.com/packages**

## ☁️ Deploy

Push to GitHub and import on **[Vercel](https://vercel.com/new)** — it just works. Remember to set
\`NEXT_PUBLIC_SITE_URL\` to your real domain.

---

Built with ❤️ using [Lacspace](https://lacspace.com/packages). This app is yours under the Lacspace Free Licence.
`;

const robotsTs = (): string => `import { robotsForSite } from "@lacspace/robots";
import { site } from "@/lib/site";

export function GET() {
  return new Response(robotsForSite(site.config), { headers: { "content-type": "text/plain" } });
}
`;

const sitemapTs = (): string => `import { sitemapForSite } from "@lacspace/sitemap";
import { site } from "@/lib/site";

export function GET() {
  const xml = sitemapForSite(site.config, ["/", "/about", "/contact"]);
  return new Response(xml, { headers: { "content-type": "application/xml" } });
}
`;

const readme = (ctx: Ctx): string => `# ${ctx.name}

A Next.js app scaffolded with [create-lacspace-app](https://www.npmjs.com/package/create-lacspace-app) — template: **${ctx.template.label}**.

Pre-wired with the Lacspace libraries:
- [\`@lacspace/seo\`](https://www.npmjs.com/package/@lacspace/seo) — metadata + JSON-LD via \`lib/site.ts\` (edit it once, it flows everywhere)
- [\`@lacspace/headers\`](https://www.npmjs.com/package/@lacspace/headers) — security headers in \`next.config.mjs\`
- [\`@lacspace/robots\`](https://www.npmjs.com/package/@lacspace/robots) + [\`@lacspace/sitemap\`](https://www.npmjs.com/package/@lacspace/sitemap) — \`app/robots.txt\` & \`app/sitemap.xml\`

## Getting started

\`\`\`bash
npm install
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000). Edit \`app/page.tsx\` and \`lib/site.ts\`.

Built with [Lacspace](https://lacspace.com/packages).
`;

/* ------------------------------ home pages ------------------------------ */

const NAV = (name: string, links: string[]): string =>
  `<header className="sticky top-0 z-40 backdrop-blur border-b border-white/10">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-lg font-black gradient-text">${name}</span>
          <div className="hidden gap-8 text-sm text-white/60 sm:flex">
            ${links.map((l) => `<a href="#${l.toLowerCase()}" className="hover:text-white">${l}</a>`).join("\n            ")}
          </div>
        </nav>
      </header>`;

const FOOTER = (name: string): string =>
  `<footer className="border-t border-white/10 py-10 text-center text-sm text-white/40">
        © {new Date().getFullYear()} ${name}. Built with{" "}
        <a href="https://lacspace.com/packages" className="text-white/70 hover:text-white">Lacspace</a>.
      </footer>`;

function homePage(ctx: Ctx): string {
  const n = ctx.template.siteName;
  const shell = (inner: string): string => `import { site } from "@/lib/site";

// ✨ Self-canonical home page — one line, full SEO (title, canonical, OG, Twitter).
export const metadata = site.meta({ title: ${JSON.stringify(n)}, path: "/" });

export default function Home() {
  return (
    <main className="min-h-screen">
      ${inner}
    </main>
  );
}
`;

  if (ctx.template.key === "personal") {
    return shell(`${NAV(n, ["Work", "About", "Contact"])}
      <section className="mx-auto max-w-3xl px-6 py-28 text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-white/40">Portfolio</p>
        <h1 className="text-5xl font-black leading-tight sm:text-7xl">Hi, I'm <span className="gradient-text">${n}</span>.</h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-white/60">${ctx.template.siteDescription}</p>
        <div className="mt-10 flex justify-center gap-4">
          <a href="#work" className="gradient-bg rounded-full px-6 py-3 font-semibold text-black">View my work</a>
          <a href="#contact" className="rounded-full border border-white/20 px-6 py-3 font-semibold hover:bg-white/5">Get in touch</a>
        </div>
      </section>
      <section id="work" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="mb-10 text-3xl font-bold">Selected work</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="group rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition hover:-translate-y-1 hover:border-white/20">
              <div className="mb-4 h-32 rounded-xl gradient-bg opacity-80" />
              <h3 className="font-semibold">Project {i}</h3>
              <p className="mt-1 text-sm text-white/50">A short description of what you built and the impact it had.</p>
            </div>
          ))}
        </div>
      </section>
      ${FOOTER(n)}`);
  }

  if (ctx.template.key === "business") {
    return shell(`${NAV(n, ["Services", "Work", "Contact"])}
      <section className="mx-auto max-w-4xl px-6 py-28 text-center">
        <h1 className="text-5xl font-black leading-tight sm:text-6xl">We build products <span className="gradient-text">that grow businesses</span>.</h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-white/60">${ctx.template.siteDescription}</p>
        <a href="#contact" className="mt-10 inline-block gradient-bg rounded-full px-8 py-3 font-semibold text-black">Start a project</a>
      </section>
      <section id="services" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="mb-10 text-center text-3xl font-bold">What we do</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { t: "Strategy", d: "Positioning, research and a roadmap that ships." },
            { t: "Design", d: "Brand and product design that people remember." },
            { t: "Engineering", d: "Fast, reliable software built to last." },
          ].map((s) => (
            <div key={s.t} className="rounded-2xl border border-white/10 bg-white/[0.02] p-8">
              <h3 className="text-xl font-bold gradient-text">{s.t}</h3>
              <p className="mt-2 text-white/60">{s.d}</p>
            </div>
          ))}
        </div>
      </section>
      <section id="contact" className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="text-3xl font-bold">Let's work together</h2>
        <p className="mt-3 text-white/60">Tell us about your project and we'll get back within a day.</p>
        <a href="mailto:hello@example.com" className="mt-8 inline-block rounded-full border border-white/20 px-8 py-3 font-semibold hover:bg-white/5">hello@example.com</a>
      </section>
      ${FOOTER(n)}`);
  }

  if (ctx.template.key === "ecommerce") {
    return shell(`${NAV(n, ["Shop", "About", "Cart"])}
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <h1 className="text-5xl font-black leading-tight sm:text-6xl"><span className="gradient-text">${n}</span></h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-white/60">${ctx.template.siteDescription}</p>
        <a href="#shop" className="mt-10 inline-block gradient-bg rounded-full px-8 py-3 font-semibold text-black">Shop the collection</a>
      </section>
      <section id="shop" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="mb-10 text-3xl font-bold">Featured</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { n: "Aurora Lamp", p: "$89" }, { n: "Terra Mug", p: "$24" },
            { n: "Linen Throw", p: "$65" }, { n: "Oak Stand", p: "$120" },
          ].map((prod) => (
            <div key={prod.n} className="group rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition hover:-translate-y-1">
              <div className="mb-4 aspect-square rounded-xl gradient-bg opacity-80" />
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{prod.n}</h3>
                <span className="text-white/60">{prod.p}</span>
              </div>
              <button className="mt-3 w-full rounded-lg border border-white/15 py-2 text-sm font-medium hover:bg-white/5">Add to cart</button>
            </div>
          ))}
        </div>
      </section>
      ${FOOTER(n)}`);
  }

  if (ctx.template.key === "blog") {
    return shell(`${NAV(n, ["Latest", "Topics", "About"])}
      <section className="mx-auto max-w-3xl px-6 py-24">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/40">The Journal</p>
        <h1 className="text-5xl font-black leading-tight sm:text-6xl gradient-text">${n}</h1>
        <p className="mt-6 text-lg text-white/60">${ctx.template.siteDescription}</p>
      </section>
      <section id="latest" className="mx-auto max-w-5xl px-6 pb-8">
        <a href="#" className="group block rounded-3xl border border-white/10 bg-white/[0.02] p-8 transition hover:border-white/20">
          <div className="mb-6 h-56 rounded-2xl gradient-bg opacity-80" />
          <span className="text-xs font-semibold uppercase tracking-wider text-white/40">Featured</span>
          <h2 className="mt-2 text-3xl font-bold group-hover:opacity-90">The one thing every product needs before launch</h2>
          <p className="mt-2 text-white/60">A short, punchy dek that pulls the reader into the piece and makes them want more.</p>
        </a>
      </section>
      <section className="mx-auto max-w-5xl px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <a key={i} href="#" className="group">
              <div className="mb-4 h-40 rounded-xl gradient-bg opacity-70" />
              <span className="text-xs uppercase tracking-wider text-white/40">Essay</span>
              <h3 className="mt-1 text-xl font-semibold group-hover:opacity-90">A thoughtful headline for post {i}</h3>
              <p className="mt-1 text-sm text-white/50">Two lines of supporting copy to set the scene for the reader.</p>
            </a>
          ))}
        </div>
      </section>
      ${FOOTER(n)}`);
  }

  if (ctx.template.key === "docs") {
    return shell(`${NAV(n, ["Guides", "API", "Examples"])}
      <section className="mx-auto max-w-4xl px-6 py-28 text-center">
        <h1 className="text-5xl font-black leading-tight sm:text-6xl"><span className="gradient-text">${n}</span></h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-white/60">${ctx.template.siteDescription}</p>
        <div className="mt-8 inline-flex items-center gap-3 rounded-lg border border-white/10 bg-black/40 px-4 py-3 font-mono text-sm text-white/80">
          <span className="text-white/40">$</span> npm install @acme/sdk
        </div>
      </section>
      <section id="guides" className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { t: "Quick start", d: "Go from zero to your first request in five minutes." },
            { t: "Guides", d: "Task-focused walkthroughs for the common paths." },
            { t: "API reference", d: "Every endpoint, typed, with copy-paste examples." },
          ].map((c) => (
            <a key={c.t} href="#" className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 transition hover:border-white/20">
              <h3 className="text-xl font-bold gradient-text">{c.t}</h3>
              <p className="mt-2 text-white/60">{c.d}</p>
            </a>
          ))}
        </div>
      </section>
      ${FOOTER(n)}`);
  }

  if (ctx.template.key === "dashboard") {
    return shell(`<div className="flex min-h-screen">
        <aside className="hidden w-56 shrink-0 border-r border-white/10 p-6 md:block">
          <div className="mb-8 text-lg font-black gradient-text">${n}</div>
          <nav className="space-y-1 text-sm text-white/60">
            {["Overview", "Analytics", "Customers", "Settings"].map((l) => (
              <a key={l} href="#" className="block rounded-lg px-3 py-2 hover:bg-white/5 hover:text-white">{l}</a>
            ))}
          </nav>
        </aside>
        <main className="flex-1 p-6 md:p-10">
          <h1 className="text-2xl font-bold">Overview</h1>
          <p className="mt-1 text-white/50">${ctx.template.siteDescription}</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { l: "Revenue", v: "$48.2k", c: "+12%" }, { l: "Users", v: "12,480", c: "+3.4%" },
              { l: "Orders", v: "1,204", c: "+8%" }, { l: "Churn", v: "1.2%", c: "-0.3%" },
            ].map((s) => (
              <div key={s.l} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <div className="text-sm text-white/50">{s.l}</div>
                <div className="mt-1 text-2xl font-bold">{s.v}</div>
                <div className="mt-1 text-xs text-emerald-400">{s.c}</div>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <div className="mb-4 font-semibold">Recent activity</div>
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between border-b border-white/5 pb-3 text-sm">
                  <span className="text-white/70">Event #{i}</span>
                  <span className="text-white/40">just now</span>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>`);
  }

  if (ctx.template.key === "restaurant") {
    return shell(`${NAV(n, ["Menu", "Story", "Reserve"])}
      <section className="mx-auto max-w-4xl px-6 py-28 text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-white/40">Est. 2026</p>
        <h1 className="text-5xl font-black leading-tight sm:text-7xl gradient-text">${n}</h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-white/60">${ctx.template.siteDescription}</p>
        <a href="#reserve" className="mt-10 inline-block gradient-bg rounded-full px-8 py-3 font-semibold text-black">Reserve a table</a>
      </section>
      <section id="menu" className="mx-auto max-w-4xl px-6 py-16">
        <h2 className="mb-10 text-center text-3xl font-bold">Tonight's plates</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {[
            { n: "Charred leeks", p: "$14" }, { n: "Handmade tagliatelle", p: "$22" },
            { n: "Wood-fired trout", p: "$28" }, { n: "Olive oil cake", p: "$11" },
          ].map((d) => (
            <div key={d.n} className="flex items-baseline justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <h3 className="text-lg font-semibold">{d.n}</h3>
                <p className="text-sm text-white/50">A short, mouth-watering description of the dish.</p>
              </div>
              <span className="shrink-0 gradient-text font-bold">{d.p}</span>
            </div>
          ))}
        </div>
      </section>
      <section id="reserve" className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h2 className="text-3xl font-bold">Join us</h2>
        <p className="mt-3 text-white/60">Open Wed–Sun, 5pm till late. Walk-ins welcome; bookings recommended.</p>
        <a href="tel:+10000000000" className="mt-8 inline-block rounded-full border border-white/20 px-8 py-3 font-semibold hover:bg-white/5">Call to book</a>
      </section>
      ${FOOTER(n)}`);
  }

  // saas
  return shell(`${NAV(n, ["Features", "Pricing", "Sign in"])}
      <section className="mx-auto max-w-4xl px-6 py-28 text-center">
        <p className="mb-4 inline-block rounded-full border border-white/15 px-4 py-1 text-xs font-semibold text-white/60">New · v1.0</p>
        <h1 className="text-5xl font-black leading-tight sm:text-6xl">Ship faster with <span className="gradient-text">${n}</span></h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-white/60">${ctx.template.siteDescription}</p>
        <div className="mt-10 flex justify-center gap-4">
          <a href="#pricing" className="gradient-bg rounded-full px-8 py-3 font-semibold text-black">Start free</a>
          <a href="#features" className="rounded-full border border-white/20 px-8 py-3 font-semibold hover:bg-white/5">See features</a>
        </div>
      </section>
      <section id="features" className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { t: "Fast", d: "Built on the edge — global by default." },
            { t: "Secure", d: "Hardened headers and auth out of the box." },
            { t: "Scalable", d: "From your first user to your millionth." },
          ].map((f) => (
            <div key={f.t} className="rounded-2xl border border-white/10 bg-white/[0.02] p-8">
              <h3 className="text-xl font-bold gradient-text">{f.t}</h3>
              <p className="mt-2 text-white/60">{f.d}</p>
            </div>
          ))}
        </div>
      </section>
      <section id="pricing" className="mx-auto max-w-md px-6 py-24 text-center">
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-10">
          <h2 className="text-3xl font-bold">Pro</h2>
          <p className="mt-2 text-5xl font-black gradient-text">$29<span className="text-lg text-white/40">/mo</span></p>
          <a href="#" className="mt-8 inline-block w-full gradient-bg rounded-full px-8 py-3 font-semibold text-black">Get started</a>
        </div>
      </section>
      ${FOOTER(n)}`);
}

/* ------------------------------ auto-generated brand images ------------------------------ */

const glyph = (ctx: Ctx): string => (ctx.template.siteName.trim()[0] ?? "A").toUpperCase();

const iconTsx = (ctx: Ctx): string => `import { ImageResponse } from "next/og";

// ✨ Auto-generated favicon — a branded icon from your accent, no design file.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, ${ctx.template.accent[0]}, ${ctx.template.accent[1]})", color: "white", fontSize: 40, fontWeight: 800, fontFamily: "sans-serif", borderRadius: 14 }}>
        ${glyph(ctx)}
      </div>
    ),
    { ...size },
  );
}
`;

const appleIconTsx = (ctx: Ctx): string => `import { ImageResponse } from "next/og";

// ✨ Auto-generated Apple touch icon.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, ${ctx.template.accent[0]}, ${ctx.template.accent[1]})", color: "white", fontSize: 104, fontWeight: 800, fontFamily: "sans-serif" }}>
        ${glyph(ctx)}
      </div>
    ),
    { ...size },
  );
}
`;

const aboutPage = (ctx: Ctx): string => `import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";

// ✨ Per-page SEO, auto-generated: title template, canonical, Open Graph,
// Twitter card and its OWN dynamic OG image — all from one line.
export const metadata: Metadata = site.meta({
  title: "About",
  path: "/about",
  description: "Learn more about ${ctx.template.siteName}.",
});

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-28">
      <Link href="/" className="text-sm text-white/50 hover:text-white">← Back home</Link>
      <h1 className="mt-6 text-4xl font-black sm:text-5xl gradient-text">About</h1>
      <p className="mt-6 text-lg leading-relaxed text-white/60">
        This page already has its own SEO — a unique title, canonical URL, Open Graph tags and a
        generated social image — from a single <code>site.meta()</code> call. Duplicate this file for
        any new route and it just works.
      </p>
    </main>
  );
}
`;

/* --------------------------- interactivity --------------------------- */

// ✨ Global ⌘K command palette — @lacspace/ui, wired to the app's routes.
const commandMenu = (ctx: Ctx): string => `"use client";
import { useRouter } from "next/navigation";
import { CommandPalette } from "@lacspace/ui";

export function CommandMenu() {
  const router = useRouter();
  return (
    <CommandPalette
      accent="${ctx.template.accent[1]}"
      items={[
        { id: "home", label: "Home", group: "Navigate", shortcut: "G H", onSelect: () => router.push("/") },
        { id: "about", label: "About", group: "Navigate", onSelect: () => router.push("/about") },${ctx.template.key === "blog" ? `
        { id: "blog", label: "Blog", group: "Navigate", onSelect: () => router.push("/blog") },` : ""}${ctx.template.key === "docs" ? `
        { id: "docs", label: "Docs", group: "Navigate", onSelect: () => router.push("/docs") },` : ""}
        { id: "contact", label: "Contact", group: "Navigate", onSelect: () => router.push("/contact") },
        { id: "packages", label: "Lacspace packages", group: "Links", onSelect: () => window.open("https://lacspace.com/packages", "_blank") },
      ]}
    />
  );
}
`;

// ✨ A real, working, spam-protected contact form — @lacspace/form + @lacspace/validate.
const actionsTs = (): string => `"use server";
import { createForm } from "@lacspace/form";
import { v } from "@lacspace/validate";

const contact = createForm({
  schema: v.object({
    name: v.string().min(2, "Please tell us your name").trim(),
    email: v.string().email("Enter a valid email").toLowerCase(),
    message: v.string().min(10, "A little more detail, please"),
  }),
  honeypot: "company", // bots fill this hidden field; humans never see it
  minSubmitMs: 800,     // reject sub-second (bot-speed) submissions
});

export type ContactState =
  | { ok: true }
  | { ok: false; errors: Record<string, string>; values: Record<string, unknown> }
  | null;

export async function submitContact(prev: ContactState, formData: FormData): Promise<ContactState> {
  const r = contact.action(prev, formData);
  if (!r.ok) return r;

  // ✅ r.data is fully typed: { name, email, message }
  // TODO: send it with @lacspace/mailer, or save it to your database.
  console.log("New contact message:", r.data);
  return { ok: true };
}
`;

const contactForm = (): string => `"use client";
import { useActionState } from "react";
import { honeypotProps, timestampValue } from "@lacspace/form";
import { submitContact, type ContactState } from "@/app/actions";

const field = "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-white/30";
const label = "mb-1 block text-sm text-white/60";
const errCls = "mt-1 text-sm text-red-400";

export function ContactForm() {
  const [state, action, pending] = useActionState<ContactState, FormData>(submitContact, null);

  if (state?.ok) {
    return (
      <p className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-lg">
        Thanks — we&rsquo;ll be in touch! ✅
      </p>
    );
  }

  const err = (k: string) => (state && !state.ok ? state.errors[k] : undefined);
  const val = (k: string) => (state && !state.ok ? ((state.values[k] as string) ?? "") : "");

  return (
    <form action={action} className="flex flex-col gap-5">
      <div>
        <label className={label} htmlFor="name">Name</label>
        <input id="name" name="name" defaultValue={val("name")} className={field} />
        {err("name") && <p className={errCls}>{err("name")}</p>}
      </div>
      <div>
        <label className={label} htmlFor="email">Email</label>
        <input id="email" name="email" type="email" defaultValue={val("email")} className={field} />
        {err("email") && <p className={errCls}>{err("email")}</p>}
      </div>
      <div>
        <label className={label} htmlFor="message">Message</label>
        <textarea id="message" name="message" rows={5} defaultValue={val("message")} className={field} />
        {err("message") && <p className={errCls}>{err("message")}</p>}
      </div>

      {/* spam protection — one line each */}
      <input {...honeypotProps("company")} />
      <input type="hidden" name="_ts" defaultValue={timestampValue()} />

      {err("_form") && <p className={errCls}>{err("_form")}</p>}
      <button
        disabled={pending}
        className="gradient-bg rounded-full px-8 py-3 font-semibold text-black disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
`;

const contactPage = (ctx: Ctx): string => `import { site } from "@/lib/site";
import { ContactForm } from "@/components/contact-form";

// ✨ Per-page SEO in one line — title, canonical, Open Graph & Twitter, all set.
export const metadata = site.meta({
  title: "Contact",
  path: "/contact",
  description: "Get in touch with ${ctx.template.siteName}.",
});

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-4xl font-black gradient-text sm:text-5xl">Get in touch</h1>
      <p className="mt-4 text-white/60">Have a question or a project in mind? Drop a message below.</p>
      <div className="mt-10">
        <ContactForm />
      </div>
    </main>
  );
}
`;

/* --------------------------- docs template (markdown) --------------------------- */

// ✨ A real Markdown-powered docs site — content/docs/*.md → sidebar + pages.
const docsLib = (): string => `import fs from "node:fs";
import path from "node:path";
import { markdownToHtml, extractHeadings, type Heading } from "@lacspace/markdown";

const DIR = path.join(process.cwd(), "content/docs");

export interface DocMeta {
  slug: string;
  title: string;
  group: string;
  order: number;
  description: string;
}
export interface Doc extends DocMeta {
  html: string;
  toc: Heading[];
}

function parse(raw: string): { data: Record<string, string>; body: string } {
  const m = /^---\\r?\\n([\\s\\S]*?)\\r?\\n---\\r?\\n?([\\s\\S]*)$/.exec(raw);
  if (!m) return { data: {}, body: raw };
  const data: Record<string, string> = {};
  for (const line of m[1].split(/\\r?\\n/)) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    data[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return { data, body: m[2] };
}

export function getAllDocs(): DocMeta[] {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const { data } = parse(fs.readFileSync(path.join(DIR, f), "utf8"));
      return {
        slug: f.replace(/\\.md$/, ""),
        title: data.title ?? f,
        group: data.group ?? "Docs",
        order: Number(data.order ?? "99"),
        description: data.description ?? "",
      };
    })
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export function getDoc(slug: string): Doc | null {
  const file = path.join(DIR, \`\${slug}.md\`);
  if (!fs.existsSync(file)) return null;
  const { data, body } = parse(fs.readFileSync(file, "utf8"));
  return {
    slug,
    title: data.title ?? slug,
    group: data.group ?? "Docs",
    order: Number(data.order ?? "99"),
    description: data.description ?? "",
    html: markdownToHtml(body, { headingOffset: 1 }),
    toc: extractHeadings(body),
  };
}

export function getDocNav(): { group: string; items: DocMeta[] }[] {
  const groups: { group: string; items: DocMeta[] }[] = [];
  for (const doc of getAllDocs()) {
    let g = groups.find((x) => x.group === doc.group);
    if (!g) { g = { group: doc.group, items: [] }; groups.push(g); }
    g.items.push(doc);
  }
  return groups;
}

export function adjacentDocs(slug: string): { prev: DocMeta | null; next: DocMeta | null } {
  const all = getAllDocs();
  const i = all.findIndex((d) => d.slug === slug);
  return { prev: i > 0 ? all[i - 1]! : null, next: i >= 0 && i < all.length - 1 ? all[i + 1]! : null };
}
`;

const docsSidebar = (): string => `"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface DocMeta { slug: string; title: string; group: string; order: number; description: string; }

export function DocsSidebar({ nav }: { nav: { group: string; items: DocMeta[] }[] }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-6 text-sm">
      {nav.map((group) => (
        <div key={group.group}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">{group.group}</p>
          <ul className="flex flex-col gap-1">
            {group.items.map((d) => {
              const href = \`/docs/\${d.slug}\`;
              const active = path === href;
              return (
                <li key={d.slug}>
                  <Link
                    href={href}
                    className={\`block rounded-lg px-3 py-1.5 transition \${active ? "gradient-bg font-semibold text-black" : "text-white/70 hover:bg-white/5 hover:text-white"}\`}
                  >
                    {d.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
`;

const docsLayout = (): string => `import Link from "next/link";
import { getDocNav } from "@/lib/docs";
import { DocsSidebar } from "@/components/docs-sidebar";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const nav = getDocNav();
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-[220px_1fr]">
      <aside className="md:sticky md:top-24 md:h-fit">
        <Link href="/docs" className="mb-6 block text-lg font-black gradient-text">Docs</Link>
        <DocsSidebar nav={nav} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
`;

const docsIndexPage = (ctx: Ctx): string => `import Link from "next/link";
import { site } from "@/lib/site";
import { getAllDocs } from "@/lib/docs";

export const metadata = site.meta({
  title: "Documentation",
  path: "/docs",
  description: "Documentation for ${ctx.template.siteName}.",
});

export default function DocsIndex() {
  const docs = getAllDocs();
  return (
    <div>
      <h1 className="text-4xl font-black gradient-text">Documentation</h1>
      <p className="mt-4 text-white/60">Everything you need to get started and go deep.</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {docs.map((d) => (
          <Link key={d.slug} href={\`/docs/\${d.slug}\`} className="rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-white/25">
            <span className="text-xs font-semibold uppercase tracking-widest text-white/40">{d.group}</span>
            <h2 className="mt-1 text-lg font-bold">{d.title}</h2>
            {d.description && <p className="mt-1 text-sm text-white/60">{d.description}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}
`;

const docsPage = (): string => `import Link from "next/link";
import { notFound } from "next/navigation";
import { site } from "@/lib/site";
import { getAllDocs, getDoc, adjacentDocs } from "@/lib/docs";

export function generateStaticParams() {
  return getAllDocs().map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) return {};
  return site.meta({ title: doc.title, path: \`/docs/\${slug}\`, description: doc.description });
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) notFound();
  const { prev, next } = adjacentDocs(slug);

  return (
    <article>
      <span className="text-xs font-semibold uppercase tracking-widest text-white/40">{doc.group}</span>
      <h1 className="mt-1 text-4xl font-black leading-tight">{doc.title}</h1>
      {doc.description && <p className="mt-3 text-lg text-white/60">{doc.description}</p>}

      {doc.toc.length > 2 && (
        <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/40">On this page</p>
          <ul className="flex flex-col gap-1 text-sm">
            {doc.toc.map((h) => (
              <li key={h.id} style={{ paddingLeft: (h.level - 1) * 12 }}>
                <a href={\`#\${h.id}\`} className="text-white/60 hover:text-white">{h.text}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="prose mt-10" dangerouslySetInnerHTML={{ __html: doc.html }} />

      <nav className="mt-14 flex justify-between gap-4 border-t border-white/10 pt-8 text-sm">
        {prev ? <Link href={\`/docs/\${prev.slug}\`} className="text-white/70 hover:text-white">&larr; {prev.title}</Link> : <span />}
        {next ? <Link href={\`/docs/\${next.slug}\`} className="text-right text-white/70 hover:text-white">{next.title} &rarr;</Link> : <span />}
      </nav>
    </article>
  );
}
`;

const docsSitemapTs = (): string => `import { sitemapForSite } from "@lacspace/sitemap";
import { site } from "@/lib/site";
import { getAllDocs } from "@/lib/docs";

export function GET() {
  const paths = ["/", "/about", "/contact", "/docs", ...getAllDocs().map((d) => \`/docs/\${d.slug}\`)];
  const xml = sitemapForSite(site.config, paths);
  return new Response(xml, { headers: { "content-type": "application/xml" } });
}
`;

const sampleDocIntro = (ctx: Ctx): string => `---
title: Introduction
group: Getting Started
order: 1
description: What ${ctx.template.siteName} is and how these docs work.
---

# Introduction

Welcome to the **${ctx.template.siteName}** documentation. These pages are plain
**Markdown files** in \`content/docs/\`, rendered to static pages with
[\`@lacspace/markdown\`](https://www.npmjs.com/package/@lacspace/markdown).

## How the docs are organised

- Each \`.md\` file becomes a page at \`/docs/<filename>\`.
- Front-matter sets the **title**, **group** (sidebar heading) and **order**.
- The sidebar, the on-this-page table of contents and prev/next links are all
  generated for you.

> Edit these files, add your own, and the navigation updates automatically.
`;

const sampleDocInstall = (): string => `---
title: Installation
group: Getting Started
order: 2
description: Add a new documentation page in under a minute.
---

# Installation & setup

Create a Markdown file in \`content/docs/\` with front-matter at the top:

\`\`\`md
---
title: My page
group: Guides
order: 1
description: A short summary for SEO and the index.
---

# My page

Write **Markdown** here — headings, lists, tables and code all work.
\`\`\`

That's it — the page appears at \`/docs/my-page\` and in the sidebar under "Guides".
`;

const sampleDocWriting = (): string => `---
title: Writing content
group: Guides
order: 1
description: Everything the Markdown renderer supports.
---

# Writing content

The renderer supports the essentials — and a bit more.

## Text & lists

**Bold**, *italic*, \`inline code\`, and:

- bullet lists
  - that nest
- [x] task lists

## Tables

| Feature | Supported |
| ------- | :-------: |
| Headings + anchors | ✅ |
| Code blocks | ✅ |
| Tables | ✅ |

## Code

\`\`\`ts
export function greet(name: string) {
  return \`Hello, \${name}!\`;
}
\`\`\`

Every heading gets an anchor id, so the on-this-page menu links straight to it.
`;

// ✨ CI gate — audits every page's SEO on each push and fails below grade A.
const seoWorkflow = (): string => `name: SEO

on:
  push:
    branches: [main]
  pull_request:

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
        env:
          NEXT_PUBLIC_SITE_URL: http://localhost:3000
      - name: Start the app
        run: npm run start &
      - name: Wait for it
        run: npx wait-on http://localhost:3000 -t 60000
      - name: Audit every page (fails below grade A)
        run: npx @lacspace/seo crawl http://localhost:3000 --min-grade A
`;

/* ------------------------- blog template (markdown) ------------------------- */

// ✨ A real Markdown-powered blog — content/posts/*.md → static pages via @lacspace/markdown.
const postsLib = (): string => `import fs from "node:fs";
import path from "node:path";
import { markdownToHtml, extractHeadings, type Heading } from "@lacspace/markdown";

const DIR = path.join(process.cwd(), "content/posts");

export interface PostMeta {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  tag?: string;
  author?: string;
}
export interface Post extends PostMeta {
  html: string;
  toc: Heading[];
}

// Tiny front-matter parser (no gray-matter needed).
function parse(raw: string): { data: Record<string, string>; body: string } {
  const m = /^---\\r?\\n([\\s\\S]*?)\\r?\\n---\\r?\\n?([\\s\\S]*)$/.exec(raw);
  if (!m) return { data: {}, body: raw };
  const data: Record<string, string> = {};
  for (const line of m[1].split(/\\r?\\n/)) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    data[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return { data, body: m[2] };
}

export function getAllPosts(): PostMeta[] {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const { data } = parse(fs.readFileSync(path.join(DIR, f), "utf8"));
      return {
        slug: f.replace(/\\.md$/, ""),
        title: data.title ?? f,
        date: data.date ?? "",
        excerpt: data.excerpt ?? "",
        tag: data.tag,
        author: data.author,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPost(slug: string): Post | null {
  const file = path.join(DIR, \`\${slug}.md\`);
  if (!fs.existsSync(file)) return null;
  const { data, body } = parse(fs.readFileSync(file, "utf8"));
  return {
    slug,
    title: data.title ?? slug,
    date: data.date ?? "",
    excerpt: data.excerpt ?? "",
    tag: data.tag,
    author: data.author,
    html: markdownToHtml(body, { headingOffset: 1 }),
    toc: extractHeadings(body),
  };
}
`;

const blogListPage = (ctx: Ctx): string => `import Link from "next/link";
import { site } from "@/lib/site";
import { getAllPosts } from "@/lib/posts";

export const metadata = site.meta({
  title: "Blog",
  path: "/blog",
  description: "Writing, notes and updates from ${ctx.template.siteName}.",
});

export default function Blog() {
  const posts = getAllPosts();
  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-4xl font-black gradient-text sm:text-5xl">Blog</h1>
      <p className="mt-4 text-white/60">Thoughts, notes and updates.</p>
      <div className="mt-12 flex flex-col gap-8">
        {posts.map((post) => (
          <Link key={post.slug} href={\`/blog/\${post.slug}\`} className="group rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:border-white/25">
            {post.tag && <span className="text-xs font-semibold uppercase tracking-widest text-white/40">{post.tag}</span>}
            <h2 className="mt-1 text-2xl font-bold group-hover:gradient-text">{post.title}</h2>
            <p className="mt-2 text-white/60">{post.excerpt}</p>
            {post.date && <time className="mt-3 block text-sm text-white/40">{new Date(post.date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</time>}
          </Link>
        ))}
        {posts.length === 0 && <p className="text-white/50">No posts yet — add a Markdown file in <code>content/posts/</code>.</p>}
      </div>
    </main>
  );
}
`;

const blogPostPage = (): string => `import Link from "next/link";
import { notFound } from "next/navigation";
import { site } from "@/lib/site";
import { getAllPosts, getPost } from "@/lib/posts";

// ✨ Every post is statically generated at build time.
export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

// ✨ Per-post SEO — title, canonical, OG image and Article JSON-LD, from one call.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return site.article({
    title: post.title,
    path: \`/blog/\${slug}\`,
    description: post.excerpt,
    datePublished: post.date,
    author: post.author,
    tags: post.tag ? [post.tag] : undefined,
  }).metadata;
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const jsonLd = site.article({
    title: post.title,
    path: \`/blog/\${slug}\`,
    description: post.excerpt,
    datePublished: post.date,
    author: post.author,
    tags: post.tag ? [post.tag] : undefined,
  }).jsonLd;

  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <Link href="/blog" className="text-sm text-white/50 hover:text-white">&larr; All posts</Link>
      <article className="mt-6">
        <h1 className="text-4xl font-black leading-tight sm:text-5xl">{post.title}</h1>
        {post.date && <time className="mt-4 block text-sm text-white/40">{new Date(post.date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</time>}
        <div className="prose mt-10" dangerouslySetInnerHTML={{ __html: post.html }} />
      </article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </main>
  );
}
`;

const blogSitemapTs = (): string => `import { sitemapForSite } from "@lacspace/sitemap";
import { site } from "@/lib/site";
import { getAllPosts } from "@/lib/posts";

export function GET() {
  const paths = ["/", "/about", "/contact", "/blog", ...getAllPosts().map((p) => \`/blog/\${p.slug}\`)];
  const xml = sitemapForSite(site.config, paths);
  return new Response(xml, { headers: { "content-type": "application/xml" } });
}
`;

const samplePostWelcome = (ctx: Ctx): string => `---
title: Welcome to your new blog
date: 2026-01-15
excerpt: How this Markdown-powered blog works — and how to add your own posts.
tag: Guide
author: ${ctx.template.siteName}
---

# You're up and running

This blog reads **Markdown files** from \`content/posts/\` and renders them to
static pages with [\`@lacspace/markdown\`](https://www.npmjs.com/package/@lacspace/markdown).
No CMS, no database — just files you can version in git.

## Add a post

1. Create \`content/posts/my-post.md\`.
2. Add front-matter at the top (title, date, excerpt, tag).
3. Write Markdown. That's it — the post appears at \`/blog/my-post\`.

## What Markdown supports

- **Bold**, *italic*, ~~strikethrough~~ and \`inline code\`
- Lists, including
  - nested items
  - [x] task lists
- Links, images and autolinks
- Tables:

| Feature | Works |
| ------- | :---: |
| Headings + anchors | ✅ |
| Code blocks | ✅ |

\`\`\`ts
// even fenced code, with a language class for highlighting
export function hello(name: string) {
  return \`Hello, \${name}!\`;
}
\`\`\`

> Every post is statically generated and gets its own SEO metadata and
> Article JSON-LD automatically. Happy writing!
`;

const samplePostSecond = (ctx: Ctx): string => `---
title: Why we build in the open
date: 2026-02-02
excerpt: A short second post so you can see the list and navigation in action.
tag: Notes
author: ${ctx.template.siteName}
---

# Building in the open

This is a second sample post. Delete it whenever you like.

Because posts are just Markdown files, you can:

1. Draft in any editor
2. Preview locally with \`npm run dev\`
3. Commit and deploy

Check the [first post](/blog/welcome) for the full Markdown reference.
`;

/* ------------------------------ file plan ------------------------------ */

function buildFiles(ctx: Ctx): Record<string, string> {
  const isBlog = ctx.template.key === "blog";
  const isDocs = ctx.template.key === "docs";
  const files: Record<string, string> = {
    "package.json": pkgJson(ctx),
    "tsconfig.json": tsconfig(),
    "next.config.mjs": nextConfig(),
    "postcss.config.mjs": postcss(),
    ".gitignore": gitignore(),
    "README.md": readme(ctx),
    "lib/site.ts": siteTs(ctx),
    "app/layout.tsx": layout(ctx),
    "app/globals.css": globalsCss(ctx),
    "app/page.tsx": homePage(ctx),
    "app/about/page.tsx": aboutPage(ctx),
    "app/not-found.tsx": notFound(),
    "app/og/route.tsx": ogRoute(ctx),
    "app/icon.tsx": iconTsx(ctx),
    "app/apple-icon.tsx": appleIconTsx(ctx),
    "app/manifest.ts": manifestTs(ctx),
    "app/robots.txt/route.ts": robotsTs(),
    "app/sitemap.xml/route.ts": isBlog ? blogSitemapTs() : isDocs ? docsSitemapTs() : sitemapTs(),
    "app/contact/page.tsx": contactPage(ctx),
    "app/actions.ts": actionsTs(),
    "components/command-menu.tsx": commandMenu(ctx),
    "components/contact-form.tsx": contactForm(),
    ".github/workflows/seo.yml": seoWorkflow(),
    ".env.example": envExample(),
    "WELCOME.md": welcomeMd(ctx),
  };

  // ✨ The blog template gets a real Markdown-powered blog.
  if (isBlog) {
    files["lib/posts.ts"] = postsLib();
    files["app/blog/page.tsx"] = blogListPage(ctx);
    files["app/blog/[slug]/page.tsx"] = blogPostPage();
    files["content/posts/welcome.md"] = samplePostWelcome(ctx);
    files["content/posts/building-in-the-open.md"] = samplePostSecond(ctx);
  }

  // ✨ The docs template gets a real Markdown-powered documentation site.
  if (isDocs) {
    files["lib/docs.ts"] = docsLib();
    files["components/docs-sidebar.tsx"] = docsSidebar();
    files["app/docs/layout.tsx"] = docsLayout();
    files["app/docs/page.tsx"] = docsIndexPage(ctx);
    files["app/docs/[slug]/page.tsx"] = docsPage();
    files["content/docs/introduction.md"] = sampleDocIntro(ctx);
    files["content/docs/installation.md"] = sampleDocInstall();
    files["content/docs/writing-content.md"] = sampleDocWriting();
  }

  return files;
}

/* ------------------------------ cli ------------------------------ */

interface Args { name?: string; template?: string; yes: boolean; install: boolean; git: boolean; pm: string; help: boolean; }

function parseArgs(list: string[]): Args {
  const a: Args = { yes: false, install: true, git: true, pm: "npm", help: false };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const next = (): string => list[++i] ?? "";
    if (arg === "-t" || arg === "--template") a.template = next();
    else if (arg === "-y" || arg === "--yes") a.yes = true;
    else if (arg === "--no-install") a.install = false;
    else if (arg === "--no-git") a.git = false;
    else if (arg === "--pm") a.pm = next();
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg.startsWith("--template=")) a.template = arg.slice(11);
    else if (!arg.startsWith("-") && !a.name) a.name = arg;
  }
  return a;
}

const HELP = `
${c("bold", "create-lacspace-app")} — scaffold a beautiful Next.js app, Lacspace-wired

${c("bold", "Usage")}
  npm create lacspace-app@latest <name> [options]
  npx create-lacspace-app <name> --template <key>

${c("bold", "Templates")}
${TEMPLATES.map((t) => `  ${t.key.padEnd(10)} ${t.description}`).join("\n")}

${c("bold", "Options")}
  -t, --template <key>   Template (${TEMPLATES.map((t) => t.key).join(" | ")})
  --pm <npm|pnpm|yarn|bun>  Package manager (default npm)
  --no-install           Skip installing dependencies
  --no-git               Skip git init
  -y, --yes              Accept defaults (needs <name>)
  -h, --help             Show this help
`;

async function main(): Promise<void> {
  const args = parseArgs(argv.slice(2));
  if (args.help) { stdout.write(HELP + "\n"); return; }

  stdout.write(`\n${c("bold", c("magenta", "◆ create-lacspace-app"))} ${c("dim", "— a gorgeous Next.js starter, batteries wired")}\n\n`);

  let name = args.name;
  let templateKey = args.template;

  if (!args.yes) {
    const rl = createInterface({ input: stdin, output: stdout });
    try {
      if (!name) name = (await rl.question(`${c("green", "?")} Project name ${c("dim", "(my-app)")}: `)).trim() || "my-app";
      if (!templateKey) {
        stdout.write(`\n  Choose a template:\n`);
        TEMPLATES.forEach((t, i) => stdout.write(`   ${c("cyan", String(i + 1))}. ${c("bold", t.label)} ${c("dim", "— " + t.description)}\n`));
        const ans = (await rl.question(`\n${c("green", "?")} Template ${c("dim", "(1)")}: `)).trim() || "1";
        const idx = /^\d+$/.test(ans) ? parseInt(ans, 10) - 1 : TEMPLATES.findIndex((t) => t.key === ans);
        templateKey = TEMPLATES[idx]?.key ?? "personal";
      }
    } finally {
      rl.close();
    }
  }

  name = name ?? "my-app";
  const template = TEMPLATES.find((t) => t.key === templateKey) ?? TEMPLATES[0]!;
  const dir = resolve(cwd(), name);
  const projectName = basename(dir).toLowerCase().replace(/[^a-z0-9-_]/g, "-");

  if (existsSync(dir) && readdirSync(dir).length > 0) {
    stdout.write(c("red", `\n✗ Directory "${name}" already exists and is not empty.\n\n`));
    exit(1);
    return;
  }

  const files = buildFiles({ name: projectName, template });
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  stdout.write(`\n  ${c("green", "✔")} Created ${c("bold", name)} ${c("dim", `(${template.label})`)}\n`);
  for (const rel of Object.keys(files)) stdout.write(`    ${c("dim", "+ " + rel)}\n`);

  if (args.git) {
    const r = spawnSync("git", ["init", "-q"], { cwd: dir, stdio: "ignore" });
    if (r.status === 0) stdout.write(`\n  ${c("green", "✔")} Initialised git\n`);
  }

  if (args.install) {
    stdout.write(`\n  ${c("cyan", "◷")} Installing dependencies with ${args.pm}…\n`);
    const install = args.pm === "yarn" ? [] : ["install"];
    const r = spawnSync(args.pm, install, { cwd: dir, stdio: "inherit" });
    if (r.status !== 0) stdout.write(c("yellow", `\n  ! Install failed — run "${args.pm} install" yourself.\n`));
  }

  const run = args.pm === "npm" ? "npm run dev" : `${args.pm} dev`;
  stdout.write(`\n${c("bold", "Done! Next steps")}\n`);
  stdout.write(`  ${c("cyan", `cd ${name}`)}\n`);
  if (!args.install) stdout.write(`  ${c("cyan", `${args.pm} install`)}\n`);
  stdout.write(`  ${c("cyan", run)}\n`);
  stdout.write(`\n  Edit ${c("cyan", "lib/site.ts")} (your SEO config) and ${c("cyan", "app/page.tsx")}.\n`);
  stdout.write(`\n  ${c("green", "Happy building!")} ${c("dim", "https://lacspace.com/packages")}\n\n`);
}

main().catch((err: unknown) => {
  stdout.write(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n\n`));
  exit(1);
});
