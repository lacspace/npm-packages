export type TrendSource = "google" | "youtube" | "wikipedia";

export interface RawTrend {
  term: string;
  source: TrendSource;
  /** 0–1 weight within this source (1 = top). */
  weight: number;
  /** Approx search traffic / views, when the source gives it. */
  volume?: number;
  /** Supporting links (news items / article). */
  links?: string[];
}

export type FetchLike = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<any> }>;

function fetchImpl(f?: FetchLike): FetchLike {
  const impl = f ?? (globalThis as any).fetch;
  if (!impl) throw new Error("trends: no fetch available — pass options.fetch");
  return impl;
}

function rankWeights(n: number): number[] {
  // Linear decay from 1 (rank 1) to ~0.1 (rank n).
  return Array.from({ length: n }, (_, i) => (n <= 1 ? 1 : 1 - (0.9 * i) / (n - 1)));
}

function parseTraffic(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = s.replace(/,/g, "").match(/(\d+)\s*(\+)?/);
  return m ? Number(m[1]) : undefined;
}

// --- Google Trends daily RSS (geo=NP by default) -----------------------------------
/** Fetch + parse the Google Trends "daily trending searches" RSS for a region. */
export async function googleTrendsDaily(options: { geo?: string; fetch?: FetchLike; signal?: AbortSignal } = {}): Promise<RawTrend[]> {
  const geo = options.geo ?? "NP";
  const url = `https://trends.google.com/trends/trendingsearches/daily/rss?geo=${encodeURIComponent(geo)}`;
  const res = await fetchImpl(options.fetch)(url, { signal: options.signal });
  if (!res.ok) throw new Error(`google-trends ${res.status}`);
  return parseGoogleTrendsRss(await res.text());
}

/** Parse Google Trends daily RSS (title + ht:approx_traffic + ht:news_item links). */
export function parseGoogleTrendsRss(xml: string): RawTrend[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]!);
  const out: { term: string; volume?: number; links: string[] }[] = [];
  for (const item of items) {
    const title = decode(first(item, /<title>([\s\S]*?)<\/title>/));
    if (!title) continue;
    const volume = parseTraffic(first(item, /<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/));
    const links = [...item.matchAll(/<ht:news_item_url>([\s\S]*?)<\/ht:news_item_url>/g)].map((m) => decode(m[1]!));
    out.push({ term: title, volume, links });
  }
  const w = rankWeights(out.length);
  return out.map((o, i) => ({ term: o.term, source: "google", weight: w[i]!, volume: o.volume, links: o.links }));
}

// --- YouTube Data API v3: most popular in a region (needs an API key) --------------
export async function youtubeMostPopular(options: { apiKey: string; regionCode?: string; maxResults?: number; fetch?: FetchLike; signal?: AbortSignal }): Promise<RawTrend[]> {
  if (!options.apiKey) return [];
  const u = new URL("https://www.googleapis.com/youtube/v3/videos");
  u.searchParams.set("part", "snippet,statistics");
  u.searchParams.set("chart", "mostPopular");
  u.searchParams.set("regionCode", options.regionCode ?? "NP");
  u.searchParams.set("maxResults", String(options.maxResults ?? 25));
  u.searchParams.set("key", options.apiKey);
  const res = await fetchImpl(options.fetch)(u.toString(), { signal: options.signal });
  if (!res.ok) throw new Error(`youtube ${res.status}`);
  const data = await res.json();
  const rows = (data.items ?? []) as any[];
  const w = rankWeights(rows.length);
  return rows.map((it, i) => ({
    term: it.snippet?.title ?? "",
    source: "youtube" as const,
    weight: w[i]!,
    volume: it.statistics?.viewCount ? Number(it.statistics.viewCount) : undefined,
    links: it.id ? [`https://youtu.be/${it.id}`] : [],
  })).filter((t) => t.term);
}

// --- Wikipedia pageviews top (free REST API, no key) -------------------------------
export async function wikipediaTop(options: { project?: string; date?: Date; fetch?: FetchLike; signal?: AbortSignal } = {}): Promise<RawTrend[]> {
  const project = options.project ?? "en.wikipedia";
  const d = options.date ?? new Date(Date.now() - 86400000); // yesterday (today may be incomplete)
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${project}/all-access/${yyyy}/${mm}/${dd}`;
  const res = await fetchImpl(options.fetch)(url, { headers: { "User-Agent": "lacspace-trends/1.0 (contact@lacspace.com)" }, signal: options.signal });
  if (!res.ok) throw new Error(`wikipedia ${res.status}`);
  const data = await res.json();
  const articles = (data.items?.[0]?.articles ?? []) as any[];
  const filtered = articles.filter((a) => !/^(Main_Page|Special:|Wikipedia:|विशेष:|मुख्य_पृष्ठ)/.test(a.article));
  const w = rankWeights(filtered.length);
  return filtered.map((a, i) => ({
    term: String(a.article).replace(/_/g, " "),
    source: "wikipedia" as const,
    weight: w[i]!,
    volume: a.views,
    links: [`https://${project}.org/wiki/${encodeURIComponent(a.article)}`],
  }));
}

function first(s: string, re: RegExp): string | undefined {
  const m = s.match(re);
  return m ? m[1]!.trim() : undefined;
}
function decode(s: string | undefined): string {
  return (s ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim();
}
