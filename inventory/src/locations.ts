/**
 * Multi-location stock — the same immutable, bring-your-own-store philosophy as
 * the core, spread across warehouses. A {@link LocationStock} is a plain map of
 * `location → Stock`; these functions give you aggregate views and transfers
 * that always conserve the total number of physical units.
 */
import { InventoryError, available } from "./index";
import type { Stock } from "./index";
import { toCount, requireQty } from "./_shared";

/** Stock held across named locations (warehouses, shelves, stores). */
export type LocationStock = Record<string, Stock>;

/**
 * Build a {@link LocationStock} from a map of `location → onHand` counts.
 * Every location starts with `reserved: 0`.
 */
export function createLocations(init: Record<string, number> = {}): LocationStock {
  const out: LocationStock = {};
  for (const [loc, raw] of Object.entries(init)) {
    const n = toCount(raw, `onHand[${loc}]`);
    if (n < 0) throw new InventoryError(`onHand[${loc}] must be >= 0`);
    out[loc] = { onHand: n, reserved: 0 };
  }
  return out;
}

/** The `Stock` at a location, or an empty `{ onHand: 0, reserved: 0 }` if absent. */
export function atLocation(ls: LocationStock, location: string): Stock {
  const s = ls[location];
  return s ? { onHand: s.onHand, reserved: s.reserved } : { onHand: 0, reserved: 0 };
}

/**
 * Return a new map with `location` set to `stock` (replacing any existing entry).
 * Immutable — the input map is not mutated.
 */
export function setLocation(ls: LocationStock, location: string, stock: Stock): LocationStock {
  return { ...ls, [location]: { onHand: stock.onHand, reserved: stock.reserved } };
}

/** Total physical units on hand across every location. */
export function totalOnHand(ls: LocationStock): number {
  return Object.values(ls).reduce((sum, s) => sum + s.onHand, 0);
}

/** Total units reserved across every location. */
export function totalReserved(ls: LocationStock): number {
  return Object.values(ls).reduce((sum, s) => sum + s.reserved, 0);
}

/** Total available (`onHand − reserved`) across every location. */
export function totalAvailable(ls: LocationStock): number {
  return Object.values(ls).reduce((sum, s) => sum + available(s), 0);
}

/** Collapse every location into a single aggregate `Stock` view. */
export function aggregate(ls: LocationStock): Stock {
  return { onHand: totalOnHand(ls), reserved: totalReserved(ls) };
}

/**
 * Move `qty` physical units from one location to another. Draws only from the
 * source's {@link available} stock (never strands a reservation) and conserves
 * the grand total of `onHand` — units are neither created nor destroyed.
 *
 * @throws {InventoryError} if `from === to`, or if `qty` exceeds the available
 * units at `from`.
 */
export function transfer(
  ls: LocationStock,
  from: string,
  to: string,
  qty: number,
): LocationStock {
  const q = requireQty(qty);
  if (from === to) throw new InventoryError("Cannot transfer to the same location");
  const src = atLocation(ls, from);
  const avail = available(src);
  if (q > avail) {
    throw new InventoryError(
      `Cannot transfer ${q} from "${from}": only ${avail} available`,
    );
  }
  const dst = atLocation(ls, to);
  return {
    ...ls,
    [from]: { onHand: src.onHand - q, reserved: src.reserved },
    [to]: { onHand: dst.onHand + q, reserved: dst.reserved },
  };
}
