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
import { pathToFileURL } from "node:url";

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m",
};
const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;

/* ------------------------------ templates ------------------------------ */

export interface TemplateDef {
  key: string;
  label: string;
  description: string;
  /** Tailwind gradient accent (from → to). */
  accent: [string, string];
  siteName: string;
  siteDescription: string;
}

export const TEMPLATES: TemplateDef[] = [
  { key: "personal", label: "Personal portfolio", description: "A sleek personal / developer portfolio with projects and contact.", accent: ["#6366f1", "#a855f7"], siteName: "LSFolio", siteDescription: "Developer, designer & maker. Selected work and writing." },
  { key: "business", label: "Business site", description: "A professional company / agency site with services and a CTA.", accent: ["#2563eb", "#06b6d4"], siteName: "LSStudio", siteDescription: "We design and build digital products that grow businesses." },
  { key: "ecommerce", label: "E-commerce storefront", description: "A modern product storefront home with a featured grid.", accent: ["#0d9488", "#84cc16"], siteName: "LSStore", siteDescription: "Beautiful things, thoughtfully made. Free shipping worldwide." },
  { key: "saas", label: "SaaS landing", description: "A high-converting SaaS landing page with features and pricing.", accent: ["#7c3aed", "#ec4899"], siteName: "LSCloud", siteDescription: "The all-in-one platform your team will love. Ship faster." },
  { key: "blog", label: "Blog / magazine", description: "A clean editorial blog home with a featured post and a grid.", accent: ["#f97316", "#ef4444"], siteName: "LSBlogs", siteDescription: "Essays, notes and stories on building things that matter." },
  { key: "docs", label: "Documentation", description: "A docs landing with quick-start and feature cards.", accent: ["#0ea5e9", "#6366f1"], siteName: "LSDocs", siteDescription: "Everything you need to build with LSDocs — guides, API and examples." },
  { key: "dashboard", label: "Admin dashboard", description: "An app dashboard shell with stat cards and a table.", accent: ["#10b981", "#14b8a6"], siteName: "LSAdmin", siteDescription: "Your control center — metrics, activity and management in one place." },
  { key: "restaurant", label: "Restaurant / cafe", description: "A warm restaurant home with menu highlights and reservations.", accent: ["#e11d48", "#f59e0b"], siteName: "LSResto", siteDescription: "Seasonal plates, natural wine and a warm room. Book a table." },
  { key: "marketplace", label: "Marketplace / commerce", description: "A real storefront wired to the Lacspace commerce packages — cart, checkout, tax, shipping, orders, invoices and Nepal payments.", accent: ["#0d9488", "#6366f1"], siteName: "LSBazaar", siteDescription: "A modern storefront — cart to checkout, wired end to end." },
];

/* ------------------------------ shared files ------------------------------ */

/**
 * A composable, optional feature add-on (see {@link FEATURES}).
 *
 * A feature is a small, self-contained bundle you can layer onto **any**
 * template: extra files (namespaced under its own routes), npm dependencies,
 * `package.json` scripts, `.env.example` entries and onboarding next-steps.
 * Features are order-independent and never collide with the base scaffold.
 */
export interface FeatureDef {
  /** Stable key (used by `--with <key>` and `add <key>`). */
  key: string;
  /** Short human label. */
  label: string;
  /** One-line description (shown in the interactive picker & `--help`). */
  description: string;
  /** npm dependencies this feature adds, merged into `package.json`. */
  deps: Record<string, string>;
  /** The files this feature drops in, given the resolved {@link Ctx}. */
  files: (ctx: Ctx) => Record<string, string>;
  /** Optional `.env.example` entries — `NAME: "explanatory comment"`. */
  env?: Record<string, string>;
  /** Optional `package.json` scripts, merged in. */
  scripts?: Record<string, string>;
  /** Onboarding steps appended to the terminal output and `LEARN.md`. */
  nextSteps: string[];
  /** Optional "learn more" URL for `LEARN.md`. */
  learn?: string;
}

export interface Ctx { name: string; template: TemplateDef; features: FeatureDef[]; mode: "static" | "dynamic"; }

/** Options accepted by the programmatic API (see `./lib`). */
export interface GenerateOptions {
  /** Project name — becomes the folder name and the default site name slug. Default `"my-app"`. */
  name?: string;
  /** Template key: one of {@link TEMPLATES} (`personal`, `business`, `ecommerce`, `saas`, `blog`, `docs`, `dashboard`, `restaurant`, `marketplace`). Default `"personal"`. */
  template?: string;
  /** Accent theme: a preset name, a `#hex`, or a `from,to` pair. Falls back to the template's default accent. */
  theme?: string;
  /**
   * Optional composable feature add-ons (see {@link FEATURES}) — e.g.
   * `["ai-chat", "rag"]`. Unknown keys are ignored; duplicates are de-duped.
   * Purely additive: an empty (or omitted) list generates today's scaffold
   * byte-for-byte.
   */
  features?: string[];
  /**
   * Project shape.
   *
   * - `"static"` (default) — today's single Next.js app, generated **byte-for-byte
   *   unchanged**. The frontend and the whole existing flow.
   * - `"dynamic"` — a full-stack **monorepo** (npm workspaces): a `frontend/`
   *   Next.js app + a `backend/` Node · Express · MongoDB · Redis · TypeScript API
   *   (working JWT auth + an example CRUD resource, built on `@lacspace/*`) + a
   *   shared `types/` package the frontend and backend both import, plus a root
   *   `docker-compose.yml` (Mongo + Redis) and one-command `npm run dev`.
   *
   * Additive: omit it (or pass `"static"`) and nothing about the existing output
   * changes.
   */
  mode?: "static" | "dynamic";
}

/**
 * Resolve raw {@link GenerateOptions} into a concrete {@link Ctx} — normalising
 * the project name, picking the template (falling back to the first), applying
 * a custom accent when a valid `theme` is given, and normalising the requested
 * feature add-ons (de-duped, unknown keys dropped). Pure; no I/O.
 */
export function resolveContext(options: GenerateOptions = {}): Ctx {
  const base = TEMPLATES.find((t) => t.key === options.template) ?? TEMPLATES[0]!;
  const accent = resolveAccent(options.theme);
  const template: TemplateDef = accent ? { ...base, accent } : base;
  const raw = options.name ?? "my-app";
  const seg = raw.split(/[\\/]/).filter(Boolean).pop() ?? "my-app";
  const name = seg.toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/^-+|-+$/g, "") || "my-app";
  const features = normalizeFeatures(options.features);
  const mode: Ctx["mode"] = options.mode === "dynamic" ? "dynamic" : "static";
  return { name, template, features, mode };
}

/**
 * Turn a raw list of requested feature keys into de-duped {@link FeatureDef}s,
 * dropping (and warning about) any unknown keys. Order-preserving; pure apart
 * from an optional `console.warn` for unknowns.
 */
export function normalizeFeatures(requested?: string[]): FeatureDef[] {
  if (!requested || requested.length === 0) return [];
  const seen = new Set<string>();
  const out: FeatureDef[] = [];
  const unknown: string[] = [];
  for (const raw of requested) {
    const key = String(raw).toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const def = FEATURES.find((f) => f.key === key);
    if (def) out.push(def);
    else unknown.push(key);
  }
  if (unknown.length) console.warn(`create-lacspace-app: ignoring unknown feature(s): ${unknown.join(", ")}`);
  return out;
}

const pkgJson = (ctx: Ctx): string => JSON.stringify({
  name: ctx.name,
  version: "0.1.0",
  private: true,
  scripts: { dev: "next dev", build: "next build", start: "next start", lint: "next lint" },
  dependencies: {
    next: "^15.1.0",
    react: "^19.0.0",
    "react-dom": "^19.0.0",
    "@lacspace/seo": "^1.7.0",
    "@lacspace/headers": "^1.1.2",
    "@lacspace/robots": "^1.3.0",
    "@lacspace/sitemap": "^1.2.0",
    "@lacspace/og": "^1.1.0",
    "@lacspace/ui": "^1.0.1",
    "@lacspace/form": "^1.0.1",
    "@lacspace/validate": "^1.0.1",
    // React Kit: dark/light theming (no-flash) + essential hooks + global
    // state (announcement bar, mobile nav) + data fetching (live stats).
    "@lacspace/theme": "^1.0.2",
    "@lacspace/hooks": "^1.0.1",
    "@lacspace/store": "^1.1.0",
    "@lacspace/query": "^1.0.1",
    // The blog & docs templates render Markdown with @lacspace/markdown
    // (>=1.0.1 includes the URL-scheme XSS hardening — keep the floor there).
    ...(ctx.template.key === "blog" || ctx.template.key === "docs" ? { "@lacspace/markdown": "^1.0.1" } : {}),
    // The marketplace template composes the Lacspace commerce packages end to
    // end: a headless cart, order + invoice engines, tax & shipping calculators,
    // coupons, integer-safe money, ids, and the eSewa + Khalti payment gateways.
    ...(ctx.template.key === "marketplace"
      ? {
          "@lacspace/cart": "^1.0.0",
          "@lacspace/order": "^1.0.0",
          "@lacspace/tax": "^1.0.0",
          "@lacspace/shipping": "^1.0.0",
          "@lacspace/coupon": "^1.0.0",
          "@lacspace/invoice": "^1.0.0",
          "@lacspace/money": "^1.0.2",
          "@lacspace/id": "^1.0.2",
          "@lacspace/esewa": "^1.0.0",
          "@lacspace/khalti": "^1.0.0",
        }
      : {}),
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
  // Serve under a sub-path (e.g. a templates.lacspace.com/<name> demo) by setting
  // NEXT_PUBLIC_BASE_PATH at build time; leave it unset for a normal standalone app.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
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
  --color-accent: var(--accent-to);
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
}

:root {
  --accent-from: ${ctx.template.accent[0]};
  --accent-to: ${ctx.template.accent[1]};
  /* on-accent text — accent gradients are saturated, so black reads cleanest */
  --on-accent: #0a0a0f;
  /* Light theme — warm off-white ground, near-black ink */
  --bg: #fbfbfd;
  --fg: #0a0a0f;
  --muted: #52525b;
  --faint: #8a8a94;
  --surface: rgb(0 0 0 / 0.025);
  --panel: rgb(0 0 0 / 0.05);
  --hairline: rgb(0 0 0 / 0.08);
  /* soft, layered shadows (never harsh) */
  --shadow-sm: 0 1px 2px rgb(15 15 25 / 0.05), 0 1px 1px rgb(15 15 25 / 0.03);
  --shadow: 0 4px 12px -2px rgb(15 15 25 / 0.08), 0 2px 6px -2px rgb(15 15 25 / 0.05);
  --shadow-lg: 0 24px 48px -12px rgb(15 15 25 / 0.14), 0 8px 20px -8px rgb(15 15 25 / 0.08);
  --glow: 0 0 0 1px rgb(0 0 0 / 0.04);
  --radius: 1rem;
  --radius-lg: 1.5rem;
}

.dark {
  /* Dark theme (default) — deep near-black with a hint of indigo */
  --on-accent: #0a0a0f;
  --bg: #08080c;
  --fg: #f5f5f7;
  --muted: rgb(235 235 245 / 0.66);
  --faint: rgb(235 235 245 / 0.42);
  --surface: rgb(255 255 255 / 0.035);
  --panel: rgb(255 255 255 / 0.07);
  --hairline: rgb(255 255 255 / 0.09);
  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.4);
  --shadow: 0 8px 24px -6px rgb(0 0 0 / 0.5);
  --shadow-lg: 0 32px 64px -16px rgb(0 0 0 / 0.65), 0 12px 28px -12px rgb(0 0 0 / 0.5);
  --glow: 0 0 0 1px rgb(255 255 255 / 0.06);
}

* { border-color: var(--hairline); }
html { scroll-behavior: smooth; }
body {
  background: var(--bg);
  color: var(--fg);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  font-feature-settings: "cv02", "cv03", "cv04", "cv11";
  transition: background-color 0.3s ease, color 0.3s ease;
}

/* Confident, tight display type — a fluid clamp() scale + negative tracking. */
h1, h2, h3, .display { letter-spacing: -0.02em; text-wrap: balance; }
h1, .display { letter-spacing: -0.035em; line-height: 1.02; }
.text-display { font-size: clamp(2.6rem, 6.5vw, 4.75rem); line-height: 1; letter-spacing: -0.04em; font-weight: 800; text-wrap: balance; }
.text-hero { font-size: clamp(2.2rem, 5.5vw, 3.75rem); line-height: 1.03; letter-spacing: -0.035em; font-weight: 800; text-wrap: balance; }
.lead { font-size: clamp(1.05rem, 1.6vw, 1.25rem); line-height: 1.6; color: var(--muted); text-wrap: pretty; }

::selection { background: var(--accent-to); color: #fff; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-thumb { background: var(--panel); border-radius: 8px; border: 2px solid transparent; background-clip: padding-box; }
::-webkit-scrollbar-thumb:hover { background: var(--hairline); }
:focus-visible { outline: 2px solid var(--accent-to); outline-offset: 2px; border-radius: 6px; }

.gradient-text {
  background: linear-gradient(115deg, var(--accent-from), var(--accent-to));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.gradient-bg { background: linear-gradient(115deg, var(--accent-from), var(--accent-to)); }
.on-accent { color: var(--on-accent); }

/* soft accent halo used behind hero type & badges */
.accent-glow { box-shadow: 0 8px 32px -8px color-mix(in oklab, var(--accent-to) 55%, transparent); }

/* opaque theme background (for sticky chrome & chips) */
.bg-app { background: var(--bg); }

/* frosted glass — translucent surface + blur + hairline */
.glass {
  background: color-mix(in oklab, var(--bg) 72%, transparent);
  backdrop-filter: blur(14px) saturate(1.4);
  -webkit-backdrop-filter: blur(14px) saturate(1.4);
  border: 1px solid var(--hairline);
}

/* the workhorse surface card — rounded, hairline, soft shadow, hover lift + glow */
.card {
  border-radius: var(--radius-lg);
  border: 1px solid var(--hairline);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  transition: transform 0.4s var(--ease-out-expo), box-shadow 0.4s var(--ease-out-expo), border-color 0.4s var(--ease-out-expo);
}
.card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
  border-color: color-mix(in oklab, var(--accent-to) 40%, var(--hairline));
}

/* subtle gradient hairline border (draws focus without shouting) */
.gradient-border { position: relative; }
.gradient-border::after {
  content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px;
  background: linear-gradient(140deg, color-mix(in oklab, var(--accent-from) 60%, transparent), transparent 45%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none;
}

/* subtle background patterns for section grounds */
.grid-bg {
  background-image: linear-gradient(var(--hairline) 1px, transparent 1px), linear-gradient(90deg, var(--hairline) 1px, transparent 1px);
  background-size: 56px 56px;
  -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 0%, #000 30%, transparent 75%);
  mask-image: radial-gradient(ellipse 70% 60% at 50% 0%, #000 30%, transparent 75%);
}
.dot-bg {
  background-image: radial-gradient(var(--hairline) 1px, transparent 1px);
  background-size: 22px 22px;
  -webkit-mask-image: radial-gradient(ellipse 60% 50% at 50% 40%, #000 20%, transparent 70%);
  mask-image: radial-gradient(ellipse 60% 50% at 50% 40%, #000 20%, transparent 70%);
}

/* indeterminate progress bar (used by the "under development" pages) */
@keyframes loadbar { 0% { transform: translateX(-120%); } 100% { transform: translateX(340%); } }

/* ambient motion for illustrations & the aurora background */
@keyframes floaty { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-18px); } }
@keyframes drift { 0%, 100% { transform: translate3d(0, 0, 0) scale(1); } 33% { transform: translate3d(4%, -3%, 0) scale(1.06); } 66% { transform: translate3d(-3%, 3%, 0) scale(0.96); } }
@keyframes spin-slow { to { transform: rotate(360deg); } }
@keyframes gradient-pan { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
@keyframes marquee-x { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes shimmer-sweep { 0% { transform: translateX(-120%) skewX(-16deg); } 60%, 100% { transform: translateX(320%) skewX(-16deg); } }
.animate-floaty { animation: floaty 6s ease-in-out infinite; }
.animate-floaty-slow { animation: floaty 9s ease-in-out infinite; }
.animate-drift { animation: drift 22s ease-in-out infinite; }
.animate-drift-slow { animation: drift 30s ease-in-out infinite; }
.animate-spin-slow { animation: spin-slow 30s linear infinite; }
.gradient-text-animated {
  background: linear-gradient(115deg, var(--accent-from), var(--accent-to), var(--accent-from));
  background-size: 200% 200%;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: gradient-pan 6s ease infinite;
}
.marquee-track { display: flex; width: max-content; animation: marquee-x 40s linear infinite; }
.marquee-track:hover { animation-play-state: paused; }
@keyframes draw { to { stroke-dashoffset: 0; } }
.animate-draw { stroke-dasharray: 2000; stroke-dashoffset: 2000; animation: draw 1.8s var(--ease-out-expo) forwards; }
.marquee-mask { -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); }

/* a slow gradient light-sweep for primary CTAs */
.shimmer { position: relative; overflow: hidden; }
.shimmer::after {
  content: ""; position: absolute; top: 0; bottom: 0; left: 0; width: 40%;
  background: linear-gradient(90deg, transparent, rgb(255 255 255 / 0.45), transparent);
  animation: shimmer-sweep 4.5s var(--ease-out-expo) infinite; pointer-events: none;
}

/* soft, staggered entrance for content — nicer easing */
@keyframes rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
main > section { animation: rise 0.7s var(--ease-out-expo) both; }
main > section:nth-of-type(2) { animation-delay: 0.06s; }
main > section:nth-of-type(3) { animation-delay: 0.12s; }
main > section:nth-of-type(4) { animation-delay: 0.16s; }

/* respect reduced motion — kill animation AND transition-driven transforms */
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after { animation: none !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
  .shimmer::after { display: none; }
}
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

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = site.meta({ title: ${JSON.stringify(ctx.template.siteName)} });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={\`\${inter.variable} \${inter.className}\`} suppressHydrationWarning>
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
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden px-6 text-center">
      <div aria-hidden className="pointer-events-none absolute h-96 w-96 rounded-full gradient-bg opacity-20 blur-3xl animate-drift-slow" />
      <div className="relative text-[9rem] font-black leading-none gradient-text-animated">404</div>
      <p className="relative text-lg text-muted">This page wandered off. Let's get you home.</p>
      <Link href="/" className="shimmer relative rounded-full gradient-bg px-7 py-3.5 font-semibold on-accent transition hover:-translate-y-0.5">Back home</Link>
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
  if (ctx.template.key === "marketplace") return marketplaceHome(ctx);

  const shell = (inner: string): string => {
  const ctaCopy: Record<string, { t: string; s: string; l: string; h: string }> = {
    personal: { t: "Have something in mind?", s: "I'm taking on a couple of projects this quarter — let's talk.", l: "Start a conversation", h: "/contact" },
    business: { t: "Let's build something that ships", s: "Tell us the outcome you're after and we'll map the path.", l: "Start a project", h: "/contact" },
    ecommerce: { t: "Find your next favourite thing", s: "Free shipping over $50 and 30-day easy returns, always.", l: "Shop the collection", h: "/shop" },
    saas: { t: "Ready to ship faster?", s: "Start free in minutes — no credit card, no lock-in.", l: "Get started free", h: "/pricing" },
    blog: { t: "Never miss a piece", s: "Get new essays in your inbox — no spam, unsubscribe anytime.", l: "Join the newsletter", h: "/newsletter" },
    docs: { t: "Start building today", s: "Go from install to your first request in five minutes.", l: "Read the quickstart", h: "/docs" },
    restaurant: { t: "Join us for dinner", s: "We fill up fast on weekends — book your table ahead.", l: "Reserve a table", h: "/reservations" },
  };
  const cc = ctaCopy[ctx.template.key] ?? ctaCopy.business!;
  return `import Link from "next/link";
import { site } from "@/lib/site";
import { LiveStats } from "@/components/live-stats";
import { Aurora } from "@/components/aurora";
import { HeroArt } from "@/components/hero-art";
import { StatBand, Steps, Testimonial, CTABand } from "@/components/ui";

// ✨ Self-canonical home page — one line, full SEO (title, canonical, OG, Twitter).
export const metadata = site.meta({ title: ${JSON.stringify(n)}, path: "/" });

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* ✨ Soft, theme-aware gradient-mesh backdrop */}
      <Aurora />
      ${inner}
      ${marqueeSection(ctx)}
      ${showcaseSection(ctx)}
      ${extraHomeSections(ctx)}
      <CTABand title=${JSON.stringify(cc.t)} subtitle=${JSON.stringify(cc.s)} ctaLabel=${JSON.stringify(cc.l)} ctaHref=${JSON.stringify(cc.h)} />
      ${faqSection(ctx)}
      ${builtWithSection(ctx)}
    </main>
  );
}
`;
  };

  if (ctx.template.key === "personal") {
    return shell(`<section className="relative mx-auto max-w-3xl px-6 py-32 text-center sm:py-40">
        <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-muted"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" /></span> Available for select projects</span>
        <h1 className="text-display mt-7">Hi, I'm <span className="gradient-text">${n}</span></h1>
        <p className="lead mx-auto mt-6 max-w-xl">${ctx.template.siteDescription}</p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <a href="#work" className="shimmer rounded-full gradient-bg px-7 py-3.5 font-semibold on-accent transition hover:-translate-y-0.5">View my work</a>
          <Link href="/contact" className="rounded-full border border-hairline px-7 py-3.5 font-semibold transition hover:bg-surface">Get in touch</Link>
        </div>
      </section>
      <section id="work" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 flex items-end justify-between">
          <div><p className="text-sm font-semibold uppercase tracking-widest gradient-text">Selected work</p><h2 className="mt-3 text-3xl font-bold sm:text-4xl">Things I've shipped</h2></div>
          <Link href="/work" className="hidden text-sm text-muted underline-offset-4 transition hover:text-fg hover:underline sm:block">All projects →</Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { t: "Aurora Design System", d: "A themeable component library and tokens powering 40+ product screens.", tag: "Design + Code", e: "🎨" },
            { t: "Northwind Analytics", d: "A real-time dashboard that cut reporting time from hours to seconds.", tag: "Product", e: "📊" },
            { t: "Lumen Mobile", d: "A 4.9★ React Native app rebuilt from the ground up for speed.", tag: "Mobile", e: "📱" },
            { t: "Harbor Commerce", d: "A headless storefront with a checkout that converts 38% better.", tag: "E-commerce", e: "🛍️" },
            { t: "Cadence Marketing", d: "A brand and site refresh that doubled qualified inbound leads.", tag: "Brand", e: "✨" },
            { t: "Meadow Docs", d: "A fast, searchable docs platform teams actually enjoy reading.", tag: "Web", e: "📚" },
          ].map((p) => (
            <Link key={p.t} href="/work" className="card group flex flex-col p-6">
              <div className="mb-5 flex aspect-[16/10] items-center justify-center overflow-hidden rounded-xl gradient-bg text-5xl on-accent">{p.e}</div>
              <span className="text-xs font-semibold uppercase tracking-widest gradient-text">{p.tag}</span>
              <h3 className="mt-1.5 font-semibold tracking-tight">{p.t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{p.d}</p>
            </Link>
          ))}
        </div>
      </section>`);
  }

  if (ctx.template.key === "business") {
    return shell(`<section className="relative mx-auto max-w-4xl px-6 py-32 text-center sm:py-40">
        <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-muted"><span aria-hidden className="h-1.5 w-1.5 rounded-full gradient-bg" /> A senior product studio</span>
        <h1 className="text-display mt-7">We build products <span className="gradient-text">that grow businesses</span></h1>
        <p className="lead mx-auto mt-6 max-w-2xl">${ctx.template.siteDescription}</p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link href="/contact" className="shimmer rounded-full gradient-bg px-7 py-3.5 font-semibold on-accent transition hover:-translate-y-0.5">Start a project</Link>
          <Link href="/work" className="rounded-full border border-hairline px-7 py-3.5 font-semibold transition hover:bg-surface">See our work</Link>
        </div>
      </section>
      <section id="services" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 text-center"><p className="text-sm font-semibold uppercase tracking-widest gradient-text">What we do</p><h2 className="mt-3 text-3xl font-bold sm:text-4xl">One team, from strategy to launch</h2></div>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { t: "Strategy", d: "Positioning, research and a roadmap that ships — grounded in evidence, not opinions.", e: "🧭" },
            { t: "Design", d: "Brand and product design people remember, with a system that scales past launch day.", e: "🎨" },
            { t: "Engineering", d: "Fast, reliable software built to last — typed, tested and observable from day one.", e: "⚙️" },
          ].map((s) => (
            <div key={s.t} className="card p-8">
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl gradient-bg text-2xl accent-glow">{s.e}</div>
              <h3 className="text-xl font-bold tracking-tight">{s.t}</h3>
              <p className="mt-2 leading-relaxed text-muted">{s.d}</p>
            </div>
          ))}
        </div>
      </section>`);
  }

  if (ctx.template.key === "ecommerce") {
    return shell(`<section className="relative mx-auto max-w-5xl px-6 py-32 text-center sm:py-40">
        <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-muted">🚚 Free worldwide shipping over $50</span>
        <h1 className="text-display mt-7"><span className="gradient-text">${n}</span></h1>
        <p className="lead mx-auto mt-6 max-w-xl">${ctx.template.siteDescription}</p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link href="/shop" className="shimmer rounded-full gradient-bg px-8 py-3.5 font-semibold on-accent transition hover:-translate-y-0.5">Shop the collection</Link>
          <Link href="/collections" className="rounded-full border border-hairline px-8 py-3.5 font-semibold transition hover:bg-surface">Browse collections</Link>
        </div>
      </section>
      <section id="shop" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 flex items-end justify-between">
          <div><p className="text-sm font-semibold uppercase tracking-widest gradient-text">Featured</p><h2 className="mt-3 text-3xl font-bold sm:text-4xl">This week's edit</h2></div>
          <Link href="/shop" className="hidden text-sm text-muted underline-offset-4 transition hover:text-fg hover:underline sm:block">Shop all →</Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { n: "Aurora Table Lamp", p: "$89", e: "💡" }, { n: "Terra Stoneware Mug", p: "$24", e: "☕" },
            { n: "Linen Waffle Throw", p: "$65", e: "🧺" }, { n: "Oak Monitor Stand", p: "$120", e: "🪵" },
          ].map((prod) => (
            <div key={prod.n} className="card group flex flex-col p-4">
              <Link href="/shop" className="mb-4 flex aspect-square items-center justify-center overflow-hidden rounded-xl gradient-bg text-6xl on-accent transition group-hover:scale-[1.03]">{prod.e}</Link>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold tracking-tight">{prod.n}</h3>
                <span className="shrink-0 font-semibold text-muted">{prod.p}</span>
              </div>
              <Link href="/shop" className="mt-4 block w-full rounded-full gradient-bg py-2.5 text-center text-sm font-semibold on-accent transition hover:-translate-y-0.5">Add to cart</Link>
            </div>
          ))}
        </div>
      </section>`);
  }

  if (ctx.template.key === "blog") {
    return shell(`<section className="mx-auto max-w-3xl px-6 py-28 sm:py-32">
        <p className="text-sm font-semibold uppercase tracking-widest gradient-text">The Journal</p>
        <h1 className="text-display mt-4"><span className="gradient-text">${n}</span></h1>
        <p className="lead mt-6 max-w-2xl">${ctx.template.siteDescription}</p>
        <Link href="/blog" className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-fg underline-offset-4 hover:underline">Read the archive →</Link>
      </section>
      <section id="latest" className="mx-auto max-w-5xl px-6 pb-8">
        <Link href="/blog" className="card group grid gap-6 overflow-hidden p-6 sm:grid-cols-[1.2fr_1fr] sm:p-8">
          <div className="flex aspect-[16/10] items-center justify-center overflow-hidden rounded-2xl gradient-bg text-6xl on-accent transition group-hover:scale-[1.02]">📮</div>
          <div className="flex flex-col justify-center">
            <span className="text-xs font-semibold uppercase tracking-widest gradient-text">Featured</span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">The one thing every product needs before launch</h2>
            <p className="mt-3 leading-relaxed text-muted">Most teams polish the wrong things. Here's the single unglamorous check that separates a launch that lands from one that limps.</p>
            <span className="mt-5 text-sm text-faint">8 min read · Product</span>
          </div>
        </Link>
      </section>
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-8 sm:grid-cols-2">
          {[
            { t: "Writing that survives the scroll", d: "Editing tricks that keep readers past the first paragraph.", tag: "Craft", e: "✍️" },
            { t: "The cost of a fast 'yes'", d: "Why the cheapest decisions are often the most expensive.", tag: "Product", e: "⚖️" },
            { t: "Building in the open, one year in", d: "What we learned shipping every week where anyone could watch.", tag: "Culture", e: "🌱" },
            { t: "Design systems for teams of one", d: "You don't need a committee to move fast and stay consistent.", tag: "Design", e: "🎨" },
          ].map((p) => (
            <Link key={p.t} href="/blog" className="group">
              <div className="mb-4 flex aspect-[16/9] items-center justify-center overflow-hidden rounded-2xl gradient-bg text-5xl on-accent transition group-hover:scale-[1.02]">{p.e}</div>
              <span className="text-xs font-semibold uppercase tracking-widest gradient-text">{p.tag}</span>
              <h3 className="mt-1.5 text-xl font-semibold tracking-tight transition group-hover:text-[color:var(--accent-to)]">{p.t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{p.d}</p>
            </Link>
          ))}
        </div>
      </section>`);
  }

  if (ctx.template.key === "docs") {
    const pkg = "@" + n.toLowerCase() + "/sdk";
    return shell(`<section className="relative mx-auto max-w-4xl px-6 py-32 text-center sm:py-40">
        <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-muted">📘 Docs · v1.0</span>
        <h1 className="text-display mt-7">Build with <span className="gradient-text">${n}</span></h1>
        <p className="lead mx-auto mt-6 max-w-2xl">Guides, API references and copy-paste examples — everything you need, in one fast, searchable place.</p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link href="/docs" className="shimmer rounded-full gradient-bg px-7 py-3.5 font-semibold on-accent transition hover:-translate-y-0.5">Read the docs</Link>
          <div className="glass inline-flex items-center gap-3 rounded-full px-5 py-3 font-mono text-sm text-muted"><span className="gradient-text font-bold">$</span> npm i ${pkg}</div>
        </div>
      </section>
      <section id="guides" className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { t: "Quick start", d: "Go from zero to your first successful request in under five minutes.", e: "🚀", href: "/docs" },
            { t: "Guides", d: "Task-focused walkthroughs for the paths you'll actually take.", e: "🧭", href: "/guides" },
            { t: "API reference", d: "Every endpoint, fully typed, with copy-paste examples in each language.", e: "🔌", href: "/api-reference" },
          ].map((c) => (
            <Link key={c.t} href={c.href} className="card group p-8">
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl gradient-bg text-2xl accent-glow">{c.e}</div>
              <h3 className="text-xl font-bold tracking-tight">{c.t} <span className="inline-block transition group-hover:translate-x-1">→</span></h3>
              <p className="mt-2 leading-relaxed text-muted">{c.d}</p>
            </Link>
          ))}
        </div>
      </section>`);
  }

  if (ctx.template.key === "restaurant") {
    return shell(`<section className="relative mx-auto max-w-4xl px-6 py-32 text-center sm:py-40">
        <p className="text-sm font-semibold uppercase tracking-[0.35em] text-faint">Est. 2026 · Natural wine bar & kitchen</p>
        <h1 className="text-display mt-5"><span className="gradient-text">${n}</span></h1>
        <p className="lead mx-auto mt-6 max-w-xl">${ctx.template.siteDescription}</p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link href="/reservations" className="shimmer rounded-full gradient-bg px-8 py-3.5 font-semibold on-accent transition hover:-translate-y-0.5">Reserve a table</Link>
          <Link href="/menu" className="rounded-full border border-hairline px-8 py-3.5 font-semibold transition hover:bg-surface">View the menu</Link>
        </div>
      </section>
      <section id="menu" className="mx-auto max-w-4xl px-6 py-20">
        <div className="mb-12 text-center"><p className="text-sm font-semibold uppercase tracking-widest gradient-text">From the pass</p><h2 className="mt-3 text-3xl font-bold sm:text-4xl">Tonight's plates</h2></div>
        <div className="grid gap-x-12 gap-y-6 sm:grid-cols-2">
          {[
            { n: "Charred leeks, hazelnut & aged pecorino", p: "$14" }, { n: "Handmade tagliatelle, brown butter & sage", p: "$22" },
            { n: "Wood-fired trout, fennel & burnt lemon", p: "$28" }, { n: "Dry-aged sirloin, bone marrow butter", p: "$34" },
            { n: "Roasted heritage carrots, dukkah & yoghurt", p: "$13" }, { n: "Olive oil & almond cake, crème fraîche", p: "$11" },
          ].map((d) => (
            <div key={d.n} className="flex items-baseline gap-3 border-b border-dashed border-hairline pb-4">
              <h3 className="font-semibold tracking-tight">{d.n}</h3>
              <span className="flex-1" />
              <span className="shrink-0 gradient-text font-bold tabular-nums">{d.p}</span>
            </div>
          ))}
        </div>
        <p className="mt-10 text-center text-sm text-muted">Menu changes with the seasons · ask us about tonight's natural wine pairings.</p>
      </section>`);
  }

  // saas
  return shell(`<section className="relative mx-auto max-w-4xl px-6 py-32 text-center sm:py-40">
        <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-muted"><span aria-hidden className="h-1.5 w-1.5 rounded-full gradient-bg" /> New · Realtime dashboards are live</span>
        <h1 className="text-display mt-7">Ship faster with <span className="gradient-text">${n}</span></h1>
        <p className="lead mx-auto mt-6 max-w-2xl">${ctx.template.siteDescription}</p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link href="/pricing" className="shimmer rounded-full gradient-bg px-8 py-3.5 font-semibold on-accent transition hover:-translate-y-0.5">Start free</Link>
          <Link href="/features" className="rounded-full border border-hairline px-8 py-3.5 font-semibold transition hover:bg-surface">See features</Link>
        </div>
        <p className="mt-5 text-sm text-faint">No credit card · Free forever plan · SOC 2-ready</p>
      </section>
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 text-center"><p className="text-sm font-semibold uppercase tracking-widest gradient-text">Why teams switch</p><h2 className="mt-3 text-3xl font-bold sm:text-4xl">Everything in one fast place</h2></div>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            { t: "Realtime analytics", d: "Live dashboards on the edge — global by default, no waiting for pipelines.", e: "⚡" },
            { t: "Secure by default", d: "Hardened headers, SSO and audit logs out of the box. SOC 2-ready.", e: "🔒" },
            { t: "Scales with you", d: "From your first user to your millionth, with usage-based billing built in.", e: "📈" },
          ].map((f) => (
            <div key={f.t} className="card p-8">
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl gradient-bg text-2xl accent-glow">{f.e}</div>
              <h3 className="text-xl font-bold tracking-tight">{f.t}</h3>
              <p className="mt-2 leading-relaxed text-muted">{f.d}</p>
            </div>
          ))}
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

