/**
 * @lacspace/refund — a returns / RMA workflow and refund-calculation engine.
 *
 * Pure, immutable and serializable. Given the line items of an order, compute
 * partial refund amounts (with correctly apportioned tax), decide which units
 * are restockable, and drive a return through a small, explicit state machine.
 *
 * All money is expressed in **integer minor units** (cents, paise, satoshi…).
 * There are no floats stored anywhere in this package, so you never lose a
 * penny to rounding.
 *
 * Isomorphic: runs in Node, edge runtimes and browsers. The only environment
 * touch-point is `globalThis.crypto` — used solely to mint return ids.
 */

/* -------------------------------------------------------------------------- */
/*  State machine                                                             */
/* -------------------------------------------------------------------------- */

/** The lifecycle status of a return request. */
export type ReturnStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "received"
  | "refunded"
  | "closed"
  | "cancelled";

/**
 * The allowed forward transitions for each {@link ReturnStatus}. A status whose
 * list is empty is terminal — no further transition is possible.
 */
export const RETURN_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  requested: ["approved", "rejected", "cancelled"],
  approved: ["received", "cancelled"],
  received: ["refunded", "closed"],
  refunded: ["closed"],
  rejected: [],
  closed: [],
  cancelled: [],
};

/** `true` when moving from `from` to `to` is a permitted transition. */
export function canTransition(from: ReturnStatus, to: ReturnStatus): boolean {
  return RETURN_TRANSITIONS[from].includes(to);
}

/** `true` when `status` is terminal (no outgoing transitions). */
export function isTerminal(status: ReturnStatus): boolean {
  return RETURN_TRANSITIONS[status].length === 0;
}

/** Thrown when a transition is illegal or a refund input is invalid. */
export class RefundError extends Error {
  /** Optional machine-readable code, e.g. `"ILLEGAL_TRANSITION"`. */
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "RefundError";
    if (code !== undefined) this.code = code;
    // Restore the prototype chain for instanceof across transpile targets.
    Object.setPrototypeOf(this, RefundError.prototype);
  }
}

/* -------------------------------------------------------------------------- */
/*  Model                                                                      */
/* -------------------------------------------------------------------------- */

/** A single line being returned. Money fields are integer minor units. */
export interface ReturnItem {
  /** Identifies the order line this return maps back to. */
  lineId: string;
  /** Stock-keeping unit — used to build restock lists. */
  sku: string;
  /** Quantity being returned. */
  qty: number;
  /** Price per unit, in integer minor units (e.g. cents). */
  unitPrice: number;
  /** Tax rate as a fraction, `0..1` (e.g. `0.2` for 20%). Defaults to `0`. */
  taxRate?: number;
  /** Free-text reason for the return. */
  reason?: string;
  /** When explicitly `false`, this line is not returned to sellable stock. */
  restock?: boolean;
}

/** A return request. Plain data — safe to `JSON.stringify` and persist. */
export interface ReturnRequest {
  /** Unique id for this return. */
  id: string;
  /** The order this return belongs to. */
  orderId: string;
  /** Current lifecycle status. */
  status: ReturnStatus;
  /** The lines being returned. */
  items: ReturnItem[];
  /** Creation timestamp (epoch ms). */
  createdAt: number;
  /** Last-update timestamp (epoch ms). */
  updatedAt: number;
  /** Ordered log of every status the return has held. */
  history: { status: ReturnStatus; at: number; note?: string }[];
  /** Arbitrary attached data. */
  meta?: Record<string, unknown>;
}

/** The computed refund breakdown. Every field is an integer in minor units. */
export interface RefundBreakdown {
  subtotal: number;
  tax: number;
  restockingFee: number;
  shipping: number;
  total: number;
}

/* -------------------------------------------------------------------------- */
/*  Internal helpers                                                           */
/* -------------------------------------------------------------------------- */

function toInt(n: number): number {
  return Math.trunc(n);
}

