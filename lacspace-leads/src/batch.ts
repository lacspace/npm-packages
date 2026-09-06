/**
 * Batch search — run several Google Maps searches (the cross-product of
 * comma-separated business types × cities × areas) and merge them into one
 * de-duplicated, sorted lead list. Ideal for covering a whole city
 * neighbourhood-by-neighbourhood in a single command.
 */
import { scrapeLeads } from "./scrape.js";
import { composeQuery, expandQueries } from "./query.js";
import { dedupeLeads } from "./filter.js";
import { sortLeads } from "./normalize.js";
import type { Lead, SearchOptions } from "./types.js";

/** One sub-search in a batch. */
export interface BatchQuery {
  type?: string;
  city?: string;
  area?: string;
  query?: string;
}

/** Optional hooks for resumable sweeps — see {@link searchLeadsBatch}. */
export interface BatchResumeHooks {
  /** Return true to skip a sub-query entirely (already collected on a prior run). */
  skip?: (query: BatchQuery) => boolean;
  /** Leads carried over from a previous, interrupted run — merged into the result. */
  seedLeads?: Lead[];
  /** Called after each completed sub-query with the leads it found (for checkpointing). */
  onQueryDone?: (query: BatchQuery, found: Lead[]) => void;
}

/**
 * Run each `{type, city, area}` search in turn and merge the results, applying
 * a single cross-search dedupe and sort at the end. Per-search `limit` is the
 * cap for *each* sub-search; `opts.total`, when set, caps the merged list.
 *
 * Filtering and sorting are applied once, globally, here — so pass them via
 * `opts` rather than relying on the per-search pass.
 *
 * For long sweeps, pass {@link BatchResumeHooks} (`skip`, `seedLeads`,
 * `onQueryDone`) to make the run resumable — the CLI's `--resume` wires these
 * to a checkpoint file.
 */
export async function searchLeadsBatch(
  queries: BatchQuery[],
  opts: Omit<SearchOptions, "type" | "city" | "area" | "query"> & { total?: number } & BatchResumeHooks = {},
): Promise<Lead[]> {
  // Strip any per-query keys that may have leaked in via a spread `opts`, so a
  // comma-separated city/area on the parent never overrides a sub-search.
  const {
    total,
    onProgress,
    signal,
    skip,
    seedLeads,
    onQueryDone,
    type: _t,
    city: _c,
    area: _a,
    query: _q,
    ...shared
  } = opts as SearchOptions & { total?: number } & BatchResumeHooks;
  void _t; void _c; void _a; void _q;
  let merged: Lead[] = seedLeads ? [...seedLeads] : [];
  const seenDedupe = shared.dedupe ?? "website";

  for (let i = 0; i < queries.length; i++) {
    if (signal?.aborted) break;
    const q = queries[i]!;
    const label = (() => {
      try {
        return composeQuery(q);
      } catch {
        return q.query ?? q.type ?? "search";
      }
    })();
    if (skip?.(q)) {
      onProgress?.(`[${i + 1}/${queries.length}] ${label} — skipped (resumed from checkpoint)`);
      continue;
    }
    onProgress?.(`[${i + 1}/${queries.length}] ${label}`);

    const subOpts: SearchOptions = {
      ...shared,
      type: q.type ?? "",
      // Defer sorting to the merged pass; keep per-search dedupe/filter local.
      ...(q.query ? { query: q.query } : {}),
      ...(q.city ? { city: q.city } : {}),
      ...(q.area ? { area: q.area } : {}),
    };
    delete (subOpts as { sort?: unknown }).sort;
    if (signal) subOpts.signal = signal;
    if (onProgress) subOpts.onProgress = (m) => onProgress(`  ${m}`);

    try {
      const found = await scrapeLeads(subOpts);
      merged = merged.concat(found);
      onQueryDone?.(q, found);
    } catch (err) {
      onProgress?.(`  ! skipped "${label}": ${(err as Error).message}`);
    }
  }

  merged = dedupeLeads(merged, seenDedupe);
  if (opts.sort) merged = sortLeads(merged, opts.sort, opts.sortDir);
  if (total !== undefined && total > 0) merged = merged.slice(0, total);
  onProgress?.(`merged ${merged.length} unique lead${merged.length === 1 ? "" : "s"}.`);
  return merged;
}

/**
 * Convenience wrapper: expand a single request with comma-separated
 * `type`/`city`/`area` into its cross-product and run it as a batch.
 */
export async function searchLeadsMulti(
  opts: SearchOptions & { total?: number },
): Promise<Lead[]> {
  const queries = expandQueries({
    ...(opts.type ? { type: opts.type } : {}),
    ...(opts.city ? { city: opts.city } : {}),
    ...(opts.area ? { area: opts.area } : {}),
    ...(opts.query ? { query: opts.query } : {}),
  });
  return searchLeadsBatch(queries, opts);
}