// A rich, prefilled, project-name-personalized About page built from the UI kit.
const aboutPage = (ctx: Ctx): string => {
  const r = richContent(ctx);
  const n = ctx.template.siteName;
  const story = r.process.map((p, i) => ({ date: (["Then", "Next", "Now", "Ahead"][i] ?? ""), title: p.title, desc: p.desc }));
  return pageFile({
    title: "About", path: "/about", description: `The story, the team and the values behind ${n}.`,
    cta: { title: "Let's build something together", subtitle: "We'd love to hear what you're working on.", label: "Get in touch", href: "/contact" },
    body: `      <section className="mx-auto max-w-3xl px-6 py-24">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "About" }]} />
        <h1 className="mt-6 text-4xl font-bold sm:text-5xl">About <span className="gradient-text">${n}</span></h1>
        <p className="mt-4 text-lg text-muted">${n} exists to help you ship something you're proud of — faster, and with less fuss. Here's who we are and what we believe.</p>
      </section>
      <Section className="pt-0"><StatBand stats={${JSON.stringify(r.stats)}} /></Section>
      <Section eyebrow="Our story" title="How we got here" className="pt-0">
        <div className="mx-auto max-w-2xl"><Timeline items={${JSON.stringify(story)}} /></div>
      </Section>
      <Section eyebrow="What we value" title="Principles we won't compromise" className="pt-0">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {${JSON.stringify(r.values)}.map((v) => <FeatureCard key={v.title} title={v.title} desc={v.desc} />)}
        </div>
      </Section>
      <Section eyebrow="The team" title="The people behind ${n}" className="pt-0">
        <TeamGrid members={${JSON.stringify(r.team)}} />
      </Section>
      <Section title="Frequently asked" className="pt-0"><FAQ items={${JSON.stringify(r.faqs.slice(0, 4))}} /></Section>`,
  });
};

// A prefilled FAQ page (uses the shared richContent questions).
const faqPage = (ctx: Ctx): string => {
  const r = richContent(ctx);
  const n = ctx.template.siteName;
  return pageFile({
    title: "FAQ", path: "/faq", description: `Answers to common questions about ${n}.`,
    cta: { title: "Still have questions?", subtitle: "We're happy to help — reach out any time.", label: "Contact us", href: "/contact" },
    body: `      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <Pill>FAQ</Pill>
        <h1 className="mt-4 text-4xl font-bold sm:text-5xl">Frequently asked <span className="gradient-text">questions</span></h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted">Everything you need to know about ${n}. Can't find an answer? Get in touch.</p>
      </section>
      <Section className="pt-0"><FAQ items={${JSON.stringify(r.faqs)}} /></Section>`,
  });
};

// Integrations (saas): logo cloud + category feature grid.
const integrationsPage = (ctx: Ctx): string => pageFile({
  title: "Integrations", path: "/integrations", description: `Connect ${ctx.template.siteName} to the tools your team already uses.`,
  cta: { title: "Don't see your tool?", subtitle: "We add integrations every month — tell us what you need.", label: "Request an integration", href: "/contact" },
  body: `      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <Pill>Integrations</Pill>
        <h1 className="mt-4 text-4xl font-bold sm:text-5xl">Works with your <span className="gradient-text">stack</span></h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted">Plug ${ctx.template.siteName} into the tools you already love.</p>
      </section>
      <Section className="pt-0"><LogoCloud label="Popular integrations" names={["Slack", "Notion", "GitHub", "Figma", "Linear", "Stripe", "Zapier", "HubSpot"]} /></Section>
      <Section eyebrow="Categories" title="Everything connects" className="pt-0">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: "💬", title: "Communication", desc: "Slack, Teams and email — never miss an update." },
            { icon: "📊", title: "Analytics", desc: "Pipe events to your warehouse or BI tool." },
            { icon: "🔗", title: "Automation", desc: "Zapier and webhooks to connect anything." },
            { icon: "💳", title: "Payments", desc: "Stripe and PayPal, wired and ready." },
            { icon: "🗂️", title: "Productivity", desc: "Notion, Linear and Jira in two clicks." },
            { icon: "🔐", title: "Identity", desc: "SSO, SAML and SCIM for teams." },
          ].map((f) => <FeatureCard key={f.title} icon={f.icon} title={f.title} desc={f.desc} />)}
        </div>
      </Section>`,
});

// Changelog (saas/docs): a release timeline.
const changelogPage = (ctx: Ctx): string => pageFile({
  title: "Changelog", path: "/changelog", description: `New features and improvements shipped to ${ctx.template.siteName}.`,
  body: `      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <Pill>Changelog</Pill>
        <h1 className="mt-4 text-4xl font-bold sm:text-5xl">What&rsquo;s <span className="gradient-text">new</span></h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted">Every improvement we ship to ${ctx.template.siteName}, newest first.</p>
      </section>
      <Section className="pt-0">
        <div className="mx-auto max-w-2xl">
          <Timeline items={[
            { date: "This week", title: "Dark mode everywhere", desc: "A no-flash theme system across every page." },
            { date: "Last week", title: "Faster search", desc: "Command palette results now feel instant." },
            { date: "Earlier", title: "Team roles", desc: "Invite teammates with granular permissions." },
            { date: "Launch", title: "Hello, world 👋", desc: "The first public release." },
          ]} />
        </div>
      </Section>`,
});

// Gallery (restaurant): a visual grid.
const galleryPage = (ctx: Ctx): string => pageFile({
  title: "Gallery", path: "/gallery", description: `A look inside ${ctx.template.siteName}.`,
  cta: { title: "Come see for yourself", subtitle: "Book a table and taste the difference.", label: "Reserve a table", href: "/reservations" },
  body: `      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <Pill>Gallery</Pill>
        <h1 className="mt-4 text-4xl font-bold sm:text-5xl">A look <span className="gradient-text">inside</span></h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted">The room, the plates, the little details that make ${ctx.template.siteName}.</p>
      </section>
      <Section className="pt-0">
        <Gallery items={[
          { emoji: "🍽️", label: "The dining room" },
          { emoji: "🥘", label: "Signature dish" },
          { emoji: "🍷", label: "Cellar" },
          { emoji: "👨‍🍳", label: "The kitchen" },
          { emoji: "🍰", label: "Desserts" },
          { emoji: "🌿", label: "Fresh daily" },
        ]} />
      </Section>`,
});

// Uses (personal): a categorized gear/tools list.
const usesPage = (ctx: Ctx): string => pageFile({
  title: "Uses", path: "/uses", description: `The gear, apps and tools ${ctx.template.siteName} uses every day.`,
  body: `      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <Pill>Uses</Pill>
        <h1 className="mt-4 text-4xl font-bold sm:text-5xl">What I <span className="gradient-text">use</span></h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted">The gear and software behind the work.</p>
      </section>
      <Section title="Editor & tools" className="pt-0">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: "🖥️", title: "VS Code", desc: "My editor of choice, tuned to the bone." },
            { icon: "⚡", title: "Next.js", desc: "The React framework behind everything I ship." },
            { icon: "🎨", title: "Figma", desc: "Where every design starts." },
            { icon: "⌨️", title: "Raycast", desc: "Launcher, clipboard history and snippets." },
            { icon: "🧠", title: "Obsidian", desc: "Notes and a second brain." },
            { icon: "🎧", title: "Focus playlist", desc: "Lo-fi, always." },
          ].map((f) => <FeatureCard key={f.title} icon={f.icon} title={f.title} desc={f.desc} />)}
        </div>
      </Section>`,
});

// A reusable rich-page layout so every converted page ships 5+ suitable sections
// with an illustration and creative components — driven by a short config.
interface RichPageCfg {
  title: string; path: string; description: string; eyebrow: string; heading: string; lead: string;
  split: { eyebrow?: string; title: string; desc: string; bullets: string[]; emoji: string };
  features: { icon: string; title: string; desc: string }[];
  extra?: string;
  cta: { title: string; subtitle: string; label: string; href: string };
}
const richPage = (ctx: Ctx, cfg: RichPageCfg): string => {
  const r = richContent(ctx);
  const showcase = cfg.extra ?? `<Section eyebrow="Loved by teams" title="Don't just take our word for it" className="pt-0">
        <div className="grid gap-6 md:grid-cols-3">
          ${r.testimonials.map((t) => `<Testimonial quote={${JSON.stringify(t.quote)}} author={${JSON.stringify(t.author)}} role={${JSON.stringify(t.role ?? "")}} />`).join("\n          ")}
        </div>
      </Section>`;
  return pageFile({
    title: cfg.title, path: cfg.path, description: cfg.description, cta: cfg.cta,
    body: `      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <Pill>${cfg.eyebrow}</Pill>
        <h1 className="mt-4 text-4xl font-bold sm:text-5xl">${cfg.heading}</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted">${cfg.lead}</p>
      </section>
      <Section className="pt-0">
        <FeatureSplit eyebrow=${JSON.stringify(cfg.split.eyebrow ?? "")} title=${JSON.stringify(cfg.split.title)} desc=${JSON.stringify(cfg.split.desc)} bullets={${JSON.stringify(cfg.split.bullets)}} media={<div className="grid h-52 place-items-center text-7xl">${cfg.split.emoji}</div>} />
      </Section>
      <Section className="pt-0"><StatBand stats={${JSON.stringify(r.stats)}} /></Section>
      <Section eyebrow="Highlights" title="What you get" className="pt-0">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {${JSON.stringify(cfg.features)}.map((f) => <FeatureCard key={f.title} icon={f.icon} title={f.title} desc={f.desc} />)}
        </div>
      </Section>
      ${showcase}`,
  });
};

// Careers (all marketing templates): open roles + why-us + perks.
const careersPage = (ctx: Ctx): string => {
  const n = ctx.template.siteName;
  return richPage(ctx, {
    title: "Careers", path: "/careers", eyebrow: "Careers",
    description: `Join the team building ${n}.`,
    heading: `Join the <span className="gradient-text">team</span>`,
    lead: `We're a small team doing our best work. If that sounds like you, say hello.`,
    split: { eyebrow: "Why us", title: "A place to do your best work", desc: "Small team, big ownership, and the support to grow.", bullets: ["Remote-first and async-friendly", "Real ownership from day one", "Learning budget and great gear"], emoji: "🚀" },
    features: [
      { icon: "🌍", title: "Remote-first", desc: "Work from anywhere, on your schedule." },
      { icon: "📈", title: "Grow fast", desc: "Mentorship and a budget to level up." },
      { icon: "🤝", title: "Real ownership", desc: "Ship things that matter, end to end." },
      { icon: "🏖️", title: "Time to recharge", desc: "Generous, actually-used time off." },
      { icon: "💙", title: "Great people", desc: "Kind, sharp teammates who have your back." },
      { icon: "💸", title: "Fair pay", desc: "Transparent, competitive compensation." },
    ],
    extra: `<Section eyebrow="Open roles" title="We're hiring" className="pt-0">
        <div className="mx-auto grid max-w-3xl gap-4">
          {[
            { role: "Senior Frontend Engineer", team: "Engineering", type: "Full-time · Remote" },
            { role: "Product Designer", team: "Design", type: "Full-time · Remote" },
            { role: "Developer Advocate", team: "Growth", type: "Full-time · Remote" },
          ].map((j) => (
            <div key={j.role} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline bg-surface p-5">
              <div><h3 className="font-semibold">{j.role}</h3><p className="text-sm text-muted">{j.team}</p></div>
              <div className="flex items-center gap-3"><Badge>{j.type}</Badge><Link href="/contact" className="rounded-full gradient-bg px-4 py-2 text-sm font-semibold on-accent">Apply</Link></div>
            </div>
          ))}
        </div>
      </Section>`,
    cta: { title: "Don't see your role?", subtitle: "We're always keen to meet great people.", label: "Send an intro", href: "/contact" },
  });
};

// Collections (ecommerce): curated category edits + a visual gallery.
const collectionsPage = (ctx: Ctx): string => richPage(ctx, {
  title: "Collections", path: "/collections", eyebrow: "Collections",
  description: `Shop ${ctx.template.siteName} by collection.`,
  heading: `Shop by <span className="gradient-text">collection</span>`,
  lead: "Curated edits for every season and style.",
  split: { eyebrow: "Featured", title: "This season's edit", desc: "Hand-picked pieces our team is loving right now.", bullets: ["Free shipping over $50", "30-day easy returns", "Ethically sourced"], emoji: "🛍️" },
  features: [
    { icon: "🧥", title: "New arrivals", desc: "Fresh drops, added weekly." },
    { icon: "🔥", title: "Best sellers", desc: "The pieces everyone's buying." },
    { icon: "🌱", title: "Sustainable", desc: "Made to last, kind to the planet." },
    { icon: "🎁", title: "Gifting", desc: "Thoughtful picks for everyone." },
    { icon: "💎", title: "Premium", desc: "Elevated essentials worth the splurge." },
    { icon: "🏷️", title: "Sale", desc: "Up to 40% off, while stocks last." },
  ],
  extra: `<Section eyebrow="Browse" title="Explore the collections" className="pt-0">
        <Gallery items={[
          { emoji: "🧥", label: "Outerwear" }, { emoji: "👟", label: "Footwear" }, { emoji: "👜", label: "Bags" },
          { emoji: "⌚", label: "Accessories" }, { emoji: "🕶️", label: "Eyewear" }, { emoji: "🧢", label: "Headwear" },
        ]} />
      </Section>`,
  cta: { title: "Ready to shop?", subtitle: "Your next favourite thing is waiting.", label: "Browse the shop", href: "/shop" },
});

// Case studies (business /work): outcomes-led project showcase.
const businessWorkPage = (ctx: Ctx): string => richPage(ctx, {
  title: "Work", path: "/work", eyebrow: "Case studies",
  description: `Selected work from ${ctx.template.siteName}.`,
  heading: `Work that <span className="gradient-text">performs</span>`,
  lead: "A few recent projects and the outcomes they drove.",
  split: { eyebrow: "How we work", title: "Outcomes, not just output", desc: "We measure success by the numbers that move your business.", bullets: ["Discovery-led, evidence-based", "Ship weekly, learn faster", "Own the result together"], emoji: "📊" },
  features: [
    { icon: "🛒", title: "Northwind Commerce", desc: "+38% conversion after a full storefront rebuild." },
    { icon: "🏦", title: "Globex Fintech", desc: "Onboarding time cut from 9 minutes to under 2." },
    { icon: "🎓", title: "Initech Learning", desc: "2.4× course completions with a redesigned LMS." },
    { icon: "🚚", title: "Umbrella Logistics", desc: "Real-time tracking that cut support tickets 45%." },
    { icon: "🏥", title: "Soylent Health", desc: "HIPAA-ready portal shipped in eight weeks." },
    { icon: "📱", title: "Hooli Mobile", desc: "A 4.9★ app rebuilt from the ground up." },
  ],
  cta: { title: "Have a project in mind?", subtitle: "Tell us the outcome you're after — we'll map the path.", label: "Start a project", href: "/contact" },
});

// API reference (docs): endpoints + example requests.
const apiRefPage = (ctx: Ctx): string => richPage(ctx, {
  title: "API Reference", path: "/api-reference", eyebrow: "API",
  description: `The ${ctx.template.siteName} REST API reference.`,
  heading: `The <span className="gradient-text">API</span> reference`,
  lead: "A predictable, typed REST API with sensible defaults.",
  split: { eyebrow: "Basics", title: "REST, done right", desc: "JSON everywhere, cursor pagination, and clear error codes.", bullets: ["Bearer-token auth", "Idempotent writes", "Webhooks for every event"], emoji: "🔌" },
  features: [
    { icon: "🔑", title: "POST /auth/token", desc: "Exchange credentials for an access token." },
    { icon: "👤", title: "GET /users/:id", desc: "Fetch a single user by id." },
    { icon: "📦", title: "GET /resources", desc: "List resources with cursor pagination." },
    { icon: "✏️", title: "PATCH /resources/:id", desc: "Partially update a resource." },
    { icon: "🗑️", title: "DELETE /resources/:id", desc: "Remove a resource (idempotent)." },
    { icon: "🪝", title: "POST /webhooks", desc: "Subscribe to real-time events." },
  ],
  extra: `<Section eyebrow="Examples" title="Common requests" className="pt-0">
        <div className="mx-auto max-w-3xl"><Accordion items={[
          { q: "Authenticate", a: "curl -X POST /auth/token -d '{ \\"key\\": \\"...\\" }' — returns a bearer token valid for 24h." },
          { q: "List with pagination", a: "GET /resources?limit=20&cursor=... — responses include a next_cursor field." },
          { q: "Handle errors", a: "Every error returns a JSON body with a code and message, plus the right HTTP status." },
        ]} /></div>
      </Section>`,
  cta: { title: "Need a hand?", subtitle: "Our team is happy to help you integrate.", label: "Talk to us", href: "/contact" },
});

// Reservations (restaurant): booking info, hours, and a nudge to reserve.
const reservationsPage = (ctx: Ctx): string => {
  const n = ctx.template.siteName;
  return richPage(ctx, {
    title: "Reservations", path: "/reservations", eyebrow: "Reservations",
    description: `Book your table at ${n}.`,
    heading: `Reserve your <span className="gradient-text">table</span>`,
    lead: `We can't wait to host you at ${n}. Book ahead — we fill up fast.`,
    split: { eyebrow: "Good to know", title: "Everything for a perfect evening", desc: "Walk-ins welcome, but reservations are recommended, especially on weekends.", bullets: ["Parties up to 12 online", "Private dining available", "Dietary needs? Just ask"], emoji: "🍽️" },
    features: [
      { icon: "🕰️", title: "Lunch", desc: "Tue–Fri · 12:00–15:00" },
      { icon: "🌙", title: "Dinner", desc: "Tue–Sun · 18:00–23:00" },
      { icon: "🥂", title: "Weekend brunch", desc: "Sat–Sun · 10:00–14:00" },
      { icon: "🎉", title: "Private events", desc: "Book the whole room." },
      { icon: "🚗", title: "Parking", desc: "Valet available on evenings." },
      { icon: "♿", title: "Accessible", desc: "Step-free access throughout." },
    ],
    extra: `<Section className="pt-0">
        <div className="mx-auto max-w-2xl rounded-3xl border border-hairline bg-surface p-8 text-center">
          <h2 className="text-2xl font-bold">Book by phone or online</h2>
          <p className="mt-3 text-muted">Call us on <span className="font-semibold text-fg">+1 (555) 012-3456</span> or reserve online in seconds.</p>
          <Link href="/contact" className="mt-6 inline-block rounded-full gradient-bg px-8 py-3 font-semibold on-accent">Reserve a table</Link>
        </div>
      </Section>`,
    cta: { title: "Planning something special?", subtitle: "Ask us about private dining and set menus.", label: "Enquire now", href: "/contact" },
  });
};

