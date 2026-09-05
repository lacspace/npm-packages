/**
 * @lacspace/settlement — settlement, netting & reconciliation for multi-party payouts.
 *
 * All money is expressed in **integer minor units** (e.g. cents, paisa) as
 * *signed* amounts: positive = credit, negative = debit. Every function here is
 * pure — inputs are never mutated and there are no side effects.
 *
 * Isomorphic, dependency-free, side-effect-free.
 */

/** A single ledger entry against one account. */
export interface Entry {
  account: string;
  /** Signed amount in minor units: `+` credit, `-` debit. */
  amount: number;
  /** Optional classifier (e.g. `"fee"`, `"sale"`, `"refund"`). */
  type?: string;
  /** Optional external reference (invoice id, transaction id, …). */
  ref?: string;
}

/** Net balance for one account. */
export interface Balance {
  account: string;
  /** Net of all entries, in minor units. */
  balance: number;
}

/** A payable position (positive balance only). */
export interface Payout {
  account: string;
  /** Amount owed to the account, in minor units. */
  payable: number;
}

/** A reconciliation line comparing expected vs actual for one account. */
export interface Discrepancy {
  account: string;
  expected: number;
  actual: number;
  /** `actual - expected`, in minor units. */
  diff: number;
}

/** Options for {@link reconcile}. */
export interface ReconcileOptions {
  /** Include matching accounts (`diff === 0`) too. Defaults to `false`. */
  all?: boolean;
}

/**
 * Net every entry per account and return the balances, sorted by account name.
 */
export function settle(entries: Entry[]): Balance[] {
  const totals = new Map<string, number>();
  for (const e of entries) {
    totals.set(e.account, (totals.get(e.account) ?? 0) + Math.trunc(e.amount));
  }
  return [...totals.entries()]
    .map(([account, balance]) => ({ account, balance }))
    .sort((a, b) => (a.account < b.account ? -1 : a.account > b.account ? 1 : 0));
}

/**
 * Net balance for a single `account` across all `entries`.
 */
export function netFor(entries: Entry[], account: string): number {
  let sum = 0;
  for (const e of entries) {
    if (e.account === account) sum += Math.trunc(e.amount);
  }
  return sum;
}

/**
 * Compare `expected` against `actual` (both `account -> minor units`).
 *
 * Returns one line per account where `diff = actual - expected`. Only
 * mismatching accounts are returned unless `{ all: true }` is passed. Results
 * are sorted by account name.
 */
export function reconcile(
  expected: Record<string, number>,
  actual: Record<string, number>,
  opts: ReconcileOptions = {},
): Discrepancy[] {
  const accounts = new Set<string>([...Object.keys(expected), ...Object.keys(actual)]);
  const out: Discrepancy[] = [];
  for (const account of [...accounts].sort()) {
    const exp = expected[account] ?? 0;
    const act = actual[account] ?? 0;
    const diff = act - exp;
    if (diff !== 0 || opts.all) {
      out.push({ account, expected: exp, actual: act, diff });
    }
  }
  return out;
}

/**
 * Accounts with a positive net balance — i.e. money that must be paid out.
 * Sorted by account name.
 */
export function payouts(entries: Entry[]): Payout[] {
  return settle(entries)
    .filter((b) => b.balance > 0)
    .map((b) => ({ account: b.account, payable: b.balance }));
}
