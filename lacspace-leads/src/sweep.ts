/**
 * Target sweeps — collect a *number of leads you ask for*, not a number of
 * listings one search happens to return.
 *
 * Google Maps stops serving a single search at roughly 120 results, no matter
 * what `--limit` says. To go deeper you have to ask it more than once: each
 * neighbourhood you name is its own search, and beyond that the map itself can
 * be tiled — the same query re-centred on a grid of points returns the
 * businesses around each point. This module plans that expansion, runs it
 * center-outwards, and stops as soon as the target is met or the map stops
 * giving anything new.
 */
import { scrapeLeads } from "./scrape.js";
import { expandQueries } from "./query.js";
import { dedupeLeads } from "./filter.js";
import { sortLeads } from "./normalize.js";
import type { LatLng } from "./geo.js";
import type { Lead, SearchOptions } from "./types.js";

/**
 * What one Google Maps search realistically returns. The feed stops loading
 * somewhere around 120 listings; asking for more from a single query is what
 * makes `--limit 500` quietly return ~114.
 */
export const MAX_PER_SEARCH = 120;

/**
 * The smallest batch a single step asks for. Google orders results by
 * prominence, so the first handful of any tile is usually something already
 * collected — ask for too few and a productive tile looks empty.
 */
export const MIN_PER_STEP = 40;

/** Metres per degree of latitude (close enough anywhere on Earth). */
const M_PER_DEG_LAT = 111_320;

/**
 * Points of a square grid around `center`, ordered center-outwards ring by
 * ring: the centre first, then its 8 neighbours, then the 16 around those.
 * `stepM` is the spacing between neighbouring points. Pure.
 */
export function gridPoints(center: LatLng, stepM: number, rings: number): LatLng[] {
  const step = Math.max(100, stepM);
  const ringCount = Math.max(0, Math.trunc(rings));
  const dLat = step / M_PER_DEG_LAT;
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const dLng = step / (M_PER_DEG_LAT * (Math.abs(cosLat) < 0.01 ? 0.01 : cosLat));
  const out: LatLng[] = [];
  for (let ring = 0; ring <= ringCount; ring++) {
    for (let x = -ring; x <= ring; x++) {
      for (let y = -ring; y <= ring; y++) {
        // Only the perimeter of this ring — the inner ones are already queued.
        if (ring > 0 && Math.max(Math.abs(x), Math.abs(y)) !== ring) continue;
        out.push({
          lat: +(center.lat + y * dLat).toFixed(6),
          lng: +(center.lng + x * dLng).toFixed(6),
        });
      }
    }
  }
  return out;
}

/** How many tiles a ring count covers, including the centre. Pure. */
export function tilesForRings(rings: number): number {
  const r = Math.max(0, Math.trunc(rings));
  return (2 * r + 1) ** 2;
}

/** The smallest ring count that covers at least `tiles` points. Pure. */
export function ringsForTiles(tiles: number): number {
  const want = Math.max(1, Math.trunc(tiles));
  let rings = 0;
  while (tilesForRings(rings) < want) rings++;
  return rings;
}

/** One planned step of a sweep, in the order it will run. */
export interface SweepStep {
  /** "search" = a named place query; "tile" = the same query re-centred on the map. */
  kind: "search" | "tile";
  type?: string;
  city?: string;
  area?: string;
  query?: string;
  center?: LatLng;
}

/**
 * The named searches a request starts with: the cross-product of comma-separated
 * types x cities x areas. Pure — the tile steps are planned later, once the map
 * has told us where the first city actually is.
 */
export function planNamedSteps(base: {
  type?: string;
  city?: string;
  area?: string;
  query?: string;
}): SweepStep[] {
  return expandQueries(base).map((q) => ({ kind: "search" as const, ...q }));
}

/** Progress report for a running sweep. */
export interface SweepStats {
  /** Named searches actually run. */
  searches: number;
  /** Map tiles actually run. */
  tiles: number;
  /** Unique leads collected (before any final trim to the target). */
  unique: number;
  /** True when the map stopped returning anything new before the target was met. */
  saturated: boolean;
}

/** Options for {@link sweepLeads}. Everything not listed is passed to each search. */
export interface SweepOptions extends Omit<SearchOptions, "limit"> {
  /** How many unique leads you want in total. */
  target: number;
  /** Spacing between map tiles, in metres. Default 2500. */
  stepM?: number;
  /** Most tiles to try before giving up. Default 49 (3 rings). */
  maxTiles?: number;
  /** Per-search cap. Defaults to {@link MAX_PER_SEARCH}; never exceeds it. */
  perSearch?: number;
  /** Called with a human-readable note as the sweep changes strategy. */
  onNotice?: (message: string) => void;
}