// Private events (restaurant).
const eventsPage = (ctx: Ctx): string => richPage(ctx, {
  title: "Private events", path: "/events", eyebrow: "Private events",
  description: `Host your event at ${ctx.template.siteName}.`,
  heading: `Your event, <span className="gradient-text">elevated</span>`,
  lead: "From intimate dinners to full buy-outs — we'll make it unforgettable.",
  split: { eyebrow: "Occasions", title: "Made for the moments that matter", desc: "Birthdays, launches, weddings and everything in between.", bullets: ["Bespoke set menus", "Dedicated event host", "AV and styling on request"], emoji: "🎉" },
  features: [
    { icon: "🎂", title: "Celebrations", desc: "Birthdays and anniversaries, done right." },
    { icon: "💼", title: "Corporate", desc: "Launches, offsites and client dinners." },
    { icon: "💍", title: "Weddings", desc: "Rehearsal dinners and receptions." },
    { icon: "🍷", title: "Tastings", desc: "Guided wine and menu pairings." },
    { icon: "👥", title: "Buy-outs", desc: "The whole space, just for you." },
    { icon: "🎶", title: "Live music", desc: "We'll arrange the perfect soundtrack." },
  ],
  cta: { title: "Let's plan your event", subtitle: "Tell us the date and the vibe — we'll handle the rest.", label: "Start planning", href: "/contact" },
});


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
        className="gradient-bg rounded-full px-8 py-3 font-semibold on-accent disabled:opacity-60"
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
                    className={\`block rounded-lg px-3 py-1.5 transition \${active ? "gradient-bg font-semibold on-accent" : "text-muted hover:bg-surface hover:text-fg"}\`}
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

export function buildFiles(ctx: Ctx): Record<string, string> {
  // ✨ Dynamic (full-stack) mode wraps the Next.js app in a monorepo alongside a
  // Node/Express/MongoDB/Redis backend + a shared types package. Static mode is
  // today's single-app scaffold, byte-for-byte unchanged.
  if (ctx.mode === "dynamic") return buildFullStack(ctx);
  return buildApp(ctx);
}

/**
 * Build the single Next.js app as a `{ path: contents }` map — the `static`
 * scaffold, and (path-prefixed) the `frontend/` half of a `dynamic` monorepo.
 */
function buildApp(ctx: Ctx): Record<string, string> {
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
  // The animated backdrop is used by every content page (via the UI page shell),
  // so it ships in all templates — including the dashboard's about/legal pages.
  files["components/aurora.tsx"] = aurora();
  if (isDash) {
    // The dashboard shell (sidebar) is shared by its home + stub pages.
    files["components/dashboard-shell.tsx"] = dashboardShell(ctx);
  } else {
    // Global marketing chrome — auto-built header + footer from the page map.
    files["components/site-header.tsx"] = siteHeader(ctx);
    files["components/site-footer.tsx"] = siteFooter(ctx);
    files["components/announcement-bar.tsx"] = announcementBar();
    // ✨ Bespoke, personalised hero illustration (marketing homes only).
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

  // ✨ The marketplace template documents its (all optional) payment env vars.
  if (ctx.template.key === "marketplace") {
    files[".env.example"] = marketEnvExample();
  }

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

  // ✨ Composable feature add-ons (ai-chat, rag, …). Strictly additive: with no
  // features selected this is a no-op and the scaffold is byte-for-byte today's.
  applyFeatures(files, ctx);

  return files;
}

/* --------------------------- feature add-on engine --------------------------- */

/**
 * Merge every selected {@link FeatureDef} into an already-built file map:
 * its files, its `package.json` deps + scripts, its `.env.example` entries and
 * a generated `LEARN.md` onboarding checklist. Order-independent and mutation-
 * safe — a no-op when `ctx.features` is empty (base scaffold stays identical).
 */
export function applyFeatures(files: Record<string, string>, ctx: Ctx): void {
  const features = ctx.features;
  if (!features.length) return;

  // 1. Feature files — namespaced under each feature's own routes, so they can
  //    never collide with the base scaffold or with each other.
  for (const feat of features) {
    for (const [rel, content] of Object.entries(feat.files(ctx))) {
      files[rel] = content;
    }
  }

  // 2. Merge deps + scripts into package.json (parse → merge → re-stringify with
  //    the exact same 2-space + trailing-newline formatting as pkgJson()).
  const addDeps: Record<string, string> = {};
  const addScripts: Record<string, string> = {};
  for (const feat of features) {
    Object.assign(addDeps, feat.deps);
    if (feat.scripts) Object.assign(addScripts, feat.scripts);
  }
  if (files["package.json"]) {
    const pkg = JSON.parse(files["package.json"]) as {
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    pkg.dependencies = { ...(pkg.dependencies ?? {}), ...addDeps };
    if (Object.keys(addScripts).length) pkg.scripts = { ...(pkg.scripts ?? {}), ...addScripts };
    files["package.json"] = JSON.stringify(pkg, null, 2) + "\n";
  }

  // 3. Append env entries (with comment lines) to .env.example (create if absent).
  //    Env NAMEs are de-duped across features and against the base file, so two
  //    features that share a variable (e.g. LACSPACE_AI_*) only document it once.
  const existingEnv = new Set(
    (files[".env.example"] ?? "").split("\n").map((l) => l.match(/^\s*#?\s*([A-Z0-9_]+)=/)?.[1]).filter(Boolean) as string[],
  );
  const envLines: string[] = [];
  for (const feat of features) {
    if (!feat.env || Object.keys(feat.env).length === 0) continue;
    const fresh = Object.entries(feat.env).filter(([name]) => !existingEnv.has(name));
    if (fresh.length === 0) continue;
    envLines.push("", `# --- ${feat.label} (${feat.key}) ---`);
    for (const [name, comment] of fresh) {
      if (comment) envLines.push(`# ${comment}`);
      envLines.push(`${name}=`);
      existingEnv.add(name);
    }
  }
  if (envLines.length) {
    const base = files[".env.example"] ?? "";
    files[".env.example"] = (base.endsWith("\n") || base === "" ? base : base + "\n") + envLines.join("\n") + "\n";
  }

  // 4. Onboarding checklist — LEARN.md gathers every feature's next-steps.
  files["LEARN.md"] = learnMd(ctx, features);
}

/** Generate the LEARN.md onboarding checklist for the selected features. */
function learnMd(ctx: Ctx, features: FeatureDef[]): string {
  const blocks = features.map((f) => {
    const steps = f.nextSteps.map((s) => `- [ ] ${s}`).join("\n");
    const learn = f.learn ? `\n\nLearn more → ${f.learn}` : "";
    return `## ${f.label} \`(${f.key})\`\n\n${f.description}\n\n${steps}${learn}`;
  }).join("\n\n");
  return `# 🧭 Learn ${ctx.name}

You scaffolded **${ctx.template.label}** with ${features.length} feature add-on${features.length === 1 ? "" : "s"}:
${features.map((f) => `\`${f.key}\``).join(" · ")}.

Work through the checklist below — each item is a real next step.

${blocks}

---

Every add-on is built from zero-dependency \`@lacspace/*\` packages. Browse them all → https://lacspace.com/packages
`;
}

/**
 * The composable feature registry — flagship, optional add-ons that layer onto
 * any template. Mirrors {@link SECTIONS}: read it with {@link listFeatures} /
 * {@link getFeature}, request it with `--with <key>` or `add <key>`.
 */
export const FEATURES: FeatureDef[] = [
  {
    key: "ai-chat",
    label: "AI chat",
    description: "A streaming AI chat route + UI — free & local by default (Ollama), keyless.",
    deps: {
      "@lacspace/ai": "^1.1.0",
      "@lacspace/prompt": "^1.1.0",
      "@lacspace/stream": "^1.1.0",
      "@lacspace/providers": "^1.0.0",
      "@lacspace/memory": "^1.0.0",
      "@lacspace/moderation": "^1.0.0",
    },
    env: {
      LACSPACE_AI_PROVIDER: "Which provider preset to use (default: ollama — free & local, no key).",
      LACSPACE_AI_BASE_URL: "Override the provider base URL (default Ollama: http://localhost:11434).",
      LACSPACE_AI_MODEL: "Chat model id (default: llama3.2).",
      LACSPACE_AI_API_KEY: "Only needed for a hosted provider — leave blank for local Ollama.",
    },
    files: (ctx) => ({
      "app/api/chat/route.ts": aiChatRoute(ctx),
      "app/chat/page.tsx": aiChatPage(ctx),
    }),
    nextSteps: [
      "🆓 Free local AI — install Ollama (https://ollama.com), then run `ollama pull llama3.2`.",
      "Run `npm run dev` and open http://localhost:3000/chat.",
      "Prefer a hosted model? Set LACSPACE_AI_* in .env (e.g. LACSPACE_AI_PROVIDER=groq + LACSPACE_AI_API_KEY=…).",
    ],
    learn: "https://developer.lacspace.com/packages/ai",
  },
  {
    key: "rag",
    label: "RAG — chat with your docs",
    description: "Index your markdown/text and answer grounded questions with cited sources. Keyless & local (Ollama).",
    deps: {
      "@lacspace/rag": "^1.0.0",
      "@lacspace/embeddings": "^1.0.0",
      "@lacspace/vector": "^1.0.0",
      "@lacspace/chunk": "^1.1.0",
      "@lacspace/rerank": "^1.0.0",
      "@lacspace/providers": "^1.0.0",
      "@lacspace/ai": "^1.1.0",
    },
    scripts: { "rag:index": "node scripts/index-content.mjs" },
    env: {
      LACSPACE_AI_PROVIDER: "Which provider preset to use (default: ollama — free & local, no key).",
      LACSPACE_AI_BASE_URL: "Override the provider base URL (default Ollama: http://localhost:11434).",
      LACSPACE_AI_MODEL: "Chat model id used to answer (default: llama3.2).",
      LACSPACE_AI_API_KEY: "Only needed for a hosted provider — leave blank for local Ollama.",
      LACSPACE_EMBED_MODEL: "Embedding model id (default: nomic-embed-text).",
    },
    files: (ctx) => ({
      "content/welcome.md": ragSampleDoc(ctx),
      "scripts/index-content.mjs": ragIndexScript(ctx),
      "app/api/ask/route.ts": ragAskRoute(ctx),
      "app/ask/page.tsx": ragAskPage(ctx),
    }),
    nextSteps: [
      "🆓 Free & local — install Ollama (https://ollama.com), then `ollama pull nomic-embed-text` and `ollama pull llama3.2`.",
      "Add markdown/text files to content/, then run `npm run rag:index` to build .rag-index.json.",
      "Run `npm run dev` and open http://localhost:3000/ask.",
    ],
    learn: "https://developer.lacspace.com/packages/rag",
  },
  {
    key: "content",
    label: "Content / blog",
    description: "A markdown content section (/updates) for any template — plus an RSS feed and an llms.txt. Drop in .md files, get pages.",
    deps: {
      "@lacspace/markdown": "^1.1.0",
      "@lacspace/rss": "^1.4.0",
      "@lacspace/llms-txt": "^1.4.0",
    },
    files: (ctx) => ({
      "content/updates/welcome.md": contentSampleWelcome(ctx),
      "content/updates/building-in-public.md": contentSampleSecond(),
      "lib/content.ts": contentLib(),
      "app/updates/page.tsx": updatesListPage(),
      "app/updates/[slug]/page.tsx": updatePostPage(),
      "app/feed.xml/route.ts": feedRoute(),
      "app/llms.txt/route.ts": llmsRoute(),
    }),
    nextSteps: [
      "Add markdown files to content/updates/ — each becomes a page at /updates/<name>.",
      "Run `npm run dev` and open http://localhost:3000/updates, /feed.xml and /llms.txt.",
      "Set NEXT_PUBLIC_SITE_URL in .env so the feed and llms.txt links are absolute.",
    ],
    learn: "https://developer.lacspace.com/packages/markdown",
  },
  {
    key: "search",
    label: "Search",
    description: "Instant, keyless full-text search (BM25) over your markdown content — a search box + /search page + API route. No key, no service.",
    deps: {
      "@lacspace/rerank": "^1.0.0",
      "@lacspace/markdown": "^1.1.0",
    },
    files: () => ({
      "app/api/search/route.ts": searchRoute(),
      "components/search.tsx": searchBox(),
      "app/search/page.tsx": searchPage(),
    }),
    nextSteps: [
      "Add markdown to content/ (e.g. the `content` add-on's content/updates/) — search indexes it automatically.",
      "Run `npm run dev` and open http://localhost:3000/search, or drop <Search /> into your header.",
      "Want semantic search? Upgrade to @lacspace/embeddings + @lacspace/vector (keyless-local via Ollama).",
    ],
    learn: "https://developer.lacspace.com/packages/rerank",
  },
];

/* ------------------------- feature: ai-chat (files) ------------------------- */

// app/api/chat/route.ts — a keyless, streaming chat endpoint.
const aiChatRoute = (_ctx: Ctx): string => `import { resolveConfig } from "@lacspace/providers";
import { stream } from "@lacspace/ai";
import type { Message } from "@lacspace/ai";
import { detectPromptInjection } from "@lacspace/moderation";
import { toReadableStream } from "@lacspace/stream";

// This route runs on Node (it talks to your local Ollama / a hosted LLM).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // 1. Read the conversation the <ChatUI/> sent us.
  const { messages } = (await req.json()) as { messages: Message[] };

  // 2. Guard the newest user turn against prompt-injection / jailbreak attempts.
  //    Learn more → https://developer.lacspace.com/packages/moderation
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const userText = typeof lastUser?.content === "string" ? lastUser.content : "";
  const check = detectPromptInjection(userText);
  if (check.flagged) {
    return new Response(JSON.stringify({ error: "That message was blocked by the safety guard." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Resolve provider config from env — KEYLESS by default (local Ollama).
  //    Learn more → https://developer.lacspace.com/packages/providers
  const cfg = resolveConfig(process.env.LACSPACE_AI_PROVIDER ?? "ollama", {
    baseUrl: process.env.LACSPACE_AI_BASE_URL,        // default: http://localhost:11434
    model: process.env.LACSPACE_AI_MODEL,             // default: llama3.2
    apiKey: process.env.LACSPACE_AI_API_KEY,          // only for hosted providers
  });

  // Ollama speaks its own dialect but also exposes an OpenAI-compatible surface
  // at /v1 — so we always call it (and any hosted provider) as "openai-compatible".
  const baseUrl = cfg.apiStyle === "ollama" ? cfg.baseUrl.replace(/\\/+$/, "") + "/v1" : cfg.baseUrl;
  const model = cfg.model ?? "llama3.2";

  // 4. Stream the reply. @lacspace/ai yields unified {type:"text", delta} chunks;
  //    we encode each token and hand the stream to the browser via @lacspace/stream.
  //    Learn more → https://developer.lacspace.com/packages/ai
  const encoder = new TextEncoder();
  async function* tokens() {
    for await (const chunk of stream({
      provider: "openai-compatible",
      baseUrl,
      apiKey: cfg.apiKey,
      model,
      headers: cfg.headers,
      messages,
    })) {
      if (chunk.type === "text") yield encoder.encode(chunk.delta);
    }
  }

  // Learn more → https://developer.lacspace.com/packages/stream
  return new Response(toReadableStream(tokens()), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
  });
}
`;

// app/chat/page.tsx — a clean streaming chat UI (uses the scaffold's design tokens).
const aiChatPage = (ctx: Ctx): string => `"use client";

import { useState, useRef, useEffect } from "react";

interface Msg { role: "user" | "assistant"; content: string; }

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);

    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages([...next, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok || !res.body) throw new Error("The chat endpoint returned an error.");

      // Read the streamed reply token-by-token and append it live.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages([...next, { role: "assistant", content: acc }]);
      }
    } catch {
      setMessages([...next, { role: "assistant", content: "⚠️ Couldn't reach the model. Is Ollama running? (ollama.com)" }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col px-6 py-10">
      <header className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-widest gradient-text">AI · ${ctx.template.siteName}</p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Chat</h1>
        <p className="mt-2 text-muted">Free &amp; local by default — powered by Ollama and the Lacspace AI Kit. No key required.</p>
      </header>

      <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-hairline bg-surface p-4">
        {messages.length === 0 && (
          <p className="py-16 text-center text-muted">Ask me anything to get started.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={
              "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed " +
              (m.role === "user" ? "gradient-bg on-accent" : "border border-hairline bg-app")
            }>
              {m.content || (busy ? "…" : "")}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={send} className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          className="w-full rounded-xl border border-hairline bg-surface px-4 py-3 outline-none focus:border-hairline"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-xl gradient-bg on-accent px-5 py-3 text-sm font-semibold shimmer disabled:opacity-50"
        >
          {busy ? "…" : "Send"}
        </button>
      </form>
    </section>
  );
}
`;

/* --------------------------- feature: rag (files) --------------------------- */

// content/welcome.md — a sample doc so /ask works immediately after indexing.
const ragSampleDoc = (ctx: Ctx): string => `# Welcome to ${ctx.template.siteName}

This markdown file lives in \`content/\`. Run \`npm run rag:index\` to chunk and embed
everything under \`content/\` into a local vector index (\`.rag-index.json\`), then open
\`/ask\` to ask grounded questions about it.

## How this works

- **Chunking** — \`@lacspace/chunk\` splits each document into overlapping passages.
- **Embeddings** — \`@lacspace/embeddings\` turns each passage into a vector using a
  local Ollama model (\`nomic-embed-text\`) — no API key needed.
- **Retrieval** — \`@lacspace/vector\` + \`@lacspace/rag\` find the passages closest to
  your question, and \`@lacspace/rerank\` re-orders them for relevance.
- **Answering** — \`@lacspace/ai\` writes a grounded answer and cites its sources.

## Tips

Add your own \`.md\` or \`.txt\` files here, re-run \`npm run rag:index\`, and ask away.
Everything runs on your machine — free, keyless and private.
`;

// scripts/index-content.mjs — build the local vector index from content/.
const ragIndexScript = (_ctx: Ctx): string => `// Build a local vector index from everything under content/.
// Run: npm run rag:index   (needs Ollama: \`ollama pull nomic-embed-text\`)
import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, extname, relative } from "node:path";
import { splitText } from "@lacspace/chunk";
import { embed } from "@lacspace/embeddings";
import { createVectorStore } from "@lacspace/vector";

const ROOT = process.cwd();
const CONTENT_DIR = join(ROOT, "content");
const OUT = join(ROOT, ".rag-index.json");

// Which files to index (add more extensions if you like).
const EXTS = new Set([".md", ".markdown", ".txt", ".mdx"]);

// Recursively collect readable files under content/.
async function walk(dir) {
  const out = [];
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (EXTS.has(extname(e.name).toLowerCase())) out.push(full);
  }
  return out;
}

async function main() {
  const files = await walk(CONTENT_DIR);
  if (files.length === 0) {
    console.error("No content found. Add .md/.txt files under content/ and re-run.");
    process.exit(1);
  }

  // 1. Chunk every document into overlapping passages via @lacspace/chunk.
  const records = [];
  for (const file of files) {
    const raw = await readFile(file, "utf8");
    const source = relative(CONTENT_DIR, file);
    const chunks = splitText(raw, { chunkSize: 900, chunkOverlap: 150 });
    chunks.forEach((chunk, i) => {
      records.push({ id: \`\${source}#\${i}\`, text: chunk.text, source });
    });
  }

  // 2. Embed all passages with a local Ollama model (keyless) via @lacspace/embeddings.
  const model = process.env.LACSPACE_EMBED_MODEL ?? "nomic-embed-text";
  const baseUrl = process.env.LACSPACE_AI_BASE_URL ?? "http://localhost:11434";
  console.log(\`Embedding \${records.length} chunks with \${model}…\`);
  const vectors = await embed(records.map((r) => r.text), { provider: "ollama", model, baseUrl });

  // 3. Store them in an in-memory vector store, then serialise to .rag-index.json.
  const store = createVectorStore({ metric: "cosine" });
  store.upsert(records.map((r, i) => ({ id: r.id, vector: vectors[i], text: r.text, metadata: { source: r.source } })));

  await writeFile(OUT, JSON.stringify(store.toJSON()));
  console.log(\`✓ Wrote \${OUT} (\${records.length} chunks from \${files.length} files).\`);
}

main().catch((err) => { console.error(err); process.exit(1); });
`;

// app/api/ask/route.ts — retrieve grounded context, then answer + cite sources.
const ragAskRoute = (_ctx: Ctx): string => `import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fromJSON } from "@lacspace/vector";
import { createEmbedder } from "@lacspace/embeddings";
import { createRag } from "@lacspace/rag";
import { rerank } from "@lacspace/rerank";
import { resolveConfig } from "@lacspace/providers";
import { chat } from "@lacspace/ai";
import type { Message } from "@lacspace/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { question } = (await req.json()) as { question: string };
  if (!question || !question.trim()) {
    return Response.json({ error: "Ask a question." }, { status: 400 });
  }

  // 1. Load the local index built by \`npm run rag:index\`.
  let store;
  try {
    const raw = await readFile(join(process.cwd(), ".rag-index.json"), "utf8");
    store = fromJSON(JSON.parse(raw));
  } catch {
    return Response.json({ error: "No index found. Run \`npm run rag:index\` first." }, { status: 503 });
  }

  // 2. Config — keyless local Ollama by default.
  //    Learn more → https://developer.lacspace.com/packages/providers
  const cfg = resolveConfig(process.env.LACSPACE_AI_PROVIDER ?? "ollama", {
    baseUrl: process.env.LACSPACE_AI_BASE_URL,
    model: process.env.LACSPACE_AI_MODEL,
    apiKey: process.env.LACSPACE_AI_API_KEY,
  });
  const embedModel = process.env.LACSPACE_EMBED_MODEL ?? "nomic-embed-text";
  const embedBaseUrl = cfg.apiStyle === "ollama" ? cfg.baseUrl : (process.env.LACSPACE_AI_BASE_URL ?? "http://localhost:11434");

  // 3. Retrieve the closest passages via @lacspace/rag + @lacspace/embeddings.
  //    Learn more → https://developer.lacspace.com/packages/rag
  const embedder = createEmbedder({ provider: "ollama", model: embedModel, baseUrl: embedBaseUrl });
  const rag = createRag({ embed: embedder, store });
  const hits = await rag.retrieve(question, { k: 8 });

  // 4. Re-rank for relevance and keep the best few. @lacspace/rerank blends the
  //    vector score with a lexical match — no second model call needed.
  //    Learn more → https://developer.lacspace.com/packages/rerank
  const ranked = await rerank(question, hits.map((h) => ({ id: h.id, text: h.text, score: h.score })), { k: 4 });

  // 5. Build a grounded prompt and answer with @lacspace/ai.
  //    Learn more → https://developer.lacspace.com/packages/ai
  const context = ranked.map((d, i) => \`[\${i + 1}] \${d.text}\`).join("\\n\\n");
  const messages: Message[] = [
    { role: "system", content: "You answer strictly from the provided context. If the answer isn't there, say you don't know. Cite sources as [n]." },
    { role: "user", content: \`Context:\\n\${context}\\n\\nQuestion: \${question}\` },
  ];

  const baseUrl = cfg.apiStyle === "ollama" ? cfg.baseUrl.replace(/\\/+$/, "") + "/v1" : cfg.baseUrl;
  const res = await chat({
    provider: "openai-compatible",
    baseUrl,
    apiKey: cfg.apiKey,
    model: cfg.model ?? "llama3.2",
    headers: cfg.headers,
    messages,
  });

  const sources = ranked.map((d, i) => ({ n: i + 1, id: d.id }));
  return Response.json({ answer: res.text, sources });
}
`;

