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
    // React Kit: dark/light theming (no-flash) + essential hooks + global
    // state (announcement bar, mobile nav) + data fetching (live stats).
    "@lacspace/theme": "^1.0.1",
    "@lacspace/hooks": "^1.0.0",
    "@lacspace/store": "^1.0.0",
    "@lacspace/query": "^1.0.0",
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
    plugins: [{ name: "next" }], baseUrl: ".", paths: { "@/*": ["./*"] },
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

/* Class-based dark mode — toggled by @lacspace/theme's <ThemeProvider>. */
@custom-variant dark (&:where(.dark, .dark *));

/* Semantic color tokens → Tailwind utilities (text-fg, text-muted, bg-surface,
   border-hairline, …). They resolve to the CSS vars below, which swap per theme. */
@theme inline {
  --color-fg: var(--fg);
  --color-muted: var(--muted);
  --color-faint: var(--faint);
  --color-surface: var(--surface);
  --color-panel: var(--panel);
  --color-hairline: var(--hairline);
}

:root {
  --accent-from: ${ctx.template.accent[0]};
  --accent-to: ${ctx.template.accent[1]};
  /* Light theme */
  --bg: #ffffff;
  --fg: #0a0a0f;
  --muted: #3f3f46;
  --faint: #71717a;
  --surface: rgb(0 0 0 / 0.03);
  --panel: rgb(0 0 0 / 0.06);
  --hairline: rgb(0 0 0 / 0.10);
}

.dark {
  /* Dark theme (default) */
  --bg: #0a0a0f;
  --fg: #f5f5f7;
  --muted: rgb(255 255 255 / 0.62);
  --faint: rgb(255 255 255 / 0.42);
  --surface: rgb(255 255 255 / 0.04);
  --panel: rgb(255 255 255 / 0.08);
  --hairline: rgb(255 255 255 / 0.10);
}

* { border-color: var(--hairline); }
html { scroll-behavior: smooth; }
body {
  background: var(--bg);
  color: var(--fg);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  transition: background-color 0.3s ease, color 0.3s ease;
}

::selection { background: var(--accent-to); color: #fff; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: var(--panel); border-radius: 8px; }
:focus-visible { outline: 2px solid var(--accent-to); outline-offset: 2px; border-radius: 4px; }

.gradient-text {
  background: linear-gradient(120deg, var(--accent-from), var(--accent-to));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.gradient-bg { background: linear-gradient(120deg, var(--accent-from), var(--accent-to)); }

/* opaque theme background (for sticky chrome & chips) */
.bg-app { background: var(--bg); }

/* indeterminate progress bar (used by the "under development" pages) */
@keyframes loadbar { 0% { transform: translateX(-120%); } 100% { transform: translateX(340%); } }

/* ambient motion for illustrations & the aurora background */
@keyframes floaty { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-16px); } }
@keyframes spin-slow { to { transform: rotate(360deg); } }
@keyframes gradient-pan { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
@keyframes marquee-x { from { transform: translateX(0); } to { transform: translateX(-50%); } }
.animate-floaty { animation: floaty 6s ease-in-out infinite; }
.animate-floaty-slow { animation: floaty 9s ease-in-out infinite; }
.animate-spin-slow { animation: spin-slow 26s linear infinite; }
.gradient-text-animated {
  background: linear-gradient(120deg, var(--accent-from), var(--accent-to), var(--accent-from));
  background-size: 200% 200%;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: gradient-pan 6s ease infinite;
}
.marquee-track { display: flex; width: max-content; animation: marquee-x 32s linear infinite; }
@keyframes draw { to { stroke-dashoffset: 0; } }
.animate-draw { stroke-dasharray: 2000; stroke-dashoffset: 2000; animation: draw 1.8s ease forwards; }
.marquee-mask { -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); }

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

const layout = (ctx: Ctx): string => {
  const isDash = ctx.template.key === "dashboard";
  // The dashboard is app-shaped (its pages render their own sidebar shell), so
  // it skips the marketing header/footer/announcement chrome.
  const imports = isDash
    ? ""
    : `import { AnnouncementBar } from "@/components/announcement-bar";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
`;
  const open = isDash ? "" : `<AnnouncementBar />
          <SiteHeader />
          `;
  const close = isDash ? "" : `
          <SiteFooter />`;
  return `import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@lacspace/theme";
import { site } from "@/lib/site";
import { CommandMenu } from "@/components/command-menu";
${imports}import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = site.meta({ title: ${JSON.stringify(ctx.template.siteName)} });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="antialiased">
        {/* ✨ Dark / light / system theming with a built-in no-flash script — @lacspace/theme */}
        <ThemeProvider defaultTheme="dark">
          {/* ✨ Press ⌘K / Ctrl-K anywhere — powered by @lacspace/ui */}
          <CommandMenu />
          ${open}{children}${close}
        </ThemeProvider>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(site.rootJsonLd()) }}
        />
      </body>
    </html>
  );
}
`;
};

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
      <p className="text-lg text-muted">This page wandered off.</p>
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
- **✨ Dark / light / system theme** — a no-flash toggle in the header via \`@lacspace/theme\` + \`@lacspace/hooks\`. The whole template is theme-aware.
- **✨ Multiple pages + auto header & footer** — the nav and a full footer are generated from one page map. The highest-value page for your template ships with **real content** (e.g. a pricing table, a shop with a working cart, a menu, a settings panel). Every other link still resolves to a real, branded page — ones you haven't filled in yet show a friendly **"under development"** screen instead of a 404. Add content in \`app/<route>/page.tsx\`.
- **✨ Global state + data fetching** — a dismissible announcement bar and the mobile menu use \`@lacspace/store\` (with \`persist\`); the home page's live "By the numbers" strip fetches \`/api/stats\` with \`@lacspace/query\` (shared cache, revalidate-on-focus).
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

function homePage(ctx: Ctx): string {
  const n = ctx.template.siteName;
  // The dashboard is app-shaped (sidebar) — it has its own shell, not the
  // marketing header/footer chrome.
  if (ctx.template.key === "dashboard") return dashboardHome(ctx);

  const shell = (inner: string): string => `import { site } from "@/lib/site";
import { LiveStats } from "@/components/live-stats";
import { Aurora } from "@/components/aurora";
import { HeroArt } from "@/components/hero-art";

