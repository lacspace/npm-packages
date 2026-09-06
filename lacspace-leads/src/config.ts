/**
 * Config-file campaigns — describe a repeatable set of searches plus shared
 * options in one JSON file and run them together. Ideal for agencies running
 * the same city sweeps on a schedule.
 *
 * ```json
 * {
 *   "searches": [
 *     { "type": "cafes", "city": "Kathmandu", "area": "Thamel,Baneshwor" },
 *     { "type": "gyms",  "city": "Pokhara" }
 *   ],
 *   "country": "NP", "verifyEmails": true, "sort": "reviews",
 *   "filters": { "hasContact": true },
 *   "out": "master.xlsx", "format": "xlsx", "append": true
 * }
 * ```
 */
import { searchLeadsBatch, type BatchQuery, type BatchResumeHooks } from "./batch.js";
import type { Lead, LeadFilters, OutputFormat, SearchOptions } from "./types.js";

/** A leads campaign config (the JSON file passed to `--config`). */
export interface LeadsConfig
  extends Partial<Omit<SearchOptions, "type" | "city" | "area" | "query" | "onProgress" | "signal" | "filters">> {
  /** The searches to run and merge. */
  searches: BatchQuery[];
  /** Post-collection filters applied across the merged set. */
  filters?: LeadFilters;
  /** Cap the merged result. */
  total?: number;
  /** Output file (used by the CLI). */
  out?: string;
  /** Output format (used by the CLI). */
  format?: OutputFormat;
  /** Append/merge into an existing `out` file (used by the CLI). */
  append?: boolean;
  /** Excel sheet name (used by the CLI). */
  sheet?: string;
}

/**
 * Run a {@link LeadsConfig}: expand its `searches`, apply the shared options and
 * filters, and return the merged, de-duplicated leads. Output settings (`out`,
 * `format`, `append`, `sheet`) are ignored here — the CLI uses them to write.
 */
export async function runConfig(
  config: LeadsConfig,
  hooks: { onProgress?: (m: string) => void; signal?: AbortSignal } & BatchResumeHooks = {},
): Promise<Lead[]> {
  const { searches, filters, total, out, format, append, sheet, ...shared } = config;
  void out; void format; void append; void sheet;
  const opts = { ...shared } as SearchOptions & { total?: number } & BatchResumeHooks;
  if (filters) opts.filters = filters;
  if (total !== undefined) opts.total = total;
  if (hooks.onProgress) opts.onProgress = hooks.onProgress;
  if (hooks.signal) opts.signal = hooks.signal;
  if (hooks.skip) opts.skip = hooks.skip;
  if (hooks.seedLeads) opts.seedLeads = hooks.seedLeads;
  if (hooks.onQueryDone) opts.onQueryDone = hooks.onQueryDone;
  return searchLeadsBatch(Array.isArray(searches) ? searches : [], opts);
}

/** Validate a parsed object is a usable config. Throws a helpful error if not. */
export function assertConfig(value: unknown): asserts value is LeadsConfig {
  if (!value || typeof value !== "object") throw new Error("Config must be a JSON object.");
  const searches = (value as LeadsConfig).searches;
  if (!Array.isArray(searches) || searches.length === 0) {
    throw new Error('Config needs a non-empty "searches" array, e.g. [{ "type": "cafes", "city": "Kathmandu" }].');
  }
}
