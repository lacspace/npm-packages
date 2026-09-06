/**
 * Pure parsers for the extra fields Google Maps shows on a listing — price
 * level, business status, claimed/verified state, open-now and category tags.
 *
 * Every function here is deterministic, takes plain strings (never the DOM or
 * the network), and returns `undefined` when the signal is absent — so the
 * scraper can wire them into the live listing panel and unit tests can exercise
 * them against small HTML/aria snippets without ever opening a browser.
 */
import type { BusinessStatus } from "./types.js";

/** The currency glyphs Google renders a price level with (matches normalize.ts). */
const PRICE_GLYPHS = /[$€£₹¥₩]/g;

/**
 * Extract a bare price-level token (`$`, `$$`, `₹₹₹`) from a price string or
 * aria-label like "Price: $$" or "Moderately priced". Returns `undefined` when
 * no price signal is present. Pure.
 */
export function parsePriceLevel(text?: string | null): string | undefined {
  if (!text) return undefined;
  const t = text.trim();
  const glyphs = t.match(/[$€£₹¥₩]{1,4}/);
  if (glyphs && glyphs[0]) return glyphs[0];
  const lower = t.toLowerCase();
  if (/inexpensive|cheap/.test(lower)) return "$";
  if (/moderate/.test(lower)) return "$$";
  if (/(very expensive|high-end|luxur|upscale)/.test(lower)) return "$$$$";
  if (/expensive|pricey/.test(lower)) return "$$$";
  return undefined;
}

/**
 * Numeric price tier 1–4 from a price-level string (`$$` → 2, `₹₹₹` → 3).
 * Anything above 4 clamps to 4; empty/unknown → `undefined`. Pure.
 */
export function priceLevelValue(price?: string | null): number | undefined {
  if (!price) return undefined;
  const n = (price.match(PRICE_GLYPHS) ?? []).length;
  if (n <= 0) return undefined;
  return Math.min(4, n);
}

/**
 * Read a business's operating state from listing text. Detects "Permanently
 * closed" and "Temporarily closed"; returns `undefined` for anything else (the
 * caller can default a loaded, non-closed listing to "operational"). Pure.
 */
export function parseBusinessStatus(text?: string | null): BusinessStatus | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  if (/permanently closed/.test(t)) return "closed";
  if (/temporarily closed|temporarily unavailable/.test(t)) return "temporarily-closed";
  return undefined;
}

/**
 * Best-effort claimed/verified state. A "Claim this business" / "Own this
 * business?" affordance means the listing is unclaimed (`false`); an explicit
 * "Verified" / "Claimed" marker means `true`; otherwise `undefined`. Pure.
 */
export function parseClaimed(text?: string | null): boolean | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  if (/claim this business|own this business|claim this listing|suggest an edit.*claim/.test(t)) return false;
  if (/\bverified\b|\bclaimed\b/.test(t)) return true;
  return undefined;
}

/**
 * Whether a business is open now, from the hours-widget label (e.g.
 * "Open ⋅ Closes 10 PM" → true, "Closed ⋅ Opens 9 AM" → false,
 * "Open 24 hours" → true). Returns `undefined` when the state is unclear. Pure.
 */
export function parseOpenNow(text?: string | null): boolean | undefined {
  if (!text) return undefined;
  const t = text.trim().toLowerCase();
  if (!t) return undefined;
  if (/open 24 hours/.test(t)) return true;
  if (/^permanently closed|^temporarily closed/.test(t)) return false;
  if (/^open\b/.test(t)) return true;
  if (/^closed\b/.test(t)) return false;
  const hasOpen = /\bopen\b/.test(t);
  const hasClosed = /\bclosed\b/.test(t);
  if (hasOpen && !hasClosed) return true;
  if (hasClosed && !hasOpen) return false;
  return undefined;
}

/**
 * Clean and de-duplicate a set of category chips into tidy tags. Accepts an
 * array of chip texts or a single delimited string ("Cafe · Bakery"). Returns
 * `undefined` when nothing usable remains. Pure.
 */
export function parseCategoryTags(
  input?: readonly (string | null | undefined)[] | string | null,
): string[] | undefined {
  if (!input) return undefined;
  const arr = typeof input === "string" ? input.split(/[,;·|•]/) : input;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
    const t = (raw ?? "").trim().replace(/\s+/g, " ");
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.length ? out : undefined;
}
