/**
 * Movements ledger — an append-only log of every stock event, from which you can
 * reconstruct the running balance at any point. Each {@link Movement} is applied
 * to a `Stock` by a pure reducer, so a fresh replay of the log always yields the
 * same `{ onHand, reserved }`.
 */
import { InventoryError } from "./index";
import type { Stock } from "./index";
import { toCount } from "./_shared";

/** Kinds of stock movement recorded in the ledger. */
export type MovementType =
  | "receipt"
  | "sale"
  | "adjustment"
  | "transfer"
  | "reservation"
  | "release"
  | "commit";

/**
 * A single ledger entry. `qty` is the magnitude for direction-fixed types
 * (`receipt` adds, `sale`/`commit` subtract) and a **signed** delta for
 * `adjustment` and `transfer` (negative = out, positive = in).
 */
export interface Movement {
  type: MovementType;
  /** Units moved. Magnitude, except `adjustment`/`transfer` which are signed. */
  qty: number;
  /** Epoch-ms the movement occurred. */
  at: number;
  /** Optional order / document reference. */
  ref?: string;
  /** Optional location the movement applies to. */
  location?: string;
  /** Optional free-text note. */
  note?: string;
}

/** A stock balance that never floors — it reflects the ledger exactly, even if negative. */
function clampNonNeg(n: number): number {
  return n < 0 ? 0 : n;
}

/**
 * Apply one movement to a `Stock`, returning the new balance. Pure.
 *
 * - `receipt` → `onHand += qty`
 * - `sale` / `commit` → `onHand -= qty` (`commit` also `reserved -= qty`)
 * - `adjustment` / `transfer` → `onHand += qty` (signed)
 * - `reservation` → `reserved += qty`, `release` → `reserved -= qty`
 *
 * `onHand` and `reserved` are clamped at `0` so a replay can never go negative.
 */
export function applyMovement(stock: Stock, m: Movement): Stock {
  const q = toCount(m.qty, "qty");
  let onHand = stock.onHand;
  let reserved = stock.reserved;
  switch (m.type) {
    case "receipt":
      onHand += Math.abs(q);
      break;
    case "sale":
      onHand -= Math.abs(q);
      break;
    case "adjustment":
    case "transfer":
      onHand += q; // signed
      break;
    case "commit":
      onHand -= Math.abs(q);
      reserved -= Math.abs(q);
      break;
    case "reservation":
      reserved += Math.abs(q);
      break;
    case "release":
      reserved -= Math.abs(q);
      break;
    default:
      throw new InventoryError(`Unknown movement type: ${String((m as Movement).type)}`);
  }
  return { onHand: clampNonNeg(onHand), reserved: clampNonNeg(reserved) };
}

/** Fold a whole ledger into a final `Stock` balance (default start `{0,0}`). */
export function reduceMovements(
  movements: readonly Movement[],
  initial: Stock = { onHand: 0, reserved: 0 },
): Stock {
  return movements.reduce<Stock>((s, m) => applyMovement(s, m), {
    onHand: initial.onHand,
    reserved: initial.reserved,
  });
}

/** One ledger row paired with the running balance immediately after it. */
export interface LedgerRow {
  movement: Movement;
  balance: Stock;
}

/**
 * Reconstruct the running balance after each movement, in order. Useful for a
 * stock statement or audit view. Does not mutate the input.
 */
export function runningBalances(
  movements: readonly Movement[],
  initial: Stock = { onHand: 0, reserved: 0 },
): LedgerRow[] {
  const rows: LedgerRow[] = [];
  let bal: Stock = { onHand: initial.onHand, reserved: initial.reserved };
  for (const m of movements) {
    bal = applyMovement(bal, m);
    rows.push({ movement: m, balance: bal });
  }
  return rows;
}

/**
 * Append a movement to a log, returning a NEW array (immutable). If `m.at` is
 * omitted, it is stamped from `now` (default `Date.now()`), keeping the ledger
 * testable with an injected clock.
 */
export function recordMovement(
  log: readonly Movement[],
  m: Omit<Movement, "at"> & { at?: number },
  now: number = Date.now(),
): Movement[] {
  const at = m.at == null ? toCount(now, "now") : toCount(m.at, "at");
  return [...log, { ...m, at }];
}
