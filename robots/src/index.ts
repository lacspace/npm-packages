/**
 * @lacspace/robots
 * Build and parse robots.txt — with AI-crawler presets and Next.js output.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

export interface RobotsGroup {
  userAgent: string | string[];
  allow?: string[];
  disallow?: string[];
  /** Seconds between requests (non-standard; honoured by Bing/Yandex). */
  crawlDelay?: number;
  /**
   * Yandex `Clean-param` directive(s) — strip tracking/query params from URLs
   * so duplicates aren't crawled, e.g. "ref /articles/" or "utm_source&utm_medium".
   */
  cleanParam?: string | string[];
}

export interface RobotsOptions {
  groups?: RobotsGroup[];
  sitemap?: string | string[];
  host?: string;
}

/** Known AI / LLM training & retrieval crawlers. */
export const AI_BOTS: string[] = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "CCBot",
  "Google-Extended",
  "PerplexityBot",
  "Perplexity-User",
  "Bytespider",
  "Amazonbot",
  "Applebot-Extended",
  "cohere-ai",
  "Diffbot",
  "FacebookBot",
  "Meta-ExternalAgent",
  "ImagesiftBot",
  "Omgilibot",
  "Timpibot",
  "YouBot",
];

/**
 * AI crawlers used to gather/train on content (as opposed to answering live
 * search queries). Blocking these keeps your pages out of training corpora
 * while still allowing AI-powered search/answer engines to cite you.
 */
export const AI_TRAINING_BOTS: string[] = [
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "Claude-Web",
  "CCBot",
  "Google-Extended",
  "Applebot-Extended",
  "Bytespider",
  "cohere-ai",
  "Diffbot",
  "FacebookBot",
  "Meta-ExternalAgent",
  "ImagesiftBot",
  "Omgilibot",
  "Timpibot",
];

function block(...lines: (string | false | undefined)[]): string {
  return lines.filter(Boolean).join("\n");
}

/** Strip CR/LF so a directive value cannot inject additional robots.txt lines. */
function dv(s: string): string {
  return String(s).replace(/[\r\n]/g, "");
}

function agentBlock(g: RobotsGroup): string {
  const agents = Array.isArray(g.userAgent) ? g.userAgent : [g.userAgent];
  const lines: string[] = agents.map((a) => `User-agent: ${dv(a)}`);
  for (const p of g.allow ?? []) lines.push(`Allow: ${dv(p)}`);
  for (const p of g.disallow ?? []) lines.push(`Disallow: ${dv(p)}`);
  if (g.crawlDelay !== undefined) lines.push(`Crawl-delay: ${g.crawlDelay}`);
  for (const c of g.cleanParam ? (Array.isArray(g.cleanParam) ? g.cleanParam : [g.cleanParam]) : [])
    lines.push(`Clean-param: ${dv(c)}`);
  // A group with neither allow nor disallow means "allow everything".
  if (!g.allow?.length && !g.disallow?.length) lines.push("Disallow:");
  return lines.join("\n");
}

/** Build a robots.txt string. */
export function robots(opts: RobotsOptions): string {
  const groups = opts.groups?.length ? opts.groups : [{ userAgent: "*" }];
  const parts = groups.map(agentBlock);
  const tail: string[] = [];
  if (opts.host) tail.push(`Host: ${dv(opts.host)}`);
  for (const s of opts.sitemap ? (Array.isArray(opts.sitemap) ? opts.sitemap : [opts.sitemap]) : [])
    tail.push(`Sitemap: ${dv(s)}`);
  return block(parts.join("\n\n"), tail.length ? "\n" + tail.join("\n") : undefined) + "\n";
}

/**
 * A robots.txt that blocks AI crawlers while allowing everyone else.
 * @param extraDisallow paths to also disallow for the wildcard agent
 */
export function blockAiBots(
  opts: { sitemap?: string | string[]; host?: string; extraDisallow?: string[]; bots?: string[] } = {},
): string {
  return robots({
    groups: [
      { userAgent: "*", disallow: opts.extraDisallow ?? [] },
      { userAgent: opts.bots ?? AI_BOTS, disallow: ["/"] },
    ],
    sitemap: opts.sitemap,
    host: opts.host,
  });
}

