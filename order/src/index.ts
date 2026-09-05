/**
 * @lacspace/order — a headless order-lifecycle engine.
 *
 * The spine between a cart and a courier: a pure, immutable and serializable
 * `Order` model with a state machine, order-number generation, line-item price
 * snapshotting, and a timestamped status history. Every operation returns a
 * brand-new `Order`; the input is never mutated, so the state plays nicely with
 * React, Redux, Zustand, signals, or a plain JSON column in your database.
 *
 * All money is expressed in **integer minor units** (cents, paise, satoshi…).
 * There are no floats stored anywhere, so you never lose a penny to rounding.
 *
 * Isomorphic — no Node built-ins. The only platform API touched is
 * `globalThis.crypto` for random ids, and that access is guarded.
 */

/* -------------------------------------------------------------------------- */
/*  Status + state machine                                                    */
/* -------------------------------------------------------------------------- */

/** Every status an order can hold across its lifecycle. */
export type OrderStatus =
  | "pending"
  | "placed"
  | "paid"
  | "processing"
  | "fulfilled"
  | "shipped"
  | "delivered"
  | "completed"
  | "on_hold"
  | "cancelled"
  | "refunded";

/**
 * The allowed forward transitions for each status. Terminal statuses
 * (`completed`, `cancelled`, `refunded`) map to an empty array.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["placed", "cancelled"],
  placed: ["paid", "cancelled", "on_hold"],
  paid: ["processing", "refunded", "on_hold", "cancelled"],
  processing: ["fulfilled", "on_hold", "cancelled", "refunded"],
  fulfilled: ["shipped", "refunded"],
  shipped: ["delivered", "refunded"],
  delivered: ["completed", "refunded"],
  on_hold: ["placed", "paid", "processing", "cancelled"],
  completed: [],
  cancelled: [],
  refunded: [],
};

/** Is moving from `from` to `to` a legal transition? */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

/** Is `status` a terminal state (no further transitions possible)? */
export function isTerminal(status: OrderStatus): boolean {
  return ORDER_TRANSITIONS[status].length === 0;
}

/* -------------------------------------------------------------------------- */
/*  Model                                                                      */
/* -------------------------------------------------------------------------- */

/** A single, price-snapshotted line in the order. All money in minor units. */
export interface OrderLine {
  /** Stable identifier for this line. */
  id: string;
  /** Stock-keeping unit / catalogue reference. */
  sku: string;
  /** Human-readable name, snapshotted at order time. */
  name: string;
  /** Price per unit, in integer minor units, snapshotted at order time. */
  unitPrice: number;
  /** Quantity. */
  qty: number;
  /** Optional per-line tax rate in the range `0..1` (e.g. `0.2` = 20%). */
  taxRate?: number;
  /** Line total = `unitPrice * qty`, in integer minor units. */
  total: number;
  /** Arbitrary attached data (variant, image…). */
  meta?: Record<string, unknown>;
}

/** A timestamped entry in the order's status history. */
export interface StatusEvent {
  status: OrderStatus;
  /** Epoch milliseconds. */
  at: number;
  /** Optional human note describing the change. */
  note?: string;
}

/** Computed monetary totals for an order. All integer minor units. */
export interface OrderTotals {
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  total: number;
}

/** The order state. Plain data — safe to `JSON.stringify` and persist. */
export interface Order {
  /** Internal, opaque id. */
  id: string;
  /** Human-facing order number, e.g. `"ORD-20260905-0001"`. */
  number: string;
  status: OrderStatus;
  /** ISO-4217 currency code, e.g. `"USD"`. Purely informational. */
  currency: string;
  customer?: { id?: string; name?: string; email?: string };
  lines: OrderLine[];
  totals: OrderTotals;
  history: StatusEvent[];
  /** Epoch milliseconds. */
  createdAt: number;
  /** Epoch milliseconds. */
  updatedAt: number;
  meta?: Record<string, unknown>;
}

/** Error thrown by order operations. Carries an optional machine `code`. */
export class OrderError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "OrderError";
    this.code = code;
  }
}

/* -------------------------------------------------------------------------- */
/*  Convenience predicates (derived from ORDER_TRANSITIONS)                    */
/* -------------------------------------------------------------------------- */

/** Can this order still be cancelled from its current status? */
export function canCancel(order: Order): boolean {
  return canTransition(order.status, "cancelled");
}