/** Mint a return id. Uses `globalThis.crypto` when available, else a fallback. */
function newId(): string {
  const g: { crypto?: Crypto } = globalThis as unknown as { crypto?: Crypto };
  if (g.crypto && typeof g.crypto.randomUUID === "function") {
    return `ret_${g.crypto.randomUUID()}`;
  }
  // Non-crypto fallback for exotic runtimes without Web Crypto.
  return `ret_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/* -------------------------------------------------------------------------- */
/*  Returns workflow                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Create a new return request. `status` defaults to `"requested"` and the
 * initial status is seeded into `history`. Returns a fresh, plain object.
 */
export function createReturn(input: {
  orderId: string;
  items: ReturnItem[];
  id?: string;
  now?: number;
  status?: ReturnStatus;
}): ReturnRequest {
  const at = input.now ?? Date.now();
  const status = input.status ?? "requested";
  return {
    id: input.id ?? newId(),
    orderId: String(input.orderId),
    status,
    items: input.items.map((it) => ({ ...it })),
    createdAt: at,
    updatedAt: at,
    history: [{ status, at }],
  };
}

/**
 * Move a return to a new status. Validates the transition against
 * {@link RETURN_TRANSITIONS}, appends a `history` entry, and returns a brand-new
 * request object — the input is never mutated.
 *
 * @throws {RefundError} (code `"ILLEGAL_TRANSITION"`) if the move is not allowed.
 */
export function transition(
  ret: ReturnRequest,
  to: ReturnStatus,
  opts: { at?: number; note?: string } = {},
): ReturnRequest {
  if (!canTransition(ret.status, to)) {
    throw new RefundError(
      `Cannot transition from "${ret.status}" to "${to}"`,
      "ILLEGAL_TRANSITION",
    );
  }
  const at = opts.at ?? Date.now();
  const entry: { status: ReturnStatus; at: number; note?: string } = { status: to, at };
  if (opts.note !== undefined) entry.note = opts.note;
  return {
    ...ret,
    status: to,
    updatedAt: at,
    items: ret.items.map((it) => ({ ...it })),
    history: [...ret.history, entry],
  };
}

/* -------------------------------------------------------------------------- */
/*  Refund calculation                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Compute the refund breakdown for a set of returned lines. All values are
 * integer minor units.
 *
 * - `subtotal` = Σ `unitPrice * qty`
 * - `tax`      = Σ `round(unitPrice * qty * (taxRate ?? 0))` — apportioned per
 *               line so mixed tax rates are handled correctly
 * - `restockingFee` = the explicit `restockingFee`, or `round(subtotal * restockingPct)`
 * - `shipping` = `refundShipping ?? 0` (added back to the customer)
 * - `total`    = `subtotal + tax + shipping - restockingFee`, **clamped to `0`**
 *               (a fee larger than the refundable amount simply yields `0`, never
 *               a negative refund).
 */
export function refundAmount(
  items: ReturnItem[],
  opts: { restockingFee?: number; refundShipping?: number; restockingPct?: number } = {},
): RefundBreakdown {
  let subtotal = 0;
  let tax = 0;
  for (const it of items) {
    const line = toInt(it.unitPrice) * toInt(it.qty);
    subtotal += line;
    const rate = it.taxRate ?? 0;
    if (rate > 0) tax += Math.round(line * rate);
  }

  let restockingFee: number;
  if (opts.restockingFee !== undefined) {
    restockingFee = Math.max(0, toInt(opts.restockingFee));
  } else if (opts.restockingPct !== undefined && opts.restockingPct > 0) {
    restockingFee = Math.max(0, Math.round(subtotal * opts.restockingPct));
  } else {
    restockingFee = 0;
  }

  const shipping = Math.max(0, toInt(opts.refundShipping ?? 0));

  const total = Math.max(0, subtotal + tax + shipping - restockingFee);

  return { subtotal, tax, restockingFee, shipping, total };
}

/* -------------------------------------------------------------------------- */
/*  Restock list                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Build a restock list from returned lines: only items with `restock !== false`
 * are included, and quantities are merged by `sku`. The result is ready to feed
 * to `@lacspace/inventory`'s `restock()` (no runtime dependency on it).
 */
export function restockItems(items: ReturnItem[]): { sku: string; qty: number }[] {
  const bySku = new Map<string, number>();
  const order: string[] = [];
  for (const it of items) {
    if (it.restock === false) continue;
    const sku = String(it.sku);
    const qty = toInt(it.qty);
    if (!bySku.has(sku)) order.push(sku);
    bySku.set(sku, (bySku.get(sku) ?? 0) + qty);
  }
  return order.map((sku) => ({ sku, qty: bySku.get(sku) ?? 0 }));
}

/* -------------------------------------------------------------------------- */
/*  Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Validate returned lines against the original order. Each returned `lineId`
 * must exist on the order, and its returned `qty` must not exceed the quantity
 * that was ordered for that line. Returns `{ ok, errors }` — never throws.
 */
export function validateReturn(
  order: { lines: { id: string; sku: string; qty: number }[] },
  items: ReturnItem[],
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const byId = new Map<string, { id: string; sku: string; qty: number }>();
  for (const line of order.lines) byId.set(String(line.id), line);

  for (const it of items) {
    const line = byId.get(String(it.lineId));
    if (!line) {
      errors.push(`Unknown lineId "${it.lineId}"`);
      continue;
    }
    const qty = toInt(it.qty);
    if (qty <= 0) {
      errors.push(`Line "${it.lineId}" has non-positive qty ${qty}`);
    } else if (qty > line.qty) {
      errors.push(
        `Line "${it.lineId}" returns ${qty} but only ${line.qty} were ordered`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}
