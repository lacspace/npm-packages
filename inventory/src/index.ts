/**
 * @lacspace/inventory — a stock-tracking engine that prevents overselling.
 *
 * Bring-your-own-store: this package is a set of pure, immutable functions over
 * a plain `Stock` state object `{ onHand, reserved }`. You decide where the
 * state lives (a database row, a cache, a signal); this decides the maths.
 *
 * The core guarantee: you can never reserve or fulfil more than is available,
 * so a race between two checkouts fails loudly instead of overselling.
 */

/** Stock state for a single SKU. Both fields are non-negative integers. */
export interface Stock {
  /** Physical units in the warehouse. */
  onHand: number;
  /** Units held for pending orders (not yet shipped). */
  reserved: number;
}

/** Thrown when an operation would oversell or is otherwise invalid. */
export class InventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryError";
    // Restore the prototype chain for instanceof across transpile targets.
    Object.setPrototypeOf(this, InventoryError.prototype);
  }
}

function toCount(n: number, label: string): number {
  const v = Math.trunc(n);
  if (!Number.isFinite(v)) throw new InventoryError(`${label} must be a finite number`);
  return v;
}

/** Require a non-negative quantity for an operation. */
function requireQty(qty: number): number {
  const q = toCount(qty, "qty");
  if (q < 0) throw new InventoryError("qty must be >= 0");
  return q;
}

/** Create a new stock state with the given quantity on hand (default `0`). */
export function createStock(onHand = 0): Stock {
  const n = toCount(onHand, "onHand");
  if (n < 0) throw new InventoryError("onHand must be >= 0");
  return { onHand: n, reserved: 0 };
}

/** Units that can still be reserved: `onHand - reserved`. */
export function available(stock: Stock): number {
  return stock.onHand - stock.reserved;
}

/**
 * Reserve `qty` units for a pending order. Increases `reserved`.
 *
 * @throws {InventoryError} if `qty` exceeds {@link available} (would oversell).
 */
export function reserve(stock: Stock, qty: number): Stock {
  const q = requireQty(qty);
  if (q > available(stock)) {
    throw new InventoryError(
      `Cannot reserve ${q}: only ${available(stock)} available`,
    );
  }
  return { onHand: stock.onHand, reserved: stock.reserved + q };
}

/**
 * Release a previously-held reservation (e.g. an abandoned cart). Never drops
 * `reserved` below `0` — it releases at most what is currently reserved.
 */
export function release(stock: Stock, qty: number): Stock {
  const q = requireQty(qty);
  return { onHand: stock.onHand, reserved: stock.reserved - Math.min(q, stock.reserved) };
}

/**
 * Fulfil (ship) `qty` reserved units: decrements both `onHand` and `reserved`.
 *
 * @throws {InventoryError} if `qty` exceeds the currently reserved amount.
 */
export function commit(stock: Stock, qty: number): Stock {
  const q = requireQty(qty);
  if (q > stock.reserved) {
    throw new InventoryError(
      `Cannot commit ${q}: only ${stock.reserved} reserved`,
    );
  }
  return { onHand: stock.onHand - q, reserved: stock.reserved - q };
}

/** Add `qty` units to `onHand` (a delivery / restock). */
export function restock(stock: Stock, qty: number): Stock {
  const q = requireQty(qty);
  return { onHand: stock.onHand + q, reserved: stock.reserved };
}

/**
 * Apply a signed correction to `onHand` (stock-take, shrinkage, returns).
 * `onHand` is clamped at `0`; `reserved` is left untouched.
 */
export function adjust(stock: Stock, delta: number): Stock {
  const d = toCount(delta, "delta");
  return { onHand: Math.max(0, stock.onHand + d), reserved: stock.reserved };
}

/** `true` when {@link available} is at or below `threshold`. */
export function isLow(stock: Stock, threshold: number): boolean {
  return available(stock) <= toCount(threshold, "threshold");
}

/** `true` when nothing is available to reserve (`available <= 0`). */
export function isOutOfStock(stock: Stock): boolean {
  return available(stock) <= 0;
}
