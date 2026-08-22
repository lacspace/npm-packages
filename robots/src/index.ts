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
