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
  "Bytespider",
  "Amazonbot",
  "Applebot-Extended",
  "cohere-ai",
  "Diffbot",
  "FacebookBot",
  "ImagesiftBot",
  "Omgilibot",
  "Timpibot",
];

function block(...lines: (string | false | undefined)[]): string {
  return lines.filter(Boolean).join("\n");
}

function agentBlock(g: RobotsGroup): string {
  const agents = Array.isArray(g.userAgent) ? g.userAgent : [g.userAgent];
  const lines: string[] = agents.map((a) => `User-agent: ${a}`);
  for (const p of g.allow ?? []) lines.push(`Allow: ${p}`);
  for (const p of g.disallow ?? []) lines.push(`Disallow: ${p}`);
  if (g.crawlDelay !== undefined) lines.push(`Crawl-delay: ${g.crawlDelay}`);
  // A group with neither allow nor disallow means "allow everything".
  if (!g.allow?.length && !g.disallow?.length) lines.push("Disallow:");
  return lines.join("\n");
}

/** Build a robots.txt string. */
export function robots(opts: RobotsOptions): string {
  const groups = opts.groups?.length ? opts.groups : [{ userAgent: "*" }];
  const parts = groups.map(agentBlock);
  const tail: string[] = [];
  if (opts.host) tail.push(`Host: ${opts.host}`);
  for (const s of opts.sitemap ? (Array.isArray(opts.sitemap) ? opts.sitemap : [opts.sitemap]) : [])
    tail.push(`Sitemap: ${s}`);
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
  groups: { userAgents: string[]; allow: string[]; disallow: string[]; crawlDelay?: number }[];
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
      case "crawl-delay":
        if (current) current.crawlDelay = Number(value);
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