// app/ask/page.tsx — an "ask your content" UI.
const ragAskPage = (ctx: Ctx): string => `"use client";

import { useState } from "react";

interface Source { n: number; id: string; }

export default function AskPage() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true); setError(""); setAnswer(""); setSources([]);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setAnswer(data.answer);
      setSources(data.sources ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest gradient-text">RAG · ${ctx.template.siteName}</p>
      <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Ask your content</h1>
      <p className="mt-2 text-muted">Grounded answers from your own docs — indexed and answered locally. Run <code className="rounded bg-panel px-1.5 py-0.5 text-sm">npm run rag:index</code> first.</p>

      <form onSubmit={ask} className="mt-8 flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What is this project about?"
          className="w-full rounded-xl border border-hairline bg-surface px-4 py-3 outline-none focus:border-hairline"
        />
        <button
          type="submit"
          disabled={busy || !question.trim()}
          className="rounded-xl gradient-bg on-accent px-5 py-3 text-sm font-semibold shimmer disabled:opacity-50"
        >
          {busy ? "…" : "Ask"}
        </button>
      </form>

      {error && <p className="mt-6 rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-400">{error}</p>}

      {answer && (
        <div className="mt-8 card p-6">
          <p className="whitespace-pre-wrap leading-relaxed">{answer}</p>
          {sources.length > 0 && (
            <div className="mt-5 border-t border-hairline pt-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">Sources</p>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {sources.map((s) => (
                  <li key={s.n}>[{s.n}] <code className="text-fg">{s.id}</code></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
`;

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
    { path: "/careers", label: "Careers", group: "Company", real: true },
    { path: "/faq", label: "FAQ", group: "Resources", real: true },
    { path: "/privacy", label: "Privacy", group: "Resources" },
    { path: "/terms", label: "Terms", group: "Resources" },
  ];
  const specific: Record<string, PageSpec[]> = {
    personal: [
      { path: "/work", label: "Work", nav: true, group: "Product", real: true },
      { path: "/blog", label: "Blog", nav: true, group: "Product" },
      { path: "/uses", label: "Uses", group: "Resources", real: true },
    ],
    business: [
      { path: "/services", label: "Services", nav: true, group: "Product", real: true },
      { path: "/work", label: "Work", nav: true, group: "Product", real: true },
      { path: "/pricing", label: "Pricing", nav: true, group: "Product", real: true },
    ],
    ecommerce: [
      { path: "/shop", label: "Shop", nav: true, group: "Product", real: true },
      { path: "/collections", label: "Collections", nav: true, group: "Product", real: true },
      { path: "/cart", label: "Cart", group: "Product", real: true },
      { path: "/shipping", label: "Shipping", group: "Resources" },
      { path: "/returns", label: "Returns", group: "Resources" },
    ],
    saas: [
      { path: "/features", label: "Features", nav: true, group: "Product", real: true },
      { path: "/pricing", label: "Pricing", nav: true, group: "Product", real: true },
      { path: "/integrations", label: "Integrations", group: "Product", real: true },
      { path: "/changelog", label: "Changelog", group: "Resources", real: true },
    ],
    blog: [
      { path: "/blog", label: "Articles", nav: true, group: "Product", real: true },
      { path: "/topics", label: "Topics", nav: true, group: "Product", real: true },
      { path: "/newsletter", label: "Newsletter", group: "Resources", real: true },
    ],
    docs: [
      { path: "/docs", label: "Docs", nav: true, group: "Product", real: true },
      { path: "/guides", label: "Guides", nav: true, group: "Product", real: true },
      { path: "/api-reference", label: "API", nav: true, group: "Product", real: true },
      { path: "/changelog", label: "Changelog", group: "Resources", real: true },
    ],
    restaurant: [
      { path: "/menu", label: "Menu", nav: true, group: "Product", real: true },
      { path: "/reservations", label: "Reservations", nav: true, group: "Product", real: true },
      { path: "/gallery", label: "Gallery", nav: true, group: "Product", real: true },
      { path: "/events", label: "Private events", group: "Resources", real: true },
    ],
    marketplace: [
      { path: "/shop", label: "Shop", nav: true, group: "Product", real: true },
      { path: "/cart", label: "Cart", group: "Product", real: true },
      { path: "/checkout", label: "Checkout", group: "Product", real: true },
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
  const isMarket = ctx.template.key === "marketplace";
  // The marketplace uses a self-contained cart island (its own @lacspace/cart
  // store) so the header stays free of cart wiring.
  if (isMarket) return marketHeader(ctx);
  const cartImport = isEcom ? `\nimport { useCart } from "@/lib/store";\nimport { useIsMounted } from "@lacspace/hooks";` : "";
  const cartHook = isEcom
    ? `\n  const count = useCart((s) => s.items.length);\n  const mounted = useIsMounted();`
    : "";
  const cartBtn = isEcom
    ? `
          <Link href="/cart" aria-label="Cart" className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-muted transition hover:text-fg">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
            {mounted() && count > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full gradient-bg px-1 text-[10px] font-bold on-accent">{count}</span>
            ) : null}
          </Link>`
    : "";
  return `"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUI } from "@/lib/store";
import { ThemeToggle } from "./theme-toggle";${cartImport}

const LINKS = [${linkLiteral(pagesFor(ctx).filter((p) => p.nav))}];

export function SiteHeader() {
  const open = useUI((s) => s.navOpen);
  const toggle = useUI((s) => s.toggleNav);
  const setOpen = useUI((s) => s.setNavOpen);
  const pathname = usePathname();${cartHook}
  // Sticky glass header that tightens and gains a hairline once you scroll.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className={"sticky top-0 z-40 transition-all duration-300 " + (scrolled ? "glass shadow-sm" : "border-b border-transparent bg-transparent")}>
      <nav className={"mx-auto flex max-w-6xl items-center justify-between px-6 transition-all duration-300 " + (scrolled ? "py-3" : "py-5")}>
        <Link href="/" className="text-lg font-black tracking-tight gradient-text">${ctx.template.siteName}</Link>
        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link key={l.href} href={l.href} className={"rounded-full px-3.5 py-1.5 text-sm font-medium transition " + (active ? "bg-surface text-fg" : "text-muted hover:bg-surface hover:text-fg")}>{l.label}</Link>
            );
          })}
          <div className="ml-2 flex items-center gap-2"><ThemeToggle />${cartBtn}</div>
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />${cartBtn}
          <button type="button" aria-label="Menu" onClick={toggle} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-muted transition hover:text-fg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </button>
        </div>
      </nav>
      {open ? (
        <div className="glass border-t border-hairline md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-3">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-2 text-muted transition hover:bg-surface hover:text-fg">{l.label}</Link>
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
import { Newsletter } from "@/components/ui";

const GROUPS = [${groupsLiteral}];

export function SiteFooter() {
  return (
    <footer className="relative mt-24 border-t border-hairline">
      <div className="mx-auto max-w-6xl px-6">
        {/* newsletter island — floats over the fold between page and footer */}
        <div className="-mt-16 mb-16">
          <Newsletter title="Stay in the loop" subtitle="Occasional updates from ${ctx.template.siteName}. No spam — unsubscribe anytime." />
        </div>
        <div className="grid gap-10 pb-4 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="text-lg font-black tracking-tight gradient-text">${ctx.template.siteName}</div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">${ctx.template.siteDescription}</p>
            <div className="mt-5 flex gap-2">
              {["𝕏", "in", "gh"].map((s) => (
                <span key={s} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-xs font-semibold text-muted transition hover:border-[color:var(--accent-to)] hover:text-fg">{s}</span>
              ))}
            </div>
          </div>
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="text-xs font-semibold uppercase tracking-widest text-faint">{g.title}</div>
              <ul className="mt-4 space-y-2.5 text-sm text-muted">
                {g.links.map((l) => (
                  <li key={l.href}><Link href={l.href} className="transition hover:text-fg">{l.label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-hairline py-8 text-sm text-faint sm:flex-row sm:items-center sm:justify-between">
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
    <div className="relative gradient-bg px-10 py-2 text-center text-sm font-medium on-accent">
      ✨ Built with the Lacspace React Kit —{" "}
      <a href="https://lacspace.com/packages" className="underline underline-offset-2">explore the packages</a>
      <button type="button" aria-label="Dismiss" onClick={dismiss} className="absolute right-3 top-1/2 -translate-y-1/2 text-lg leading-none on-accent/60 hover:on-accent">×</button>
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
        <Link href="/" className="gradient-bg rounded-full px-6 py-3 font-semibold on-accent">Back home</Link>
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
  return `"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeToggle } from "./theme-toggle";

const NAV = [${linkLiteral(nav)}];

export function DashboardShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-hairline bg-surface/40 p-5 md:flex">
        <div className="mb-8 flex items-center justify-between px-2">
          <Link href="/" className="text-lg font-black tracking-tight gradient-text">${ctx.template.siteName}</Link>
          <ThemeToggle />
        </div>
        <nav className="flex-1 space-y-1 text-sm">
          {NAV.map((l) => {
            const active = pathname === l.href;
            return (
              <Link key={l.href} href={l.href} className={"flex items-center gap-2 rounded-xl px-3 py-2 font-medium transition " + (active ? "gradient-bg on-accent shadow-sm" : "text-muted hover:bg-surface hover:text-fg")}>
                <span aria-hidden className={"h-1.5 w-1.5 rounded-full " + (active ? "bg-[color:var(--on-accent)]" : "bg-current opacity-40")} />
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 rounded-2xl border border-hairline p-4 text-xs text-muted">
          <p className="font-semibold text-fg">Need a hand?</p>
          <p className="mt-1">Read the docs or reach the team.</p>
          <Link href="/help" className="mt-3 inline-block rounded-full gradient-bg px-3 py-1.5 font-semibold on-accent">Get help</Link>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6 md:p-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
            {subtitle ? <p className="mt-1.5 text-muted">{subtitle}</p> : null}
          </div>
          <div className="md:hidden"><ThemeToggle /></div>
        </div>
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
          <div className="mb-5 flex items-center justify-between">
            <div><h2 className="font-semibold tracking-tight">Revenue</h2><p className="text-sm text-muted">Last 12 months</p></div>
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400">▲ 12.4%</span>
          </div>
          <AreaChart data={[12, 18, 15, 22, 20, 28, 26, 34, 30, 38, 42, 48]} />
        </div>
        <div className="rounded-2xl border border-hairline bg-surface p-6">
          <div className="mb-5 font-semibold tracking-tight">Recent activity</div>
          <div className="space-y-4">
            {[
              { who: "Ava Chen", what: "upgraded to Pro", when: "2m ago" },
              { who: "Order #4821", what: "was paid", when: "18m ago" },
              { who: "Liam Patel", what: "started a trial", when: "1h ago" },
              { who: "Refund #204", what: "was issued", when: "3h ago" },
            ].map((e) => (
              <div key={e.who} className="flex items-center gap-3 text-sm">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full gradient-bg text-xs font-bold on-accent">{e.who.slice(0, 1)}</span>
                <span className="min-w-0 flex-1 truncate text-muted"><span className="font-medium text-fg">{e.who}</span> {e.what}</span>
                <span className="shrink-0 text-faint">{e.when}</span>
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
import { Section, Pill, StatCard, FeatureCard, Testimonial, Steps, CTABand, Bento, AreaChart, Newsletter, Badge, Callout, Accordion, FAQ, Tabs, Timeline, PricingTable, LogoCloud, StatBand, TeamGrid, FeatureSplit, Gallery, Rating, Progress, Breadcrumbs, Avatar, AvatarGroup } from "@/components/ui";

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
              {tier.highlight ? <span className="mb-4 inline-block w-fit rounded-full gradient-bg px-3 py-1 text-xs font-bold on-accent">Most popular</span> : null}
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
              <Link href="/contact" className={"mt-8 rounded-full px-6 py-3 text-center font-semibold transition " + (tier.highlight ? "gradient-bg on-accent" : "border border-hairline hover:bg-app")}>{tier.cta}</Link>
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
          <button type="button" onClick={() => add({ id: p.id, name: p.name, price: p.price })} className="mt-4 rounded-full gradient-bg px-4 py-2 text-sm font-semibold on-accent transition hover:opacity-90">Add to bag</button>
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
        <Link href="/shop" className="mt-6 inline-block rounded-full gradient-bg px-6 py-3 font-semibold on-accent">Browse the shop</Link>
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
      <button type="button" className="mt-8 w-full rounded-full gradient-bg px-6 py-3 font-semibold on-accent">Checkout</button>
    </div>
  );
}
`;

/* ============================ marketplace template ============================ */

// lib/products.ts — an in-memory catalogue. Prices are integer paisa (minor units).
const productsLib = (ctx: Ctx): string => `// The catalogue for ${ctx.template.siteName}. Swap this for a database or CMS —
// every price is an integer in **paisa** (minor units), so there is never a
// floating-point rounding bug. NPR 450.00 is written as 45000.

export interface Product {
  slug: string;
  name: string;
  /** Price in integer minor units (paisa). */
  price: number;
  /** A placeholder visual — swap for a real image URL when you have one. */
  emoji: string;
  /** Optional image URL (falls back to the emoji tile). */
  image?: string;
  blurb: string;
  /** Shipping weight in grams — drives the weight-based shipping rate. */
  weight: number;
}

export const PRODUCTS: Product[] = [
  { slug: "himalayan-gold-tea", name: "Himalayan Gold Tea", price: 45000, emoji: "\\u{1F375}", blurb: "Hand-picked orthodox black tea from the high hills — bright, malty and endlessly re-steepable.", weight: 250 },
  { slug: "lokta-notebook", name: "Lokta Paper Notebook", price: 68000, emoji: "\\u{1F4D3}", blurb: "A5 notebook bound in handmade lokta paper. 160 pages that take fountain-pen ink beautifully.", weight: 320 },
  { slug: "pashmina-scarf", name: "Pashmina Scarf", price: 320000, emoji: "\\u{1F9E3}", blurb: "Feather-light, ethically sourced pashmina, hand-loomed in a natural undyed grey.", weight: 180 },
  { slug: "singing-bowl", name: "Hand-hammered Singing Bowl", price: 540000, emoji: "\\u{1F514}", blurb: "A seven-metal bowl with a long, resonant hum. Comes with a wooden striker and cushion.", weight: 900 },
  { slug: "ceramic-mug", name: "Glazed Ceramic Mug", price: 52000, emoji: "\\u2615", blurb: "A chunky, wheel-thrown mug in a speckled reactive glaze. Holds a generous 350ml.", weight: 420 },
  { slug: "wool-socks", name: "Merino Wool Socks", price: 38000, emoji: "\\u{1F9E6}", blurb: "Cushioned merino socks that stay warm even when damp — the ones you will keep reaching for.", weight: 120 },
];

export function getProduct(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}
`;

// lib/commerce.ts — composes the Lacspace commerce packages: tax, shipping,
// order + invoice engines and money formatting. Pure + isomorphic, so the quote
// runs on the client (live cart totals) and buildOrder runs in a route handler.
const commerceLib = (ctx: Ctx): string => `import { tax, RATES } from "@lacspace/tax";
import { cheapestQuote, type ShippingMethod } from "@lacspace/shipping";
import { createOrder, orderNumber, type Order } from "@lacspace/order";
import { createInvoice, type Invoice } from "@lacspace/invoice";
import { Money } from "@lacspace/money";

/** Everything internal is integer paisa; this is the only currency the store uses. */
export const CURRENCY = "NPR";
/** Nepal VAT — 13% — straight from @lacspace/tax's RATES table. */
export const VAT_RATE = RATES.NP_VAT;

/** Format integer paisa for display, e.g. 45000 -> "NPR 450.00". */
export function formatMoney(minor: number): string {
  return Money.fromMinor(Math.round(minor), CURRENCY).format();
}

/** A cart line the quote engine understands. All amounts are integer paisa. */
export interface QuoteLine {
  id: string;
  name: string;
  unitPrice: number;
  qty: number;
  /** Per-unit weight in grams (drives shipping). */
  weight?: number;
}

/**
 * The shipping methods offered at checkout. @lacspace/shipping rates each one
 * against the shipment (weight / subtotal / item count); "standard" ships free
 * once the order is large enough.
 */
export const SHIPPING_METHODS: ShippingMethod[] = [
  {
    id: "standard",
    label: "Standard (3-5 days)",
    strategy: "weight",
    bands: [
      { min: 0, max: 500, cost: 8000 },
      { min: 501, max: 2000, cost: 12000 },
      { min: 2001, cost: 20000 },
    ],
    freeOver: 500000,
    etaDays: [3, 5],
  },
  { id: "express", label: "Express (1-2 days)", strategy: "flat", flat: 25000, etaDays: [1, 2] },
];

/** The computed money breakdown for a cart. Every field is integer paisa. */
export interface Quote {
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  itemCount: number;
  currency: string;
  shippingMethod: string;
  /** Paisa still needed to unlock free standard shipping (0 once unlocked). */
  freeShippingRemaining: number;
}

const asQty = (n: number): number => Math.max(0, Math.trunc(n));

/** Compose subtotal + 13% VAT (@lacspace/tax) + cheapest shipping (@lacspace/shipping). */
export function quote(lines: QuoteLine[]): Quote {
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * asQty(l.qty), 0);
  const weight = lines.reduce((sum, l) => sum + (l.weight ?? 0) * asQty(l.qty), 0);
  const itemCount = lines.reduce((sum, l) => sum + asQty(l.qty), 0);

  const vat = tax(subtotal, { rate: VAT_RATE });
  const ship = cheapestQuote(SHIPPING_METHODS, { weight, subtotal, itemCount });
  const shipping = ship?.cost ?? 0;
  const total = subtotal + vat.tax + shipping;
  const freeOver = 500000;

  return {
    subtotal,
    tax: vat.tax,
    shipping,
    total,
    itemCount,
    currency: CURRENCY,
    shippingMethod: ship?.label ?? "-",
    freeShippingRemaining: Math.max(0, freeOver - subtotal),
  };
}

export interface BuildOrderInput {
  lines: QuoteLine[];
  customer?: { name?: string; email?: string };
  paymentMethod: string;
  /** Sequence number for the human-facing order number. */
  seq?: number;
}

export interface BuiltOrder {
  order: Order;
  invoice: Invoice;
  quote: Quote;
}

/** Build an immutable Order (+ Invoice) from cart lines. Used by the checkout API. */
export function buildOrder(input: BuildOrderInput): BuiltOrder {
  const q = quote(input.lines);
  const seq = input.seq ?? Math.floor(Math.random() * 9000) + 1000;
  const number = orderNumber(seq, { prefix: "BZR" });

  const order = createOrder({
    number,
    currency: CURRENCY,
    lines: input.lines.map((l) => ({ sku: l.id, name: l.name, unitPrice: l.unitPrice, qty: asQty(l.qty) })),
    tax: q.tax,
    shipping: q.shipping,
    customer: input.customer,
    meta: { paymentMethod: input.paymentMethod, shippingMethod: q.shippingMethod },
  });

  const invoice = createInvoice({
    number: number.replace("BZR", "INV"),
    currency: CURRENCY,
    seller: { name: ${JSON.stringify(ctx.template.siteName)}, email: "orders@example.com" },
    buyer: { name: input.customer?.name ?? "Guest", email: input.customer?.email },
    lines: input.lines.map((l) => ({ description: l.name, qty: asQty(l.qty), unitPrice: l.unitPrice, taxRate: VAT_RATE })),
    status: "issued",
    issuedAt: Date.now(),
    notes: "Paid via " + input.paymentMethod + ". Shipping: " + q.shippingMethod + ".",
  });

  return { order, invoice, quote: q };
}
`;

// components/cart-store.tsx — a @lacspace/store store wrapping @lacspace/cart,
// persisted to localStorage. SSR-safe: no window access at module scope.
const cartStore = (): string => `"use client";

import { create, persist } from "@lacspace/store";
import { createCart, addItem, setQty, removeItem, type Cart } from "@lacspace/cart";

const EMPTY: Cart = createCart({ currency: "NPR" });

export interface AddInput {
  id: string;
  name: string;
  unitPrice: number;
  qty?: number;
  meta?: Record<string, unknown>;
}

interface CartStore {
  cart: Cart;
  add: (item: AddInput) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
}

// @lacspace/cart is pure & immutable — every op returns a brand-new Cart, which
// is exactly what @lacspace/store wants. persist() guards SSR (no localStorage
// on the server), so this is safe to import anywhere.
export const useCart = create<CartStore>(
  persist(
    (set, get) => ({
      cart: EMPTY,
      add: (item) =>
        set({
          cart: addItem(get().cart, {
            id: item.id,
            name: item.name,
            unitPrice: item.unitPrice,
            qty: item.qty ?? 1,
            meta: item.meta,
          }),
        }),
      setQty: (id, qty) => set({ cart: setQty(get().cart, id, qty) }),
      remove: (id) => set({ cart: removeItem(get().cart, id) }),
      clear: () => set({ cart: createCart({ currency: "NPR" }) }),
    }),
    { name: "market-cart" },
  ),
);
`;

// components/cart-button.tsx — the header cart badge (a small client island).
const cartButton = (): string => `"use client";

import Link from "next/link";
import { useCart } from "@/components/cart-store";
import { useIsMounted } from "@lacspace/hooks";

export function CartButton() {
  const count = useCart((s) => s.cart.items.reduce((n, i) => n + i.qty, 0));
  const mounted = useIsMounted();
  return (
    <Link href="/cart" aria-label="Cart" className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-muted transition hover:text-fg">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
      {mounted() && count > 0 ? (
        <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full gradient-bg px-1 text-[10px] font-bold on-accent">{count}</span>
      ) : null}
    </Link>
  );
}
`;

// components/add-to-cart.tsx — a reusable "Add to cart" client island.
const addToCart = (): string => `"use client";

import { useState } from "react";
import { useCart } from "@/components/cart-store";

export interface AddToCartProduct {
  id: string;
  name: string;
  unitPrice: number;
  weight?: number;
  emoji?: string;
}

export function AddToCart({ product, className = "" }: { product: AddToCartProduct; className?: string }) {
  const add = useCart((s) => s.add);
  const [added, setAdded] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        add({
          id: product.id,
          name: product.name,
          unitPrice: product.unitPrice,
          qty: 1,
          meta: { weight: product.weight ?? 0, emoji: product.emoji ?? "" },
        });
        setAdded(true);
        window.setTimeout(() => setAdded(false), 1200);
      }}
      className={"rounded-full gradient-bg px-4 py-2.5 text-sm font-semibold on-accent transition hover:-translate-y-0.5 " + className}
    >
      {added ? "Added \\u2713" : "Add to cart"}
    </button>
  );
}
`;

// components/site-header.tsx (marketplace variant) — nav + theme + cart island.
const marketHeader = (ctx: Ctx): string => `"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUI } from "@/lib/store";
import { ThemeToggle } from "./theme-toggle";
import { CartButton } from "./cart-button";

const LINKS = [${linkLiteral(pagesFor(ctx).filter((p) => p.nav))}];

export function SiteHeader() {
  const open = useUI((s) => s.navOpen);
  const toggle = useUI((s) => s.toggleNav);
  const setOpen = useUI((s) => s.setNavOpen);
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header className={"sticky top-0 z-40 transition-all duration-300 " + (scrolled ? "glass shadow-sm" : "border-b border-transparent bg-transparent")}>
      <nav className={"mx-auto flex max-w-6xl items-center justify-between px-6 transition-all duration-300 " + (scrolled ? "py-3" : "py-5")}>
        <Link href="/" className="text-lg font-black tracking-tight gradient-text">${ctx.template.siteName}</Link>
        <div className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link key={l.href} href={l.href} className={"rounded-full px-3.5 py-1.5 text-sm font-medium transition " + (active ? "bg-surface text-fg" : "text-muted hover:bg-surface hover:text-fg")}>{l.label}</Link>
            );
          })}
          <div className="ml-2 flex items-center gap-2"><ThemeToggle /><CartButton /></div>
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <CartButton />
          <button type="button" aria-label="Menu" onClick={toggle} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-muted transition hover:text-fg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </button>
        </div>
      </nav>
      {open ? (
        <div className="glass border-t border-hairline md:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-6 py-3">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-2 text-muted transition hover:bg-surface hover:text-fg">{l.label}</Link>
            ))}
          </div>
        </div>
      ) : null}
    </header>
  );
}
`;

// app/page.tsx (marketplace) — hero + a featured product grid with working carts.
const marketplaceHome = (ctx: Ctx): string => {
  const n = ctx.template.siteName;
  return `import { site } from "@/lib/site";
import Link from "next/link";
import { Aurora } from "@/components/aurora";
import { HeroArt } from "@/components/hero-art";
import { LiveStats } from "@/components/live-stats";
import { AddToCart } from "@/components/add-to-cart";
import { PRODUCTS } from "@/lib/products";
import { formatMoney } from "@/lib/commerce";

export const metadata = site.meta({ title: ${JSON.stringify(n)}, path: "/" });

export default function Home() {
  const featured = PRODUCTS.slice(0, 3);
  return (
    <main className="relative min-h-screen overflow-hidden">
      <Aurora />
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-28 md:grid-cols-2">
        <div>
          <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-muted">🛒 Cart to checkout, wired end to end</span>
          <h1 className="text-display mt-6">Shop <span className="gradient-text">${n}</span></h1>
          <p className="lead mt-6 max-w-md">${ctx.template.siteDescription}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/shop" className="shimmer rounded-full gradient-bg px-8 py-3.5 font-semibold on-accent transition hover:-translate-y-0.5">Shop the collection</Link>
            <Link href="/cart" className="rounded-full border border-hairline px-8 py-3.5 font-semibold transition hover:bg-surface">View cart</Link>
          </div>
          <p className="mt-6 text-sm text-muted">Free standard shipping over {formatMoney(500000)} · eSewa &amp; Khalti at checkout.</p>
        </div>
        <HeroArt />
      </section>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-12 flex items-end justify-between">
          <div><p className="text-sm font-semibold uppercase tracking-widest gradient-text">Featured</p><h2 className="mt-3 text-3xl font-bold sm:text-4xl">Fresh in the store</h2></div>
          <Link href="/shop" className="hidden text-sm text-muted underline-offset-4 transition hover:text-fg hover:underline sm:block">See all →</Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((p) => (
            <div key={p.slug} className="card group flex flex-col p-5">
              <Link href={"/product/" + p.slug} className="mb-5 flex aspect-square items-center justify-center overflow-hidden rounded-xl gradient-bg text-7xl on-accent transition group-hover:scale-[1.03]">{p.emoji}</Link>
              <Link href={"/product/" + p.slug} className="font-semibold tracking-tight transition group-hover:text-[color:var(--accent-to)]">{p.name}</Link>
              <div className="mt-1 font-semibold text-muted">{formatMoney(p.price)}</div>
              <div className="mt-4">
                <AddToCart product={{ id: p.slug, name: p.name, unitPrice: p.price, weight: p.weight, emoji: p.emoji }} className="w-full" />
              </div>
            </div>
          ))}
        </div>
      </section>
      ${builtWithSection(ctx)}
    </main>
  );
}
`;
};

// app/shop/page.tsx — the full product grid (server component).
const marketShopPage = (ctx: Ctx): string => `import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";
import { PRODUCTS } from "@/lib/products";
import { formatMoney } from "@/lib/commerce";
import { AddToCart } from "@/components/add-to-cart";

export const metadata: Metadata = site.meta({ title: "Shop", path: "/shop", description: ${JSON.stringify(`Everything in the ${ctx.template.siteName} store.`)} });

export default function Page() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-24">
      <p className="text-sm font-semibold uppercase tracking-widest text-faint">Shop</p>
      <h1 className="mt-3 text-4xl font-bold">Everything in the <span className="gradient-text">store</span></h1>
      <p className="mt-4 max-w-xl text-muted">Prices are exact to the paisa with @lacspace/money, and your cart is saved locally with @lacspace/store.</p>
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {PRODUCTS.map((p) => (
          <div key={p.slug} className="group flex flex-col rounded-2xl border border-hairline bg-surface p-5 transition hover:-translate-y-1">
            <Link href={"/product/" + p.slug} className="mb-4 flex aspect-square items-center justify-center rounded-xl gradient-bg text-6xl">{p.emoji}</Link>
            <Link href={"/product/" + p.slug} className="font-semibold group-hover:opacity-90">{p.name}</Link>
            <p className="mt-1 line-clamp-2 text-sm text-muted">{p.blurb}</p>
            <div className="mt-3 text-muted">{formatMoney(p.price)}</div>
            <div className="mt-4">
              <AddToCart product={{ id: p.slug, name: p.name, unitPrice: p.price, weight: p.weight, emoji: p.emoji }} className="w-full" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
`;

// app/product/[slug]/page.tsx — product detail with static params + Add to cart.
const marketProductPage = (ctx: Ctx): string => `import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { site } from "@/lib/site";
import { PRODUCTS, getProduct } from "@/lib/products";
import { formatMoney } from "@/lib/commerce";
import { AddToCart } from "@/components/add-to-cart";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) return site.meta({ title: "Not found", path: "/product/" + slug });
  return site.meta({ title: product.name, path: "/product/" + slug, description: product.blurb });
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-24">
      <Link href="/shop" className="text-sm text-muted underline underline-offset-4 hover:text-fg">← Back to shop</Link>
      <div className="mt-8 grid gap-12 md:grid-cols-2">
        <div className="flex aspect-square items-center justify-center rounded-3xl gradient-bg text-[10rem]">{product.emoji}</div>
        <div className="flex flex-col justify-center">
          <h1 className="text-4xl font-bold">{product.name}</h1>
          <div className="mt-3 text-2xl font-semibold gradient-text">{formatMoney(product.price)}</div>
          <p className="mt-6 text-lg text-muted">{product.blurb}</p>
          <div className="mt-8 flex items-center gap-4">
            <AddToCart product={{ id: product.slug, name: product.name, unitPrice: product.price, weight: product.weight, emoji: product.emoji }} />
            <Link href="/cart" className="rounded-full border border-hairline px-6 py-2 text-sm font-semibold hover:bg-surface">Go to cart</Link>
          </div>
          <p className="mt-6 text-sm text-muted">Ships in 3-5 days · free over {formatMoney(500000)} · {product.weight}g</p>
        </div>
      </div>
    </main>
  );
}
`;

// app/cart/page.tsx — the live cart view ("use client").
const marketCartPage = (ctx: Ctx): string => `"use client";

import Link from "next/link";
import { useCart } from "@/components/cart-store";
import { quote, formatMoney, type QuoteLine } from "@/lib/commerce";
import { useIsMounted } from "@lacspace/hooks";

export default function Page() {
  const cart = useCart((s) => s.cart);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);
  const mounted = useIsMounted();

  if (!mounted()) {
    return <main className="mx-auto min-h-screen max-w-3xl px-6 py-24 text-center text-muted">Loading your cart…</main>;
  }

  if (cart.items.length === 0) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-6 py-24 text-center">
        <h1 className="text-4xl font-bold">Your <span className="gradient-text">cart</span></h1>
        <p className="mt-4 text-lg text-muted">It's empty for now.</p>
        <Link href="/shop" className="mt-8 inline-block rounded-full gradient-bg px-6 py-3 font-semibold on-accent">Browse the shop</Link>
      </main>
    );
  }

  const lines: QuoteLine[] = cart.items.map((i) => ({
    id: i.id,
    name: i.name ?? i.id,
    unitPrice: i.unitPrice,
    qty: i.qty,
    weight: Number((i.meta && (i.meta as Record<string, unknown>).weight) ?? 0),
  }));
  const q = quote(lines);

  const rows: { label: string; value: string; strong?: boolean }[] = [
    { label: "Subtotal", value: formatMoney(q.subtotal) },
    { label: "VAT (13%)", value: formatMoney(q.tax) },
    { label: "Shipping (" + q.shippingMethod + ")", value: q.shipping === 0 ? "Free" : formatMoney(q.shipping) },
    { label: "Total", value: formatMoney(q.total), strong: true },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-24">
      <h1 className="text-4xl font-bold">Your <span className="gradient-text">cart</span></h1>
      <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_20rem]">
        <ul className="divide-y divide-hairline">
          {cart.items.map((i) => {
            const emoji = String((i.meta && (i.meta as Record<string, unknown>).emoji) ?? "\\u{1F6D2}");
            return (
              <li key={i.id} className="flex items-center gap-4 py-5">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl gradient-bg text-3xl">{emoji}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{i.name}</div>
                  <div className="text-sm text-muted">{formatMoney(i.unitPrice)} each</div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label="Decrease" onClick={() => setQty(i.id, i.qty - 1)} className="h-8 w-8 rounded-full border border-hairline text-muted transition hover:text-fg">−</button>
                  <span className="w-8 text-center tabular-nums">{i.qty}</span>
                  <button type="button" aria-label="Increase" onClick={() => setQty(i.id, i.qty + 1)} className="h-8 w-8 rounded-full border border-hairline text-muted transition hover:text-fg">+</button>
                </div>
                <div className="w-24 text-right font-semibold tabular-nums">{formatMoney(i.unitPrice * i.qty)}</div>
                <button type="button" aria-label="Remove" onClick={() => remove(i.id)} className="text-faint transition hover:text-fg">✕</button>
              </li>
            );
          })}
        </ul>
        <aside className="h-fit rounded-2xl border border-hairline bg-surface p-6">
          <h2 className="font-semibold">Order summary</h2>
          <dl className="mt-5 space-y-3 text-sm">
            {rows.map((r) => (
              <div key={r.label} className={"flex items-center justify-between " + (r.strong ? "border-t border-hairline pt-3 text-base font-bold" : "text-muted")}>
                <dt>{r.label}</dt>
                <dd className="tabular-nums">{r.value}</dd>
              </div>
            ))}
          </dl>
          {q.freeShippingRemaining > 0 ? (
            <p className="mt-4 text-xs text-muted">Add {formatMoney(q.freeShippingRemaining)} more for free shipping.</p>
          ) : null}
          <Link href="/checkout" className="mt-6 block w-full rounded-full gradient-bg px-6 py-3 text-center font-semibold on-accent">Checkout</Link>
          <button type="button" onClick={clear} className="mt-3 block w-full text-center text-sm text-muted transition hover:text-fg">Clear cart</button>
        </aside>
      </div>
    </main>
  );
}
`;

// app/checkout/page.tsx — order summary + details + payment method ("use client").
const marketCheckoutPage = (ctx: Ctx): string => `"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/cart-store";
import { quote, formatMoney, type QuoteLine } from "@/lib/commerce";
import { useIsMounted } from "@lacspace/hooks";

type Method = "esewa" | "khalti" | "cod";