// ✨ Self-canonical home page — one line, full SEO (title, canonical, OG, Twitter).
export const metadata = site.meta({ title: ${JSON.stringify(n)}, path: "/" });

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* ✨ Animated, theme-aware gradient backdrop */}
      <Aurora />
      ${inner}
      ${showcaseSection(ctx)}
      ${marqueeSection(ctx)}
      ${faqSection(ctx)}
      ${builtWithSection(ctx)}
    </main>
  );
}
`;

  if (ctx.template.key === "personal") {
    return shell(`<section className="mx-auto max-w-3xl px-6 py-28 text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-faint">Portfolio</p>
        <h1 className="text-5xl font-black leading-tight sm:text-7xl">Hi, I'm <span className="gradient-text">${n}</span>.</h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted">${ctx.template.siteDescription}</p>
        <div className="mt-10 flex justify-center gap-4">
          <a href="#work" className="gradient-bg rounded-full px-6 py-3 font-semibold text-black">View my work</a>
          <a href="#contact" className="rounded-full border border-hairline px-6 py-3 font-semibold hover:bg-surface">Get in touch</a>
        </div>
      </section>
      <section id="work" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="mb-10 text-3xl font-bold">Selected work</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="group rounded-2xl border border-hairline bg-surface p-6 transition hover:-translate-y-1 hover:border-hairline">
              <div className="mb-4 h-32 rounded-xl gradient-bg opacity-80" />
              <h3 className="font-semibold">Project {i}</h3>
              <p className="mt-1 text-sm text-muted">A short description of what you built and the impact it had.</p>
            </div>
          ))}
        </div>
      </section>`);
  }

  if (ctx.template.key === "business") {
    return shell(`<section className="mx-auto max-w-4xl px-6 py-28 text-center">
        <h1 className="text-5xl font-black leading-tight sm:text-6xl">We build products <span className="gradient-text">that grow businesses</span>.</h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">${ctx.template.siteDescription}</p>
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
            <div key={s.t} className="rounded-2xl border border-hairline bg-surface p-8">
              <h3 className="text-xl font-bold gradient-text">{s.t}</h3>
              <p className="mt-2 text-muted">{s.d}</p>
            </div>
          ))}
        </div>
      </section>
      <section id="contact" className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="text-3xl font-bold">Let's work together</h2>
        <p className="mt-3 text-muted">Tell us about your project and we'll get back within a day.</p>
        <a href="mailto:hello@example.com" className="mt-8 inline-block rounded-full border border-hairline px-8 py-3 font-semibold hover:bg-surface">hello@example.com</a>
      </section>`);
  }

  if (ctx.template.key === "ecommerce") {
    return shell(`<section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <h1 className="text-5xl font-black leading-tight sm:text-6xl"><span className="gradient-text">${n}</span></h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted">${ctx.template.siteDescription}</p>
        <a href="#shop" className="mt-10 inline-block gradient-bg rounded-full px-8 py-3 font-semibold text-black">Shop the collection</a>
      </section>
      <section id="shop" className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="mb-10 text-3xl font-bold">Featured</h2>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { n: "Aurora Lamp", p: "$89" }, { n: "Terra Mug", p: "$24" },
            { n: "Linen Throw", p: "$65" }, { n: "Oak Stand", p: "$120" },
          ].map((prod) => (
            <div key={prod.n} className="group rounded-2xl border border-hairline bg-surface p-4 transition hover:-translate-y-1">
              <div className="mb-4 aspect-square rounded-xl gradient-bg opacity-80" />
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{prod.n}</h3>
                <span className="text-muted">{prod.p}</span>
              </div>
              <a href="/shop" className="mt-3 block w-full rounded-lg border border-hairline py-2 text-center text-sm font-medium hover:bg-surface">Add to cart</a>
            </div>
          ))}
        </div>
      </section>`);
  }

  if (ctx.template.key === "blog") {
    return shell(`<section className="mx-auto max-w-3xl px-6 py-24">
        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-faint">The Journal</p>
        <h1 className="text-5xl font-black leading-tight sm:text-6xl gradient-text">${n}</h1>
        <p className="mt-6 text-lg text-muted">${ctx.template.siteDescription}</p>
      </section>
      <section id="latest" className="mx-auto max-w-5xl px-6 pb-8">
        <a href="#" className="group block rounded-3xl border border-hairline bg-surface p-8 transition hover:border-hairline">
          <div className="mb-6 h-56 rounded-2xl gradient-bg opacity-80" />
          <span className="text-xs font-semibold uppercase tracking-wider text-faint">Featured</span>
          <h2 className="mt-2 text-3xl font-bold group-hover:opacity-90">The one thing every product needs before launch</h2>
          <p className="mt-2 text-muted">A short, punchy dek that pulls the reader into the piece and makes them want more.</p>
        </a>
      </section>
      <section className="mx-auto max-w-5xl px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <a key={i} href="#" className="group">
              <div className="mb-4 h-40 rounded-xl gradient-bg opacity-70" />
              <span className="text-xs uppercase tracking-wider text-faint">Essay</span>
              <h3 className="mt-1 text-xl font-semibold group-hover:opacity-90">A thoughtful headline for post {i}</h3>
              <p className="mt-1 text-sm text-muted">Two lines of supporting copy to set the scene for the reader.</p>
            </a>
          ))}
        </div>
      </section>`);
  }

  if (ctx.template.key === "docs") {
    return shell(`<section className="mx-auto max-w-4xl px-6 py-28 text-center">
        <h1 className="text-5xl font-black leading-tight sm:text-6xl"><span className="gradient-text">${n}</span></h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">${ctx.template.siteDescription}</p>
        <div className="mt-8 inline-flex items-center gap-3 rounded-lg border border-hairline bg-panel px-4 py-3 font-mono text-sm text-muted">
          <span className="text-faint">$</span> npm install @acme/sdk
        </div>
      </section>
      <section id="guides" className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { t: "Quick start", d: "Go from zero to your first request in five minutes." },
            { t: "Guides", d: "Task-focused walkthroughs for the common paths." },
            { t: "API reference", d: "Every endpoint, typed, with copy-paste examples." },
          ].map((c) => (
            <a key={c.t} href="#" className="rounded-2xl border border-hairline bg-surface p-8 transition hover:border-hairline">
              <h3 className="text-xl font-bold gradient-text">{c.t}</h3>
              <p className="mt-2 text-muted">{c.d}</p>
            </a>
          ))}
        </div>
      </section>`);
  }

  if (ctx.template.key === "restaurant") {
    return shell(`<section className="mx-auto max-w-4xl px-6 py-28 text-center">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-faint">Est. 2026</p>
        <h1 className="text-5xl font-black leading-tight sm:text-7xl gradient-text">${n}</h1>
        <p className="mx-auto mt-6 max-w-xl text-lg text-muted">${ctx.template.siteDescription}</p>
        <a href="#reserve" className="mt-10 inline-block gradient-bg rounded-full px-8 py-3 font-semibold text-black">Reserve a table</a>
      </section>
      <section id="menu" className="mx-auto max-w-4xl px-6 py-16">
        <h2 className="mb-10 text-center text-3xl font-bold">Tonight's plates</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {[
            { n: "Charred leeks", p: "$14" }, { n: "Handmade tagliatelle", p: "$22" },
            { n: "Wood-fired trout", p: "$28" }, { n: "Olive oil cake", p: "$11" },
          ].map((d) => (
            <div key={d.n} className="flex items-baseline justify-between gap-4 border-b border-hairline pb-4">
              <div>
                <h3 className="text-lg font-semibold">{d.n}</h3>
                <p className="text-sm text-muted">A short, mouth-watering description of the dish.</p>
              </div>
              <span className="shrink-0 gradient-text font-bold">{d.p}</span>
            </div>
          ))}
        </div>
      </section>
      <section id="reserve" className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h2 className="text-3xl font-bold">Join us</h2>
        <p className="mt-3 text-muted">Open Wed–Sun, 5pm till late. Walk-ins welcome; bookings recommended.</p>
        <a href="tel:+10000000000" className="mt-8 inline-block rounded-full border border-hairline px-8 py-3 font-semibold hover:bg-surface">Call to book</a>
      </section>`);
  }

  // saas
  return shell(`<section className="mx-auto max-w-4xl px-6 py-28 text-center">
        <p className="mb-4 inline-block rounded-full border border-hairline px-4 py-1 text-xs font-semibold text-muted">New · v1.0</p>
        <h1 className="text-5xl font-black leading-tight sm:text-6xl">Ship faster with <span className="gradient-text">${n}</span></h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">${ctx.template.siteDescription}</p>
        <div className="mt-10 flex justify-center gap-4">
          <a href="#pricing" className="gradient-bg rounded-full px-8 py-3 font-semibold text-black">Start free</a>
          <a href="#features" className="rounded-full border border-hairline px-8 py-3 font-semibold hover:bg-surface">See features</a>
        </div>
      </section>
      <section id="features" className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { t: "Fast", d: "Built on the edge — global by default." },
            { t: "Secure", d: "Hardened headers and auth out of the box." },
            { t: "Scalable", d: "From your first user to your millionth." },
          ].map((f) => (
            <div key={f.t} className="rounded-2xl border border-hairline bg-surface p-8">
              <h3 className="text-xl font-bold gradient-text">{f.t}</h3>
              <p className="mt-2 text-muted">{f.d}</p>
            </div>
          ))}
        </div>
      </section>
      <section id="pricing" className="mx-auto max-w-md px-6 py-24 text-center">
        <div className="rounded-3xl border border-hairline bg-surface p-10">
          <h2 className="text-3xl font-bold">Pro</h2>
          <p className="mt-2 text-5xl font-black gradient-text">$29<span className="text-lg text-faint">/mo</span></p>
          <a href="#" className="mt-8 inline-block w-full gradient-bg rounded-full px-8 py-3 font-semibold text-black">Get started</a>
        </div>
      </section>`);
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
      <Link href="/" className="text-sm text-muted hover:text-fg">← Back home</Link>
      <h1 className="mt-6 text-4xl font-black sm:text-5xl gradient-text">About</h1>
      <p className="mt-6 text-lg leading-relaxed text-muted">
        This page already has its own SEO — a unique title, canonical URL, Open Graph tags and a
        generated social image — from a single <code>site.meta()</code> call. Duplicate this file for
        any new route and it just works.
      </p>
    </main>
  );
}
`;

/* --------------------------- interactivity --------------------------- */

// ✨ Dark / light theme toggle — @lacspace/theme + @lacspace/hooks.
const themeToggle = (): string => `"use client";

import { useTheme } from "@lacspace/theme";
import { useIsMounted } from "@lacspace/hooks";

/** A sun/moon button that flips between light and dark. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isMounted = useIsMounted();
  const dark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-muted transition hover:text-fg"
    >
      {/* Render a neutral placeholder until mounted to avoid a hydration mismatch. */}
      {!isMounted() ? (
        <span className="block h-4 w-4" />
      ) : dark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
`;

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

const newsletter = createForm({
  schema: v.object({ email: v.string().email("Enter a valid email").toLowerCase() }),
  honeypot: "website",
  minSubmitMs: 500,
});

export type SubscribeState =
  | { ok: true }
  | { ok: false; errors: Record<string, string>; values: Record<string, unknown> }
  | null;

export async function submitNewsletter(prev: SubscribeState, formData: FormData): Promise<SubscribeState> {
  const r = newsletter.action(prev, formData);
  if (!r.ok) return r;

  // ✅ r.data is fully typed: { email }
  // TODO: add r.data.email to your list (Resend, Mailchimp, a database…).
  console.log("New subscriber:", r.data.email);
  return { ok: true };
}
`;

const contactForm = (): string => `"use client";
import { useActionState } from "react";
import { honeypotProps, timestampValue } from "@lacspace/form";
import { submitContact, type ContactState } from "@/app/actions";

const field = "w-full rounded-xl border border-hairline bg-surface px-4 py-3 outline-none focus:border-hairline";
const label = "mb-1 block text-sm text-muted";
const errCls = "mt-1 text-sm text-red-400";