/* ------------------------------ parser ------------------------------ */

export interface ParsedRobots {
  groups: {
    userAgents: string[];
    allow: string[];
    disallow: string[];
    crawlDelay?: number;
    cleanParam?: string[];
  }[];
  sitemaps: string[];
  host?: string;
}

/** Parse a robots.txt string into structured rules. */
export function parseRobots(txt: string): ParsedRobots {
  const result: ParsedRobots = { groups: [], sitemaps: [] };
  let current: ParsedRobots["groups"][number] | null = null;
  let expectingAgent = true;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    switch (field) {
      case "user-agent":
        if (!current || !expectingAgent) {
          current = { userAgents: [], allow: [], disallow: [] };
          result.groups.push(current);
        }
        current.userAgents.push(value);
        expectingAgent = true;
        break;
      case "allow":
        if (current) current.allow.push(value);
        expectingAgent = false;
        break;
      case "disallow":
        if (current) current.disallow.push(value);
        expectingAgent = false;
        break;
      case "crawl-delay": {
        const cd = Number(value);
        if (current && Number.isFinite(cd)) current.crawlDelay = cd;
        expectingAgent = false;
        break;
      }
      case "clean-param":
        if (current) (current.cleanParam ??= []).push(value);
        expectingAgent = false;
        break;
      case "sitemap":
        result.sitemaps.push(value);
        break;
      case "host":
        result.host = value;
        break;
    }
  }
  return result;
}

/* ------------------------------ Next.js ------------------------------ */

export interface NextRobots {
  rules: { userAgent: string | string[]; allow?: string[]; disallow?: string[]; crawlDelay?: number }[];
  sitemap?: string | string[];
  host?: string;
}

/* ------------------------------ presets ------------------------------ */

interface PresetOptions {
  sitemap?: string | string[];
  host?: string;
  /** Extra paths to disallow on top of the stack defaults. */
  extraDisallow?: string[];
}

const STACK_DISALLOW: Record<string, string[]> = {
  nextjs: ["/api/", "/_next/", "/admin"],
  wordpress: ["/wp-admin/", "/wp-includes/", "/xmlrpc.php", "/?s=", "/search"],
  shopify: ["/cart", "/checkout", "/account", "/orders", "/*?*preview_theme_id*"],
  astro: ["/api/"],
};

/** robots.txt tuned for a stack's private/duplicate paths. */
export function stackRobots(stack: keyof typeof STACK_DISALLOW, opts: PresetOptions = {}): string {
  return robots({
    groups: [{ userAgent: "*", disallow: [...STACK_DISALLOW[stack]!, ...(opts.extraDisallow ?? [])] }],
    sitemap: opts.sitemap,
    host: opts.host,
  });
}

export const nextjsRobots = (o: PresetOptions = {}) => stackRobots("nextjs", o);
export const wordpressRobots = (o: PresetOptions = {}) => stackRobots("wordpress", o);
export const shopifyRobots = (o: PresetOptions = {}) => stackRobots("shopify", o);

/** Block every crawler from everything — for staging / preview environments. */
export function blockAll(): string {
  return robots({ groups: [{ userAgent: "*", disallow: ["/"] }] });
}

/**
 * Pick a production or a block-all robots.txt from an environment flag.
 * @example envRobots(process.env.VERCEL_ENV === "production", { sitemap })
 */
export function envRobots(isProduction: boolean, prodOpts: RobotsOptions = {}): string {
  return isProduction ? robots(prodOpts) : blockAll();
}

/** Allow search & answer engines but block AI-training crawlers. */
export function allowSearchBlockTraining(opts: PresetOptions = {}): string {
  const training = ["GPTBot", "CCBot", "Google-Extended", "anthropic-ai", "Applebot-Extended", "Bytespider", "cohere-ai"];
  return robots({
    groups: [
      { userAgent: "*", disallow: opts.extraDisallow ?? [] },
      { userAgent: training, disallow: ["/"] },
    ],
    sitemap: opts.sitemap,
    host: opts.host,
  });
}