/**
 * Collect up to `target` unique leads, expanding coverage until it has them.
 *
 * Order of work, stopping the moment the target is met:
 *  1. every named search (types x cities x areas);
 *  2. map tiles around the first search's centre, center-outwards.
 *
 * Tiling stops early once several consecutive tiles return nothing new, which
 * means that area of the map is exhausted — `stats.saturated` says so, and the
 * caller should tell the user rather than pretend the target was reachable.
 */
export async function sweepLeads(
  opts: SweepOptions,
): Promise<{ leads: Lead[]; stats: SweepStats }> {
  const {
    target,
    stepM = 2500,
    maxTiles = 49,
    perSearch,
    onNotice,
    near,
    ...shared
  } = opts;

  const want = Math.max(1, Math.trunc(target));
  const cap = Math.min(MAX_PER_SEARCH, Math.max(1, Math.trunc(perSearch ?? MAX_PER_SEARCH)));
  const dedupeBy = shared.dedupe ?? "smart";

  let collected: Lead[] = [];
  const stats: SweepStats = { searches: 0, tiles: 0, unique: 0, saturated: false };

  // Names and Maps URLs already collected. Overlapping tiles hand these to the
  // scraper so it never re-opens a listing it has already read.
  const seenNames = new Set<string>();
  const seenUrls = new Set<string>();
  const remember = (leads: readonly Lead[]): void => {
    for (const l of leads) {
      if (l.name) seenNames.add(l.name.trim().toLowerCase());
      if (l.mapsUrl) seenUrls.add(l.mapsUrl);
    }
  };
  const skipListing = (listing: { name?: string; href: string }): boolean =>
    seenUrls.has(listing.href) || (!!listing.name && seenNames.has(listing.name.trim().toLowerCase()));

  const merge = (found: Lead[]): number => {
    const before = collected.length;
    collected = dedupeLeads([...collected, ...found], dedupeBy);
    remember(found);
    stats.unique = collected.length;
    return collected.length - before;
  };

  const enough = (): boolean => collected.length >= want;

  /**
   * How many listings one step should pull. Never just "what's still missing" —
   * a tile's top results are the ones already collected, so a small ask returns
   * nothing new and looks like the map is exhausted when it isn't.
   */
  const stepLimit = (): number =>
    Math.min(cap, Math.max(MIN_PER_STEP, (want - collected.length) * 2));

  // The map centre, learned from the first search that reports one. It is what
  // makes tiling possible without any geocoding API.
  let center: LatLng | undefined = near ? { lat: near.lat, lng: near.lng } : undefined;
  const captureCenter = (c: LatLng): void => { center ??= c; };

  // 1. Named searches.
  for (const step of planNamedSteps(shared)) {
    if (enough() || shared.signal?.aborted) break;
    const searchOpts: SearchOptions = {
      ...shared,
      ...step,
      limit: stepLimit(),
      onCenter: captureCenter,
    };
    const found = await scrapeLeads(searchOpts);
    stats.searches++;
    const added = merge(found);
    onNotice?.(
      `search ${stats.searches}: ${[step.area, step.city].filter(Boolean).join(", ") || step.query || step.type} → +${added} new (${collected.length}/${want})`,
    );
  }

  // 2. Map tiles, center-outwards.
  if (!enough() && !shared.signal?.aborted) {
    if (!center) {
      onNotice?.("no map centre available, so tiling is not possible — pass --near lat,lng to sweep a radius");
      stats.saturated = true;
    } else {
      const points = gridPoints(center, stepM, ringsForTiles(maxTiles)).slice(0, Math.max(1, maxTiles));
      onNotice?.(
        `named searches gave ${collected.length} of ${want} — tiling the map around ${center.lat.toFixed(4)},${center.lng.toFixed(4)} every ${Math.round(stepM)}m`,
      );
      let dry = 0;
      for (const point of points) {
        if (enough() || shared.signal?.aborted) break;
        const tileOpts: SearchOptions = {
          ...shared,
          limit: stepLimit(),
          near: point,
          onCenter: captureCenter,
          skipListing,
        };
        // A tile IS the location, so every place word has to go: leaving
        // "in Kathmandu" in the query makes Google re-centre on the city and
        // return the same city-wide list for every tile.
        delete tileOpts.area;
        delete tileOpts.city;
        // Frame the viewport on the tile itself rather than the 2km default.
        if (tileOpts.radiusM === undefined) tileOpts.zoomRadiusM = stepM;
        const found = await scrapeLeads(tileOpts);
        stats.tiles++;
        const added = merge(found);
        onNotice?.(`tile ${stats.tiles}/${points.length} → +${added} new (${collected.length}/${want})`);
        dry = added === 0 ? dry + 1 : 0;
        // Four dead tiles in a row means this patch of map is exhausted.
        if (dry >= 4) {
          stats.saturated = true;
          break;
        }
      }
      if (!enough() && !stats.saturated) stats.saturated = stats.tiles >= points.length;
    }
  }

  const sorted = shared.sort ? sortLeads(collected, shared.sort, shared.sortDir) : collected;
  return { leads: sorted.slice(0, want), stats };
}