export function ContactForm() {
  const [state, action, pending] = useActionState<ContactState, FormData>(submitContact, null);

  if (state?.ok) {
    return (
      <p className="rounded-2xl border border-hairline bg-surface p-8 text-center text-lg">
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
      <p className="mt-4 text-muted">Have a question or a project in mind? Drop a message below.</p>
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
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-faint">{group.group}</p>
          <ul className="flex flex-col gap-1">
            {group.items.map((d) => {
              const href = \`/docs/\${d.slug}\`;
              const active = path === href;
              return (
                <li key={d.slug}>
                  <Link
                    href={href}
                    className={\`block rounded-lg px-3 py-1.5 transition \${active ? "gradient-bg font-semibold text-black" : "text-muted hover:bg-surface hover:text-fg"}\`}
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
import { ThemeToggle } from "@/components/theme-toggle";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const nav = getDocNav();
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-[220px_1fr]">
      <aside className="md:sticky md:top-24 md:h-fit">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/docs" className="block text-lg font-black gradient-text">Docs</Link>
          <ThemeToggle />
        </div>
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
      <p className="mt-4 text-muted">Everything you need to get started and go deep.</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {docs.map((d) => (
          <Link key={d.slug} href={\`/docs/\${d.slug}\`} className="rounded-2xl border border-hairline bg-surface p-5 transition hover:border-hairline">
            <span className="text-xs font-semibold uppercase tracking-widest text-faint">{d.group}</span>
            <h2 className="mt-1 text-lg font-bold">{d.title}</h2>
            {d.description && <p className="mt-1 text-sm text-muted">{d.description}</p>}
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
      <span className="text-xs font-semibold uppercase tracking-widest text-faint">{doc.group}</span>
      <h1 className="mt-1 text-4xl font-black leading-tight">{doc.title}</h1>
      {doc.description && <p className="mt-3 text-lg text-muted">{doc.description}</p>}

      {doc.toc.length > 2 && (
        <div className="mt-8 rounded-xl border border-hairline bg-surface p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-faint">On this page</p>
          <ul className="flex flex-col gap-1 text-sm">
            {doc.toc.map((h) => (
              <li key={h.id} style={{ paddingLeft: (h.level - 1) * 12 }}>
                <a href={\`#\${h.id}\`} className="text-muted hover:text-fg">{h.text}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="prose mt-10" dangerouslySetInnerHTML={{ __html: doc.html }} />

      <nav className="mt-14 flex justify-between gap-4 border-t border-hairline pt-8 text-sm">
        {prev ? <Link href={\`/docs/\${prev.slug}\`} className="text-muted hover:text-fg">&larr; {prev.title}</Link> : <span />}
        {next ? <Link href={\`/docs/\${next.slug}\`} className="text-right text-muted hover:text-fg">{next.title} &rarr;</Link> : <span />}
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
      <p className="mt-4 text-muted">Thoughts, notes and updates.</p>
      <div className="mt-12 flex flex-col gap-8">
        {posts.map((post) => (
          <Link key={post.slug} href={\`/blog/\${post.slug}\`} className="group rounded-2xl border border-hairline bg-surface p-6 transition hover:border-hairline">
            {post.tag && <span className="text-xs font-semibold uppercase tracking-widest text-faint">{post.tag}</span>}
            <h2 className="mt-1 text-2xl font-bold group-hover:gradient-text">{post.title}</h2>
            <p className="mt-2 text-muted">{post.excerpt}</p>
            {post.date && <time className="mt-3 block text-sm text-faint">{new Date(post.date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</time>}
          </Link>
        ))}
        {posts.length === 0 && <p className="text-muted">No posts yet — add a Markdown file in <code>content/posts/</code>.</p>}
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
      <Link href="/blog" className="text-sm text-muted hover:text-fg">&larr; All posts</Link>
      <article className="mt-6">
        <h1 className="text-4xl font-black leading-tight sm:text-5xl">{post.title}</h1>
        {post.date && <time className="mt-4 block text-sm text-faint">{new Date(post.date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</time>}
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
    "components/theme-toggle.tsx": themeToggle(),
    // ✨ React Kit: global state (@lacspace/store) + data fetching (@lacspace/query).
    "lib/store.ts": uiStore(),
    "components/under-development.tsx": underDevelopmentComponent(),
    "components/live-stats.tsx": liveStats(),
    "app/api/stats/route.ts": statsRoute(),
    ".github/workflows/seo.yml": seoWorkflow(),
    ".env.example": envExample(),
    "WELCOME.md": welcomeMd(ctx),
  };

  const isDash = ctx.template.key === "dashboard";
  if (isDash) {
    // The dashboard shell (sidebar) is shared by its home + stub pages.
    files["components/dashboard-shell.tsx"] = dashboardShell(ctx);
  } else {
    // Global marketing chrome — auto-built header + footer from the page map.
    files["components/site-header.tsx"] = siteHeader(ctx);
    files["components/site-footer.tsx"] = siteFooter(ctx);
    files["components/announcement-bar.tsx"] = announcementBar();
    // ✨ Creative home extras — animated backdrop + bespoke illustration.
    files["components/aurora.tsx"] = aurora();
    files["components/hero-art.tsx"] = heroArt(ctx);
  }

  // ✨ Every nav/footer link gets a real, branded page — no 404s. Pages without
  // content yet render a friendly "under development" placeholder.
  for (const page of stubPages(ctx)) {
    files[`app${page.path}/page.tsx`] = isDash ? dashboardStubPage(page) : underDevPage(page);
  }

  // ✨ Drop-in UI kit (Section, FeatureCard, Testimonial, CTABand, …) in every app.
  Object.assign(files, uiKitFiles());

  // ✨ The highest-value page(s) per template ship with real content.
  Object.assign(files, realPageFiles(ctx));

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

/* --------------------- site pages, chrome & react kit --------------------- */

interface PageSpec { path: string; label: string; nav?: boolean; group?: "Product" | "Company" | "Resources"; real?: boolean; }

/** The page set for a template — nav links, footer groups and which are real. */
function pagesFor(ctx: Ctx): PageSpec[] {
  const k = ctx.template.key;
  if (k === "dashboard") {
    return [
      { path: "/analytics", label: "Analytics", nav: true, group: "Product", real: true },
      { path: "/customers", label: "Customers", nav: true, group: "Product" },
      { path: "/billing", label: "Billing", nav: true, group: "Product" },
      { path: "/settings", label: "Settings", nav: true, group: "Product", real: true },
      { path: "/help", label: "Help", group: "Resources" },
    ];
  }
  const common: PageSpec[] = [
    { path: "/about", label: "About", nav: true, group: "Company", real: true },
    { path: "/contact", label: "Contact", nav: true, group: "Company", real: true },
    { path: "/careers", label: "Careers", group: "Company" },
    { path: "/privacy", label: "Privacy", group: "Resources" },
    { path: "/terms", label: "Terms", group: "Resources" },
  ];
  const specific: Record<string, PageSpec[]> = {
    personal: [
      { path: "/work", label: "Work", nav: true, group: "Product", real: true },
      { path: "/blog", label: "Blog", nav: true, group: "Product" },
      { path: "/uses", label: "Uses", group: "Resources" },
    ],
    business: [
      { path: "/services", label: "Services", nav: true, group: "Product", real: true },
      { path: "/work", label: "Work", nav: true, group: "Product" },
      { path: "/pricing", label: "Pricing", nav: true, group: "Product", real: true },
      { path: "/faq", label: "FAQ", group: "Resources" },
    ],
    ecommerce: [
      { path: "/shop", label: "Shop", nav: true, group: "Product", real: true },
      { path: "/collections", label: "Collections", nav: true, group: "Product" },
      { path: "/cart", label: "Cart", group: "Product", real: true },
      { path: "/shipping", label: "Shipping", group: "Resources" },
      { path: "/returns", label: "Returns", group: "Resources" },
    ],
    saas: [
      { path: "/features", label: "Features", nav: true, group: "Product", real: true },
      { path: "/pricing", label: "Pricing", nav: true, group: "Product", real: true },
      { path: "/integrations", label: "Integrations", group: "Product" },
      { path: "/changelog", label: "Changelog", group: "Resources" },
    ],
    blog: [
      { path: "/blog", label: "Articles", nav: true, group: "Product", real: true },
      { path: "/topics", label: "Topics", nav: true, group: "Product", real: true },
      { path: "/newsletter", label: "Newsletter", group: "Resources", real: true },
    ],
    docs: [
      { path: "/docs", label: "Docs", nav: true, group: "Product", real: true },
      { path: "/guides", label: "Guides", nav: true, group: "Product", real: true },
      { path: "/api-reference", label: "API", nav: true, group: "Product" },
      { path: "/changelog", label: "Changelog", group: "Resources" },
    ],
    restaurant: [
      { path: "/menu", label: "Menu", nav: true, group: "Product", real: true },
      { path: "/reservations", label: "Reservations", nav: true, group: "Product" },
      { path: "/gallery", label: "Gallery", nav: true, group: "Product" },
      { path: "/events", label: "Private events", group: "Resources" },
    ],
  };
  return [...(specific[k] ?? []), ...common];
}

/** Pages that need a generated "under development" stub (no real content yet). */
function stubPages(ctx: Ctx): PageSpec[] {
  return pagesFor(ctx).filter((p) => !p.real);
}

const linkLiteral = (pages: PageSpec[]): string =>
  pages.map((l) => `{ href: ${JSON.stringify(l.path)}, label: ${JSON.stringify(l.label)} }`).join(", ");

// ✨ Global site header — page nav, theme toggle, and a mobile menu backed by
// @lacspace/store (so the open state is shared, not prop-drilled).
const siteHeader = (ctx: Ctx): string => {
  const isEcom = ctx.template.key === "ecommerce";
  const cartImport = isEcom ? `\nimport { useCart } from "@/lib/store";\nimport { useIsMounted } from "@lacspace/hooks";` : "";
  const cartHook = isEcom
    ? `\n  const count = useCart((s) => s.items.length);\n  const mounted = useIsMounted();`
    : "";
  const cartBtn = isEcom
    ? `
          <Link href="/cart" aria-label="Cart" className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-muted transition hover:text-fg">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
            {mounted() && count > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full gradient-bg px-1 text-[10px] font-bold text-black">{count}</span>
            ) : null}
          </Link>`
    : "";
  return `"use client";

import Link from "next/link";
import { useUI } from "@/lib/store";
import { ThemeToggle } from "./theme-toggle";${cartImport}

const LINKS = [${linkLiteral(pagesFor(ctx).filter((p) => p.nav))}];

export function SiteHeader() {
  const open = useUI((s) => s.navOpen);
  const toggle = useUI((s) => s.toggleNav);
  const setOpen = useUI((s) => s.setNavOpen);${cartHook}
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-app/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-black gradient-text">${ctx.template.siteName}</Link>
        <div className="hidden items-center gap-6 md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm text-muted transition hover:text-fg">{l.label}</Link>
          ))}
          <ThemeToggle />${cartBtn}
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />${cartBtn}
          <button type="button" aria-label="Menu" onClick={toggle} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-muted transition hover:text-fg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </button>
        </div>
      </nav>
      {open ? (
        <div className="border-t border-hairline md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-3">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-muted transition hover:bg-surface hover:text-fg">{l.label}</Link>
            ))}
          </div>
        </div>
      ) : null}
    </header>
  );
}
`;
};

// ✨ Global site footer — columns auto-built from the template's page map.
const siteFooter = (ctx: Ctx): string => {
  const pages = pagesFor(ctx);
  const groups = (["Product", "Company", "Resources"] as const)
    .map((title) => ({ title, items: pages.filter((p) => p.group === title) }))
    .filter((g) => g.items.length > 0);
  const groupsLiteral = groups
    .map((g) => `{ title: ${JSON.stringify(g.title)}, links: [${linkLiteral(g.items)}] }`)
    .join(", ");
  return `import Link from "next/link";

const GROUPS = [${groupsLiteral}];

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <div className="text-lg font-black gradient-text">${ctx.template.siteName}</div>
            <p className="mt-3 max-w-xs text-sm text-muted">${ctx.template.siteDescription}</p>
          </div>
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="text-sm font-semibold">{g.title}</div>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                {g.links.map((l) => (
                  <li key={l.href}><Link href={l.href} className="transition hover:text-fg">{l.label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-hairline pt-6 text-sm text-faint sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} ${ctx.template.siteName}. All rights reserved.</span>
          <span>Built with <a href="https://lacspace.com/packages" className="text-muted transition hover:text-fg">the Lacspace React Kit</a>.</span>
        </div>
      </div>
    </footer>
  );
}
`;
};

// ✨ Dismissible announcement bar — dismissal is persisted via @lacspace/store.
const announcementBar = (): string => `"use client";

import { useAnnouncement } from "@/lib/store";
import { useIsMounted } from "@lacspace/hooks";

export function AnnouncementBar() {
  const dismissed = useAnnouncement((s) => s.dismissed);
  const dismiss = useAnnouncement((s) => s.dismiss);
  const mounted = useIsMounted();

  // Persisted state is client-only — wait for mount to avoid a hydration flash.
  if (!mounted() || dismissed) return null;

  return (
    <div className="relative gradient-bg px-10 py-2 text-center text-sm font-medium text-black">
      ✨ Built with the Lacspace React Kit —{" "}
      <a href="https://lacspace.com/packages" className="underline underline-offset-2">explore the packages</a>
      <button type="button" aria-label="Dismiss" onClick={dismiss} className="absolute right-3 top-1/2 -translate-y-1/2 text-lg leading-none text-black/60 hover:text-black">×</button>
    </div>
  );
}
`;

// ✨ Friendly placeholder shown instead of a 404 for scaffolded-but-empty pages.
const underDevelopmentComponent = (): string => `"use client";

import Link from "next/link";

/** A branded placeholder for pages that don't have content yet. */
export function UnderDevelopment({ title = "This page", path }: { title?: string; path?: string }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl gradient-bg text-3xl">🚧</div>
      <p className="text-sm font-semibold uppercase tracking-widest text-muted">Under development</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight"><span className="gradient-text">{title}</span> is coming soon</h1>
      <p className="mt-4 max-w-md text-muted">We're putting the finishing touches on this page. Check back shortly — or head back home in the meantime.</p>
      <div className="mt-8 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-surface">
        <div className="h-full w-1/3 gradient-bg" style={{ animation: "loadbar 1.8s ease-in-out infinite" }} />
      </div>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className="gradient-bg rounded-full px-6 py-3 font-semibold text-black">Back home</Link>
        <Link href="/contact" className="rounded-full border border-hairline px-6 py-3 font-semibold transition hover:bg-surface">Get in touch</Link>
      </div>
      {path ? (
        <p className="mt-8 text-xs text-faint">Add your content in <code className="rounded bg-surface px-1.5 py-0.5">app{path}/page.tsx</code>.</p>
      ) : null}
    </div>
  );
}
`;

// A generated route for a marketing-template stub page.
const underDevPage = (page: PageSpec): string => `import type { Metadata } from "next";
import { site } from "@/lib/site";
import { UnderDevelopment } from "@/components/under-development";

