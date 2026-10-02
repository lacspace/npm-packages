import {
  FetchLike, MediaType, Provider, SearchOptions, SearchResult, StockAsset,
} from "./types.js";
import { passesFilters } from "./common.js";
import { pexelsSearch } from "./pexels.js";
import { pixabaySearch } from "./pixabay.js";

export * from "./types.js";
export { attribution, isNewsSafe, orientationOf } from "./common.js";

/** Round-robin key pool that parks a key briefly after a rate-limit (429). */
class KeyPool {
  private i = 0;
  private cooldown = new Map<string, number>();
  constructor(private keys: string[]) {}
  get size(): number {
    return this.keys.length;
  }
  next(now = Date.now()): string | undefined {
    if (!this.keys.length) return undefined;
    for (let n = 0; n < this.keys.length; n++) {
      const k = this.keys[(this.i + n) % this.keys.length]!;
      if ((this.cooldown.get(k) ?? 0) <= now) {
        this.i = (this.i + n + 1) % this.keys.length;
        return k;
      }
    }
    return this.keys[this.i % this.keys.length]; // all cooling down → use one anyway
  }
  penalize(key: string, ms = 60_000, now = Date.now()): void {
    this.cooldown.set(key, now + ms);
  }
}

function toKeys(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return (Array.isArray(v) ? v : v.split(","))
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface StockMediaOptions {
  /** Pexels API key(s). String, comma-list, or array — pooled round-robin. */
  pexelsKey?: string | string[];
  /** Pixabay API key(s). String, comma-list, or array — pooled round-robin. */
  pixabayKey?: string | string[];
  /** fetch implementation. Defaults to global fetch (Node 18+/browser). */
  fetch?: FetchLike;
  /** Cache TTL for identical searches, ms (default 600000 = 10 min; 0 disables). */
  cacheTtlMs?: number;
}

export interface StockMediaClient {
  search(query: string, options?: SearchOptions): Promise<SearchResult>;
  /** Fetch an asset's bytes via the configured fetch (bring-your-own storage). */
  download(asset: StockAsset, opts?: { signal?: AbortSignal }): Promise<Uint8Array>;
  /** Pick the smallest rendition that still meets a minimum width. */
  pickRendition(asset: StockAsset, minWidth: number): StockAsset["files"][number] | undefined;
}

interface CacheEntry {
  at: number;
  result: SearchResult;
}

/**
 * Create a stock-media client over the Pexels and Pixabay official APIs. Searches
 * free-licence photos and video clips, normalizes both providers to one shape with
 * licence + one-line attribution per asset, and caches by query. It NEVER scrapes news
 * sites, social media or image search — only the two official APIs. Bring your own
 * API keys (pooled) and, optionally, a fetch implementation; deterministic and testable.
 */
export function createStockMedia(options: StockMediaOptions = {}): StockMediaClient {
  const fetchImpl = (options.fetch ?? (globalThis as any).fetch) as FetchLike | undefined;
  if (!fetchImpl) throw new Error("stockmedia: no fetch available — pass options.fetch");
  const pexels = new KeyPool(toKeys(options.pexelsKey ?? envKey("PEXELS_API_KEY")));
  const pixabay = new KeyPool(toKeys(options.pixabayKey ?? envKey("PIXABAY_API_KEY")));
  const ttl = options.cacheTtlMs ?? 600_000;
  const cache = new Map<string, CacheEntry>();

  async function runProvider(
    provider: Provider,
    type: MediaType,
    query: string,
    opts: SearchOptions,
    out: StockAsset[],
    warnings: string[],
  ): Promise<void> {
    const pool = provider === "pexels" ? pexels : pixabay;
    const key = pool.next();
    if (!key) {
      warnings.push(`${provider}: no API key configured`);
      return;
    }
    try {
      const fn = provider === "pexels" ? pexelsSearch : pixabaySearch;
      const assets = await fn(type, query, key, fetchImpl!, opts);
      out.push(...assets);
    } catch (e) {
      const msg = (e as Error).message;
      if (/\b429\b/.test(msg)) pool.penalize(key);
      warnings.push(`${provider}/${type}: ${msg}`);
    }
  }

  return {
    async search(query, options = {}) {
      const type = options.type ?? "both";
      const provider = options.provider ?? "both";
      const cacheKey = JSON.stringify([query, options]);
      if (ttl > 0) {
        const hit = cache.get(cacheKey);
        if (hit && Date.now() - hit.at < ttl) return hit.result;
      }
      const providers: Provider[] = provider === "both" ? ["pexels", "pixabay"] : [provider];
      const types: MediaType[] = type === "both" ? ["photo", "video"] : [type];
      const out: StockAsset[] = [];
      const warnings: string[] = [];
      await Promise.all(
        providers.flatMap((p) => types.map((t) => runProvider(p, t, query, options, out, warnings))),
      );
      const seen = new Set<string>();
      const assets = out
        .filter((a) => passesFilters(a, options))
        .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
      const result: SearchResult = { query, assets, providers, warnings };
      if (ttl > 0) cache.set(cacheKey, { at: Date.now(), result });
      return result;
    },

    async download(asset, opts = {}) {
      const res = await fetchImpl!(asset.downloadUrl, { signal: opts.signal });
      if (!res.ok) throw new Error(`download ${asset.id}: ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },

    pickRendition(asset, minWidth) {
      const ascending = [...asset.files].sort((a, b) => a.width - b.width);
      return ascending.find((f) => f.width >= minWidth) ?? ascending[ascending.length - 1];
    },
  };
}

function envKey(name: string): string | undefined {
  try {
    return (globalThis as any).process?.env?.[name];
  } catch {
    return undefined;
  }
}