export default function Page() {
  const router = useRouter();
  const cart = useCart((s) => s.cart);
  const clear = useCart((s) => s.clear);
  const mounted = useIsMounted();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [method, setMethod] = useState<Method>("esewa");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!mounted()) {
    return <main className="mx-auto min-h-screen max-w-3xl px-6 py-24 text-center text-muted">Loading…</main>;
  }

  if (cart.items.length === 0) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-6 py-24 text-center">
        <h1 className="text-4xl font-bold">Checkout</h1>
        <p className="mt-4 text-lg text-muted">Your cart is empty.</p>
        <Link href="/shop" className="mt-8 inline-block rounded-full gradient-bg px-6 py-3 font-semibold on-accent">Browse the shop</Link>
      </main>
    );
  }

  const lines: QuoteLine[] = cart.items.map((i) => ({
    id: i.id,
    name: i.name ?? i.id,
    unitPrice: i.unitPrice,
    qty: i.qty,
    weight: Number((i.meta && (i.meta as Record<string, unknown>).weight) ?? 0),
  }));
  const q = quote(lines);
  // Prefix API calls so they work both standalone and under a demo sub-path
  // (basePath). router.push / <Link> already apply basePath automatically.
  const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

  async function submitEsewaForm(amount: number, orderNumber: string) {
    const res = await fetch(BASE + "/api/pay/esewa", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount, orderNumber }),
    });
    const data = (await res.json()) as { action: string; fields: Record<string, string> };
    const form = document.createElement("form");
    form.method = "POST";
    form.action = data.action;
    Object.entries(data.fields).forEach(([k, v]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = k;
      input.value = v;
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(BASE + "/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lines, customer: { name, email, address }, paymentMethod: method }),
      });
      if (!res.ok) throw new Error("Could not place the order.");
      const order = (await res.json()) as { orderNumber: string; total: number };

      if (method === "cod") {
        clear();
        router.push("/checkout/success?order=" + encodeURIComponent(order.orderNumber) + "&method=cod");
        return;
      }
      if (method === "khalti") {
        const pay = await fetch(BASE + "/api/pay/khalti", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ amount: order.total, orderNumber: order.orderNumber, orderName: ${JSON.stringify(`${ctx.template.siteName} order`)}, customer: { name, email } }),
        });
        const data = (await pay.json()) as { payment_url: string; mock?: boolean };
        clear();
        window.location.href = data.payment_url;
        return;
      }
      // eSewa: build + auto-submit the signed form (navigates to the gateway).
      await submitEsewaForm(order.total, order.orderNumber);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const field = "w-full rounded-xl border border-hairline bg-surface px-4 py-3 outline-none focus:border-hairline";
  const methods: { id: Method; label: string; hint: string }[] = [
    { id: "esewa", label: "eSewa", hint: "Test gateway \\u2014 signed with the documented sandbox credentials." },
    { id: "khalti", label: "Khalti", hint: "Runs in mock mode until you set KHALTI_SECRET." },
    { id: "cod", label: "Cash on delivery", hint: "Pay when your order arrives." },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-24">
      <h1 className="text-4xl font-bold">Checkout</h1>
      <form onSubmit={onSubmit} className="mt-12 grid gap-12 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-8">
          <section className="space-y-4">
            <h2 className="font-semibold">Your details</h2>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={field} />
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={field} />
            <textarea required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Delivery address" rows={3} className={field} />
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">Payment</h2>
            {methods.map((m) => (
              <label key={m.id} className={"flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition " + (method === m.id ? "border-transparent bg-surface ring-2 ring-[var(--accent-to)]" : "border-hairline hover:bg-surface")}>
                <input type="radio" name="method" checked={method === m.id} onChange={() => setMethod(m.id)} className="mt-1" />
                <span>
                  <span className="block font-medium">{m.label}</span>
                  <span className="block text-sm text-muted">{m.hint}</span>
                </span>
              </label>
            ))}
          </section>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </div>
        <aside className="h-fit rounded-2xl border border-hairline bg-surface p-6">
          <h2 className="font-semibold">Order summary</h2>
          <ul className="mt-4 space-y-2 text-sm text-muted">
            {cart.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3">
                <span className="truncate">{i.name} × {i.qty}</span>
                <span className="tabular-nums">{formatMoney(i.unitPrice * i.qty)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-2 border-t border-hairline pt-4 text-sm">
            <div className="flex justify-between text-muted"><dt>Subtotal</dt><dd className="tabular-nums">{formatMoney(q.subtotal)}</dd></div>
            <div className="flex justify-between text-muted"><dt>VAT (13%)</dt><dd className="tabular-nums">{formatMoney(q.tax)}</dd></div>
            <div className="flex justify-between text-muted"><dt>Shipping</dt><dd className="tabular-nums">{q.shipping === 0 ? "Free" : formatMoney(q.shipping)}</dd></div>
            <div className="flex justify-between border-t border-hairline pt-2 text-base font-bold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(q.total)}</dd></div>
          </dl>
          <button type="submit" disabled={busy} className="mt-6 block w-full rounded-full gradient-bg px-6 py-3 text-center font-semibold on-accent transition hover:opacity-90 disabled:opacity-60">
            {busy ? "Placing order\\u2026" : "Pay " + formatMoney(q.total)}
          </button>
        </aside>
      </form>
    </main>
  );
}
`;

// app/checkout/success/page.tsx — confirmation, reads the order from the query.
const marketSuccessPage = (ctx: Ctx): string => `import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/lib/site";

export const metadata: Metadata = site.meta({ title: "Order confirmed", path: "/checkout/success" });

export default async function Page({ searchParams }: { searchParams: Promise<{ order?: string; method?: string; mock?: string }> }) {
  const sp = await searchParams;
  const order = sp.order ?? "";
  const method = sp.method ?? "";
  const mock = sp.mock === "1";
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-24 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full gradient-bg text-4xl on-accent">✓</div>
      <h1 className="mt-8 text-4xl font-bold">Thank you!</h1>
      <p className="mt-4 text-lg text-muted">Your order with ${ctx.template.siteName} is confirmed.</p>
      {order ? (
        <p className="mt-6 rounded-xl border border-hairline bg-surface px-5 py-3 font-mono text-sm">Order {order}</p>
      ) : null}
      {method ? <p className="mt-3 text-sm text-muted">Payment method: {method}</p> : null}
      {mock ? <p className="mt-3 max-w-md text-sm text-muted">This Khalti payment ran in mock mode. Set KHALTI_SECRET in your environment to hit the real gateway.</p> : null}
      <Link href="/shop" className="mt-10 inline-block rounded-full gradient-bg px-6 py-3 font-semibold on-accent">Continue shopping</Link>
    </main>
  );
}
`;

// app/api/checkout/route.ts — build an order + invoice from the cart (in-memory).
const checkoutRoute = (): string => `import { NextResponse } from "next/server";
import { buildOrder, type QuoteLine } from "@/lib/commerce";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    lines?: QuoteLine[];
    customer?: { name?: string; email?: string };
    paymentMethod?: string;
  };
  const lines = body.lines ?? [];
  if (lines.length === 0) {
    return NextResponse.json({ error: "Cart is empty" }, { status: 400 });
  }

  // @lacspace/order + @lacspace/invoice build immutable, serializable records.
  // Persist \`order\` / \`invoice\` to your database here — this demo keeps them in memory.
  const { order, invoice, quote } = buildOrder({
    lines,
    customer: body.customer,
    paymentMethod: body.paymentMethod ?? "cod",
  });

  return NextResponse.json({
    orderNumber: order.number,
    invoiceNumber: invoice.number,
    total: quote.total,
    currency: quote.currency,
  });
}
`;

// app/api/pay/esewa/route.ts — return a signed eSewa form (server-only crypto).
const esewaRoute = (): string => `import { NextResponse } from "next/server";
import { buildForm, ESEWA_TEST_SECRET, ESEWA_TEST_PRODUCT_CODE } from "@lacspace/esewa";

// eSewa amounts are in **rupees**, so we convert from the paisa the cart uses.
export async function POST(req: Request) {
  const body = (await req.json()) as { amount?: number; orderNumber?: string };
  const secret = process.env.ESEWA_SECRET ?? ESEWA_TEST_SECRET;
  const productCode = process.env.ESEWA_PRODUCT_CODE ?? ESEWA_TEST_PRODUCT_CODE;
  const env: "test" | "prod" = process.env.ESEWA_SECRET ? "prod" : "test";
  const rupees = Math.round((body.amount ?? 0) / 100);
  const origin = new URL(req.url).origin;
  const orderNumber = body.orderNumber ?? "txn-" + Date.now();

  const form = await buildForm(
    {
      amount: rupees,
      transactionUuid: orderNumber,
      productCode,
      successUrl: origin + "/checkout/success?order=" + encodeURIComponent(orderNumber) + "&method=esewa",
      failureUrl: origin + "/checkout?failed=1",
    },
    { secret, env },
  );

  return NextResponse.json(form);
}
`;

// app/api/pay/khalti/route.ts — initiate Khalti, or a labelled mock with no key.
const khaltiRoute = (): string => `import { NextResponse } from "next/server";
import { initiate } from "@lacspace/khalti";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    amount?: number;
    orderNumber?: string;
    orderName?: string;
    customer?: { name?: string; email?: string };
  };
  const secret = process.env.KHALTI_SECRET;
  const origin = new URL(req.url).origin;
  const orderNumber = body.orderNumber ?? "order";
  const returnUrl = origin + "/checkout/success?order=" + encodeURIComponent(orderNumber) + "&method=khalti";

  // Zero-config: without a secret we return a clearly-labelled mock so the flow
  // still completes end-to-end in development.
  if (!secret) {
    return NextResponse.json({
      mock: true,
      pidx: "mock-" + Date.now(),
      payment_url: returnUrl + "&mock=1",
    });
  }

  const res = await initiate(
    {
      return_url: returnUrl,
      website_url: origin,
      amount: body.amount ?? 0, // paisa
      purchase_order_id: orderNumber,
      purchase_order_name: body.orderName ?? "Order",
      customer_info: body.customer,
    },
    { secretKey: secret, env: "test" },
  );

  return NextResponse.json(res);
}
`;

// .env.example (marketplace) — all payment vars are optional (test/mock mode).
const marketEnvExample = (): string => `# Your production URL — powers canonical URLs, sitemap, robots and OG images.
NEXT_PUBLIC_SITE_URL=https://example.com

# --- Payments (all optional) ---
# The store runs out of the box: eSewa uses the documented sandbox credentials,
# and Khalti falls back to a labelled mock until you add a secret.

# eSewa — set both to go live (otherwise the EPAYTEST sandbox is used).
# ESEWA_SECRET=
# ESEWA_PRODUCT_CODE=

# Khalti — set the secret to hit the real gateway (otherwise a mock is returned).
# KHALTI_SECRET=
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
            <button key={t} type="button" onClick={() => setTheme(t)} className={"rounded-full px-4 py-1.5 text-sm capitalize transition " + (theme === t ? "gradient-bg font-semibold on-accent" : "text-muted hover:text-fg")}>{t}</button>
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
    <section className={"mx-auto max-w-6xl px-6 py-20 sm:py-24 " + className}>
      {eyebrow ? <p className="text-sm font-semibold uppercase tracking-widest gradient-text">{eyebrow}</p> : null}
      {title ? <h2 className="mt-3 text-3xl font-bold sm:text-4xl">{title}</h2> : null}
      {lead ? <p className="mt-4 max-w-2xl text-lg text-muted">{lead}</p> : null}
      {children ? <div className="mt-12">{children}</div> : null}
    </section>
  );
}
`,
  "components/ui/pill.tsx": `import type { ReactNode } from "react";

export function Pill({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={"glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold uppercase tracking-widest text-muted " + className}><span aria-hidden className="h-1.5 w-1.5 rounded-full gradient-bg" />{children}</span>;
}
`,
  "components/ui/stat-card.tsx": `export function StatCard({ label, value, delta }: { label: string; value: string; delta?: string }) {
  const down = delta?.trim().startsWith("-");
  return (
    <div className="card p-6">
      <div className="text-3xl font-bold tabular-nums tracking-tight">{value}</div>
      <div className="mt-1 text-sm text-muted">{label}</div>
      {delta ? <div className={"mt-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold " + (down ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400")}>{down ? "▼" : "▲"} {delta}</div> : null}
    </div>
  );
}
`,
  "components/ui/feature-card.tsx": `import type { ReactNode } from "react";

export function FeatureCard({ icon, title, desc }: { icon?: ReactNode; title: string; desc: string }) {
  return (
    <div className="card group p-7">
      {icon ? <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl gradient-bg text-2xl accent-glow transition group-hover:scale-105">{icon}</div> : null}
      <h3 className="font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{desc}</p>
    </div>
  );
}
`,
  "components/ui/testimonial.tsx": `export function Testimonial({ quote, author, role }: { quote: string; author: string; role?: string }) {
  const initials = author.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();
  return (
    <figure className="card flex h-full flex-col p-7">
      <div aria-hidden className="text-3xl leading-none gradient-text">&ldquo;</div>
      <blockquote className="mt-1 flex-1 text-[15px] font-medium leading-relaxed text-fg/90">{quote}</blockquote>
      <figcaption className="mt-6 flex items-center gap-3 border-t border-hairline pt-5">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full gradient-bg text-sm font-bold on-accent">{initials}</span>
        <span className="text-sm"><span className="block font-semibold text-fg">{author}</span>{role ? <span className="block text-muted">{role}</span> : null}</span>
      </figcaption>
    </figure>
  );
}
`,
  "components/ui/steps.tsx": `export function Steps({ items }: { items: { title: string; desc: string }[] }) {
  return (
    <ol className="grid gap-6 sm:grid-cols-3">
      {items.map((s, i) => (
        <li key={s.title} className="card p-7">
          <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-xl gradient-bg text-sm font-bold on-accent">{String(i + 1).padStart(2, "0")}</div>
          <h3 className="font-semibold tracking-tight">{s.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.desc}</p>
        </li>
      ))}
    </ol>
  );
}
`,
  "components/ui/cta-band.tsx": `import Link from "next/link";

export function CTABand({ title, subtitle, ctaLabel = "Get started", ctaHref = "/contact" }: { title: string; subtitle?: string; ctaLabel?: string; ctaHref?: string }) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="relative overflow-hidden rounded-[2rem] border border-hairline bg-surface p-12 text-center shadow-lg sm:p-20">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full gradient-bg opacity-30 blur-3xl animate-drift" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-16 h-64 w-64 rounded-full gradient-bg opacity-25 blur-3xl animate-drift-slow" />
        <div aria-hidden className="dot-bg pointer-events-none absolute inset-0 opacity-40" />
        <h2 className="relative text-3xl font-bold tracking-tight sm:text-5xl">{title}</h2>
        {subtitle ? <p className="relative mx-auto mt-4 max-w-xl text-lg text-muted">{subtitle}</p> : null}
        <Link href={ctaHref} className="shimmer relative mt-9 inline-block rounded-full gradient-bg px-8 py-3.5 font-semibold on-accent shadow-lg transition hover:-translate-y-0.5">{ctaLabel}</Link>
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
    <div className="gradient-border relative mx-auto max-w-3xl overflow-hidden rounded-[1.75rem] border border-transparent bg-surface p-8 text-center shadow-lg sm:p-12">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full gradient-bg opacity-20 blur-3xl" />
      <h2 className="relative text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
      <p className="relative mx-auto mt-2 max-w-md text-sm text-muted">{subtitle}</p>
      {state?.ok ? (
        <p className="relative mx-auto mt-6 max-w-md rounded-xl border border-hairline bg-app p-4 text-sm">You&rsquo;re subscribed — thanks! ✅</p>
      ) : (
        <form action={action} className="relative mx-auto mt-7 flex max-w-md flex-col gap-3 sm:flex-row">
          <input name="email" type="email" placeholder="you@example.com" aria-label="Email" className="w-full flex-1 rounded-full border border-hairline bg-app px-5 py-3 outline-none transition focus:border-[color:var(--accent-to)]" />
          <input {...honeypotProps("website")} />
          <input type="hidden" name="_ts" defaultValue={timestampValue()} />
          <button disabled={pending} className="rounded-full gradient-bg px-6 py-3 font-semibold on-accent transition hover:-translate-y-0.5 disabled:opacity-60">{pending ? "Joining…" : "Subscribe"}</button>
        </form>
      )}
      {err ? <p className="relative mt-3 text-sm text-red-400">{err}</p> : null}
    </div>
  );
}
`,
  "components/ui/badge.tsx": `import type { ReactNode } from "react";

const tones = {
  default: "border-hairline bg-surface text-muted",
  accent: "border-transparent gradient-bg on-accent",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  danger: "border-red-500/30 bg-red-500/10 text-red-400",
} as const;

export function Badge({ children, tone = "default", className = "" }: { children: ReactNode; tone?: keyof typeof tones; className?: string }) {
  return <span className={"inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold " + tones[tone] + " " + className}>{children}</span>;
}
`,
  "components/ui/callout.tsx": `import type { ReactNode } from "react";

const tones = {
  info: { c: "border-sky-500/30 bg-sky-500/10", i: "💡" },
  success: { c: "border-emerald-500/30 bg-emerald-500/10", i: "✅" },
  warning: { c: "border-amber-500/30 bg-amber-500/10", i: "⚠️" },
  danger: { c: "border-red-500/30 bg-red-500/10", i: "⛔" },
} as const;

export function Callout({ children, title, tone = "info" }: { children: ReactNode; title?: string; tone?: keyof typeof tones }) {
  const t = tones[tone];
  return (
    <div className={"flex gap-3 rounded-2xl border p-4 " + t.c}>
      <div className="text-lg leading-none">{t.i}</div>
      <div className="text-sm">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className="text-muted">{children}</div>
      </div>
    </div>
  );
}
`,
  "components/ui/accordion.tsx": `export function Accordion({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
      {items.map((it, i) => (
        <details key={it.q} className={"group px-6 " + (i > 0 ? "border-t border-hairline" : "")}>
          <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-medium">
            {it.q}
            <span className="ml-4 text-muted transition group-open:rotate-45">+</span>
          </summary>
          <p className="pb-5 text-sm leading-relaxed text-muted">{it.a}</p>
        </details>
      ))}
    </div>
  );
}
`,
  "components/ui/faq.tsx": `export function FAQ({ items, title }: { items: { q: string; a: string }[]; title?: string }) {
  return (
    <div className="mx-auto max-w-3xl">
      {title ? <h2 className="mb-8 text-center text-3xl font-bold sm:text-4xl">{title}</h2> : null}
      <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
        {items.map((it, i) => (
          <details key={it.q} className={"group px-6 " + (i > 0 ? "border-t border-hairline" : "")}>
            <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-medium">{it.q}<span className="ml-4 text-muted transition group-open:rotate-45">+</span></summary>
            <p className="pb-5 text-sm leading-relaxed text-muted">{it.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
`,
  "components/ui/tabs.tsx": `"use client";

import { useState, type ReactNode } from "react";

export function Tabs({ tabs }: { tabs: { label: string; content: ReactNode }[] }) {
  const [i, setI] = useState(0);
  return (
    <div>
      <div className="inline-flex flex-wrap gap-1 rounded-full border border-hairline bg-surface p-1">
        {tabs.map((t, idx) => (
          <button key={t.label} onClick={() => setI(idx)} className={"rounded-full px-4 py-2 text-sm font-medium transition " + (i === idx ? "gradient-bg on-accent" : "text-muted hover:text-fg")}>{t.label}</button>
        ))}
      </div>
      <div className="mt-6">{tabs[i]?.content}</div>
    </div>
  );
}
`,
  "components/ui/timeline.tsx": `export function Timeline({ items }: { items: { date?: string; title: string; desc?: string }[] }) {
  return (
    <ol className="relative ml-3 border-l border-hairline">
      {items.map((it) => (
        <li key={it.title} className="mb-8 ml-6">
          <span aria-hidden className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full gradient-bg" />
          {it.date ? <p className="text-xs font-semibold uppercase tracking-widest text-faint">{it.date}</p> : null}
          <h3 className="mt-1 font-semibold">{it.title}</h3>
          {it.desc ? <p className="mt-1 text-sm text-muted">{it.desc}</p> : null}
        </li>
      ))}
    </ol>
  );
}
`,
  "components/ui/pricing-table.tsx": `import Link from "next/link";

interface Tier { name: string; price: string; period?: string; features: string[]; ctaLabel?: string; ctaHref?: string; featured?: boolean; }

export function PricingTable({ tiers }: { tiers: Tier[] }) {
  return (
    <div className="grid items-center gap-6 md:grid-cols-3">
      {tiers.map((t) => (
        <div key={t.name} className={"relative flex flex-col rounded-[1.5rem] border p-8 transition " + (t.featured ? "gradient-border border-transparent bg-surface shadow-lg md:scale-[1.04]" : "border-hairline bg-surface hover:border-[color:var(--accent-to)]")}>
          {t.featured ? <span className="absolute -top-3 left-8 rounded-full gradient-bg px-3 py-1 text-xs font-bold on-accent shadow-sm">Most popular</span> : null}
          <h3 className="font-semibold tracking-tight">{t.name}</h3>
          <div className="mt-4 flex items-end gap-1"><span className="text-5xl font-bold tracking-tight">{t.price}</span>{t.period ? <span className="mb-1.5 text-sm text-muted">/{t.period}</span> : null}</div>
          <ul className="mt-7 flex-1 space-y-3 text-sm text-muted">
            {t.features.map((f) => <li key={f} className="flex gap-2.5"><span className="mt-0.5 gradient-text font-bold">✓</span>{f}</li>)}
          </ul>
          <Link href={t.ctaHref ?? "/contact"} className={"mt-8 rounded-full px-6 py-3 text-center font-semibold transition " + (t.featured ? "shimmer gradient-bg on-accent hover:-translate-y-0.5" : "border border-hairline hover:bg-app")}>{t.ctaLabel ?? "Choose " + t.name}</Link>
        </div>
      ))}
    </div>
  );
}
`,
  "components/ui/logo-cloud.tsx": `export function LogoCloud({ names, label }: { names: string[]; label?: string }) {
  return (
    <div className="text-center">
      {label ? <p className="text-xs font-semibold uppercase tracking-widest text-faint">{label}</p> : null}
      <div className="mt-7 flex flex-wrap items-center justify-center gap-x-12 gap-y-5">
        {names.map((n) => <span key={n} className="text-lg font-bold tracking-tight text-muted opacity-60 grayscale transition hover:opacity-100 hover:grayscale-0">{n}</span>)}
      </div>
    </div>
  );
}
`,
  "components/ui/stat-band.tsx": `export function StatBand({ stats }: { stats: { value: string; label: string }[] }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-[1.5rem] border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="bg-surface px-6 py-10 text-center transition hover:bg-panel">
          <div className="gradient-text text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">{s.value}</div>
          <div className="mt-2 text-sm text-muted">{s.label}</div>
        </div>
      ))}
    </div>
  );
}
`,
  "components/ui/team-grid.tsx": `export function TeamGrid({ members }: { members: { name: string; role: string; bio?: string }[] }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {members.map((m) => (
        <div key={m.name} className="card p-7 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl gradient-bg text-xl font-bold on-accent accent-glow">{m.name.split(" ").map((x) => x[0]).join("").slice(0, 2)}</div>
          <h3 className="mt-4 font-semibold tracking-tight">{m.name}</h3>
          <p className="gradient-text text-sm font-medium">{m.role}</p>
          {m.bio ? <p className="mt-2 text-sm leading-relaxed text-muted">{m.bio}</p> : null}
        </div>
      ))}
    </div>
  );
}
`,
  "components/ui/feature-split.tsx": `import type { ReactNode } from "react";

export function FeatureSplit({ eyebrow, title, desc, bullets, media, reverse = false }: { eyebrow?: string; title: string; desc?: string; bullets?: string[]; media?: ReactNode; reverse?: boolean }) {
  return (
    <div className={"grid items-center gap-10 md:grid-cols-2 " + (reverse ? "md:[&>*:first-child]:order-2" : "")}>
      <div>
        {eyebrow ? <p className="text-sm font-semibold uppercase tracking-widest text-faint">{eyebrow}</p> : null}
        <h2 className="mt-3 text-3xl font-bold sm:text-4xl">{title}</h2>
        {desc ? <p className="mt-4 text-lg text-muted">{desc}</p> : null}
        {bullets ? <ul className="mt-6 space-y-2 text-muted">{bullets.map((b) => <li key={b} className="flex gap-2"><span className="gradient-text">✓</span>{b}</li>)}</ul> : null}
      </div>
      <div className="relative overflow-hidden rounded-3xl border border-hairline bg-surface p-8">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full gradient-bg opacity-30 blur-3xl" />
        <div className="relative">{media ?? <div className="grid h-48 place-items-center text-5xl">✨</div>}</div>
      </div>
    </div>
  );
}
`,
  "components/ui/gallery.tsx": `export function Gallery({ items }: { items: { label?: string; emoji?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {items.map((it, i) => (
        <div key={i} className="group relative grid aspect-square place-items-center overflow-hidden rounded-2xl border border-hairline bg-surface">
          <div aria-hidden className="pointer-events-none absolute inset-0 gradient-bg opacity-10 transition group-hover:opacity-20" />
          <span className="relative text-4xl">{it.emoji ?? "🖼️"}</span>
          {it.label ? <span className="absolute bottom-2 left-3 text-xs text-muted">{it.label}</span> : null}
        </div>
      ))}
    </div>
  );
}
`,
  "components/ui/rating.tsx": `export function Rating({ value = 5, count }: { value?: number; count?: number }) {
  return (
    <div className="inline-flex items-center gap-1 text-amber-400" aria-label={value + " out of 5"}>
      {[0, 1, 2, 3, 4].map((i) => <span key={i}>{i < Math.round(value) ? "★" : "☆"}</span>)}
      {count ? <span className="ml-1 text-sm text-muted">({count})</span> : null}
    </div>
  );
}
`,
  "components/ui/progress.tsx": `export function Progress({ value, label }: { value: number; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div>
      {label ? <div className="mb-1 flex justify-between text-sm"><span>{label}</span><span className="text-muted">{v}%</span></div> : null}
      <div className="h-2 overflow-hidden rounded-full bg-app"><div className="h-full gradient-bg" style={{ width: v + "%" }} /></div>
    </div>
  );
}
`,
  "components/ui/breadcrumbs.tsx": `import Link from "next/link";

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-muted">
      {items.map((it, i) => (
        <span key={it.label} className="flex items-center gap-2">
          {it.href ? <Link href={it.href} className="hover:text-fg">{it.label}</Link> : <span className="text-fg">{it.label}</span>}
          {i < items.length - 1 ? <span aria-hidden className="text-faint">/</span> : null}
        </span>
      ))}
    </nav>
  );
}
`,
  "components/ui/avatar.tsx": `export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase();
  return <span className="inline-flex items-center justify-center rounded-full gradient-bg font-bold on-accent" style={{ width: size, height: size, fontSize: size * 0.4 }}>{initials}</span>;
}

export function AvatarGroup({ names }: { names: string[] }) {
  return <div className="flex -space-x-2">{names.map((n) => <span key={n} className="rounded-full bg-app p-0.5"><Avatar name={n} size={36} /></span>)}</div>;
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
export * from "./badge";
export * from "./callout";
export * from "./accordion";
export * from "./faq";
export * from "./tabs";
export * from "./timeline";
export * from "./pricing-table";
export * from "./logo-cloud";
export * from "./stat-band";
export * from "./team-grid";
export * from "./feature-split";
export * from "./gallery";
export * from "./rating";
export * from "./progress";
export * from "./breadcrumbs";
export * from "./avatar";
`,
});

/** Real, content-filled pages that replace the highest-value stub per template. */
function realPageFiles(ctx: Ctx): Record<string, string> {
  const k = ctx.template.key;
  const f: Record<string, string> = {};
  if (k !== "dashboard") { f["app/faq/page.tsx"] = faqPage(ctx); f["app/careers/page.tsx"] = careersPage(ctx); }
  if (k === "personal") { f["app/work/page.tsx"] = workPage(ctx); f["app/uses/page.tsx"] = usesPage(ctx); }
  if (k === "business") { f["app/services/page.tsx"] = servicesPage(ctx); f["app/pricing/page.tsx"] = pricingPage(ctx); f["app/work/page.tsx"] = businessWorkPage(ctx); }
  if (k === "saas") { f["app/features/page.tsx"] = featuresPage(ctx); f["app/pricing/page.tsx"] = pricingPage(ctx); f["app/integrations/page.tsx"] = integrationsPage(ctx); f["app/changelog/page.tsx"] = changelogPage(ctx); }
  if (k === "ecommerce") {
    f["app/shop/page.tsx"] = shopPage(ctx);
    f["app/cart/page.tsx"] = cartPage();
    f["app/collections/page.tsx"] = collectionsPage(ctx);
    f["components/product-grid.tsx"] = productGrid();
    f["components/cart-view.tsx"] = cartView();
  }
  if (k === "marketplace") {
    f["lib/products.ts"] = productsLib(ctx);
    f["lib/commerce.ts"] = commerceLib(ctx);
    f["components/cart-store.tsx"] = cartStore();
    f["components/cart-button.tsx"] = cartButton();
    f["components/add-to-cart.tsx"] = addToCart();
    f["app/shop/page.tsx"] = marketShopPage(ctx);
    f["app/product/[slug]/page.tsx"] = marketProductPage(ctx);
    f["app/cart/page.tsx"] = marketCartPage(ctx);
    f["app/checkout/page.tsx"] = marketCheckoutPage(ctx);
    f["app/checkout/success/page.tsx"] = marketSuccessPage(ctx);
    f["app/api/checkout/route.ts"] = checkoutRoute();
    f["app/api/pay/esewa/route.ts"] = esewaRoute();
    f["app/api/pay/khalti/route.ts"] = khaltiRoute();
  }
  if (k === "blog") { f["app/topics/page.tsx"] = topicsPage(ctx); f["app/newsletter/page.tsx"] = newsletterPage(ctx); }
  if (k === "docs") { f["app/guides/page.tsx"] = guidesPage(ctx); f["app/changelog/page.tsx"] = changelogPage(ctx); f["app/api-reference/page.tsx"] = apiRefPage(ctx); }
  if (k === "restaurant") { f["app/menu/page.tsx"] = menuPage(ctx); f["app/gallery/page.tsx"] = galleryPage(ctx); f["app/reservations/page.tsx"] = reservationsPage(ctx); f["app/events/page.tsx"] = eventsPage(ctx); }
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
    marketplace: {
      emoji: "🛒", chips: ["Cart", "Checkout", "Pay"],
      showcaseTitle: "Cart to checkout, wired end to end",
      showcaseLead: `${n} is a real storefront — a headless cart, tax & shipping, orders and invoices, plus eSewa & Khalti payments.`,
      bullets: ["Integer-safe money (no rounding bugs)", "VAT + weight-based shipping", "eSewa & Khalti, test-mode out of the box"],
      marqueeLabel: "Powered by", marquee: ["@lacspace/cart", "@lacspace/order", "@lacspace/tax", "@lacspace/shipping", "@lacspace/invoice", "@lacspace/esewa", "@lacspace/khalti"],
      faq: [
        { q: "How is the cart stored?", a: "In a @lacspace/store store persisted to localStorage — it survives a refresh, and it's SSR-safe." },
        { q: "Which payments are supported?", a: "eSewa and Khalti are wired up, plus cash on delivery. They run in test/mock mode with zero config." },
        { q: "How are totals calculated?", a: "Subtotal, 13% VAT (@lacspace/tax) and shipping (@lacspace/shipping) are composed in lib/commerce, all in integer paisa." },
      ],
    },
  };
  return map[ctx.template.key] ?? map.business!;
}

// components/aurora.tsx — an animated, theme-aware gradient backdrop for the hero.
const aurora = (): string => `export function Aurora() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[820px] overflow-hidden">
      {/* soft gradient-mesh — blurred orbs keyed to the accent, drifting slowly */}
      <div className="absolute -left-32 -top-24 h-[32rem] w-[32rem] rounded-full opacity-25 blur-[90px] animate-drift" style={{ background: "radial-gradient(circle at 50% 50%, var(--accent-from), transparent 68%)" }} />
      <div className="absolute -right-24 top-24 h-[30rem] w-[30rem] rounded-full opacity-20 blur-[90px] animate-drift-slow" style={{ background: "radial-gradient(circle at 50% 50%, var(--accent-to), transparent 68%)" }} />
      <div className="absolute left-1/3 top-64 h-96 w-96 rounded-full opacity-[0.14] blur-[80px] animate-floaty" style={{ background: "radial-gradient(circle at 50% 50%, var(--accent-to), transparent 70%)" }} />
      {/* faint dotted texture, fading out toward the fold */}
      <div className="dot-bg absolute inset-0 opacity-60" />
      {/* seam that melts the aurora into the page */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[var(--bg)]" />
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
      {/* ambient accent glow behind the whole piece */}
      <div aria-hidden className="absolute inset-6 rounded-full opacity-30 blur-3xl gradient-bg animate-drift-slow" />
      {/* orbiting rings */}
      <div className="absolute inset-0 rounded-full border border-hairline animate-spin-slow" />
      <div className="absolute inset-10 rounded-full border border-dashed border-hairline animate-spin-slow" style={{ animationDirection: "reverse" }} />
      {/* orbit node */}
      <div className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full gradient-bg animate-spin-slow" style={{ transformOrigin: "50% 190px" }} />
      {/* center badge with the platform initials */}
      <div className="absolute left-1/2 top-1/2 flex h-32 w-32 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[1.75rem] gradient-bg text-4xl font-black on-accent shadow-lg accent-glow animate-floaty" style={{ animationDuration: "7s" }}>
        ${JSON.stringify(initials)}
      </div>
      {/* floating glass chips */}
      <div className="glass absolute left-0 top-10 flex items-center gap-2 rounded-2xl px-3.5 py-2 text-xs font-semibold shadow-lg animate-floaty">
        <span className="text-sm">${d.emoji}</span> ${JSON.stringify(d.chips[0])}
      </div>
      <div className="glass absolute right-0 top-28 flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-xs font-semibold shadow-lg animate-floaty-slow">
        <span className="h-1.5 w-1.5 rounded-full gradient-bg" /> ${JSON.stringify(d.chips[1])}
      </div>
      <div className="glass absolute bottom-8 left-6 rounded-2xl px-3.5 py-2 text-xs font-semibold shadow-lg animate-floaty" style={{ animationDelay: "1.2s" }}>
        ${JSON.stringify(d.chips[2])}
      </div>
    </div>
  );
}
`;
};

// A showcase band: pre-written copy + the animated illustration.
/* ----------------------- expanded, prefilled content ----------------------- */

interface RichContent {
  stats: { value: string; label: string }[];
  process: { title: string; desc: string }[];
  testimonials: { quote: string; author: string; role?: string }[];
  team: { name: string; role: string; bio?: string }[];
  values: { title: string; desc: string }[];
  faqs: { q: string; a: string }[];
}

/** Deeper, template-tailored, project-name-personalized content used by the extra
 *  home sections and the rich prebuilt pages (about, faq, and template extras). */
function richContent(ctx: Ctx): RichContent {
  const n = ctx.template.siteName;
  const base: RichContent = {
    stats: [
      { value: "10k+", label: "Monthly visitors" },
      { value: "99.9%", label: "Uptime" },
      { value: "4.9★", label: "Average rating" },
      { value: "<1s", label: "Load time" },
    ],
    process: [
      { title: "Discover", desc: `We learn what ${n} needs and map the fastest path to value.` },
      { title: "Design", desc: "We shape the experience and validate it early with real content." },
      { title: "Build", desc: "We ship in weekly increments you can see and steer." },
      { title: "Launch", desc: "We go live, measure, and keep improving together." },
    ],
    testimonials: [
      { quote: `Working with ${n} was the smoothest launch we've had — everything just worked.`, author: "Sam Rivera", role: "Product Lead" },
      { quote: "Fast, polished and genuinely easy to build on. Highly recommend.", author: "Jordan Ellis", role: "Founder" },
      { quote: "The attention to detail shows on every single page.", author: "Priya Nair", role: "Design Director" },
    ],
    team: [
      { name: "Alex Morgan", role: "Founder & CEO", bio: "Sets the vision and keeps us honest." },
      { name: "Riya Sharma", role: "Head of Design", bio: "Makes every pixel earn its place." },
      { name: "Chris Doyle", role: "Lead Engineer", bio: "Ships fast without breaking things." },
    ],
    values: [
      { title: "Craft", desc: "We care about the details others skip." },
      { title: "Speed", desc: "We ship early and iterate in the open." },
      { title: "Honesty", desc: "Clear pricing, clear timelines, no surprises." },
      { title: "Partnership", desc: "Your goals are our goals." },
    ],
    faqs: [
      { q: `Is ${n} really production-ready?`, a: `Yes — every ${n} page is server-rendered, SEO-optimized and ships with sensible security headers out of the box.` },
      { q: "How do I get started?", a: "Clone the project, run npm install and npm run dev — you'll have a live site in under a minute." },
      { q: "Can I customize the design?", a: "Completely. Colours, fonts and layout are token-driven, so a few edits reskin the whole site." },
      { q: "Is it accessible and fast?", a: "Built mobile-first with semantic HTML, keyboard support and a strong Lighthouse baseline." },
      { q: "Do you support dark mode?", a: "Yes — light, dark and system themes with a no-flash script, powered by @lacspace/theme." },
      { q: "How do I deploy?", a: "Deploy to any Node host or Vercel in one click — sitemap, robots and OG images are all wired up." },
    ],
  };
  const over: Record<string, Partial<RichContent>> = {
    restaurant: {
      stats: [
        { value: "20+", label: "Years serving" },
        { value: "4.8★", label: "Google rating" },
        { value: "120", label: "Seats" },
        { value: "Daily", label: "Fresh menu" },
      ],
      process: [
        { title: "Reserve", desc: `Book your table at ${n} online in seconds.` },
        { title: "Arrive", desc: "Settle in — we'll take it from here." },
        { title: "Savour", desc: "Seasonal plates, made from scratch." },
      ],
      testimonials: [
        { quote: `Best meal we've had all year — ${n} never misses.`, author: "Dana Lopez", role: "Regular" },
        { quote: "The tasting menu is an experience. Book ahead!", author: "Marco Bianchi", role: "Food writer" },
        { quote: "Warm service, unforgettable flavours.", author: "Aisha Khan", role: "Guest" },
      ],
    },
    ecommerce: {
      stats: [
        { value: "50k+", label: "Orders shipped" },
        { value: "4.9★", label: "Customer rating" },
        { value: "48h", label: "Fast delivery" },
        { value: "30d", label: "Free returns" },
      ],
    },
  };
  return { ...base, ...(over[ctx.template.key] ?? {}) };
}