export const metadata: Metadata = site.meta({ title: ${JSON.stringify(page.label)}, path: ${JSON.stringify(page.path)}, description: ${JSON.stringify(page.label + " — coming soon. We're building this page.")} });

export default function Page() {
  return (
    <main className="min-h-screen">
      <UnderDevelopment title={${JSON.stringify(page.label)}} path={${JSON.stringify(page.path)}} />
    </main>
  );
}
`;

// A generated stub page inside the dashboard shell.
const dashboardStubPage = (page: PageSpec): string => `import type { Metadata } from "next";
import { site } from "@/lib/site";
import { DashboardShell } from "@/components/dashboard-shell";
import { UnderDevelopment } from "@/components/under-development";

export const metadata: Metadata = site.meta({ title: ${JSON.stringify(page.label)}, path: ${JSON.stringify(page.path)}, description: ${JSON.stringify(page.label + " — coming soon.")} });

export default function Page() {
  return (
    <DashboardShell title={${JSON.stringify(page.label)}}>
      <UnderDevelopment title={${JSON.stringify(page.label)}} path={${JSON.stringify(page.path)}} />
    </DashboardShell>
  );
}
`;

// lib/store.ts — global state via @lacspace/store.
const uiStore = (): string => `import { create, persist } from "@lacspace/store";

/** Ephemeral UI state — e.g. the mobile nav. Not persisted. */
interface UIState {
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  toggleNav: () => void;
}
export const useUI = create<UIState>((set) => ({
  navOpen: false,
  setNavOpen: (navOpen) => set({ navOpen }),
  toggleNav: () => set((s) => ({ navOpen: !s.navOpen })),
}));

/** Whether the announcement bar was dismissed — persisted to localStorage. */
interface AnnouncementState {
  dismissed: boolean;
  dismiss: () => void;
}
export const useAnnouncement = create<AnnouncementState>(
  persist(
    (set) => ({
      dismissed: false,
      dismiss: () => set({ dismissed: true }),
    }),
    { name: "announcement" },
  ),
);

/** A tiny shopping cart — persisted to localStorage. */
export interface CartItem { id: string; name: string; price: number; }
interface CartState {
  items: CartItem[];
  add: (item: CartItem) => void;
  remove: (id: string) => void;
  clear: () => void;
}
export const useCart = create<CartState>(
  persist(
    (set) => ({
      items: [],
      add: (item) => set((s) => ({ items: [...s.items, item] })),
      remove: (id) => set((s) => {
        const i = s.items.findIndex((x) => x.id === id);
        if (i === -1) return {};
        const items = s.items.slice();
        items.splice(i, 1);
        return { items };
      }),
      clear: () => set({ items: [] }),
    }),
    { name: "cart" },
  ),
);
`;

// app/api/stats/route.ts — a self-contained endpoint for the query demo.
const statsRoute = (): string => `import { NextResponse } from "next/server";

// Demo endpoint powering <LiveStats/> (@lacspace/query). Swap in your real data.
export const dynamic = "force-dynamic";

export function GET() {
  const jitter = (n: number) => n + Math.floor(Math.random() * n * 0.04);
  return NextResponse.json({
    users: jitter(12480),
    uptime: 99.98,
    requests: jitter(1_840_000),
  });
}
`;

// components/live-stats.tsx — data fetching + cache via @lacspace/query.
const liveStats = (): string => `"use client";

import { useQuery } from "@lacspace/query";

interface Stats { users: number; uptime: number; requests: number; }