/** Can this order still be refunded from its current status? */
export function canRefund(order: Order): boolean {
  return canTransition(order.status, "refunded");
}

/** Can this order transition to `shipped` from its current status? */
export function canShip(order: Order): boolean {
  return canTransition(order.status, "shipped");
}

/** Can this order transition to `fulfilled` from its current status? */
export function canFulfill(order: Order): boolean {
  return canTransition(order.status, "fulfilled");
}

/* -------------------------------------------------------------------------- */
/*  Internal helpers                                                           */
/* -------------------------------------------------------------------------- */

/** Input shape for a single line when building or amending an order. */
export interface OrderLineInput {
  id?: string;
  sku: string;
  name?: string;
  unitPrice: number;
  qty: number;
  taxRate?: number;
  meta?: Record<string, unknown>;
}

function snapshotLine(input: OrderLineInput): OrderLine {
  const qty = Math.max(0, Math.trunc(input.qty));
  const unitPrice = Math.trunc(input.unitPrice);
  const line: OrderLine = {
    id: input.id ?? input.sku,
    sku: input.sku,
    name: input.name ?? input.sku,
    unitPrice,
    qty,
    total: unitPrice * qty,
  };
  if (input.taxRate !== undefined) line.taxRate = input.taxRate;
  if (input.meta !== undefined) line.meta = input.meta;
  return line;
}

function computeTotals(
  lines: OrderLine[],
  opts: { discount?: number; shipping?: number; tax?: number },
): OrderTotals {
  const subtotal = lines.reduce((sum, l) => sum + l.total, 0);
  const discount = Math.max(0, Math.trunc(opts.discount ?? 0));
  const shipping = Math.max(0, Math.trunc(opts.shipping ?? 0));
  const tax =
    opts.tax !== undefined
      ? Math.max(0, Math.trunc(opts.tax))
      : lines.reduce((sum, l) => sum + Math.round(l.total * (l.taxRate ?? 0)), 0);
  const total = Math.max(0, subtotal - discount + tax + shipping);
  return { subtotal, discount, tax, shipping, total };
}

/* -------------------------------------------------------------------------- */
/*  Construction & transitions                                                 */
/* -------------------------------------------------------------------------- */

/** Input to {@link createOrder}. */
export interface CreateOrderInput {
  lines: OrderLineInput[];
  currency: string;
  customer?: { id?: string; name?: string; email?: string };
  /** Flat discount in integer minor units. */
  discount?: number;
  /** Flat shipping in integer minor units. */
  shipping?: number;
  /** Explicit tax override in minor units; otherwise derived per-line. */
  tax?: number;
  /** Initial status. Defaults to `"pending"`. */
  status?: OrderStatus;
  /** Epoch milliseconds for `createdAt`/first history event. Defaults to now. */
  now?: number;
  /** Opaque id. Defaults to a random id. */
  id?: string;
  /** Human-facing number. Defaults to the id. */
  number?: string;
  meta?: Record<string, unknown>;
}

/**
 * Build a new, immutable `Order`. Each line is **snapshotted** (its `total` is
 * computed from `unitPrice * qty`) so later catalogue price changes never
 * mutate an existing order. Totals are computed and the history is seeded with
 * one `StatusEvent` for the initial status.
 */
export function createOrder(input: CreateOrderInput): Order {
  const now = input.now ?? Date.now();
  const lines = input.lines.map(snapshotLine);
  const totals = computeTotals(lines, input);
  const status = input.status ?? "pending";
  const id = input.id ?? randomOrderId({ prefix: "ord" });
  const order: Order = {
    id,
    number: input.number ?? id,
    status,
    currency: input.currency,
    lines,
    totals,
    history: [{ status, at: now }],
    createdAt: now,
    updatedAt: now,
  };
  if (input.customer !== undefined) order.customer = input.customer;
  if (input.meta !== undefined) order.meta = input.meta;
  return order;
}

/**
 * Transition an order to a new status. Validates via {@link canTransition} and
 * throws an `OrderError` (code `"invalid-transition"`) on an illegal move.
 * Returns a **new** order with the updated status, an appended history event
 * and a fresh `updatedAt`.
 */
export function transition(
  order: Order,
  to: OrderStatus,
  opts?: { at?: number; note?: string },
): Order {
  if (!canTransition(order.status, to)) {
    throw new OrderError(
      `Cannot transition order from "${order.status}" to "${to}".`,
      "invalid-transition",
    );
  }
  const at = opts?.at ?? Date.now();
  const event: StatusEvent = { status: to, at };
  if (opts?.note !== undefined) event.note = opts.note;
  return {
    ...order,
    status: to,
    history: [...order.history, event],
    updatedAt: at,
  };
}