/** Extra, filled home sections (stats band, process, testimonials) shared by every
 *  marketing template — rendered with the prebuilt UI kit. */
const extraHomeSections = (ctx: Ctx): string => {
  const r = richContent(ctx);
  const tst = r.testimonials
    .map((t) => `<Testimonial quote={${JSON.stringify(t.quote)}} author={${JSON.stringify(t.author)}} role={${JSON.stringify(t.role ?? "")}} />`)
    .join("\n          ");
  return `<section className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-10 text-center"><p className="text-sm font-semibold uppercase tracking-widest gradient-text">By the numbers</p><h2 className="mt-3 text-3xl font-bold sm:text-4xl">Built to perform</h2></div>
        <StatBand stats={${JSON.stringify(r.stats)}} />
      </section>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-12 text-center"><p className="text-sm font-semibold uppercase tracking-widest gradient-text">How it works</p><h2 className="mt-3 text-3xl font-bold sm:text-4xl">A simple, proven path</h2><p className="mx-auto mt-3 max-w-xl text-muted">From first hello to launch day — no surprises.</p></div>
        <Steps items={${JSON.stringify(r.process)}} />
      </section>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-12 text-center"><p className="text-sm font-semibold uppercase tracking-widest gradient-text">Loved by teams</p><h2 className="mt-3 text-3xl font-bold sm:text-4xl">Don't just take our word for it</h2></div>
        <div className="grid items-stretch gap-6 md:grid-cols-3">
          ${tst}
        </div>
      </section>`;
};

const showcaseSection = (ctx: Ctx): string => {
  const d = creativeData(ctx);
  const bullets = d.bullets.map((b) => `<li className="flex items-center gap-3 text-muted"><span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full gradient-bg text-[11px] on-accent">✓</span> ${b}</li>`).join("\n            ");
  return `<section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 md:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest gradient-text">${ctx.template.siteName}</p>
          <h2 className="mt-3 text-3xl font-bold sm:text-4xl">${d.showcaseTitle}</h2>
          <p className="mt-4 max-w-md text-lg text-muted">${d.showcaseLead}</p>
          <ul className="mt-7 space-y-3.5 text-sm font-medium">
            ${bullets}
          </ul>
        </div>
        <HeroArt />
      </section>`;
};

// An auto-scrolling marquee band (pure CSS, duplicated track for a seamless loop).
const marqueeSection = (ctx: Ctx): string => {
  const d = creativeData(ctx);
  const chip = (t: string) => `<span className="whitespace-nowrap rounded-full border border-hairline bg-surface px-5 py-2 text-sm font-semibold text-muted">${t}</span>`;
  const track = d.marquee.map(chip).join("\n            ");
  return `<section className="py-14">
        <p className="mb-8 text-center text-xs font-semibold uppercase tracking-widest text-faint">${d.marqueeLabel}</p>
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
  const items = d.faq.map((f) => `<details className="group rounded-2xl border border-hairline bg-surface p-5 transition hover:border-[color:var(--accent-to)]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
              ${f.q}
              <span className="text-lg text-muted transition group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted">${f.a}</p>
          </details>`).join("\n          ");
  return `<section className="mx-auto max-w-3xl px-6 py-24">
        <div className="mb-10 text-center"><p className="text-sm font-semibold uppercase tracking-widest gradient-text">FAQ</p><h2 className="mt-3 text-3xl font-bold sm:text-4xl">Frequently asked</h2></div>
        <div className="space-y-3">
          ${items}
        </div>
      </section>`;
};

/* ------------------------- feature: content (files) ------------------------- */

// lib/content.ts — reads content/updates/*.md at request time (server-only).
const contentLib = (): string => `import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter, markdownToHtml, excerpt } from "@lacspace/markdown";

// how this works: every .md file in content/updates/ becomes a post. Frontmatter
// (title/date/description) is read with @lacspace/markdown; the body is rendered to
// safe HTML (raw HTML in the source is escaped, so this is XSS-safe by construction).
const DIR = path.join(process.cwd(), "content/updates");

export interface PostMeta { slug: string; title: string; date: string; description: string; }
export interface Post extends PostMeta { html: string; }

function read(slug: string): Post | null {
  const file = path.join(DIR, slug + ".md");
  if (!fs.existsSync(file)) return null;
  const { data, content } = parseFrontmatter(fs.readFileSync(file, "utf8"));
  return {
    slug,
    title: String(data.title ?? slug),
    date: String(data.date ?? ""),
    description: String(data.description ?? excerpt(content, { length: 160 })),
    html: markdownToHtml(content, { headingIds: true, openLinksInNewTab: true }),
  };
}

export function getAllPosts(): PostMeta[] {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => read(f.replace(/\\.md$/, ""))!)
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPost(slug: string): Post | null {
  return read(slug);
}
`;

// app/updates/page.tsx — the post list.
const updatesListPage = (): string => `import Link from "next/link";
import { site } from "@/lib/site";
import { getAllPosts } from "@/lib/content";

export const metadata = site.meta({ title: "Updates", path: "/updates" });