export function LiveStats() {
  // Shared cache, de-duped requests, and revalidation on window focus.
  const { data, isLoading } = useQuery("stats", async () => {
    const res = await fetch("/api/stats");
    if (!res.ok) throw new Error("Failed to load stats");
    return (await res.json()) as Stats;
  });

  const items = [
    { label: "Active users", value: data ? data.users.toLocaleString() : "—" },
    { label: "Uptime", value: data ? data.uptime + "%" : "—" },
    { label: "Requests / mo", value: data ? new Intl.NumberFormat("en", { notation: "compact" }).format(data.requests) : "—" },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {items.map((s) => (
        <div key={s.label} className="rounded-2xl border border-hairline bg-app p-6 text-center">
          <div className={"text-3xl font-bold tabular-nums " + (isLoading ? "animate-pulse text-muted" : "")}>{s.value}</div>
          <div className="mt-1 text-sm text-muted">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
`;

// The creative "Built with the React Kit" + live-stats band appended to home.
const builtWithSection = (ctx: Ctx): string => {
  const count = pagesFor(ctx).length + 1; // + the home page
  return `<section className="mx-auto max-w-6xl px-6 py-20">
        <div className="rounded-3xl border border-hairline bg-surface p-8 sm:p-12">
          <p className="text-sm font-semibold uppercase tracking-widest text-muted">Live · @lacspace/query</p>
          <h2 className="mt-3 text-3xl font-bold">By the numbers</h2>
          <p className="mt-2 max-w-xl text-muted">Fetched from an internal API route and revalidated on window focus — a tiny demo of the data layer wired into this starter.</p>
          <div className="mt-8"><LiveStats /></div>
          <div className="mt-12 border-t border-hairline pt-8">
            <p className="text-sm font-semibold uppercase tracking-widest text-muted">Built with the Lacspace React Kit</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {["@lacspace/theme", "@lacspace/hooks", "@lacspace/store", "@lacspace/query", "@lacspace/ui", "@lacspace/seo", "@lacspace/og", "@lacspace/form"].map((p) => (
                <span key={p} className="rounded-full border border-hairline bg-app px-3 py-1 font-mono text-xs text-muted">{p}</span>
              ))}
            </div>
            <p className="mt-5 max-w-2xl text-sm text-muted">Dark mode with no flash, a ⌘K palette, SEO + dynamic OG images, a validated contact form, and ${count}+ pages wired up — all scaffolded, all yours. <a href="https://lacspace.com/packages" className="text-fg underline underline-offset-4">Explore the packages →</a></p>
          </div>
        </div>
      </section>`;
};

// components/dashboard-shell.tsx — the sidebar chrome shared by dashboard pages.
const dashboardShell = (ctx: Ctx): string => {
  const nav = [{ path: "/", label: "Overview" }, ...pagesFor(ctx).filter((p) => p.nav)];
  return `import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "./theme-toggle";

const NAV = [${linkLiteral(nav)}];

export function DashboardShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r border-hairline p-6 md:block">
        <div className="mb-8 flex items-center justify-between">
          <Link href="/" className="text-lg font-black gradient-text">${ctx.template.siteName}</Link>
          <ThemeToggle />
        </div>
        <nav className="space-y-1 text-sm text-muted">
          {NAV.map((l) => (
            <Link key={l.href} href={l.href} className="block rounded-lg px-3 py-2 transition hover:bg-surface hover:text-fg">{l.label}</Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-6 md:p-10">
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle ? <p className="mt-1 text-muted">{subtitle}</p> : null}
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}
`;
};

// app/page.tsx for the dashboard template — StatCards + an animated area chart.
const dashboardHome = (ctx: Ctx): string => `import { site } from "@/lib/site";
import { DashboardShell } from "@/components/dashboard-shell";
import { StatCard, AreaChart } from "@/components/ui";

export const metadata = site.meta({ title: "Overview", path: "/" });

export default function Home() {
  return (
    <DashboardShell title="Overview" subtitle=${JSON.stringify(ctx.template.siteDescription)}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue" value="$48.2k" delta="+12%" />
        <StatCard label="Orders" value="1,204" delta="+8%" />
        <StatCard label="Customers" value="8,430" delta="+3.4%" />
        <StatCard label="Churn" value="1.2%" delta="-0.3%" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-hairline bg-surface p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Revenue</h2>
            <span className="text-sm font-medium text-emerald-400">+12.4%</span>
          </div>
          <AreaChart data={[12, 18, 15, 22, 20, 28, 26, 34, 30, 38, 42, 48]} />
        </div>
        <div className="rounded-2xl border border-hairline bg-surface p-6">
          <div className="mb-4 font-semibold">Recent activity</div>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between border-b border-hairline pb-3 text-sm">
                <span className="text-muted">Event #{i}</span>
                <span className="text-faint">just now</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
`;

/* ------------------------ real (content-filled) pages ------------------------ */

interface Cta { title: string; subtitle?: string; label?: string; href?: string; }
const ctaBandJsx = (c: Cta): string =>
  `      <CTABand title=${JSON.stringify(c.title)}${c.subtitle ? ` subtitle=${JSON.stringify(c.subtitle)}` : ""}${c.label ? ` ctaLabel=${JSON.stringify(c.label)}` : ""}${c.href ? ` ctaHref=${JSON.stringify(c.href)}` : ""} />`;

// A server page (exports metadata) whose body is raw JSX. Ships the animated
// aurora backdrop, the drop-in UI kit, and an optional closing CTA band.
const pageFile = (o: { title: string; path: string; description: string; body: string; cta?: Cta }): string =>
  `import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";
import { Aurora } from "@/components/aurora";
import { Section, Pill, StatCard, FeatureCard, Testimonial, Steps, CTABand, Bento, AreaChart, Newsletter } from "@/components/ui";

export const metadata: Metadata = site.meta({ title: ${JSON.stringify(o.title)}, path: ${JSON.stringify(o.path)}, description: ${JSON.stringify(o.description)} });

export default function Page() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <Aurora />
${o.body}
${o.cta ? ctaBandJsx(o.cta) : ""}
    </main>
  );
}
`;

const pricingPage = (ctx: Ctx): string => pageFile({
  title: "Pricing", path: "/pricing", description: `Simple, transparent pricing for ${ctx.template.siteName}. Start free and upgrade anytime.`,
  cta: { title: "Still deciding?", subtitle: "Talk to us and we'll help you pick the right plan.", label: "Contact sales", href: "/contact" },
  body: `      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <Pill>Pricing</Pill>
        <h1 className="mt-4 text-4xl font-bold sm:text-5xl">Simple, transparent <span className="gradient-text">pricing</span></h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted">Start free. Upgrade when you're ready. Cancel anytime.</p>
      </section>
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { name: "Starter", price: "$0", period: "/mo", tagline: "For side projects", features: ["1 project", "Community support", "Basic analytics"], cta: "Get started", highlight: false },
            { name: "Pro", price: "$29", period: "/mo", tagline: "For growing teams", features: ["Unlimited projects", "Priority support", "Advanced analytics", "Custom domain"], cta: "Start free trial", highlight: true },
            { name: "Scale", price: "Custom", period: "", tagline: "For organizations", features: ["SSO & SAML", "Dedicated support", "SLA & audit logs", "Guided onboarding"], cta: "Contact sales", highlight: false },
          ].map((tier) => (
            <div key={tier.name} className={"flex flex-col rounded-3xl border p-8 " + (tier.highlight ? "border-transparent bg-surface ring-2 ring-[color:var(--accent-to)]" : "border-hairline bg-surface")}>
              {tier.highlight ? <span className="mb-4 inline-block w-fit rounded-full gradient-bg px-3 py-1 text-xs font-bold text-black">Most popular</span> : null}
              <h2 className="text-lg font-semibold">{tier.name}</h2>
              <p className="mt-1 text-sm text-muted">{tier.tagline}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-black">{tier.price}</span>
                <span className="text-muted">{tier.period}</span>
              </div>
              <ul className="mt-6 flex-1 space-y-3 text-sm">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-muted"><span className="text-[color:var(--accent-to)]">✓</span> {f}</li>
                ))}
              </ul>
              <Link href="/contact" className={"mt-8 rounded-full px-6 py-3 text-center font-semibold transition " + (tier.highlight ? "gradient-bg text-black" : "border border-hairline hover:bg-app")}>{tier.cta}</Link>
            </div>
          ))}
        </div>
        <p className="mt-10 text-center text-sm text-faint">All plans include SSL, unlimited bandwidth and a 14-day money-back guarantee.</p>
      </section>
      <section className="px-6 pb-8">
        <Testimonial quote="We switched in an afternoon and never looked back. Worth every penny." author="Sam Rivera" role="CTO, Globex" />
      </section>`,
});

const servicesPage = (ctx: Ctx): string => pageFile({
  title: "Services", path: "/services", description: `What ${ctx.template.siteName} can do for you — from strategy to launch.`,
  cta: { title: "Have a project in mind?", subtitle: "Tell us what you're building and we'll take it from there.", label: "Start a conversation", href: "/contact" },
  body: `      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <Pill>Services</Pill>
        <h1 className="mt-4 text-4xl font-bold sm:text-5xl">What we <span className="gradient-text">do</span></h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted">End-to-end help — from the first sketch to a product your customers love.</p>
      </section>
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: "🎯", title: "Strategy", desc: "Positioning, roadmaps and the plan to get there." },
            { icon: "🎨", title: "Design", desc: "Brand, UX and interfaces people enjoy using." },
            { icon: "🛠️", title: "Development", desc: "Fast, accessible, maintainable web and mobile apps." },
            { icon: "🚀", title: "Launch", desc: "Ship with confidence — SEO, analytics and monitoring." },
            { icon: "📈", title: "Growth", desc: "Experiments and optimization that move the numbers." },
            { icon: "🤝", title: "Support", desc: "Ongoing care so your product keeps getting better." },
          ].map((s) => (
            <FeatureCard key={s.title} icon={s.icon} title={s.title} desc={s.desc} />
          ))}
        </div>
      </section>
      <section className="px-6 pb-8">
        <Testimonial quote="They shipped faster than we thought possible — and it looked incredible." author="Jordan Ellis" role="Founder, Northwind" />
      </section>`,
});

const featuresPage = (ctx: Ctx): string => pageFile({
  title: "Features", path: "/features", description: `Everything ${ctx.template.siteName} gives your team, in one place.`,
  cta: { title: "Ready to ship faster?", subtitle: "Start free — no credit card required.", label: "See pricing", href: "/pricing" },
  body: `      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <Pill>Features</Pill>
        <h1 className="mt-4 text-4xl font-bold sm:text-5xl">Built to <span className="gradient-text">ship faster</span></h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted">A focused set of features that do the heavy lifting so your team can move.</p>
      </section>
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: "⚡", title: "Fast by default", desc: "Edge-rendered and cached — instant everywhere." },
            { icon: "🔒", title: "Secure", desc: "Hardened headers, auth and audit logs out of the box." },
            { icon: "📊", title: "Analytics", desc: "Understand usage without bolting on a dozen tools." },
            { icon: "🔌", title: "Integrations", desc: "Connect the tools you already use in a click." },
            { icon: "🧩", title: "Extensible", desc: "A clean API and webhooks for anything custom." },
            { icon: "🌗", title: "Delightful UX", desc: "Dark mode, a ⌘K palette and thoughtful details." },
          ].map((f) => (
            <FeatureCard key={f.title} icon={f.icon} title={f.title} desc={f.desc} />
          ))}
        </div>
      </section>
      <section className="mx-auto max-w-5xl px-6 pb-8">
        <h2 className="mb-8 text-center text-2xl font-bold">How it works</h2>
        <Steps items={[
          { title: "Connect", desc: "Sign up and link the tools you already use." },
          { title: "Configure", desc: "Set it up your way in a few clicks — no code required." },
          { title: "Ship", desc: "Go live and watch the numbers in real time." },
        ]} />
      </section>
      <section className="mx-auto max-w-6xl px-6 py-8">
        <h2 className="mb-8 text-center text-2xl font-bold">One platform, everything included</h2>
        <Bento items={[
          { title: "Realtime dashboard", desc: "Everything as it happens, in one view.", icon: "📊", className: "sm:col-span-2 sm:row-span-2" },
          { title: "Webhooks", desc: "Automate anything.", icon: "🔌" },
          { title: "SSO & SAML", desc: "Enterprise-ready.", icon: "🔐" },
          { title: "Audit logs", desc: "Full history.", icon: "🧾" },
          { title: "99.99% uptime", desc: "Rock solid.", icon: "⚡" },
        ]} />
      </section>`,
});

const workPage = (ctx: Ctx): string => pageFile({
  title: "Work", path: "/work", description: `Selected projects by ${ctx.template.siteName}.`,
  cta: { title: "Have something in mind?", subtitle: "I'm currently open to new projects.", label: "Get in touch", href: "/contact" },
  body: `      <section className="mx-auto max-w-3xl px-6 py-24">
        <Pill>Work</Pill>
        <h1 className="mt-4 text-4xl font-bold sm:text-5xl">Selected <span className="gradient-text">work</span></h1>
        <p className="mt-4 text-lg text-muted">A few things I've designed and built recently.</p>
      </section>
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { title: "Aurora", tag: "Product design", year: "2026" },
            { title: "Northwind", tag: "Web app", year: "2025" },
            { title: "Lumen", tag: "Branding", year: "2025" },
            { title: "Harbor", tag: "Mobile app", year: "2024" },
            { title: "Cadence", tag: "Design system", year: "2024" },
            { title: "Meadow", tag: "Marketing site", year: "2023" },
          ].map((p) => (
            <div key={p.title} className="group rounded-2xl border border-hairline bg-surface p-6 transition hover:-translate-y-1">
              <div className="mb-4 aspect-video rounded-xl gradient-bg opacity-80 transition group-hover:opacity-100" />
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{p.title}</h3>
                <span className="text-xs text-faint">{p.year}</span>
              </div>
              <p className="mt-1 text-sm text-muted">{p.tag}</p>
            </div>
          ))}
        </div>
      </section>`,
});

const menuPage = (ctx: Ctx): string => pageFile({
  title: "Menu", path: "/menu", description: `The menu at ${ctx.template.siteName} — seasonal plates and natural wine.`,
  cta: { title: "Hungry?", subtitle: "Book a table — we can't wait to cook for you.", label: "Reserve a table", href: "/reservations" },
  body: `      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <Pill>Menu</Pill>
        <h1 className="mt-4 text-4xl font-bold sm:text-5xl gradient-text">Tonight's menu</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted">Seasonal, ingredient-led and always changing. Here's what we're serving now.</p>
      </section>
      <section className="mx-auto max-w-3xl px-6 pb-24">
        {[
          { section: "Starters", items: [ { n: "Charred leeks, hazelnut", p: "$14" }, { n: "Burrata, heirloom tomato", p: "$16" }, { n: "Wood-fired sourdough", p: "$7" } ] },
          { section: "Mains", items: [ { n: "Handmade tagliatelle", p: "$22" }, { n: "Wood-fired trout", p: "$28" }, { n: "Dry-aged sirloin", p: "$34" } ] },
          { section: "Dessert", items: [ { n: "Olive oil cake", p: "$11" }, { n: "Dark chocolate tart", p: "$12" } ] },
        ].map((group) => (
          <div key={group.section} className="mb-12">
            <h2 className="mb-6 text-2xl font-bold">{group.section}</h2>
            <div className="space-y-4">
              {group.items.map((d) => (
                <div key={d.n} className="flex items-baseline justify-between gap-4 border-b border-hairline pb-3">
                  <span className="font-medium">{d.n}</span>
                  <span className="shrink-0 gradient-text font-bold">{d.p}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>`,
});

const cardGridPage = (o: { ctx: Ctx; title: string; path: string; eyebrow: string; heading: string; lead: string; items: { title: string; desc: string }[]; cta?: Cta }): string => pageFile({
  title: o.title, path: o.path, description: o.lead, cta: o.cta,
  body: `      <section className="mx-auto max-w-3xl px-6 py-24">
        <Pill>${o.eyebrow}</Pill>
        <h1 className="mt-4 text-4xl font-bold sm:text-5xl">${o.heading}</h1>
        <p className="mt-4 text-lg text-muted">${o.lead}</p>
      </section>
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {${JSON.stringify(o.items)}.map((it) => (
            <div key={it.title} className="rounded-2xl border border-hairline bg-surface p-6 transition hover:-translate-y-1 hover:border-[color:var(--accent-to)]">
              <h3 className="font-semibold">{it.title}</h3>
              <p className="mt-2 text-sm text-muted">{it.desc}</p>
            </div>
          ))}
        </div>
      </section>`,
});

const topicsPage = (ctx: Ctx): string => cardGridPage({
  ctx, title: "Topics", path: "/topics", eyebrow: "Topics", heading: "Browse by topic", lead: "Find what you care about — from deep dives to quick notes.",
  cta: { title: "Never miss a post", subtitle: "Subscribe and get new pieces in your inbox.", label: "Join the newsletter", href: "/newsletter" },
  items: [
    { title: "Engineering", desc: "How we build and the decisions behind it." },
    { title: "Design", desc: "Craft, systems and the details that matter." },
    { title: "Product", desc: "What we're shipping and why." },
    { title: "Culture", desc: "How we work and what we believe." },
    { title: "Tutorials", desc: "Step-by-step, hands-on guides." },
    { title: "Announcements", desc: "News and releases." },
  ],
});

const guidesPage = (ctx: Ctx): string => cardGridPage({
  ctx, title: "Guides", path: "/guides", eyebrow: "Guides", heading: "Guides & tutorials", lead: "Task-focused walkthroughs to get you productive fast.",
  cta: { title: "Can't find what you need?", subtitle: "We're happy to help — reach out any time.", label: "Contact us", href: "/contact" },
  items: [
    { title: "Getting started", desc: "Install, configure and run your first build." },
    { title: "Authentication", desc: "Add sign-in, sessions and protected routes." },
    { title: "Deployment", desc: "Ship to production the right way." },
    { title: "Best practices", desc: "Patterns that scale as your app grows." },
    { title: "Migrations", desc: "Upgrade safely between versions." },
    { title: "Troubleshooting", desc: "Fix the most common issues quickly." },
  ],
});

const newsletterPage = (ctx: Ctx): string => pageFile({
  title: "Newsletter", path: "/newsletter", description: `Subscribe to ${ctx.template.siteName} — new posts straight to your inbox.`,
  body: `      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <Pill>Newsletter</Pill>
        <h1 className="mt-4 text-4xl font-bold sm:text-5xl">Join the <span className="gradient-text">list</span></h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted">${ctx.template.siteDescription}</p>
      </section>
      <section className="px-6 pb-24">
        <Newsletter title="Get new posts in your inbox" subtitle="A short email when we publish something new. Unsubscribe anytime." />
      </section>`,
});

// dashboard — a real analytics page with live stats and animated charts.
const analyticsPage = (ctx: Ctx): string => `import type { Metadata } from "next";
import { site } from "@/lib/site";
import { DashboardShell } from "@/components/dashboard-shell";
import { LiveStats } from "@/components/live-stats";
import { StatCard, AreaChart } from "@/components/ui";

export const metadata: Metadata = site.meta({ title: "Analytics", path: "/analytics", description: ${JSON.stringify(`Analytics for ${ctx.template.siteName}.`)} });

export default function Page() {
  return (
    <DashboardShell title="Analytics" subtitle="Traffic, signups and revenue at a glance.">
      <LiveStats />
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-hairline bg-surface p-6">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Traffic</h2><span className="text-sm font-medium text-emerald-400">+18%</span></div>
          <AreaChart gradientId="g-traffic" data={[8, 12, 10, 16, 14, 20, 22, 19, 26, 30, 28, 34]} />
        </div>
        <div className="rounded-2xl border border-hairline bg-surface p-6">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Signups</h2><span className="text-sm font-medium text-emerald-400">+9%</span></div>
          <AreaChart gradientId="g-signups" data={[3, 5, 4, 7, 9, 8, 11, 13, 12, 15, 18, 21]} />
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Sessions" value="48.2k" delta="+12%" />
        <StatCard label="Avg. time" value="3m 14s" delta="+4%" />
        <StatCard label="Bounce rate" value="38%" delta="-2%" />
        <StatCard label="Conversion" value="3.4%" delta="+0.6%" />
      </div>
    </DashboardShell>
  );
}
`;

// ecommerce — shop (server) renders the client product grid.
const shopPage = (ctx: Ctx): string => `import type { Metadata } from "next";
import { site } from "@/lib/site";
import { ProductGrid } from "@/components/product-grid";

export const metadata: Metadata = site.meta({ title: "Shop", path: "/shop", description: ${JSON.stringify(`Shop everything at ${ctx.template.siteName}.`)} });

export default function Page() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-24">
      <p className="text-sm font-semibold uppercase tracking-widest text-faint">Shop</p>
      <h1 className="mt-3 text-4xl font-bold">Everything in the <span className="gradient-text">store</span></h1>
      <p className="mt-4 max-w-xl text-muted">Add items to your bag — it's saved locally with @lacspace/store, so it survives a refresh.</p>
      <div className="mt-12"><ProductGrid /></div>
    </main>
  );
}
`;

const cartPage = (): string => `import type { Metadata } from "next";
import { site } from "@/lib/site";
import { CartView } from "@/components/cart-view";

export const metadata: Metadata = site.meta({ title: "Your bag", path: "/cart", description: "Review the items in your bag." });

export default function Page() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-24">
      <h1 className="text-4xl font-bold">Your <span className="gradient-text">bag</span></h1>
      <div className="mt-12"><CartView /></div>
    </main>
  );
}
`;

const productGrid = (): string => `"use client";

import { useCart } from "@/lib/store";

const PRODUCTS = [
  { id: "p1", name: "Aurora Mug", price: 18, emoji: "☕" },
  { id: "p2", name: "Field Notebook", price: 12, emoji: "📓" },
  { id: "p3", name: "Canvas Tote", price: 24, emoji: "👜" },
  { id: "p4", name: "Enamel Pin", price: 8, emoji: "📌" },
  { id: "p5", name: "Cotton Tee", price: 28, emoji: "👕" },
  { id: "p6", name: "Sticker Pack", price: 6, emoji: "✨" },
  { id: "p7", name: "Ceramic Vase", price: 42, emoji: "🏺" },
  { id: "p8", name: "Linen Apron", price: 34, emoji: "🧵" },
];

export function ProductGrid() {
  const add = useCart((s) => s.add);
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {PRODUCTS.map((p) => (
        <div key={p.id} className="flex flex-col rounded-2xl border border-hairline bg-surface p-5">
          <div className="mb-4 flex aspect-square items-center justify-center rounded-xl gradient-bg text-5xl">{p.emoji}</div>
          <h3 className="font-semibold">{p.name}</h3>
          <div className="mt-1 text-muted">{"$" + p.price.toFixed(2)}</div>
          <button type="button" onClick={() => add({ id: p.id, name: p.name, price: p.price })} className="mt-4 rounded-full gradient-bg px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90">Add to bag</button>
        </div>
      ))}
    </div>
  );
}
`;

const cartView = (): string => `"use client";

import Link from "next/link";
import { useCart } from "@/lib/store";
import { useIsMounted } from "@lacspace/hooks";

export function CartView() {
  const items = useCart((s) => s.items);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);
  const mounted = useIsMounted();

  if (!mounted()) return <div className="py-16 text-center text-muted">Loading your bag…</div>;

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-lg text-muted">Your bag is empty.</p>
        <Link href="/shop" className="mt-6 inline-block rounded-full gradient-bg px-6 py-3 font-semibold text-black">Browse the shop</Link>
      </div>
    );
  }

  const total = items.reduce((sum, i) => sum + i.price, 0);

  return (
    <div className="mx-auto max-w-2xl">
      <ul className="divide-y divide-hairline">
        {items.map((i, idx) => (
          <li key={i.id + "-" + idx} className="flex items-center justify-between py-4">
            <span className="font-medium">{i.name}</span>
            <span className="flex items-center gap-4">
              <span className="tabular-nums text-muted">{"$" + i.price.toFixed(2)}</span>
              <button type="button" onClick={() => remove(i.id)} aria-label="Remove" className="text-faint transition hover:text-fg">✕</button>
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex items-center justify-between border-t border-hairline pt-6">
        <button type="button" onClick={clear} className="text-sm text-muted transition hover:text-fg">Clear bag</button>
        <span className="text-lg font-bold">Total {"$" + total.toFixed(2)}</span>
      </div>
      <button type="button" className="mt-8 w-full rounded-full gradient-bg px-6 py-3 font-semibold text-black">Checkout</button>
    </div>
  );
}
`;

// dashboard — settings (server) renders the client settings panel in the shell.
const settingsPage = (ctx: Ctx): string => `import type { Metadata } from "next";
import { site } from "@/lib/site";
import { DashboardShell } from "@/components/dashboard-shell";
import { SettingsPanel } from "@/components/settings-panel";

export const metadata: Metadata = site.meta({ title: "Settings", path: "/settings", description: ${JSON.stringify(`Manage your ${ctx.template.siteName} preferences.`)} });

export default function Page() {
  return (
    <DashboardShell title="Settings" subtitle="Manage your preferences.">
      <SettingsPanel />
    </DashboardShell>
  );
}
`;

const settingsPanel = (): string => `"use client";

import { useLocalStorage } from "@lacspace/hooks";
import { useTheme } from "@lacspace/theme";

export function SettingsPanel() {
  // Persisted to the browser with @lacspace/hooks.
  const [emailNotifs, setEmailNotifs] = useLocalStorage("settings:emailNotifs", true);
  const [weekly, setWeekly] = useLocalStorage("settings:weeklyDigest", false);
  const { theme, setTheme } = useTheme();

  const toggle = (on: boolean) =>
    "relative h-6 w-11 rounded-full transition " + (on ? "gradient-bg" : "bg-panel");
  const knob = (on: boolean) =>
    "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all " + (on ? "left-[1.375rem]" : "left-0.5");

  return (
    <div className="max-w-xl space-y-8">
      <section className="rounded-2xl border border-hairline bg-surface p-6">
        <h2 className="font-semibold">Notifications</h2>
        <p className="mt-1 text-sm text-muted">Saved to your browser with @lacspace/hooks (useLocalStorage).</p>
        <div className="mt-5 space-y-4">
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm">Email notifications</span>
            <button type="button" role="switch" aria-checked={emailNotifs} onClick={() => setEmailNotifs((v) => !v)} className={toggle(emailNotifs)}>
              <span className={knob(emailNotifs)} />
            </button>
          </label>
          <label className="flex items-center justify-between gap-4">
            <span className="text-sm">Weekly digest</span>
            <button type="button" role="switch" aria-checked={weekly} onClick={() => setWeekly((v) => !v)} className={toggle(weekly)}>
              <span className={knob(weekly)} />
            </button>
          </label>
        </div>
      </section>
      <section className="rounded-2xl border border-hairline bg-surface p-6">
        <h2 className="font-semibold">Appearance</h2>
        <p className="mt-1 text-sm text-muted">Theme via @lacspace/theme.</p>
        <div className="mt-4 inline-flex rounded-full border border-hairline p-1">
          {["light", "dark", "system"].map((t) => (
            <button key={t} type="button" onClick={() => setTheme(t)} className={"rounded-full px-4 py-1.5 text-sm capitalize transition " + (theme === t ? "gradient-bg font-semibold text-black" : "text-muted hover:text-fg")}>{t}</button>
          ))}
        </div>
      </section>
    </div>
  );
}
`;

// A small, dependency-free, theme-aware UI kit that ships in every app so users
// can drop <Section>, <FeatureCard>, <CTABand> etc. anywhere. Server components.
const uiKitFiles = (): Record<string, string> => ({
  "components/ui/section.tsx": `import type { ReactNode } from "react";

export function Section({ eyebrow, title, lead, children, className = "" }: { eyebrow?: string; title?: string; lead?: string; children?: ReactNode; className?: string }) {
  return (
    <section className={"mx-auto max-w-6xl px-6 py-16 " + className}>
      {eyebrow ? <p className="text-sm font-semibold uppercase tracking-widest text-faint">{eyebrow}</p> : null}
      {title ? <h2 className="mt-3 text-3xl font-bold sm:text-4xl">{title}</h2> : null}
      {lead ? <p className="mt-4 max-w-2xl text-lg text-muted">{lead}</p> : null}
      {children ? <div className="mt-10">{children}</div> : null}
    </section>
  );
}
`,
  "components/ui/pill.tsx": `import type { ReactNode } from "react";

export function Pill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={"inline-flex items-center gap-1 rounded-full border border-hairline bg-surface px-3 py-1 text-xs font-semibold uppercase tracking-widest text-muted " + className}>{children}</span>;
}
`,
  "components/ui/stat-card.tsx": `export function StatCard({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface p-6 transition hover:-translate-y-1">
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      <div className="mt-1 text-sm text-muted">{label}</div>
      {delta ? <div className="mt-2 text-xs font-medium text-emerald-400">{delta}</div> : null}
    </div>
  );
}
`,
  "components/ui/feature-card.tsx": `import type { ReactNode } from "react";

export function FeatureCard({ icon, title, desc }: { icon?: ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface p-6 transition hover:-translate-y-1 hover:border-[color:var(--accent-to)]">
      {icon ? <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl gradient-bg text-2xl">{icon}</div> : null}
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">{desc}</p>
    </div>
  );
}
`,
  "components/ui/testimonial.tsx": `export function Testimonial({ quote, author, role }: { quote: string; author: string; role?: string }) {
  return (
    <figure className="mx-auto max-w-2xl rounded-3xl border border-hairline bg-surface p-8 text-center">
      <div className="text-4xl leading-none gradient-text">&ldquo;</div>
      <blockquote className="mt-2 text-lg font-medium leading-relaxed">{quote}</blockquote>
      <figcaption className="mt-4 text-sm text-muted">— {author}{role ? ", " + role : ""}</figcaption>
    </figure>
  );
}
`,
  "components/ui/steps.tsx": `export function Steps({ items }: { items: { title: string; desc: string }[] }) {
  return (
    <ol className="grid gap-6 sm:grid-cols-3">
      {items.map((s, i) => (
        <li key={s.title} className="rounded-2xl border border-hairline bg-surface p-6">
          <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full gradient-bg text-sm font-bold text-black">{i + 1}</div>
          <h3 className="font-semibold">{s.title}</h3>
          <p className="mt-1 text-sm text-muted">{s.desc}</p>
        </li>
      ))}
    </ol>
  );
}
`,
  "components/ui/cta-band.tsx": `import Link from "next/link";

export function CTABand({ title, subtitle, ctaLabel = "Get started", ctaHref = "/contact" }: { title: string; subtitle?: string; ctaLabel?: string; ctaHref?: string }) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="relative overflow-hidden rounded-3xl border border-hairline bg-surface p-10 text-center sm:p-16">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full gradient-bg opacity-40 blur-3xl animate-floaty" />
        <div aria-hidden className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full gradient-bg opacity-30 blur-3xl animate-floaty-slow" />
        <h2 className="relative text-3xl font-bold sm:text-4xl">{title}</h2>
        {subtitle ? <p className="relative mx-auto mt-3 max-w-xl text-muted">{subtitle}</p> : null}
        <Link href={ctaHref} className="relative mt-8 inline-block rounded-full gradient-bg px-8 py-3 font-semibold text-black transition hover:opacity-90">{ctaLabel}</Link>
      </div>
    </section>
  );
}
`,
  "components/ui/bento.tsx": `import type { ReactNode } from "react";