/** Statuses during which line edits are still permitted. */
const EDITABLE_STATUSES: OrderStatus[] = ["pending", "placed"];

function assertEditable(order: Order): void {
  if (!EDITABLE_STATUSES.includes(order.status)) {
    throw new OrderError(
      `Order is locked for editing in status "${order.status}"; lines can only change while pending or placed.`,
      "locked",
    );
  }
}

function reprice(order: Order, lines: OrderLine[], now?: number): Order {
  const at = now ?? Date.now();
  return {
    ...order,
    lines,
    totals: computeTotals(lines, {
      discount: order.totals.discount,
      shipping: order.totals.shipping,
    }),
    updatedAt: at,
  };
}

/**
 * Add a line to a pre-payment order and recompute totals. Throws
 * `OrderError` (code `"locked"`) once the order is `paid` or beyond.
 */
export function addLine(order: Order, line: OrderLineInput, now?: number): Order {
  assertEditable(order);
  return reprice(order, [...order.lines, snapshotLine(line)], now);
}

/**
 * Remove a line by id from a pre-payment order and recompute totals. Throws
 * `OrderError` (code `"locked"`) once the order is `paid` or beyond.
 */
export function removeLine(order: Order, lineId: string, now?: number): Order {
  assertEditable(order);
  return reprice(
    order,
    order.lines.filter((l) => l.id !== lineId),
    now,
  );
}

/**
 * Set an absolute quantity for a line on a pre-payment order and recompute
 * totals. A `qty <= 0` removes the line. Throws `OrderError` (code `"locked"`)
 * once the order is `paid` or beyond.
 */
export function updateQty(
  order: Order,
  lineId: string,
  qty: number,
  now?: number,
): Order {
  assertEditable(order);
  const next = Math.max(0, Math.trunc(qty));
  const lines = order.lines
    .map((l) =>
      l.id === lineId ? { ...l, qty: next, total: l.unitPrice * next } : l,
    )
    .filter((l) => l.qty > 0);
  return reprice(order, lines, now);
}

/* -------------------------------------------------------------------------- */
/*  Numbering                                                                  */
/* -------------------------------------------------------------------------- */

function pad(n: number, width: number): string {
  const s = String(Math.abs(Math.trunc(n)));
  return s.length >= width ? s : "0".repeat(width - s.length) + s;
}

/**
 * Build a deterministic, human-facing order number from a sequence.
 *
 * @example
 * orderNumber(1); // "ORD-20260905-0001" (with today's date)
 */
export function orderNumber(
  seq: number,
  opts?: { prefix?: string; date?: Date; pad?: number; separator?: string },
): string {
  const prefix = opts?.prefix ?? "ORD";
  const date = opts?.date ?? new Date();
  const width = opts?.pad ?? 4;
  const sep = opts?.separator ?? "-";
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1, 2);
  const d = pad(date.getDate(), 2);
  return `${prefix}${sep}${y}${m}${d}${sep}${pad(seq, width)}`;
}

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Fill `out` with random bytes, preferring `crypto`, falling back to Math.random. */
function randomBytes(out: Uint8Array): Uint8Array {
  const g: { crypto?: Crypto } =
    typeof globalThis !== "undefined" ? globalThis : {};
  if (g.crypto && typeof g.crypto.getRandomValues === "function") {
    g.crypto.getRandomValues(out);
    return out;
  }
  // Fallback: platform has no Web Crypto. Not cryptographically strong.
  if (typeof console !== "undefined" && typeof console.warn === "function") {
    console.warn(
      "[@lacspace/order] globalThis.crypto is unavailable; falling back to Math.random for randomOrderId (not cryptographically secure).",
    );
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

/**
 * Generate a crypto-random short id, e.g. `"ord_k3f9x1a7q2mz"`. Uses
 * `globalThis.crypto.getRandomValues` when available, otherwise falls back to
 * `Math.random` with a warning.
 */
export function randomOrderId(opts?: { prefix?: string }): string {
  const bytes = randomBytes(new Uint8Array(16));
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += ID_ALPHABET[bytes[i]! % ID_ALPHABET.length];
  }
  const prefix = opts?.prefix;
  return prefix ? `${prefix}_${out}` : out;
}