export default function UpdatesPage() {
  const posts = getAllPosts();
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold">Updates</h1>
      <p className="mt-2 text-muted">News, notes and posts. <a href="/feed.xml" className="underline">RSS</a></p>
      {posts.length === 0 && (
        <p className="mt-8 text-muted">No posts yet — add a markdown file in <code>content/updates/</code>.</p>
      )}
      <ul className="mt-8 space-y-6">
        {posts.map((p) => (
          <li key={p.slug} className="border-b border-hairline pb-6">
            <Link href={\`/updates/\${p.slug}\`} className="text-xl font-semibold hover:underline">{p.title}</Link>
            {p.date && <p className="mt-1 text-sm text-muted">{p.date}</p>}
            <p className="mt-2 text-muted">{p.description}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
`;

// app/updates/[slug]/page.tsx — a single post. The [&_h2]:… classes style the
// rendered markdown without needing global "prose" CSS, so it looks good on ANY template.
const updatePostPage = (): string => `import Link from "next/link";
import { notFound } from "next/navigation";
import { site } from "@/lib/site";
import { getAllPosts, getPost } from "@/lib/content";

export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  return site.meta({ title: post?.title ?? "Updates", path: \`/updates/\${slug}\` });
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link href="/updates" className="text-sm text-muted hover:underline">← Updates</Link>
      <h1 className="mt-4 text-3xl font-bold">{post.title}</h1>
      {post.date && <p className="mt-1 text-sm text-muted">{post.date}</p>}
      <article
        className="mt-8 leading-7 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_p]:mt-4 [&_p]:text-muted [&_a]:underline [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mt-1 [&_pre]:mt-4 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-surface [&_pre]:p-4 [&_pre]:text-sm [&_code]:text-sm"
        dangerouslySetInnerHTML={{ __html: post.html }}
      />
    </main>
  );
}
`;

// app/feed.xml/route.ts — an RSS 2.0 feed of your posts (@lacspace/rss).
const feedRoute = (): string => `import { rssResponse } from "@lacspace/rss";
import { getAllPosts } from "@/lib/content";

export const dynamic = "force-static";

export function GET() {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const items = getAllPosts().map((p) => ({
    title: p.title,
    link: base + "/updates/" + p.slug,
    description: p.description,
    // Only pass a date the feed can parse (rfc822Date throws on bad input).
    date: p.date && !Number.isNaN(Date.parse(p.date)) ? p.date : undefined,
  }));
  return rssResponse(
    { title: "Updates", link: base, description: "The latest posts and updates.", feedUrl: base + "/feed.xml" },
    items,
  );
}
`;

// app/llms.txt/route.ts — an llms.txt content index for AI crawlers (@lacspace/llms-txt).
const llmsRoute = (): string => `import { llmsTxtFromPages } from "@lacspace/llms-txt";
import { getAllPosts } from "@/lib/content";

export const dynamic = "force-static";

export function GET() {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const txt = llmsTxtFromPages(
    getAllPosts().map((p) => ({ title: p.title, url: base + "/updates/" + p.slug, content: p.description, section: "Updates" })),
    { title: "Updates", summary: "A content index for large language models." },
  );
  return new Response(txt, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
`;

const contentSampleWelcome = (ctx: Ctx): string => `---
title: Welcome to ${ctx.template.siteName}'s content section
date: 2026-01-15
description: This markdown file became a page automatically — here's how it works.
---

## It just works

Drop any \\\`.md\\\` file into \\\`content/updates/\\\` and it becomes a page at \\\`/updates/<filename>\\\`, listed on \\\`/updates\\\`, and included in \\\`/feed.xml\\\` and \\\`/llms.txt\\\`.

- Frontmatter \\\`title\\\`, \\\`date\\\` and \\\`description\\\` are read automatically.
- The body is rendered safely with \\\`@lacspace/markdown\\\` — raw HTML is escaped, so it's XSS-safe.
- Delete this file when you're ready to write your own.
`;

const contentSampleSecond = (): string => `---
title: Building in public
date: 2026-01-10
description: A second example post so the list and feed have something to show.
---

## Why a content section?

Every product needs a place for changelog posts, announcements and notes. This one is
Markdown-powered, needs no database, and ships an RSS feed and an \\\`llms.txt\\\` for free.

### Add your own

1. Create \\\`content/updates/my-post.md\\\`.
2. Add frontmatter (\\\`title\\\`, \\\`date\\\`, \\\`description\\\`).
3. Write. That's it — it appears at \\\`/updates/my-post\\\`.
`;

/* ------------------------- feature: search (files) ------------------------- */

// app/api/search/route.ts — instant BM25 search over content/**/*.md (@lacspace/rerank).
const searchRoute = (): string => `import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter, toPlainText, excerpt } from "@lacspace/markdown";
import { rerank } from "@lacspace/rerank";

// how this works: full-text search with BM25 ranking — no external service, no API
// key, no Ollama. It scans your markdown at request time and ranks matches. (For a
// big site, precompute the corpus at build time and cache it instead.)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOT = path.join(process.cwd(), "content");
// Map a content/<dir>/ to the route it renders under.
const SECTION: Record<string, string> = { updates: "/updates", posts: "/blog", docs: "/docs" };

interface Entry { id: string; title: string; url: string; text: string; }

function corpus(): Entry[] {
  if (!fs.existsSync(ROOT)) return [];
  const out: Entry[] = [];
  for (const dir of fs.readdirSync(ROOT)) {
    const full = path.join(ROOT, dir);
    if (!fs.statSync(full).isDirectory()) continue;
    const base = SECTION[dir] ?? "/" + dir;
    for (const file of fs.readdirSync(full)) {
      if (!file.endsWith(".md")) continue;
      const slug = file.replace(/\\.md$/, "");
      const { data, content } = parseFrontmatter(fs.readFileSync(path.join(full, file), "utf8"));
      out.push({ id: dir + "/" + slug, title: String(data.title ?? slug), url: base + "/" + slug, text: toPlainText(content) });
    }
  }
  return out;
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return Response.json([]);
  const docs = corpus().map((e) => ({ id: e.id, text: e.title + "\\n" + e.text, metadata: { title: e.title, url: e.url } }));
  const hits = await rerank(q, docs, { method: "bm25", k: 8 });
  return Response.json(hits.map((h) => ({
    title: String(h.metadata?.title ?? ""),
    url: String(h.metadata?.url ?? "#"),
    snippet: excerpt(h.text.split("\\n").slice(1).join(" "), { length: 140 }),
  })));
}
`;

// components/search.tsx — a debounced search box with a results dropdown.
const searchBox = (): string => `"use client";
import { useState, useEffect, useRef } from "react";

interface Result { title: string; url: string; snippet: string; }

export function Search() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      const res = await fetch("/api/search?q=" + encodeURIComponent(q));
      setResults(await res.json());
      setOpen(true);
    }, 200);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  return (
    <div className="relative w-full max-w-md">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => { if (results.length) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search…"
        className="w-full rounded-xl border border-hairline bg-surface px-4 py-2 outline-none"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-hairline bg-app shadow-lg">
          {results.map((r) => (
            <li key={r.url}>
              <a href={r.url} className="block px-4 py-3 transition hover:bg-surface">
                <p className="font-medium">{r.title}</p>
                <p className="mt-0.5 text-sm text-muted">{r.snippet}</p>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
`;

// app/search/page.tsx — a standalone search page.
const searchPage = (): string => `import { site } from "@/lib/site";
import { Search } from "@/components/search";

export const metadata = site.meta({ title: "Search", path: "/search" });

export default function SearchPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold">Search</h1>
      <p className="mt-2 text-muted">Instant, keyless full-text search over your content.</p>
      <div className="mt-8"><Search /></div>
    </main>
  );
}
`;

/* ============================ dynamic / full-stack ============================ */
/*
 * Dynamic mode wraps the Next.js app (the `static` scaffold) in an npm-workspaces
 * MONOREPO alongside a real backend:
 *
 *   <name>/
 *     ├─ package.json        ← workspaces + one-command `npm run dev` (concurrently)
 *     ├─ docker-compose.yml   ← Mongo + Redis (optional)
 *     ├─ .env.example         ← one env file for the whole project
 *     ├─ types/               ← shared API types (imported by BOTH sides — no drift)
 *     ├─ backend/             ← Node · Express · MongoDB · Redis · TypeScript API
 *     │    (JWT auth + an example CRUD resource, built on @lacspace/* packages)
 *     └─ frontend/            ← the Next.js app, wired to the API (login/account)
 *
 * It reuses buildApp() verbatim for the frontend (so nothing about the app scaffold
 * changes), then layers the backend, the shared types, and the root wiring on top.
 */

/** The npm scope for the generated workspaces, e.g. `"@my-app"`. */
const scope = (ctx: Ctx): string => `@${ctx.name}`;

/* ---- shared types workspace (type-only → zero runtime coupling) ---- */

const typesPkgJson = (ctx: Ctx): string => JSON.stringify({
  name: `${scope(ctx)}/types`,
  version: "0.1.0",
  private: true,
  // Type-only package: it ships a single .d.ts (no runtime code, nothing to build).
  types: "./index.d.ts",
  exports: { ".": { types: "./index.d.ts" } },
}, null, 2) + "\n";

const sharedTypes = (): string => `// Shared API contract — imported by BOTH the frontend and the backend, so the two
// can never drift. These are TYPE-ONLY (no runtime code), so importing them adds
// nothing to either bundle. Edit here once; both sides update. Use \`import type\`.

/** A user, as returned by the API (no password; dates are ISO strings). */
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

/** The response from POST /auth/register and POST /auth/login. */
export interface AuthResponse {
  token: string;
  user: User;
}

/** The shape of an error response from the API. */
export interface ApiError {
  error: string;
  fields?: Record<string, string>;
}

/** The example CRUD resource. Rename "Note" to your real domain object. */
export interface Note {
  id: string;
  title: string;
  body: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteInput {
  title: string;
  body?: string;
}

export interface UpdateNoteInput {
  title?: string;
  body?: string;
}
`;

/* ---- root workspace files ---- */

const rootPkgJson = (ctx: Ctx): string => JSON.stringify({
  name: ctx.name,
  version: "0.1.0",
  private: true,
  workspaces: ["types", "backend", "frontend"],
  scripts: {
    // Run the API and the frontend together (concurrently), colourised + kill-all.
    dev: 'concurrently -k -n api,web -c blue,magenta "npm:dev:api" "npm:dev:web"',
    "dev:api": `npm run dev --workspace ${scope(ctx)}/backend`,
    "dev:web": `npm run dev --workspace ${scope(ctx)}/frontend`,
    build: `npm run build --workspace ${scope(ctx)}/backend && npm run build --workspace ${scope(ctx)}/frontend`,
    start: 'concurrently -k -n api,web -c blue,magenta "npm:start:api" "npm:start:web"',
    "start:api": `npm run start --workspace ${scope(ctx)}/backend`,
    "start:web": `npm run start --workspace ${scope(ctx)}/frontend`,
    typecheck: `npm run typecheck --workspace ${scope(ctx)}/backend`,
  },
  devDependencies: { concurrently: "^9.1.0" },
  engines: { node: ">=18" },
}, null, 2) + "\n";

const dockerCompose = (ctx: Ctx): string => `# Local infrastructure for ${ctx.name}. Start it with:  docker compose up -d
# Optional — the API also runs with NO Redis, and against any MongoDB (e.g. Atlas).
services:
  mongo:
    image: mongo:7
    restart: unless-stopped
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "6379:6379"

volumes:
  mongo-data:
`;

const rootGitignore = (): string => `node_modules\n.env\n.env.local\n*.log\n.DS_Store\ndist\n.next\n`;

const rootEnvExample = (ctx: Ctx): string => `# ${ctx.name} — ONE .env for the whole monorepo.  Copy it:  cp .env.example .env
# The defaults below let the app run locally with zero changes.

# --- Backend ---
NODE_ENV=development
PORT=4000

# MongoDB. With Docker (docker compose up -d) the default just works. Or paste a
# free MongoDB Atlas connection string here.
MONGODB_URI=mongodb://localhost:27017/${ctx.name}

# Signs JWTs. In production generate a strong value:  openssl rand -hex 32
JWT_SECRET=dev-secret-change-me

# Redis is OPTIONAL — leave empty to use the in-memory cache fallback.
# With Docker, set it to:  redis://localhost:6379
REDIS_URL=

# Who may call the API (the frontend origin). Comma-separate for multiple.
CORS_ORIGIN=http://localhost:3000

# --- Frontend ---
# Where the browser calls the API. Unset = http://localhost:4000 (local default).
# NEXT_PUBLIC_API_URL=http://localhost:4000
`;

const rootReadme = (ctx: Ctx): string => `# ${ctx.name}

A full-stack app scaffolded with [create-lacspace-app](https://www.npmjs.com/package/create-lacspace-app) — a **${ctx.template.label}** frontend + a real backend, wired together.

\`\`\`
${ctx.name}/
├─ frontend/   Next.js 15 app (your UI) — talks to the API
├─ backend/    Node · Express · MongoDB · Redis · TypeScript API
├─ types/      Shared API types — imported by BOTH sides, so they can't drift
└─ docker-compose.yml   Mongo + Redis for local dev (optional)
\`\`\`

## Quick start

\`\`\`bash
cp .env.example .env         # one env file for everything (sensible defaults)
docker compose up -d         # optional: starts MongoDB + Redis locally
npm install                  # installs all three workspaces at once
npm run dev                  # runs the API (:4000) and the frontend (:3000) together
\`\`\`

Then open **http://localhost:3000** → visit **/register**, create an account, and you'll land on **/account** — a protected page that reads/writes the example "notes" resource through the API.

**No Docker?** Point \`MONGODB_URI\` at any MongoDB (a free [Atlas](https://www.mongodb.com/atlas) cluster works). Redis is optional — leave \`REDIS_URL\` empty and the API uses an in-memory cache instead.

## What's already built

- **Auth** — \`POST /auth/register\`, \`POST /auth/login\` (JWT), \`GET /auth/me\`. Passwords hashed with \`@lacspace/password\`, tokens signed/verified with \`@lacspace/jwt\`.
- **Example CRUD** — \`/notes\` (list · create · read · update · delete), protected, per-user, with a per-user cache (Redis or in-memory) that busts on writes.
- **Validation** — request bodies validated with \`@lacspace/validate\`; failures return a clean 400.
- **Rate limiting** — auth endpoints throttled with \`@lacspace/rate-limit\`.
- **Typed env** — \`@lacspace/env\` fails fast at boot if config is wrong.

Everything on the backend is built from zero-dependency \`@lacspace/*\` packages → https://lacspace.com/packages

## Make it yours

Rename the \`Note\` resource (in \`types/index.d.ts\`, \`backend/src/models/note.ts\`, \`backend/src/routes/notes.ts\`) to your real domain object, then follow the same pattern for more resources. The shared \`types/\` package keeps the frontend and backend in lock-step.
`;

/* ---- frontend ↔ backend wiring ---- */

const frontendApiClient = (ctx: Ctx): string => `import type { AuthResponse, User, Note, CreateNoteInput, ApiError } from "${scope(ctx)}/types";

// how this works: a tiny typed fetch wrapper around the backend API. The response
// shapes come from the shared "${scope(ctx)}/types" package — the SAME types the
// backend uses — so the client and server can never disagree about the contract.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const TOKEN_KEY = "${ctx.name}_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch {}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(\`\${BASE}\${path}\`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: \`Bearer \${token}\` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = "Request failed";
    try { message = ((await res.json()) as ApiError).error ?? message; } catch {}
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  register: (input: { name: string; email: string; password: string }) =>
    request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify(input) }),
  login: (input: { email: string; password: string }) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(input) }),
  me: () => request<User>("/auth/me"),
  listNotes: () => request<Note[]>("/notes"),
  createNote: (input: CreateNoteInput) =>
    request<Note>("/notes", { method: "POST", body: JSON.stringify(input) }),
  deleteNote: (id: string) => request<void>(\`/notes/\${id}\`, { method: "DELETE" }),
};
`;

const frontendLoginPage = (): string => `"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, setToken } from "@/lib/api";

// how this works: posts to the backend /auth/login, stores the returned JWT, then
// redirects to /account. Every request after this sends the token automatically.
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { token } = await api.login({ email, password });
      setToken(token);
      router.push("/account");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-bold">Welcome back</h1>
      <p className="mt-1 text-muted">Sign in to your account.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="you@example.com" className="w-full rounded-xl border border-hairline bg-surface px-4 py-3 outline-none" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required placeholder="Password" className="w-full rounded-xl border border-hairline bg-surface px-4 py-3 outline-none" />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button disabled={busy} className="w-full rounded-full gradient-bg px-4 py-3 font-semibold on-accent transition hover:opacity-90 disabled:opacity-60">{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="mt-4 text-sm text-muted">No account? <Link href="/register" className="underline">Create one</Link></p>
    </main>
  );
}
`;

const frontendRegisterPage = (): string => `"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, setToken } from "@/lib/api";

// how this works: posts to /auth/register, stores the JWT, redirects to /account.
export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { token } = await api.register({ name, email, password });
      setToken(token);
      router.push("/account");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-bold">Create your account</h1>
      <p className="mt-1 text-muted">It takes a few seconds.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Your name" className="w-full rounded-xl border border-hairline bg-surface px-4 py-3 outline-none" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="you@example.com" className="w-full rounded-xl border border-hairline bg-surface px-4 py-3 outline-none" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={8} placeholder="Password (min 8 chars)" className="w-full rounded-xl border border-hairline bg-surface px-4 py-3 outline-none" />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button disabled={busy} className="w-full rounded-full gradient-bg px-4 py-3 font-semibold on-accent transition hover:opacity-90 disabled:opacity-60">{busy ? "Creating…" : "Create account"}</button>
      </form>
      <p className="mt-4 text-sm text-muted">Already have one? <Link href="/login" className="underline">Sign in</Link></p>
    </main>
  );
}
`;

const frontendAccountPage = (ctx: Ctx): string => `"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, setToken } from "@/lib/api";
import type { User, Note } from "${scope(ctx)}/types";

// how this works: a PROTECTED page. On mount it calls /auth/me with the stored
// token; if that fails it bounces to /login. Notes are the example CRUD resource.
export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) { router.push("/login"); return; }
    (async () => {
      try {
        setUser(await api.me());
        setNotes(await api.listNotes());
      } catch { setToken(null); router.push("/login"); }
    })();
  }, [router]);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const note = await api.createNote({ title, body });
      setNotes((prev) => [note, ...prev]);
      setTitle(""); setBody("");
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to save"); }
  }
  async function remove(id: string) {
    await api.deleteNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }
  function signOut() { setToken(null); router.push("/login"); }

  if (!user) return <main className="mx-auto max-w-2xl px-6 py-16 text-muted">Loading…</main>;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hi, {user.name}</h1>
          <p className="text-muted">{user.email}</p>
        </div>
        <button onClick={signOut} className="rounded-full border border-hairline px-4 py-2 text-sm transition hover:bg-surface">Sign out</button>
      </div>

      <form onSubmit={addNote} className="mt-8 space-y-3 rounded-2xl border border-hairline bg-surface p-5">
        <h2 className="font-semibold">Add a note</h2>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Title" className="w-full rounded-xl border border-hairline bg-app px-4 py-2 outline-none" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write something…" rows={3} className="w-full rounded-xl border border-hairline bg-app px-4 py-2 outline-none" />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="rounded-full gradient-bg px-4 py-2 text-sm font-semibold on-accent">Save note</button>
      </form>

      <ul className="mt-6 space-y-3">
        {notes.length === 0 && <li className="text-muted">No notes yet — add your first above.</li>}
        {notes.map((n) => (
          <li key={n.id} className="flex items-start justify-between rounded-2xl border border-hairline p-4">
            <div>
              <p className="font-medium">{n.title}</p>
              {n.body && <p className="mt-1 text-sm text-muted">{n.body}</p>}
            </div>
            <button onClick={() => remove(n.id)} className="shrink-0 text-sm text-muted transition hover:text-red-400">Delete</button>
          </li>
        ))}
      </ul>
    </main>
  );
}
`;

/**
 * Build a full-stack monorepo file map: the Next.js app under `frontend/`, a
 * Node/Express/MongoDB/Redis API under `backend/`, a shared `types/` package, and
 * the root workspace wiring. Reuses buildApp() verbatim for the frontend.
 */
function buildFullStack(ctx: Ctx): Record<string, string> {
  const out: Record<string, string> = {};
  const s = scope(ctx);

  // 1. Frontend = the standard Next.js app, moved under frontend/.
  const app = buildApp(ctx);
  for (const [rel, content] of Object.entries(app)) out[`frontend/${rel}`] = content;

  // 2. Make the frontend a workspace: scoped name + a dep on the shared types.
  const fpkg = JSON.parse(out["frontend/package.json"]!) as { name: string; dependencies: Record<string, string> };
  fpkg.name = `${s}/frontend`;
  fpkg.dependencies[`${s}/types`] = "*";
  out["frontend/package.json"] = JSON.stringify(fpkg, null, 2) + "\n";

  // 3. Resolve the shared types from the frontend (tsconfig path + transpile).
  const fts = JSON.parse(out["frontend/tsconfig.json"]!) as { compilerOptions: { paths: Record<string, string[]> } };
  fts.compilerOptions.paths[`${s}/types`] = ["../types/index.d.ts"];
  out["frontend/tsconfig.json"] = JSON.stringify(fts, null, 2) + "\n";
  // next.config stays the base one — the shared types are type-only (erased at
  // build), so no transpilePackages / runtime resolution is needed.

  // 4. Document the API URL alongside the frontend's own env.
  const fenv = out["frontend/.env.example"] ?? "";
  out["frontend/.env.example"] = (fenv.endsWith("\n") || fenv === "" ? fenv : fenv + "\n") +
    "\n# The backend API base URL. Unset = http://localhost:4000 (local default).\n# NEXT_PUBLIC_API_URL=http://localhost:4000\n";

  // 5. Frontend ↔ backend wiring: a typed API client + auth/account pages.
  out["frontend/lib/api.ts"] = frontendApiClient(ctx);
  out["frontend/app/login/page.tsx"] = frontendLoginPage();
  out["frontend/app/register/page.tsx"] = frontendRegisterPage();
  out["frontend/app/account/page.tsx"] = frontendAccountPage(ctx);

  // 6. The backend workspace (Express · MongoDB · Redis · JWT auth · CRUD).
  Object.assign(out, backendFiles(ctx));

  // 7. The shared types workspace (a single .d.ts — type-only, no build).
  out["types/package.json"] = typesPkgJson(ctx);
  out["types/index.d.ts"] = sharedTypes();

  // 8. Root workspace: one install, one `npm run dev`, Docker for Mongo + Redis.
  out["package.json"] = rootPkgJson(ctx);
  out["docker-compose.yml"] = dockerCompose(ctx);
  out[".gitignore"] = rootGitignore();
  out[".env.example"] = rootEnvExample(ctx);
  out["README.md"] = rootReadme(ctx);

  return out;
}

/* ---- backend workspace (Node · Express · MongoDB · Redis · TypeScript) ---- */

const backendPkgJson = (ctx: Ctx): string => JSON.stringify({
  name: `${scope(ctx)}/backend`,
  version: "0.1.0",
  private: true,
  type: "module",
  main: "dist/index.js",
  scripts: {
    dev: "tsx watch src/index.ts",
    build: "tsc -p tsconfig.json",
    start: "node dist/index.js",
    typecheck: "tsc -p tsconfig.json --noEmit",
  },
  dependencies: {
    express: "^4.21.2",
    cors: "^2.8.5",
    mongoose: "^8.9.0",
    ioredis: "^5.4.2",
    dotenv: "^16.4.7",
    // ✨ Backend built on zero-dep @lacspace/* packages instead of the usual grab-bag.
    "@lacspace/env": "^1.1.0",
    "@lacspace/jwt": "^1.4.0",
    "@lacspace/password": "^1.1.0",
    "@lacspace/validate": "^1.1.0",
    "@lacspace/id": "^1.1.0",
    "@lacspace/rate-limit": "^1.2.0",
    "@lacspace/cache": "^1.1.0",
    [`${scope(ctx)}/types`]: "*",
  },
  devDependencies: {
    typescript: "^5.7.0",
    tsx: "^4.19.2",
    "@types/node": "^22.10.0",
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
  },
}, null, 2) + "\n";

const backendTsconfig = (ctx: Ctx): string => JSON.stringify({
  compilerOptions: {
    target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext",
    lib: ["ES2022"], esModuleInterop: true, allowSyntheticDefaultImports: true,
    strict: true, skipLibCheck: true, resolveJsonModule: true,
    outDir: "dist", rootDir: "src", sourceMap: true, types: ["node"],
    baseUrl: ".", paths: { [`${scope(ctx)}/types`]: ["../types/index.d.ts"] },
  },
  include: ["src/**/*"],
  exclude: ["node_modules", "dist"],
}, null, 2) + "\n";

const backendGitignore = (): string => `node_modules\ndist\n.env\n*.log\n`;

const backendReadme = (ctx: Ctx): string => `# ${ctx.name} — API

Node · Express · MongoDB · Redis (optional) · TypeScript. Built on zero-dependency \`@lacspace/*\` packages.

Run it from the repo root with \`npm run dev\` (starts this API + the frontend). Standalone: \`npm run dev\` inside this folder.

## Endpoints

| Method | Path             | Auth | Description                    |
|--------|------------------|------|--------------------------------|
| GET    | \`/health\`        | —    | Liveness check                 |
| POST   | \`/auth/register\` | —    | Create an account → JWT + user |
| POST   | \`/auth/login\`    | —    | Log in → JWT + user            |
| GET    | \`/auth/me\`       | ✓    | The current user               |
| GET    | \`/notes\`         | ✓    | List your notes (cached)       |
| POST   | \`/notes\`         | ✓    | Create a note                  |
| GET    | \`/notes/:id\`     | ✓    | Read one note                  |
| PATCH  | \`/notes/:id\`     | ✓    | Update a note                  |
| DELETE | \`/notes/:id\`     | ✓    | Delete a note                  |

Send \`Authorization: Bearer <token>\` for the ✓ routes (you get the token from register/login).

## Layout

\`\`\`
src/
├─ index.ts        boot: load env → connect Mongo → listen
├─ load-env.ts     loads the root .env (imported first)
├─ env.ts          typed, validated env (@lacspace/env)
├─ app.ts          the Express app (CORS, routes, error handler)
├─ db.ts           Mongoose connection
├─ cache.ts        Redis, or an in-memory fallback (@lacspace/cache)
├─ http.ts         HttpError + asyncHandler
├─ validation.ts   request schemas (@lacspace/validate)
├─ middleware/     auth (@lacspace/jwt) + error handling
├─ models/         Mongoose models (User, Note)
└─ routes/         auth + notes (the example CRUD resource)
\`\`\`
`;

const backendLoadEnv = (): string => `import { config } from "dotenv";
import { resolve } from "node:path";

// how this works: the whole monorepo shares ONE .env at the repo root. When this
// API runs via \`npm run dev\` its working directory is backend/, so the root .env
// is one level up. This module is imported FIRST (before env.ts) so the variables
// exist by the time anything reads them.
config({ path: resolve(process.cwd(), "../.env") });
config(); // also load backend/.env if you keep one (root values already set win)
`;

const backendEnv = (ctx: Ctx): string => `import { createEnv, str, port, oneOf } from "@lacspace/env";

// how this works: fail-fast, TYPED environment variables (@lacspace/env). Bad or
// missing values throw at boot with a clear message. Sensible dev defaults mean it
// runs with zero config against a local MongoDB; set real values in the root .env.
export const env = createEnv({
  NODE_ENV: oneOf(["development", "production", "test"], { default: "development" }),
  PORT: port({ default: 4000 }),
  MONGODB_URI: str({ default: "mongodb://localhost:27017/${ctx.name}" }),
  JWT_SECRET: str({ default: "dev-secret-change-me" }),
  REDIS_URL: str({ optional: true }),
  CORS_ORIGIN: str({ default: "http://localhost:3000" }),
});

if (env.NODE_ENV === "production" && env.JWT_SECRET === "dev-secret-change-me") {
  throw new Error("Set a strong JWT_SECRET in production (see .env.example).");
}
`;

const backendIndex = (ctx: Ctx): string => `import "./load-env.js"; // MUST be first: fills process.env before anything reads it
import { env } from "./env.js";
import { connectDb } from "./db.js";
import { createApp } from "./app.js";

// how this works: connect to MongoDB, build the Express app, then listen.
async function main(): Promise<void> {
  await connectDb(env.MONGODB_URI);
  const app = createApp();
  app.listen(env.PORT, () => {
    console.log(\`🚀 ${ctx.name} API ready on http://localhost:\${env.PORT}\`);
  });
}

main().catch((err) => {
  console.error("Failed to start the API:", err);
  process.exit(1);
});
`;

const backendDb = (): string => `import mongoose from "mongoose";

// how this works: opens the Mongoose connection. Call once at boot.
export async function connectDb(uri: string): Promise<void> {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  console.log("✔ MongoDB connected");
}
`;

const backendCache = (): string => `import { createCache } from "@lacspace/cache";
import { Redis } from "ioredis";
import { env } from "./env.js";

// how this works: one cache interface, TWO backends. If REDIS_URL is set we use
// Redis; otherwise we fall back to @lacspace/cache (zero-dep, in-memory) so the app
// runs with NO Redis at all. The rest of the code doesn't care which is active.
export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  readonly kind: "redis" | "memory";
}

function redisCache(url: string): Cache {
  const client = new Redis(url, { maxRetriesPerRequest: 2 });
  client.on("error", (e: Error) => console.warn("⚠ Redis error:", e.message));
  return {
    kind: "redis",
    async get(key) { return client.get(key); },
    async set(key, value, ttl) { if (ttl) await client.set(key, value, "EX", ttl); else await client.set(key, value); },
    async del(key) { await client.del(key); },
  };
}

function memoryCache(): Cache {
  const mem = createCache<string>({ max: 5000 });
  return {
    kind: "memory",
    async get(key) { return mem.get(key) ?? null; },
    async set(key, value, ttl) { mem.set(key, value, ttl ? ttl * 1000 : undefined); },
    async del(key) { mem.delete(key); },
  };
}

export const cache: Cache = env.REDIS_URL ? redisCache(env.REDIS_URL) : memoryCache();
console.log(\`✔ Cache: \${cache.kind}\${cache.kind === "memory" ? " (no REDIS_URL — in-memory fallback)" : ""}\`);
`;

const backendHttp = (): string => `import type { Request, Response, NextFunction, RequestHandler } from "express";

/** A simple HTTP error with a status code — throw it from any handler. */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

// how this works: Express v4 doesn't catch rejected Promises from async handlers,
// so wrap them — any thrown error is forwarded to the error middleware.
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };
`;

const backendExpressTypes = (): string => `// Adds req.user (populated by requireAuth) to Express's Request type.
import "express";

declare global {
  namespace Express {
    interface Request {
      user?: { sub: string; email: string; iat?: number; exp?: number; iss?: string };
    }
  }
}

export {};
`;

const backendErrorMw = (): string => `import type { Request, Response, NextFunction } from "express";
import { ValidationError } from "@lacspace/validate";
import { HttpError } from "../http.js";

// how this works: ONE place that turns thrown errors into clean JSON responses.
// Register it LAST (after all routes). Express identifies it by its 4 arguments.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ValidationError) {
    res.status(400).json({ error: "Validation failed", fields: err.flatten() });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
`;

const backendAuthMw = (ctx: Ctx): string => `import type { RequestHandler } from "express";
import { expressJwt } from "@lacspace/jwt";
import { env } from "../env.js";

// how this works: verifies the "Authorization: Bearer <token>" header with
// @lacspace/jwt and attaches the decoded payload to req.user (see express.d.ts).
// Missing/invalid token → it responds 401 automatically. Put it on any route you
// want protected:  router.get("/secret", requireAuth, handler)
// (@lacspace/jwt's middleware is framework-agnostic, so we cast it to Express's
//  RequestHandler — it's a standard (req, res, next) function underneath.)
export const requireAuth = expressJwt(env.JWT_SECRET, { issuer: "${ctx.name}-api" }) as unknown as RequestHandler;
`;

const backendUserModel = (): string => `import mongoose from "mongoose";
import { uuidv7 } from "@lacspace/id";

// how this works: the User fields. _id is a time-sortable UUID (@lacspace/id)
// instead of an ObjectId, so ids are readable and orderable. We store only a
// password HASH, never the raw password. (We DON'T extend mongoose.Document — that
// would force _id to be an ObjectId; a plain interface lets _id be our string.)
export interface UserDoc {
  _id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new mongoose.Schema<UserDoc>(
  {
    _id: { type: String, default: () => uuidv7() },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true },
);

export const User =
  (mongoose.models.User as mongoose.Model<UserDoc>) ?? mongoose.model<UserDoc>("User", userSchema);
`;

const backendNoteModel = (): string => `import mongoose from "mongoose";
import { uuidv7 } from "@lacspace/id";

// how this works: the example CRUD resource. Rename "Note" to your real domain
// object (Task, Post, Product…) and add fields — the routes follow the same shape.
// (Plain interface, not mongoose.Document, so _id can be our string UUID.)
export interface NoteDoc {
  _id: string;
  title: string;
  body: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

const noteSchema = new mongoose.Schema<NoteDoc>(
  {
    _id: { type: String, default: () => uuidv7() },
    title: { type: String, required: true, trim: true },
    body: { type: String, default: "" },
    userId: { type: String, required: true, index: true },
  },
  { timestamps: true },
);

export const Note =
  (mongoose.models.Note as mongoose.Model<NoteDoc>) ?? mongoose.model<NoteDoc>("Note", noteSchema);
`;

const backendValidation = (): string => `import { v, type Infer } from "@lacspace/validate";

// how this works: Zod-like schemas (@lacspace/validate). .parse(body) throws a
// ValidationError on bad input, which the error middleware turns into a clean 400
// with per-field messages.
export const RegisterInput = v.object({
  name: v.string().min(2).max(80),
  email: v.string().email(),
  password: v.string().min(8).max(200),
});

export const LoginInput = v.object({
  email: v.string().email(),
  password: v.string().min(1),
});

export const NoteInput = v.object({
  title: v.string().min(1).max(200),
  body: v.string().max(10_000).default(""),
});

export type RegisterBody = Infer<typeof RegisterInput>;
export type LoginBody = Infer<typeof LoginInput>;
export type NoteBody = Infer<typeof NoteInput>;
`;

const backendAuthRoutes = (ctx: Ctx): string => `import express from "express";
import { hash, verify as verifyPassword } from "@lacspace/password";
import { sign } from "@lacspace/jwt";
import { asyncHandler, HttpError } from "../http.js";
import { requireAuth } from "../middleware/auth.js";
import { User, type UserDoc } from "../models/user.js";
import { env } from "../env.js";
import { RegisterInput, LoginInput } from "../validation.js";
import type { AuthResponse, User as UserDTO } from "${scope(ctx)}/types";

const ISSUER = "${ctx.name}-api";
const WEEK = 60 * 60 * 24 * 7; // token lifetime, in seconds
const router = express.Router();

function toDTO(u: UserDoc): UserDTO {
  return { id: String(u._id), email: u.email, name: u.name, createdAt: u.createdAt.toISOString() };
}
function tokenFor(u: UserDoc): Promise<string> {
  return sign({ sub: String(u._id), email: u.email }, env.JWT_SECRET, { expiresIn: WEEK, issuer: ISSUER });
}

// POST /auth/register — create an account, return a JWT + the user.
router.post("/register", asyncHandler(async (req, res) => {
  const { name, email, password } = RegisterInput.parse(req.body);
  if (await User.findOne({ email })) throw new HttpError(409, "That email is already registered");
  const passwordHash = await hash(password); // PBKDF2 via @lacspace/password
  const user = await User.create({ name, email, passwordHash });
  const out: AuthResponse = { token: await tokenFor(user), user: toDTO(user) };
  res.status(201).json(out);
}));

// POST /auth/login — verify credentials, return a JWT + the user.
router.post("/login", asyncHandler(async (req, res) => {
  const { email, password } = LoginInput.parse(req.body);
  const user = await User.findOne({ email });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new HttpError(401, "Invalid email or password");
  }
  const out: AuthResponse = { token: await tokenFor(user), user: toDTO(user) };
  res.json(out);
}));

// GET /auth/me — the current user (requires a valid token).
router.get("/me", requireAuth, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user!.sub);
  if (!user) throw new HttpError(404, "User not found");
  res.json(toDTO(user));
}));

export default router;
`;

const backendNoteRoutes = (ctx: Ctx): string => `import express from "express";
import { asyncHandler, HttpError } from "../http.js";
import { requireAuth } from "../middleware/auth.js";
import { Note, type NoteDoc } from "../models/note.js";
import { cache } from "../cache.js";
import { NoteInput } from "../validation.js";
import type { Note as NoteDTO } from "${scope(ctx)}/types";

const router = express.Router();
router.use(requireAuth); // every /notes route requires a valid token

function toDTO(n: NoteDoc): NoteDTO {
  return {
    id: String(n._id),
    title: n.title,
    body: n.body,
    userId: String(n.userId),
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
  };
}
const listKey = (userId: string): string => \`notes:\${userId}\`;

// GET /notes — this user's notes. Cached for 30s (Redis or in-memory); every write
// below busts the cache, so reads are fast but never stale after a change.
router.get("/", asyncHandler(async (req, res) => {
  const userId = req.user!.sub;
  const cached = await cache.get(listKey(userId));
  if (cached) { res.json(JSON.parse(cached) as NoteDTO[]); return; }
  const notes = await Note.find({ userId }).sort({ createdAt: -1 });
  const dto = notes.map(toDTO);
  await cache.set(listKey(userId), JSON.stringify(dto), 30);
  res.json(dto);
}));

// POST /notes — create a note.
router.post("/", asyncHandler(async (req, res) => {
  const userId = req.user!.sub;
  const { title, body } = NoteInput.parse(req.body);
  const note = await Note.create({ title, body, userId });
  await cache.del(listKey(userId));
  res.status(201).json(toDTO(note));
}));

// GET /notes/:id — one note (only if it's yours).
router.get("/:id", asyncHandler(async (req, res) => {
  const note = await Note.findOne({ _id: req.params.id, userId: req.user!.sub });
  if (!note) throw new HttpError(404, "Note not found");
  res.json(toDTO(note));
}));

// PATCH /notes/:id — update a note.
router.patch("/:id", asyncHandler(async (req, res) => {
  const patch = NoteInput.partial().parse(req.body);
  const note = await Note.findOneAndUpdate({ _id: req.params.id, userId: req.user!.sub }, { $set: patch }, { new: true });
  if (!note) throw new HttpError(404, "Note not found");
  await cache.del(listKey(req.user!.sub));
  res.json(toDTO(note));
}));

// DELETE /notes/:id — delete a note.
router.delete("/:id", asyncHandler(async (req, res) => {
  const note = await Note.findOneAndDelete({ _id: req.params.id, userId: req.user!.sub });
  if (!note) throw new HttpError(404, "Note not found");
  await cache.del(listKey(req.user!.sub));
  res.status(204).end();
}));

export default router;
`;

const backendApp = (ctx: Ctx): string => `import express from "express";
import type { RequestHandler } from "express";
import cors from "cors";
import { rateLimit, expressRateLimit } from "@lacspace/rate-limit";
import { env } from "./env.js";
import { errorHandler } from "./middleware/error.js";
import authRoutes from "./routes/auth.js";
import noteRoutes from "./routes/notes.js";

// how this works: assembles the Express app — CORS for the frontend, JSON parsing,
// a health check, the auth + notes routers, then the error handler LAST.
export function createApp(): express.Express {
  const app = express();

  app.use(cors({ origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()), credentials: true }));
  app.use(express.json());

  // Brute-force protection on auth: 20 requests / minute / IP (@lacspace/rate-limit).
  const authLimiter = expressRateLimit(rateLimit({ limit: 20, windowMs: 60_000 })) as unknown as RequestHandler;

  app.get("/health", (_req, res) => { res.json({ ok: true, service: "${ctx.name}-api" }); });
  app.use("/auth", authLimiter, authRoutes);
  app.use("/notes", noteRoutes);

  app.use(errorHandler);
  return app;
}
`;

/** The backend workspace as a `{ path: contents }` map. */
function backendFiles(ctx: Ctx): Record<string, string> {
  return {
    "backend/package.json": backendPkgJson(ctx),
    "backend/tsconfig.json": backendTsconfig(ctx),
    "backend/.gitignore": backendGitignore(),
    "backend/README.md": backendReadme(ctx),
    "backend/src/index.ts": backendIndex(ctx),
    "backend/src/load-env.ts": backendLoadEnv(),
    "backend/src/env.ts": backendEnv(ctx),
    "backend/src/db.ts": backendDb(),
    "backend/src/cache.ts": backendCache(),
    "backend/src/app.ts": backendApp(ctx),
    "backend/src/http.ts": backendHttp(),
    "backend/src/express.d.ts": backendExpressTypes(),
    "backend/src/validation.ts": backendValidation(),
    "backend/src/middleware/auth.ts": backendAuthMw(ctx),
    "backend/src/middleware/error.ts": backendErrorMw(),
    "backend/src/models/user.ts": backendUserModel(),
    "backend/src/models/note.ts": backendNoteModel(),
    "backend/src/routes/auth.ts": backendAuthRoutes(ctx),
    "backend/src/routes/notes.ts": backendNoteRoutes(ctx),
  };
}

/* ------------------------------ cli ------------------------------ */

interface Args { name?: string; template?: string; theme?: string; features: string[]; mode?: "static" | "dynamic"; yes: boolean; install: boolean; git: boolean; pm: string; help: boolean; }

const splitList = (s: string): string[] => s.split(",").map((x) => x.trim()).filter(Boolean);

function parseArgs(list: string[]): Args {
  const a: Args = { features: [], yes: false, install: true, git: true, pm: "npm", help: false };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const next = (): string => list[++i] ?? "";
    if (arg === "-t" || arg === "--template") a.template = next();
    else if (arg === "-y" || arg === "--yes") a.yes = true;
    else if (arg === "--no-install") a.install = false;
    else if (arg === "--no-git") a.git = false;
    else if (arg === "--pm") a.pm = next();
    else if (arg === "--theme" || arg === "--accent") a.theme = next();
    else if (arg === "--with" || arg === "--features") a.features.push(...splitList(next()));
    else if (arg === "--fullstack" || arg === "--full-stack" || arg === "--dynamic") a.mode = "dynamic";
    else if (arg === "--static") a.mode = "static";
    else if (arg === "--mode") { const m = next().toLowerCase(); a.mode = m === "dynamic" ? "dynamic" : "static"; }
    else if (arg.startsWith("--mode=")) { const m = arg.slice(7).toLowerCase(); a.mode = m === "dynamic" ? "dynamic" : "static"; }
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg.startsWith("--template=")) a.template = arg.slice(11);
    else if (arg.startsWith("--theme=")) a.theme = arg.slice(8);
    else if (arg.startsWith("--accent=")) a.theme = arg.slice(9);
    else if (arg.startsWith("--with=")) a.features.push(...splitList(arg.slice(7)));
    else if (arg.startsWith("--features=")) a.features.push(...splitList(arg.slice(11)));
    else if (!arg.startsWith("-") && !a.name) a.name = arg;
  }
  return a;
}

/* ------------------------- theme / accent customisation ------------------------- */

// Named accent presets → [from, to] gradient stops. `--theme lacspace`, etc.
const THEMES: Record<string, [string, string]> = {
  lacspace: ["#0bb9d9", "#7c3aed"], violet: ["#7c3aed", "#ec4899"], indigo: ["#6366f1", "#a855f7"],
  blue: ["#2563eb", "#06b6d4"], cyan: ["#0891b2", "#22d3ee"], sky: ["#0ea5e9", "#38bdf8"],
  teal: ["#0d9488", "#22c55e"], emerald: ["#10b981", "#14b8a6"], green: ["#16a34a", "#4ade80"],
  lime: ["#65a30d", "#a3e635"], amber: ["#f59e0b", "#f97316"], orange: ["#ea580c", "#f59e0b"],
  red: ["#dc2626", "#f97316"], rose: ["#e11d48", "#fb7185"], pink: ["#db2777", "#f472b6"],
  fuchsia: ["#c026d3", "#f0abfc"], purple: ["#9333ea", "#d946ef"], slate: ["#475569", "#94a3b8"],
  sunset: ["#f97316", "#db2777"], ocean: ["#0ea5e9", "#6366f1"], forest: ["#16a34a", "#65a30d"],
  aurora: ["#22d3ee", "#a855f7"], gold: ["#d97706", "#facc15"],
};

const normHex = (h: string): string | null => {
  let s = h.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(s)) s = s.split("").map((ch) => ch + ch).join("");
  return /^[0-9a-fA-F]{6}$/.test(s) ? "#" + s.toLowerCase() : null;
};
const hexToRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = (r: number, g: number, b: number): string =>
  "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");
const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b); let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6;
  }
  return [h * 360, s, l];
};
const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const hue = (t: number): number => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255];
};
// A single hex → a pleasing 2-stop gradient (hue-rotated, slightly lighter second stop).
const hexPair = (hex: string): [string, string] => {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  const [r2, g2, b2] = hslToRgb(h + 28, Math.min(1, s + 0.05), Math.min(0.72, l + 0.1));
  return [hex, rgbToHex(r2, g2, b2)];
};