interface BentoItem { title: string; desc?: string; icon?: ReactNode; className?: string; }

/** A modern, asymmetric "bento" grid. Pass className like "sm:col-span-2" to span. */
export function Bento({ items }: { items: BentoItem[] }) {
  return (
    <div className="grid auto-rows-[minmax(150px,auto)] grid-cols-2 gap-4 sm:grid-cols-3">
      {items.map((it) => (
        <div key={it.title} className={"relative overflow-hidden rounded-3xl border border-hairline bg-surface p-6 transition hover:-translate-y-1 " + (it.className ?? "")}>
          <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full gradient-bg opacity-20 blur-2xl" />
          {it.icon ? <div className="mb-3 text-2xl">{it.icon}</div> : null}
          <h3 className="relative font-semibold">{it.title}</h3>
          {it.desc ? <p className="relative mt-1 text-sm text-muted">{it.desc}</p> : null}
        </div>
      ))}
    </div>
  );
}
`,
  "components/ui/area-chart.tsx": `/** A dependency-free, theme-aware area chart with an animated draw. */
export function AreaChart({ data, height = 160, gradientId = "lac-area", className = "" }: { data: number[]; height?: number; gradientId?: string; className?: string }) {
  const w = 600;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((d, i) => [i * step, height - ((d - min) / range) * (height - 24) - 12] as const);
  const line = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = line + " L" + w + " " + height + " L0 " + height + " Z";
  return (
    <svg viewBox={"0 0 " + w + " " + height} preserveAspectRatio="none" className={"w-full " + className} style={{ height }} role="img" aria-label="Chart">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent-to)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent-to)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={"url(#" + gradientId + ")"} />
      <path d={line} fill="none" stroke="var(--accent-to)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="animate-draw" />
    </svg>
  );
}
`,
  "components/ui/newsletter.tsx": `"use client";

