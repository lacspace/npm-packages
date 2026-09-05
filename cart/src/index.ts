/**
 * @lacspace/cart — a headless, framework-agnostic shopping-cart engine.
 *
 * Pure, immutable and serializable. Every operation returns a brand-new `Cart`
 * object; the input is never mutated, so the state plays nicely with React,
 * Redux, Zustand, signals, or a plain JSON column in your database.
 *
 * All money is expressed in **integer minor units** (cents, paise, satoshi…).
 * There are no floats anywhere in this package, so you never lose a penny to
 * rounding.
 */

/** A single line in the cart. `unitPrice` is in integer minor units. */
export interface CartItem {
  /** Stable identifier — items with the same `id` are merged. */
  id: string;
  /** Human-readable name (optional). */
  name?: string;
  /** Price per unit, in integer minor units (e.g. cents). */
  unitPrice: number;
  /** Quantity. Values <= 0 remove the line. */
  qty: number;
  /** Arbitrary attached data (variant, image, sku…). */
  meta?: Record<string, unknown>;
}

/** The cart state. Plain data — safe to `JSON.stringify` and persist. */
export interface Cart {
  items: CartItem[];
  /** ISO-4217 currency code, e.g. `"USD"`. Purely informational. */
  currency?: string;
}

/** Options controlling {@link totals}. All amounts are integer minor units. */
export interface TotalsOptions {
  /** Tax rate as a fraction, `0..1` (e.g. `0.2` for 20%). Applied after discount. */
  taxRate?: number;
  /** Flat shipping charge, in minor units. */
  shipping?: number;
  /** Flat discount, in minor units. Clamped so subtotal never goes below 0. */
  discount?: number;
}

/** The computed money breakdown. Every field is an integer in minor units. */
export interface CartTotals {
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  total: number;
  itemCount: number;
}

function toInt(n: number): number {
  return Math.trunc(n);
}

/** Normalise an incoming item: coerce numeric fields to safe integers. */
function normalizeItem(item: CartItem): CartItem {
  const out: CartItem = {
    id: String(item.id),
    unitPrice: toInt(item.unitPrice),
    qty: toInt(item.qty),
  };
  if (item.name !== undefined) out.name = item.name;
  if (item.meta !== undefined) out.meta = item.meta;
  return out;
}

/**
 * Create a new cart. Accepts a partial initial state; items are normalised and
 * lines with the same `id` are merged so the result is always well-formed.
 */
export function createCart(init: Partial<Cart> = {}): Cart {
  let cart: Cart = { items: [] };
  if (init.currency !== undefined) cart.currency = init.currency;
  for (const item of init.items ?? []) {
    cart = addItem(cart, item);
  }
  return cart;
}

/**
 * Add an item. If a line with the same `id` already exists, the quantities are
 * summed (and the incoming `name`/`meta`, when present, win). Returns a new cart.
 */
export function addItem(cart: Cart, item: CartItem): Cart {
  const incoming = normalizeItem(item);
  const existing = findItem(cart, incoming.id);

  let items: CartItem[];
  if (existing) {
    const merged: CartItem = {
      ...existing,
      unitPrice: incoming.unitPrice,
      qty: existing.qty + incoming.qty,
    };
    if (item.name !== undefined) merged.name = incoming.name;
    if (item.meta !== undefined) merged.meta = incoming.meta;
    items = cart.items.map((it) => (it.id === incoming.id ? merged : it));
  } else {
    items = [...cart.items, incoming];
  }

  // A merge that drops to <= 0 removes the line.
  items = items.filter((it) => it.qty > 0);
  return withItems(cart, items);
}

/**
 * Set an absolute quantity for a line. A `qty` of `0` or less removes the line.
 * No-op (returns an equivalent new cart) if the id is not present. Returns a new cart.
 */
export function setQty(cart: Cart, id: string, qty: number): Cart {
  const q = toInt(qty);
  const key = String(id);
  if (q <= 0) return removeItem(cart, key);
  if (!findItem(cart, key)) return withItems(cart, [...cart.items]);
  const items = cart.items.map((it) => (it.id === key ? { ...it, qty: q } : it));
  return withItems(cart, items);
}

/** Remove a line by id. Returns a new cart. */
export function removeItem(cart: Cart, id: string): Cart {
  const key = String(id);
  return withItems(
    cart,
    cart.items.filter((it) => it.id !== key),
  );
}

/** Empty the cart, preserving `currency`. Returns a new cart. */
export function clear(cart: Cart): Cart {
  return withItems(cart, []);
}

/** Find a line by id, or `undefined`. Does not mutate. */
export function findItem(cart: Cart, id: string): CartItem | undefined {
  const key = String(id);
  return cart.items.find((it) => it.id === key);
}

/** Total number of units across all lines (sum of `qty`). */
export function itemCount(cart: Cart): number {
  return cart.items.reduce((n, it) => n + it.qty, 0);
}

/**
 * Compute the money breakdown for a cart. All values are integer minor units.
 *
 * `total = subtotal - discount + tax + shipping`, and is clamped so it can
 * never be negative. Tax is applied to the discounted subtotal.
 */
export function totals(cart: Cart, opts: TotalsOptions = {}): CartTotals {
  const subtotal = cart.items.reduce((sum, it) => sum + it.unitPrice * it.qty, 0);

  const rawDiscount = Math.max(0, toInt(opts.discount ?? 0));
  const discount = Math.min(rawDiscount, subtotal);

  const shipping = Math.max(0, toInt(opts.shipping ?? 0));

  const taxRate = opts.taxRate ?? 0;
  const taxable = subtotal - discount;
  const tax = taxRate > 0 ? Math.round(taxable * taxRate) : 0;

  const total = Math.max(0, subtotal - discount + tax + shipping);

  return {
    subtotal,
    discount,
    tax,
    shipping,
    total,
    itemCount: itemCount(cart),
  };
}

/** Internal: build a new cart preserving `currency`. */
function withItems(cart: Cart, items: CartItem[]): Cart {
  const next: Cart = { items };
  if (cart.currency !== undefined) next.currency = cart.currency;
  return next;
}
