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
    "@lacspace/seo": "^1.5.0",
    "@lacspace/headers": "^1.1.1",
    "@lacspace/robots": "^1.2.0",
    "@lacspace/sitemap": "^1.1.0",
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
}

html { scroll-behavior: smooth; }
body { background: #0a0a0f; color: #e5e7eb; -webkit-font-smoothing: antialiased; }

.gradient-text {
  background: linear-gradient(120deg, var(--accent-from), var(--accent-to));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.gradient-bg { background: linear-gradient(120deg, var(--accent-from), var(--accent-to)); }
`;

const siteTs = (ctx: Ctx): string => `import { defineSite } from "@lacspace/seo";

/** Your site's SEO configuration — set once, used everywhere. */
export const site = defineSite({
  name: ${JSON.stringify(ctx.template.siteName)},
  url: "https://example.com",
  description: ${JSON.stringify(ctx.template.siteDescription)},
  // twitter: "yourhandle",
  // ogImage: "/og",
});
`;

const layout = (ctx: Ctx): string => `import type { Metadata } from "next";
import { site } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = site.meta({ title: ${JSON.stringify(ctx.template.siteName)} });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
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
  const shell = (inner: string): string => `export default function Home() {
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

/* ------------------------------ file plan ------------------------------ */

function buildFiles(ctx: Ctx): Record<string, string> {
  return {
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
    "app/robots.txt/route.ts": robotsTs(),
    "app/sitemap.xml/route.ts": sitemapTs(),
  };
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