import { useActionState } from "react";
import { honeypotProps, timestampValue } from "@lacspace/form";
import { submitNewsletter, type SubscribeState } from "@/app/actions";

/** An email capture block — validated & spam-protected via @lacspace/form. */
export function Newsletter({ title = "Stay in the loop", subtitle = "Occasional updates. No spam — unsubscribe anytime." }: { title?: string; subtitle?: string }) {
  const [state, action, pending] = useActionState<SubscribeState, FormData>(submitNewsletter, null);
  const err = state && !state.ok ? (state.errors.email ?? state.errors._form) : undefined;

  return (
    <div className="mx-auto max-w-xl rounded-3xl border border-hairline bg-surface p-8 text-center">
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="mt-2 text-sm text-muted">{subtitle}</p>
      {state?.ok ? (
        <p className="mt-6 rounded-xl border border-hairline bg-app p-4 text-sm">You&rsquo;re subscribed — thanks! ✅</p>
      ) : (
        <form action={action} className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input name="email" type="email" placeholder="you@example.com" aria-label="Email" className="w-full flex-1 rounded-full border border-hairline bg-app px-5 py-3 outline-none focus:border-[color:var(--accent-to)]" />
          <input {...honeypotProps("website")} />
          <input type="hidden" name="_ts" defaultValue={timestampValue()} />
          <button disabled={pending} className="rounded-full gradient-bg px-6 py-3 font-semibold text-black transition hover:opacity-90 disabled:opacity-60">{pending ? "Joining…" : "Subscribe"}</button>
        </form>
      )}
      {err ? <p className="mt-3 text-sm text-red-400">{err}</p> : null}
    </div>
  );
}
`,
  "components/ui/index.ts": `export * from "./section";