/* ------------------------------ matcher ------------------------------ */

function pathOf(urlOrPath: string): string {
  try {
    const u = new URL(urlOrPath);
    return u.pathname + u.search;
  } catch {
    return urlOrPath;
  }
}

function matchLength(pattern: string, path: string): number {
  if (pattern === "") return -1; // "Disallow:" (empty) is not a rule
  let anchorEnd = false;
  let pat = pattern;
  if (pat.endsWith("$")) {
    anchorEnd = true;
    pat = pat.slice(0, -1);
  }
  const re = new RegExp("^" + pat.replace(/[.+?^${}()|[\]\\*]/g, "\\$&").replace(/\\\*/g, ".*") + (anchorEnd ? "$" : ""));
  return re.test(path) ? pattern.length : -1;
}

/**
 * Test whether a URL/path is crawlable per parsed robots rules for a user-agent
 * (longest-match wins; ties favour Allow, per Google's spec).
 */
export function isAllowed(urlOrPath: string, parsed: ParsedRobots, userAgent = "*"): boolean {
  const path = pathOf(urlOrPath);
  const ua = userAgent.toLowerCase();
  let group =
    parsed.groups.find((g) => g.userAgents.some((a) => a !== "*" && ua.includes(a.toLowerCase()))) ??
    parsed.groups.find((g) => g.userAgents.includes("*"));
  if (!group) return true;
  let allow = -1;
  let disallow = -1;
  for (const p of group.allow) allow = Math.max(allow, matchLength(p, path));
  for (const p of group.disallow) disallow = Math.max(disallow, matchLength(p, path));
  if (disallow === -1) return true;
  return allow >= disallow;
}

/** Convert to the shape Next.js `robots.ts` expects (`MetadataRoute.Robots`). */
export function toNextRobots(opts: RobotsOptions): NextRobots {
  const groups = opts.groups?.length ? opts.groups : [{ userAgent: "*" }];
  return {
    rules: groups.map((g) => ({
      userAgent: g.userAgent,
      allow: g.allow,
      disallow: g.disallow,
      crawlDelay: g.crawlDelay,
    })),
    sitemap: opts.sitemap,
    host: opts.host,
  };
}

/** Minimal site shape shared across the Lacspace SEO Kit (structural, no imports). */
export interface SiteLike {
  /** Absolute base URL, e.g. "https://acme.com". */
  url: string;
}

export interface RobotsForSiteOptions {
  /** Paths to disallow (default: none — allow everything). */
  disallow?: string[];
  /** Also block AI/LLM crawlers (GPTBot, ClaudeBot, CCBot, Google-Extended…). */
  blockAi?: boolean;
  /** Override the sitemap URL (defaults to `<url>/sitemap.xml`). */
  sitemap?: string | string[];
}

/**
 * A sensible, production-ready robots.txt from just your site URL — allow all,
 * auto sitemap reference and host, with one flag to fend off AI scrapers.
 * @example robotsForSite({ url: "https://acme.com" }, { blockAi: true })
 */
export function robotsForSite(site: SiteLike, opts: RobotsForSiteOptions = {}): string {
  const base = site.url.replace(/\/$/, "");
  const groups: RobotsGroup[] = [{ userAgent: "*", allow: ["/"], disallow: opts.disallow ?? [] }];
  if (opts.blockAi) for (const bot of AI_BOTS) groups.push({ userAgent: bot, disallow: ["/"] });
  return robots({ groups, sitemap: opts.sitemap ?? `${base}/sitemap.xml`, host: base });
}

/* ------------------------------ AI policy ------------------------------ */

export type AiPolicyPreset = "block-all-ai" | "allow-search-block-training" | "allow-all";

