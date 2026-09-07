/**
 * Batches / lots with expiry — track stock as discrete lots and consume them in
 * a defined order: **FIFO** (oldest received first) or **FEFO** (soonest to
 * expire first, ideal for perishables). Allocation is pure and conserves units:
 * every consumed unit is deducted from a lot; nothing is created.
 */
import { InventoryError } from "./index";
import { requireQty, toCount } from "./_shared";

/** A single batch of a SKU. `qty` is a non-negative integer count of units. */
export interface Lot {
  /** Lot / batch identifier. */
  id: string;
  /** Units remaining in this lot. */
  qty: number;
  /** Epoch-ms the lot was received (used for FIFO). */
  receivedAt?: number;
  /** Epoch-ms the lot expires (used for FEFO / expiry reports). */
  expiresAt?: number;
}

/** Consumption ordering: first-in-first-out or first-expired-first-out. */
export type ConsumeStrategy = "fifo" | "fefo";

/** One lot's contribution to an allocation. */
export interface Allocation {
  /** The lot the units were drawn from. */
  id: string;
  /** Units drawn from that lot. */
  qty: number;
}

/** Result of {@link allocate}: what was picked, what could not be met, remaining lots. */
export interface AllocationResult {
  /** Per-lot picks, in consumption order. */
  allocations: Allocation[];
  /** Units that could NOT be fulfilled (short by this many). */
  remaining: number;
  /** Lots after consumption (decremented; empty lots removed). */
  lots: Lot[];
}

/** Total units across a set of lots. */
export function lotQuantity(lots: readonly Lot[]): number {
  return lots.reduce((sum, l) => sum + Math.max(0, toCount(l.qty, `lot[${l.id}].qty`)), 0);
}

/**
 * Return a copy of `lots` ordered for consumption.
 *
 * - `fefo`: soonest `expiresAt` first; lots with no expiry sort last.
 * - `fifo`: earliest `receivedAt` first; lots with no receipt time sort last.
 *
 * Ties fall back to the other timestamp, then to insertion order (stable).
 */
export function sortLots(lots: readonly Lot[], strategy: ConsumeStrategy = "fefo"): Lot[] {
  const withIndex = lots.map((l, i) => ({ l, i }));
  const key = strategy === "fefo" ? "expiresAt" : "receivedAt";
  const alt = strategy === "fefo" ? "receivedAt" : "expiresAt";
  withIndex.sort((a, b) => {
    const ka = a.l[key] ?? Infinity;
    const kb = b.l[key] ?? Infinity;
    if (ka !== kb) return ka - kb;
    const aa = a.l[alt] ?? Infinity;
    const ab = b.l[alt] ?? Infinity;
    if (aa !== ab) return aa - ab;
    return a.i - b.i;
  });
  return withIndex.map((x) => ({ ...x.l }));
}

/**
 * Allocate `qty` units across `lots` in FIFO/FEFO order (default `fefo`).
 *
 * Pure: the input lots are untouched. The returned `lots` are the remainder
 * (decremented, with fully-consumed lots dropped). Conservation holds:
 * `lotQuantity(input) === lotQuantity(result.lots) + (qty − result.remaining)`.
 *
 * @param options.strategy consumption order (`"fifo"` | `"fefo"`, default `"fefo"`).
 * @param options.now when set, lots with `expiresAt <= now` are skipped (expired
 *   stock is never allocated) and left in the returned `lots`.
 */
export function allocate(
  lots: readonly Lot[],
  qty: number,
  options: { strategy?: ConsumeStrategy; now?: number } = {},
): AllocationResult {
  let need = requireQty(qty);
  const now = options.now == null ? null : toCount(options.now, "now");
  const ordered = sortLots(lots, options.strategy ?? "fefo");
  const allocations: Allocation[] = [];
  const out: Lot[] = [];
  for (const lot of ordered) {
    const have = Math.max(0, toCount(lot.qty, `lot[${lot.id}].qty`));
    const isExpired = now != null && lot.expiresAt != null && lot.expiresAt <= now;
    if (need > 0 && have > 0 && !isExpired) {
      const take = Math.min(need, have);
      if (take > 0) {
        allocations.push({ id: lot.id, qty: take });
        need -= take;
      }
      const left = have - take;
      if (left > 0) out.push({ ...lot, qty: left });
    } else if (have > 0) {
      out.push({ ...lot, qty: have });
    }
  }
  return { allocations, remaining: need, lots: out };
}

/** Lots that have expired at `now` (`expiresAt <= now`), preserving order. */
export function expiredLots(lots: readonly Lot[], now: number): Lot[] {
  const t = toCount(now, "now");
  return lots.filter((l) => l.expiresAt != null && l.expiresAt <= t).map((l) => ({ ...l }));
}

/**
 * Lots expiring within `withinMs` of `now` (not yet expired, but soon), soonest
 * first. Excludes already-expired lots and lots with no `expiresAt`.
 */
export function expiringLots(lots: readonly Lot[], withinMs: number, now: number): Lot[] {
  const t = toCount(now, "now");
  const window = requireQty(withinMs, "withinMs");
  const cutoff = t + window;
  return sortLots(
    lots.filter((l) => l.expiresAt != null && l.expiresAt > t && l.expiresAt <= cutoff),
    "fefo",
  );
}