// Resolve a --theme value into [from, to], or null to keep the template default.
function resolveAccent(theme: string | undefined): [string, string] | null {
  if (!theme) return null;
  const key = theme.toLowerCase().trim();
  if (THEMES[key]) return THEMES[key];
  if (key.includes(",")) {
    const [a, b] = key.split(",").map((p) => normHex(p));
    if (a && b) return [a, b];
    if (a) return hexPair(a);
    return null;
  }
  const one = normHex(key);
  return one ? hexPair(one) : null;
}

const HELP = `
${c("bold", "create-lacspace-app")} — scaffold a beautiful Next.js app, Lacspace-wired

${c("bold", "Usage")}
  npm create lacspace-app@latest <name> [options]
  npx create-lacspace-app <name> --template <key>
  npx create-lacspace-app add <section...>   ${c("dim", "# grow an existing app")}

${c("bold", "Templates")}
${TEMPLATES.map((t) => `  ${t.key.padEnd(10)} ${t.description}`).join("\n")}

${c("bold", "Options")}
  -t, --template <key>   Template (${TEMPLATES.map((t) => t.key).join(" | ")})
  --fullstack            Full-stack monorepo: Next.js frontend + Node/Express/
                         MongoDB/Redis backend (JWT auth + CRUD) + shared types
                         ${c("dim", "(alias --dynamic; default is --static, a single Next.js app)")}
  --with <a,b>           Feature add-ons, comma-separated (alias --features)
  --theme <name|hex>     Accent: a preset, a "#hex", or "from,to" (e.g. --theme lacspace)
  --pm <npm|pnpm|yarn|bun>  Package manager (default npm)
  --no-install           Skip installing dependencies
  --no-git               Skip git init
  -y, --yes              Accept defaults (needs <name>)
  -h, --help             Show this help

${c("bold", "Feature add-ons")} ${c("dim", "(--with) — free & keyless, local by default")}
${FEATURES.map((f) => `  ${f.key.padEnd(10)} ${f.description}`).join("\n")}
  ${c("dim", "e.g. npx create-lacspace-app my-app --template saas --with ai-chat,rag")}

${c("bold", "Themes")} ${c("dim", "(--theme)")}
  ${Object.keys(THEMES).join(" · ")}
  ${c("dim", 'or a custom colour: --theme "#ff6a00"  ·  --theme "#0bb9d9,#7c3aed"')}

${c("bold", "Grow an existing app")}
  npx create-lacspace-app add pricing faq testimonials   ${c("dim", "# prebuilt sections")}
  npx create-lacspace-app add ai-chat                    ${c("dim", "# a feature add-on")}
  ${c("dim", "Drops themed sections / feature files into your project (and the UI kit if missing).")}
`;

/* ------------------------- `add` — grow an existing app ------------------------- */

// Prebuilt, drop-in page SECTIONS. `npx create-lacspace-app add pricing faq` writes
// these into components/sections/ so you can compose new pages after scaffolding.
export const SECTIONS: Record<string, string> = {
  hero: `import Link from "next/link";
import { Pill } from "@/components/ui";

export function HeroSection() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-32 text-center">
      <Pill>New</Pill>
      <h1 className="text-display mt-6">Build something <span className="gradient-text">people love</span></h1>
      <p className="lead mx-auto mt-6 max-w-xl">A confident headline and one sentence that sells the outcome — edit me.</p>
      <div className="mt-9 flex flex-wrap justify-center gap-3">
        <Link href="/contact" className="shimmer rounded-full gradient-bg px-7 py-3.5 font-semibold on-accent transition hover:-translate-y-0.5">Get started</Link>
        <Link href="/about" className="rounded-full border border-hairline px-7 py-3.5 font-semibold transition hover:bg-surface">Learn more</Link>
      </div>
    </section>
  );
}
`,
  features: `import { Section, FeatureCard } from "@/components/ui";

const ITEMS = [
  { icon: "⚡", title: "Fast", desc: "Server-rendered and instant by default." },
  { icon: "🔒", title: "Secure", desc: "Sensible security headers out of the box." },
  { icon: "🎨", title: "Beautiful", desc: "A polished, themeable design system." },
  { icon: "🔎", title: "SEO-ready", desc: "Metadata, JSON-LD and sitemaps wired." },
  { icon: "📱", title: "Responsive", desc: "Looks great on every screen." },
  { icon: "🌗", title: "Dark mode", desc: "Light, dark and system — no flash." },
];

export function FeaturesSection() {
  return (
    <Section eyebrow="Features" title="Everything you need">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {ITEMS.map((f) => <FeatureCard key={f.title} icon={f.icon} title={f.title} desc={f.desc} />)}
      </div>
    </Section>
  );
}
`,
  pricing: `import { Section, PricingTable } from "@/components/ui";

export function PricingSection() {
  return (
    <Section eyebrow="Pricing" title="Simple, transparent pricing">
      <PricingTable tiers={[
        { name: "Starter", price: "$0", period: "mo", features: ["1 project", "Community support", "Basic analytics"] },
        { name: "Pro", price: "$29", period: "mo", featured: true, features: ["Unlimited projects", "Priority support", "Advanced analytics", "Custom domain"] },
        { name: "Scale", price: "Custom", features: ["SSO & SAML", "Dedicated support", "SLA & audit logs"] },
      ]} />
    </Section>
  );
}
`,
  faq: `import { Section, FAQ } from "@/components/ui";

export function FaqSection() {
  return (
    <Section className="pt-0">
      <FAQ title="Frequently asked" items={[
        { q: "Is it production-ready?", a: "Yes — server-rendered, SEO-optimized and secure by default." },
        { q: "Can I customize it?", a: "Completely. Colours, fonts and layout are token-driven." },
        { q: "Does it support dark mode?", a: "Light, dark and system themes with a no-flash script." },
        { q: "How do I deploy?", a: "One click to any Node host or Vercel." },
      ]} />
    </Section>
  );
}
`,
  testimonials: `import { Section, Testimonial } from "@/components/ui";

const QUOTES = [
  { quote: "The smoothest launch we've ever had.", author: "Sam Rivera", role: "Product Lead" },
  { quote: "Fast, polished and easy to build on.", author: "Jordan Ellis", role: "Founder" },
  { quote: "The attention to detail shows everywhere.", author: "Priya Nair", role: "Design Director" },
];

export function TestimonialsSection() {
  return (
    <Section eyebrow="Loved by teams" title="Don't just take our word for it">
      <div className="grid gap-6 md:grid-cols-3">
        {QUOTES.map((t) => <Testimonial key={t.author} quote={t.quote} author={t.author} role={t.role} />)}
      </div>
    </Section>
  );
}
`,
  team: `import { Section, TeamGrid } from "@/components/ui";

export function TeamSection() {
  return (
    <Section eyebrow="The team" title="The people behind it">
      <TeamGrid members={[
        { name: "Alex Morgan", role: "Founder & CEO", bio: "Sets the vision and keeps us honest." },
        { name: "Riya Sharma", role: "Head of Design", bio: "Makes every pixel earn its place." },
        { name: "Chris Doyle", role: "Lead Engineer", bio: "Ships fast without breaking things." },
      ]} />
    </Section>
  );
}
`,
  stats: `import { Section, StatBand } from "@/components/ui";

export function StatsSection() {
  return (
    <Section eyebrow="By the numbers" title="Built to perform">
      <StatBand stats={[
        { value: "10k+", label: "Monthly visitors" },
        { value: "99.9%", label: "Uptime" },
        { value: "4.9★", label: "Average rating" },
        { value: "<1s", label: "Load time" },
      ]} />
    </Section>
  );
}
`,
  timeline: `import { Section, Timeline } from "@/components/ui";

export function TimelineSection() {
  return (
    <Section eyebrow="Our story" title="How we got here">
      <div className="mx-auto max-w-2xl">
        <Timeline items={[
          { date: "Then", title: "The idea", desc: "It started with a simple frustration." },
          { date: "Next", title: "First release", desc: "We shipped, and people showed up." },
          { date: "Now", title: "Growing fast", desc: "Thousands of teams, and counting." },
        ]} />
      </div>
    </Section>
  );
}
`,
  gallery: `import { Section, Gallery } from "@/components/ui";

export function GallerySection() {
  return (
    <Section eyebrow="Gallery" title="A look inside">
      <Gallery items={[
        { emoji: "🖼️", label: "One" }, { emoji: "🌆", label: "Two" }, { emoji: "🎨", label: "Three" },
        { emoji: "📸", label: "Four" }, { emoji: "✨", label: "Five" }, { emoji: "🌟", label: "Six" },
      ]} />
    </Section>
  );
}
`,
  logos: `import { Section, LogoCloud } from "@/components/ui";

export function LogosSection() {
  return (
    <Section className="pt-0">
      <LogoCloud label="Trusted by teams at" names={["Northwind", "Globex", "Initech", "Umbrella", "Soylent", "Hooli"]} />
    </Section>
  );
}
`,
  cta: `import { CTABand } from "@/components/ui";

export function CtaSection() {
  return <CTABand title="Ready to get started?" subtitle="Join thousands of teams building with us." ctaLabel="Get started" ctaHref="/contact" />;
}
`,
  bento: `import { Section, Bento } from "@/components/ui";

export function BentoSection() {
  return (
    <Section eyebrow="One platform" title="Everything, together">
      <Bento items={[
        { icon: "⚡", title: "Blazing fast", desc: "Instant page loads, everywhere.", className: "sm:col-span-2" },
        { icon: "🔒", title: "Secure", desc: "Locked down by default." },
        { icon: "🎨", title: "Themeable", desc: "Your brand, one token away." },
        { icon: "📊", title: "Insightful", desc: "Know what's working.", className: "sm:col-span-2" },
      ]} />
    </Section>
  );
}
`,
  steps: `import { Section, Steps } from "@/components/ui";

export function StepsSection() {
  return (
    <Section eyebrow="How it works" title="Up and running in three steps">
      <Steps items={[
        { title: "Create your account", desc: "Sign up free in seconds — no credit card required." },
        { title: "Connect your data", desc: "Import in one click or use the API. Your call." },
        { title: "Ship something great", desc: "Go live and watch it work, from day one." },
      ]} />
    </Section>
  );
}
`,
  "feature-split": `import { Section, FeatureSplit } from "@/components/ui";

export function FeatureSplitSection() {
  return (
    <Section eyebrow="Why teams switch" title="Built for the way you actually work">
      <FeatureSplit
        eyebrow="Focus"
        title="Less busywork, more momentum"
        desc="Everything in one place, so your team spends time on the work that matters — not on wiring tools together."
        bullets={["Set up in minutes, not weeks", "Real-time, always in sync", "Scales from one to a thousand"]}
        media={<div className="grid h-52 place-items-center text-7xl">🚀</div>}
      />
    </Section>
  );
}
`,
  banner: `import Link from "next/link";

export function BannerSection() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-12">
      <div className="relative flex flex-col items-center gap-6 overflow-hidden rounded-[1.75rem] gradient-bg px-8 py-10 text-center on-accent shadow-lg sm:flex-row sm:justify-between sm:text-left">
        <div aria-hidden className="dot-bg pointer-events-none absolute inset-0 opacity-20" />
        <div className="relative">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Ready to see it in action?</h2>
          <p className="mt-1.5 text-sm opacity-80">Start free today — it takes less than a minute.</p>
        </div>
        <Link href="/contact" className="relative shrink-0 rounded-full bg-[var(--bg)] px-7 py-3 font-semibold text-fg transition hover:-translate-y-0.5">Get started</Link>
      </div>
    </section>
  );
}
`,
};

/** Ensure the @lacspace UI kit exists in the target project (sections import from it). */
function ensureUiKit(root: string): string[] {
  const added: string[] = [];
  for (const [rel, content] of Object.entries(uiKitFiles())) {
    const full = join(root, rel);
    if (!existsSync(full)) { mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, content); added.push(rel); }
  }
  return added;
}

const pascal = (s: string): string => s.split(/[-_]/).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");

/** `add` subcommand — drop prebuilt sections OR a feature add-on into a project. */
function runAdd(rawNames: string[]): void {
  stdout.write(`\n${c("bold", c("magenta", "◆ create-lacspace-app add"))} ${c("dim", "— drop prebuilt sections or a feature into your app")}\n\n`);
  const root = cwd();
  if (!existsSync(join(root, "package.json"))) {
    stdout.write(c("red", "✗ No package.json here. Run this inside your Next.js project.\n\n")); exit(1); return;
  }
  const wanted = rawNames.filter((n) => !n.startsWith("-")).map((n) => n.toLowerCase());
  if (wanted.length === 0 || rawNames.includes("--help") || rawNames.includes("-h")) {
    stdout.write(`Usage: ${c("cyan", "npx create-lacspace-app add <section|feature...>")}\n\n${c("bold", "Available sections")}\n`);
    stdout.write("  " + Object.keys(SECTIONS).map((k) => c("cyan", k)).join("  ") + "\n");
    stdout.write(`\n${c("bold", "Available features")}\n`);
    stdout.write("  " + FEATURES.map((f) => c("cyan", f.key)).join("  ") + "\n");
    stdout.write(`\nExample: ${c("cyan", "npx create-lacspace-app add pricing faq")}  ${c("dim", "or")}  ${c("cyan", "add ai-chat")}\n\n`);
    return;
  }

  // Split requested names into features vs sections vs unknown.
  const featKeys = wanted.filter((n) => FEATURES.some((f) => f.key === n));
  const sectionNames = wanted.filter((n) => n in SECTIONS);
  const unknown = wanted.filter((n) => !featKeys.includes(n) && !(n in SECTIONS));
  if (unknown.length) stdout.write(c("yellow", `! Unknown: ${unknown.join(", ")} ${c("dim", "(run with no args to list)")}\n`));

  // 1. Feature add-ons — drop their files (skip existing), then print what to wire.
  const addedFeatures = featKeys.map((k) => FEATURES.find((f) => f.key === k)!);
  if (addedFeatures.length) {
    const ctx = resolveContext({ name: basename(root), features: featKeys });
    for (const feat of addedFeatures) {
      stdout.write(`\n${c("bold", `+ ${feat.label}`)} ${c("dim", `(${feat.key})`)}\n`);
      for (const [rel, content] of Object.entries(feat.files(ctx))) {
        const full = join(root, rel);
        if (existsSync(full)) { stdout.write(c("yellow", `  ~ ${rel} exists — skipped\n`)); continue; }
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, content);
        stdout.write(`  ${c("green", "✔")} ${c("dim", "+ " + rel)}\n`);
      }
      stdout.write(`\n  ${c("bold", "Add these dependencies")}:\n    ${c("cyan", "npm i " + Object.entries(feat.deps).map(([n, v]) => `${n}@${v}`).join(" "))}\n`);
      if (feat.scripts && Object.keys(feat.scripts).length) {
        stdout.write(`\n  ${c("bold", "Add to package.json scripts")}:\n`);
        for (const [n, v] of Object.entries(feat.scripts)) stdout.write(`    ${c("cyan", `"${n}": "${v}"`)}\n`);
      }
      if (feat.env && Object.keys(feat.env).length) {
        stdout.write(`\n  ${c("bold", "Add to .env")}:\n`);
        for (const [n, comment] of Object.entries(feat.env)) stdout.write(`    ${c("cyan", n + "=")}  ${c("dim", "# " + comment)}\n`);
      }
      stdout.write(`\n  ${c("bold", "Next steps")}:\n`);
      for (const s of feat.nextSteps) stdout.write(`    ${c("dim", "•")} ${s}\n`);
    }
    stdout.write("\n");
  }

  // 2. Prebuilt sections — unchanged behaviour.
  if (sectionNames.length) {
    const kitAdded = ensureUiKit(root);
    if (kitAdded.length) stdout.write(`  ${c("green", "✔")} Added the UI kit ${c("dim", "(" + kitAdded.length + " components)")}\n`);

    const created: string[] = [];
    for (const name of sectionNames) {
      const rel = `components/sections/${name}.tsx`;
      const full = join(root, rel);
      if (existsSync(full)) { stdout.write(c("yellow", `  ~ ${rel} exists — skipped\n`)); continue; }
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, SECTIONS[name]!);
      created.push(name);
      stdout.write(`  ${c("green", "✔")} ${c("dim", "+ " + rel)}\n`);
    }
    if (created.length) {
      stdout.write(`\n${c("bold", "Use them")} — import into any page:\n`);
      for (const n of created) stdout.write(`  ${c("cyan", `import { ${pascal(n)}Section } from "@/components/sections/${n}";`)}\n`);
      stdout.write(`\n  Then drop ${c("cyan", "<" + pascal(created[0]!) + "Section />")} into your JSX.\n`);
      stdout.write(`\n  ${c("dim", "Sections use the @lacspace UI kit + design tokens — best inside a create-lacspace-app project.")}\n\n`);
    }
  }

  if (!addedFeatures.length && !sectionNames.length) { exit(1); return; }
}

async function main(): Promise<void> {
  const raw = argv.slice(2);
  if (raw[0] === "add") { runAdd(raw.slice(1)); return; }
  const args = parseArgs(raw);
  if (args.help) { stdout.write(HELP + "\n"); return; }

  stdout.write(`\n${c("bold", c("magenta", "◆ create-lacspace-app"))} ${c("dim", "— a gorgeous Next.js starter, batteries wired")}\n\n`);

  let name = args.name;
  let templateKey = args.template;
  let mode: "static" | "dynamic" = args.mode ?? "static";
  const featureKeys: string[] = [...args.features];

  // Interactive prompts only when not --yes and attached to a TTY.
  if (!args.yes && stdin.isTTY) {
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
      // ✨ Static vs dynamic — the project shape. Only ask when not already set
      //    by a flag (--fullstack / --static / --mode).
      if (args.mode === undefined) {
        stdout.write(`\n  What kind of app?\n`);
        stdout.write(`   ${c("cyan", "1")}. ${c("bold", "Static / frontend only")} ${c("dim", "— a single Next.js app (SEO site, marketing, blog, docs). Fast, deploy anywhere.")}\n`);
        stdout.write(`   ${c("cyan", "2")}. ${c("bold", "Dynamic / full-stack")} ${c("dim", "— frontend + a Node·Express·MongoDB·Redis API with working auth & CRUD, wired together.")}\n`);
        const ans = (await rl.question(`\n${c("green", "?")} Type ${c("dim", "(1)")}: `)).trim() || "1";
        mode = ans === "2" || ans.toLowerCase().startsWith("dyn") || ans.toLowerCase().startsWith("full") ? "dynamic" : "static";
      }
      // ✨ Feature add-ons — a numbered picker (readline only, no raw mode).
      if (featureKeys.length === 0) {
        stdout.write(`\n  Add feature add-ons? ${c("dim", "(free & keyless — local AI by default)")}\n`);
        FEATURES.forEach((f, i) => stdout.write(`   ${c("cyan", String(i + 1))}. ${c("bold", f.label)} ${c("dim", "— " + f.description)}\n`));
        const ans = (await rl.question(`\n${c("green", "?")} Add features? ${c("dim", "(comma-separated numbers, or Enter for none)")}: `)).trim();
        if (ans) {
          for (const tok of splitList(ans)) {
            const idx = /^\d+$/.test(tok) ? parseInt(tok, 10) - 1 : FEATURES.findIndex((f) => f.key === tok);
            const feat = FEATURES[idx];
            if (feat && !featureKeys.includes(feat.key)) featureKeys.push(feat.key);
          }
        }
      }
    } finally {
      rl.close();
    }
  }

  name = name ?? "my-app";
  const base = TEMPLATES.find((t) => t.key === templateKey) ?? TEMPLATES[0]!;
  // --theme <preset|#hex|from,to> customises the accent gradient at scaffold time.
  const accent = resolveAccent(args.theme);
  if (args.theme && !accent) {
    stdout.write(c("yellow", `  ! Unknown theme "${args.theme}" — using the ${base.key} default. Try a preset (${Object.keys(THEMES).slice(0, 6).join(", ")}…) or a hex like "#ff6a00".\n`));
  }
  const template: TemplateDef = accent ? { ...base, accent } : base;
  if (accent) stdout.write(`  ${c("dim", "theme")} ${c("bold", args.theme!)} ${c("dim", `→ ${accent[0]} → ${accent[1]}`)}\n`);
  const dir = resolve(cwd(), name);
  const projectName = basename(dir).toLowerCase().replace(/[^a-z0-9-_]/g, "-");

  if (existsSync(dir) && readdirSync(dir).length > 0) {
    stdout.write(c("red", `\n✗ Directory "${name}" already exists and is not empty.\n\n`));
    exit(1);
    return;
  }

  const features = normalizeFeatures(featureKeys);
  const files = buildFiles({ name: projectName, template, features, mode });
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  const shape = mode === "dynamic" ? " · full-stack" : "";
  stdout.write(`\n  ${c("green", "✔")} Created ${c("bold", name)} ${c("dim", `(${template.label}${shape})`)}\n`);
  if (features.length) stdout.write(`  ${c("green", "✔")} Feature add-ons: ${features.map((f) => c("cyan", f.key)).join(", ")}\n`);
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
  if (mode === "dynamic") {
    // Full-stack: one root install wires both workspaces; Mongo+Redis via compose
    // (Redis is optional — the API falls back to an in-memory cache without it).
    stdout.write(`  ${c("cyan", "cp .env.example .env")} ${c("dim", "— then, optionally:")} ${c("cyan", "docker compose up -d")} ${c("dim", "(Mongo + Redis)")}\n`);
    stdout.write(`  ${c("cyan", run)} ${c("dim", "— runs the API (:4000) and the frontend (:3000) together")}\n`);
    stdout.write(`\n  ${c("dim", "backend →")} ${c("cyan", "backend/src/")} ${c("dim", "(Express · MongoDB · Redis · JWT auth · example CRUD)")}\n`);
    stdout.write(`  ${c("dim", "frontend →")} ${c("cyan", "frontend/app/")} ${c("dim", "· shared API types →")} ${c("cyan", "types/src/")}\n`);
    stdout.write(`  ${c("dim", "No Docker? Point")} ${c("cyan", "MONGODB_URI")} ${c("dim", "at any MongoDB (e.g. free Atlas); Redis is optional.")}\n`);
  } else {
    stdout.write(`  ${c("cyan", run)}\n`);
    stdout.write(`\n  Edit ${c("cyan", "lib/site.ts")} (your SEO config) and ${c("cyan", "app/page.tsx")}.\n`);
  }

  // ✨ Feature add-on next-steps — makes the free/local AI story prominent.
  if (features.length) {
    const hasAi = features.some((f) => f.key === "ai-chat" || f.key === "rag");
    stdout.write(`\n${c("bold", "Your feature add-ons")} ${c("dim", "— details in LEARN.md")}\n`);
    if (hasAi) stdout.write(`  ${c("green", "🆓 Free & local AI")} ${c("dim", "— install Ollama (https://ollama.com); no API key required.")}\n`);
    for (const f of features) {
      stdout.write(`\n  ${c("bold", f.label)} ${c("dim", `(${f.key})`)}\n`);
      for (const s of f.nextSteps) stdout.write(`    ${c("dim", "•")} ${s}\n`);
    }
  }

  stdout.write(`\n  ${c("green", "Happy building!")} ${c("dim", "https://lacspace.com/packages")}\n\n`);
}

// Only run the interactive CLI when this file is executed directly (as the
// `create-lacspace-app` bin), NOT when it is imported by the library entry
// (`./lib`) — importing must be free of side effects.
const invokedAsCli = argv[1] ? import.meta.url === pathToFileURL(argv[1]).href : false;
if (invokedAsCli) {
  main().catch((err: unknown) => {
    stdout.write(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n\n`));
    exit(1);
  });
}