export * from "./pill";
export * from "./stat-card";
export * from "./feature-card";
export * from "./testimonial";
export * from "./steps";
export * from "./cta-band";
export * from "./bento";
export * from "./area-chart";
export * from "./newsletter";
`,
});

/** Real, content-filled pages that replace the highest-value stub per template. */
function realPageFiles(ctx: Ctx): Record<string, string> {
  const k = ctx.template.key;
  const f: Record<string, string> = {};
  if (k === "personal") f["app/work/page.tsx"] = workPage(ctx);
  if (k === "business") { f["app/services/page.tsx"] = servicesPage(ctx); f["app/pricing/page.tsx"] = pricingPage(ctx); }
  if (k === "saas") { f["app/features/page.tsx"] = featuresPage(ctx); f["app/pricing/page.tsx"] = pricingPage(ctx); }
  if (k === "ecommerce") {
    f["app/shop/page.tsx"] = shopPage(ctx);
    f["app/cart/page.tsx"] = cartPage();
    f["components/product-grid.tsx"] = productGrid();
    f["components/cart-view.tsx"] = cartView();
  }
  if (k === "blog") { f["app/topics/page.tsx"] = topicsPage(ctx); f["app/newsletter/page.tsx"] = newsletterPage(ctx); }
  if (k === "docs") f["app/guides/page.tsx"] = guidesPage(ctx);
  if (k === "restaurant") f["app/menu/page.tsx"] = menuPage(ctx);
  if (k === "dashboard") {
    f["app/settings/page.tsx"] = settingsPage(ctx);
    f["components/settings-panel.tsx"] = settingsPanel();
    f["app/analytics/page.tsx"] = analyticsPage(ctx);
  }
  return f;
}

/* ----------------------- creative sections & illustrations ----------------------- */

interface CreativeData {
  emoji: string;
  chips: [string, string, string];
  showcaseTitle: string;
  showcaseLead: string;
  bullets: string[];
  marqueeLabel: string;
  marquee: string[];
  faq: { q: string; a: string }[];
}

/** Pre-written, template-tailored copy for the auto-generated home sections. */
function creativeData(ctx: Ctx): CreativeData {
  const n = ctx.template.siteName;
  const map: Record<string, CreativeData> = {
    personal: {
      emoji: "👋", chips: ["Design", "Code", "Ship"],
      showcaseTitle: "Design & build, end to end",
      showcaseLead: `${n} turns ideas into polished products — from the first sketch to the last pixel.`,
      bullets: ["10+ years shipping web & mobile", "Design systems that scale", "Obsessed with the details"],
      marqueeLabel: "Worked with", marquee: ["Aurora", "Northwind", "Lumen", "Harbor", "Cadence", "Meadow"],
      faq: [
        { q: "Are you available for freelance?", a: "Yes — I take on a couple of projects each quarter. Reach out via the contact page." },
        { q: "What do you work with?", a: "React, Next.js and TypeScript, with a lot of care for UX and performance." },
        { q: "Do you do both design and development?", a: "Both — I can take a project from concept all the way to production." },
      ],
    },
    business: {
      emoji: "🏢", chips: ["Strategy", "Design", "Launch"],
      showcaseTitle: "Everything you need to grow",
      showcaseLead: `${n} partners with you from strategy to launch — one senior team, accountable for outcomes.`,
      bullets: ["Senior team, no hand-offs", "Fixed timelines & clear pricing", "We sweat the details"],
      marqueeLabel: "Trusted by teams at", marquee: ["Northwind", "Globex", "Initech", "Umbrella", "Soylent", "Hooli"],
      faq: [
        { q: "How do engagements work?", a: "We scope a clear plan, agree a fixed timeline, and ship in weekly increments." },
        { q: "What does it cost?", a: "See our pricing page for plans, or contact us for a custom quote." },
        { q: "How soon can we start?", a: "Usually within two weeks. Get in touch to check availability." },
      ],
    },
    ecommerce: {
      emoji: "🛍️", chips: ["Shop", "Bag", "Checkout"],
      showcaseTitle: "Thoughtfully made, delivered fast",
      showcaseLead: `${n} curates beautiful things and ships them worldwide — with easy returns, always.`,
      bullets: ["Free worldwide shipping", "30-day easy returns", "Sustainably sourced"],
      marqueeLabel: "Why shop with us", marquee: ["Free shipping", "Easy returns", "Secure checkout", "Ethically made", "Gift wrapping", "Loved by 10k+"],
      faq: [
        { q: "How long is shipping?", a: "Most orders arrive in 3–5 business days with free worldwide shipping." },
        { q: "What's your return policy?", a: "30 days, no questions asked — see the returns page for details." },
        { q: "Is checkout secure?", a: "Yes — payments are encrypted and we never store your card details." },
      ],
    },
    saas: {
      emoji: "⚡", chips: ["Analytics", "Billing", "API"],
      showcaseTitle: "The platform your team will love",
      showcaseLead: `${n} brings analytics, billing and automation into one fast, secure place.`,
      bullets: ["Set up in minutes", "SOC 2-ready security", "Scales with you"],
      marqueeLabel: "Powering teams at", marquee: ["Globex", "Initech", "Hooli", "Pied Piper", "Umbrella", "Stark"],
      faq: [
        { q: "Is there a free plan?", a: "Yes — start free and upgrade when you're ready. See the pricing page." },
        { q: "How is my data secured?", a: "Encryption in transit and at rest, audit logs, and SSO on higher plans." },
        { q: "Can I self-host?", a: "Contact sales — we offer flexible deployment options." },
      ],
    },
    blog: {
      emoji: "✍️", chips: ["Essays", "Notes", "Stories"],
      showcaseTitle: "Words worth your time",
      showcaseLead: `${n} publishes essays and notes on building things that matter — no fluff.`,
      bullets: ["New pieces most weeks", "No clickbait, ever", "Written by practitioners"],
      marqueeLabel: "Topics we cover", marquee: ["Engineering", "Design", "Product", "Culture", "Tutorials", "Announcements"],
      faq: [
        { q: "How often do you publish?", a: "A new piece most weeks — subscribe so you never miss one." },
        { q: "Can I contribute?", a: "We love guest posts. Pitch us via the contact page." },
        { q: "Is there a newsletter?", a: "Yes — head to the newsletter page to join." },
      ],
    },
    docs: {
      emoji: "📚", chips: ["Guides", "API", "Examples"],
      showcaseTitle: "Everything you need to build",
      showcaseLead: `${n} gives you guides, API references and copy-paste examples — all in one place.`,
      bullets: ["Quickstart in 5 minutes", "Searchable & versioned", "Real, runnable examples"],
      marqueeLabel: "What you'll find", marquee: ["Quickstart", "Guides", "API reference", "Examples", "Migrations", "Troubleshooting"],
      faq: [
        { q: "Where do I start?", a: "Head to the guides for a 5-minute quickstart." },
        { q: "Is there an API reference?", a: "Yes — the API page has the full reference." },
        { q: "How do I report a docs issue?", a: "Use the contact page — we fix docs fast." },
      ],
    },
    restaurant: {
      emoji: "🍷", chips: ["Menu", "Wine", "Reserve"],
      showcaseTitle: "Seasonal plates, natural wine",
      showcaseLead: `${n} serves ingredient-led plates and natural wine in a warm, low-lit room.`,
      bullets: ["Menu changes with the seasons", "Natural, low-intervention wine", "Walk-ins welcome"],
      marqueeLabel: "On the pass", marquee: ["Wood-fired", "Local produce", "Natural wine", "House-made pasta", "Seasonal", "Fresh sourdough"],
      faq: [
        { q: "Do you take reservations?", a: "Yes — book via the reservations page. Walk-ins are welcome too." },
        { q: "Any dietary options?", a: "Plenty — vegetarian and vegan plates change weekly. Just ask about allergies." },
        { q: "When are you open?", a: "Wednesday to Sunday, 5pm till late." },
      ],
    },
  };
  return map[ctx.template.key] ?? map.business!;
}

// components/aurora.tsx — an animated, theme-aware gradient backdrop for the hero.
const aurora = (): string => `export function Aurora() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px] overflow-hidden">
      <div className="absolute -left-20 -top-16 h-96 w-96 rounded-full opacity-30 blur-3xl animate-floaty" style={{ background: "radial-gradient(circle, var(--accent-from), transparent 70%)" }} />
      <div className="absolute -right-10 top-40 h-80 w-80 rounded-full opacity-25 blur-3xl animate-floaty-slow" style={{ background: "radial-gradient(circle, var(--accent-to), transparent 70%)" }} />
      <div className="absolute left-1/3 top-72 h-72 w-72 rounded-full opacity-20 blur-3xl animate-floaty" style={{ background: "radial-gradient(circle, var(--accent-to), transparent 70%)" }} />
    </div>
  );
}
`;

// components/hero-art.tsx — a bespoke, animated illustration personalised with
// the platform's initials and template-specific labels.
const heroArt = (ctx: Ctx): string => {
  const d = creativeData(ctx);
  const initials = ctx.template.siteName.trim().split(/\s+/).slice(0, 2).map((w) => (w[0] ?? "").toUpperCase()).join("") || "A";
  return `export function HeroArt() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-sm select-none">
      {/* orbiting rings */}
      <div className="absolute inset-0 rounded-full border border-hairline animate-spin-slow" />
      <div className="absolute inset-10 rounded-full border border-hairline animate-spin-slow" style={{ animationDirection: "reverse" }} />
      <div className="absolute inset-0 rounded-full opacity-40 blur-2xl gradient-bg" />
      {/* center badge with the platform initials */}
      <div className="absolute left-1/2 top-1/2 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-3xl gradient-bg text-4xl font-black text-black shadow-2xl animate-floaty">
        ${JSON.stringify(initials)}
      </div>
      {/* floating labels */}
      <div className="absolute left-0 top-10 flex items-center gap-2 rounded-xl border border-hairline bg-app px-3 py-2 text-xs font-medium shadow-lg animate-floaty">
        <span>${d.emoji}</span> ${JSON.stringify(d.chips[0])}
      </div>
      <div className="absolute right-0 top-28 rounded-xl border border-hairline bg-app px-3 py-2 text-xs font-medium shadow-lg animate-floaty-slow">
        ${JSON.stringify(d.chips[1])}
      </div>
      <div className="absolute bottom-8 left-6 rounded-xl border border-hairline bg-app px-3 py-2 text-xs font-medium shadow-lg animate-floaty" style={{ animationDelay: "1.2s" }}>
        ${JSON.stringify(d.chips[2])}
      </div>
    </div>
  );
}
`;
};

// A showcase band: pre-written copy + the animated illustration.
const showcaseSection = (ctx: Ctx): string => {
  const d = creativeData(ctx);
  const bullets = d.bullets.map((b) => `<li className="flex items-center gap-2 text-muted"><span className="text-[color:var(--accent-to)]">✓</span> ${b}</li>`).join("\n            ");
  return `<section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 md:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-faint">${ctx.template.siteName}</p>
          <h2 className="mt-3 text-3xl font-bold sm:text-4xl">${d.showcaseTitle}</h2>
          <p className="mt-4 max-w-md text-lg text-muted">${d.showcaseLead}</p>
          <ul className="mt-6 space-y-3 text-sm">
            ${bullets}
          </ul>
        </div>
        <HeroArt />
      </section>`;
};

// An auto-scrolling marquee band (pure CSS, duplicated track for a seamless loop).
const marqueeSection = (ctx: Ctx): string => {
  const d = creativeData(ctx);
  const chip = (t: string) => `<span className="rounded-full border border-hairline bg-surface px-5 py-2 text-sm font-medium text-muted">${t}</span>`;
  const track = d.marquee.map(chip).join("\n            ");
  return `<section className="border-y border-hairline py-10">
        <p className="mb-6 text-center text-xs font-semibold uppercase tracking-widest text-faint">${d.marqueeLabel}</p>
        <div className="marquee-mask overflow-hidden">
          <div className="marquee-track gap-4">
            ${track}
            ${track}
          </div>
        </div>
      </section>`;
};

// A pre-written FAQ accordion (native <details>, no JS needed).
const faqSection = (ctx: Ctx): string => {
  const d = creativeData(ctx);
  const items = d.faq.map((f) => `<details className="group rounded-2xl border border-hairline bg-surface p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
              ${f.q}
              <span className="text-muted transition group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted">${f.a}</p>
          </details>`).join("\n          ");
  return `<section className="mx-auto max-w-3xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold">Frequently asked</h2>
        <div className="mt-10 space-y-3">
          ${items}
        </div>
      </section>`;
};

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
