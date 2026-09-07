/**
 * @lacspace/cart — serialization, hydration, merging and quantity clamping.
 *
 * A {@link Cart} is already plain data, but these helpers give you a stable,
 * versioned envelope for persistence, a tolerant re-hydrator that always
 * returns a well-formed cart, and a way to combine two carts. All pure and
 * immutable — inputs are never mutated.
 */

import type { Cart } from "./index";
import { addItem, createCart, findItem, removeItem, setQty } from "./index";

/** Current serialized envelope version. */
const SERIAL_VERSION = 1 as const;

/** A versioned, JSON-safe snapshot of a cart. */
export interface SerializedCart {
  /** Envelope version, for forward-compatible migrations. */
  v: typeof SERIAL_VERSION;
  currency?: string;
  items: Cart["items"];
}

/** Coerce to a safe integer (NaN/±Infinity → 0), matching the core engine. */
function toInt(n: number): number {
  const v = Math.trunc(n);
  return Number.isFinite(v) ? v : 0;
}

/**
 * Serialize a cart to a compact JSON string, wrapped in a versioned envelope.
 * Round-trips through {@link hydrateCart}.
 */
export function serializeCart(cart: Cart): string {
  const snapshot: SerializedCart = { v: SERIAL_VERSION, items: cart.items };
  if (cart.currency !== undefined) snapshot.currency = cart.currency;
  return JSON.stringify(snapshot);
}

/**
 * Rebuild a cart from a JSON string, a {@link SerializedCart} envelope, or any
 * plain `{ items, currency }` shape. Tolerant of malformed input: unknown or
 * corrupt data yields a valid empty cart rather than throwing, and every line
 * is re-normalised (integer prices/quantities, option deltas, merged ids).
 */
export function hydrateCart(input: string | SerializedCart | Partial<Cart> | unknown): Cart {
  let raw: unknown = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch {
      return createCart();
    }
  }
  if (!raw || typeof raw !== "object") return createCart();

  const obj = raw as Partial<Cart> & { currency?: unknown };
  const init: Partial<Cart> = {};
  if (typeof obj.currency === "string") init.currency = obj.currency;
  if (Array.isArray(obj.items)) init.items = obj.items as Cart["items"];
  // createCart normalises every field and merges same-id lines.
  return createCart(init);
}

/**
 * Merge cart `b` into cart `a`, summing the quantities of lines that share an
 * `id`. `b`'s `unitPrice`/`name`/`meta`/`options` win on a collision (same rule
 * as {@link addItem}). Currency is taken from `a`, falling back to `b`. Returns
 * a new cart; neither input is mutated.
 */
export function mergeCarts(a: Cart, b: Cart): Cart {
  const currency = a.currency ?? b.currency;
  let out = createCart(currency !== undefined ? { currency } : {});
  for (const it of a.items) out = addItem(out, it);
  for (const it of b.items) out = addItem(out, it);
  return out;
}

/**
 * Clamp an existing line's quantity into `[min, max]` (either bound optional).
 * If clamping drives the quantity to `0` or below, the line is removed. A
 * missing line, or a range with no bounds, is a no-op returning a fresh,
 * equivalent cart. Returns a new cart.
 */
export function clampQty(
  cart: Cart,
  id: string,
  range: { min?: number; max?: number },
): Cart {
  const item = findItem(cart, id);
  if (!item) return removeItem(cart, id); // no-op: returns a fresh, equivalent cart
  let q = item.qty;
  if (range.min !== undefined) q = Math.max(q, toInt(range.min));
  if (range.max !== undefined) q = Math.min(q, toInt(range.max));
  return setQty(cart, id, q);
}