/**
 * Ready-made robots groups expressing an AI-crawler policy, to spread into
 * {@link robots} / {@link toNextRobots} alongside your own groups.
 *
 * - `"block-all-ai"` — disallow every known AI crawler (see {@link AI_BOTS}).
 * - `"allow-search-block-training"` — block training crawlers ({@link AI_TRAINING_BOTS})
 *   while leaving AI search/answer engines (OAI-SearchBot, PerplexityBot…) free.
 * - `"allow-all"` — no AI-specific restrictions (empty).
 *
 * @example
 * robots({ groups: [{ userAgent: "*", allow: ["/"] }, ...aiPolicy("block-all-ai")], sitemap });
 */
export function aiPolicy(preset: AiPolicyPreset): RobotsGroup[] {
  switch (preset) {
    case "block-all-ai":
      return [{ userAgent: [...AI_BOTS], disallow: ["/"] }];
    case "allow-search-block-training":
      return [{ userAgent: [...AI_TRAINING_BOTS], disallow: ["/"] }];
    case "allow-all":
      return [];
  }
}

/* ------------------------- robots directives ------------------------- */

/**
 * Robots meta / `X-Robots-Tag` directives. Boolean flags emit the bare token;
 * `maxSnippet` / `maxImagePreview` / `maxVideoPreview` emit the `max-*` forms;
 * `unavailableAfter` emits `unavailable_after:` with an RFC-1123 date.
 */
export interface RobotsDirectives {
  /** Equivalent to `noindex, nofollow`. */
  none?: boolean;
  /** Explicit `all` (default behaviour — index and follow). */
  all?: boolean;
  index?: boolean;
  noindex?: boolean;
  follow?: boolean;
  nofollow?: boolean;
  noarchive?: boolean;
  nosnippet?: boolean;
  noimageindex?: boolean;
  notranslate?: boolean;
  nocache?: boolean;
  /** `max-snippet:<n>` — max characters of snippet (-1 = no limit). */
  maxSnippet?: number;
  /** `max-image-preview:<setting>`. */
  maxImagePreview?: "none" | "standard" | "large";
  /** `max-video-preview:<n>` — max seconds of video preview (-1 = no limit). */
  maxVideoPreview?: number;
  /** `unavailable_after:<date>` — drop from results after this time. */
  unavailableAfter?: string | Date;
}

function buildDirectives(d: RobotsDirectives): string {
  const out: string[] = [];
  if (d.none) out.push("none");
  if (d.all) out.push("all");
  if (d.index) out.push("index");
  if (d.noindex) out.push("noindex");
  if (d.follow) out.push("follow");
  if (d.nofollow) out.push("nofollow");
  if (d.noarchive) out.push("noarchive");
  if (d.nosnippet) out.push("nosnippet");
  if (d.noimageindex) out.push("noimageindex");
  if (d.notranslate) out.push("notranslate");
  if (d.nocache) out.push("nocache");
  if (d.maxSnippet !== undefined) out.push(`max-snippet:${Math.trunc(d.maxSnippet)}`);
  if (d.maxImagePreview !== undefined) out.push(`max-image-preview:${d.maxImagePreview}`);
  if (d.maxVideoPreview !== undefined) out.push(`max-video-preview:${Math.trunc(d.maxVideoPreview)}`);
  if (d.unavailableAfter !== undefined) {
    const v = d.unavailableAfter;
    out.push(`unavailable_after: ${v instanceof Date ? v.toUTCString() : dv(v)}`);
  }
  return out.join(", ");
}

/**
 * Build a `<meta name="robots">` content string from typed directives.
 * @example metaRobots({ noindex: true, nofollow: true }) // "noindex, nofollow"
 */
export function metaRobots(directives: RobotsDirectives): string {
  return buildDirectives(directives);
}

/**
 * Build an `X-Robots-Tag` header value from typed directives, optionally scoped
 * to a specific crawler (prefixes `"<bot>: "`).
 * @example xRobotsTag({ noindex: true, maxImagePreview: "large" }) // "noindex, max-image-preview:large"
 * @example xRobotsTag({ noindex: true }, { userAgent: "googlebot" }) // "googlebot: noindex"
 */
export function xRobotsTag(directives: RobotsDirectives, opts?: { userAgent?: string }): string {
  const body = buildDirectives(directives);
  return opts?.userAgent ? `${dv(opts.userAgent)}: ${body}` : body;
}
