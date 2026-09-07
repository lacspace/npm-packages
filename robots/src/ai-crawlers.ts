/**
 * @lacspace/robots — AI / LLM crawler presets.
 *
 * A curated, maintainable catalog of AI/LLM crawler user-agents plus one-call
 * helpers that emit an explicit per-agent group (one `User-agent:` block per
 * bot), so a policy stays readable and unambiguous in the generated robots.txt.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

import { robots, AI_BOTS, type RobotsGroup } from "./index";

/** What a crawler is used for — drives block/allow policy decisions. */
export type AiCrawlerType = "training" | "search" | "assistant" | "scraper";

export interface AiCrawlerInfo {
  /** The exact `User-agent` token to match in robots.txt. */
  name: string;
  /** Company / project that operates the crawler. */
  operator: string;
  /** Primary purpose the crawler is documented for. */
  type: AiCrawlerType;
  /** Short human note on why you might (dis)allow it. */
  purpose: string;
}

/**
 * Curated catalog of currently-known AI/LLM crawlers with their operator and
 * intent. This is the single source of truth for the AI-crawler presets — add a
 * row here and the block/allow helpers pick it up automatically.
 */
export const AI_CRAWLER_CATALOG: readonly AiCrawlerInfo[] = [
  { name: "GPTBot", operator: "OpenAI", type: "training", purpose: "Trains OpenAI foundation models." },
  { name: "OAI-SearchBot", operator: "OpenAI", type: "search", purpose: "Indexes pages for ChatGPT search results." },
  { name: "ChatGPT-User", operator: "OpenAI", type: "assistant", purpose: "Live fetch when a ChatGPT user opens a link." },
  { name: "ClaudeBot", operator: "Anthropic", type: "training", purpose: "Gathers content for Anthropic's models." },
  { name: "Claude-Web", operator: "Anthropic", type: "assistant", purpose: "Live fetch on behalf of a Claude user." },
  { name: "anthropic-ai", operator: "Anthropic", type: "training", purpose: "Legacy Anthropic crawler token." },
  { name: "CCBot", operator: "Common Crawl", type: "training", purpose: "Open web corpus widely used for LLM training." },
  { name: "Google-Extended", operator: "Google", type: "training", purpose: "Opt-out token for Gemini / Vertex AI training." },
  { name: "PerplexityBot", operator: "Perplexity", type: "search", purpose: "Indexes pages for Perplexity answers." },
  { name: "Perplexity-User", operator: "Perplexity", type: "assistant", purpose: "Live fetch when a Perplexity user asks." },
  { name: "Bytespider", operator: "ByteDance", type: "training", purpose: "ByteDance / TikTok LLM data collection." },
  { name: "Amazonbot", operator: "Amazon", type: "assistant", purpose: "Powers Alexa / Amazon answer features." },
  { name: "Applebot-Extended", operator: "Apple", type: "training", purpose: "Opt-out token for Apple foundation models." },
  { name: "Meta-ExternalAgent", operator: "Meta", type: "training", purpose: "Meta AI training / indexing crawler." },
  { name: "FacebookBot", operator: "Meta", type: "training", purpose: "Meta crawler used for language models." },
  { name: "cohere-ai", operator: "Cohere", type: "training", purpose: "Cohere model data collection." },
  { name: "Diffbot", operator: "Diffbot", type: "scraper", purpose: "Structured-data / knowledge-graph extraction." },
  { name: "ImagesiftBot", operator: "ImageSift (Hive)", type: "scraper", purpose: "Image dataset collection." },
  { name: "Omgilibot", operator: "Webz.io", type: "scraper", purpose: "Web data resold for AI training." },
  { name: "Timpibot", operator: "Timpi", type: "scraper", purpose: "Decentralized search / AI dataset crawler." },
  { name: "YouBot", operator: "You.com", type: "search", purpose: "Indexes pages for You.com answers." },
] as const;

export interface AiCrawlerPresetOptions {
  /** One or many `Sitemap:` URLs to append. */
  sitemap?: string | string[];
  /** Site-wide `Host:` directive. */
  host?: string;
  /**
   * Which crawlers to target. Defaults to the full {@link AI_BOTS} list. Pass
   * `AiCrawlerType[]` semantics via {@link aiCrawlersByType}, or an explicit list.
   */
  bots?: string[];
  /** `Crawl-delay:` (seconds) applied to every emitted AI-crawler group. */
  crawlDelay?: number;
  /** Extra paths to disallow for the wildcard (`*`) group. */
  extraDisallow?: string[];
  /** Yandex `Clean-param` directive(s) for the wildcard (`*`) group. */
  cleanParam?: string | string[];
}

function botList(opts: AiCrawlerPresetOptions): string[] {
  return opts.bots ?? AI_BOTS;
}

function wildcardGroup(opts: AiCrawlerPresetOptions): RobotsGroup {
  return { userAgent: "*", disallow: opts.extraDisallow ?? [], cleanParam: opts.cleanParam };
}

/**
 * robots.txt that blocks AI crawlers — one explicit `User-agent` group per bot,
 * each with `Disallow: /` — while allowing everyone else. Unlike a single
 * multi-agent group, this emits a self-documenting block per crawler.
 *
 * @example
 * blockAiCrawlers({ sitemap: ["https://acme.com/sitemap.xml"], crawlDelay: 10 })
 */
export function blockAiCrawlers(opts: AiCrawlerPresetOptions = {}): string {
  const groups: RobotsGroup[] = [wildcardGroup(opts)];
  for (const bot of botList(opts))
    groups.push({ userAgent: bot, disallow: ["/"], crawlDelay: opts.crawlDelay });
  return robots({ groups, sitemap: opts.sitemap, host: opts.host });
}

/**
 * robots.txt that explicitly allows AI crawlers — one `User-agent` group per
 * bot, each with `Allow: /`. Useful to publicly opt-in AI indexing while keeping
 * the wildcard group's own restrictions.
 *
 * @example allowAiCrawlers({ sitemap: "https://acme.com/sitemap.xml" })
 */
export function allowAiCrawlers(opts: AiCrawlerPresetOptions = {}): string {
  const groups: RobotsGroup[] = [wildcardGroup(opts)];
  for (const bot of botList(opts))
    groups.push({ userAgent: bot, allow: ["/"], crawlDelay: opts.crawlDelay });
  return robots({ groups, sitemap: opts.sitemap, host: opts.host });
}

/** The crawler names from {@link AI_CRAWLER_CATALOG} matching the given type(s). */
export function aiCrawlersByType(...types: AiCrawlerType[]): string[] {
  const set = new Set(types);
  return AI_CRAWLER_CATALOG.filter((c) => set.has(c.type)).map((c) => c.name);
}
