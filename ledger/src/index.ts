/**
 * @lacspace/ledger
 *
 * A tiny **double-entry** ledger / wallet. Every transaction is a set of lines
 * whose signed amounts sum to **zero**, so the books can never drift: balances
 * are just sums, and the trial balance always totals zero.
 *
 * Sign convention: an account's balance is the sum of its signed line amounts.
 * A debit is a **positive** amount, a credit is a **negative** one — so
 * `post({ debit, credit, amount })` books `+amount` to `debit` and `-amount` to
 * `credit`. Under this convention an asset/expense account rises when debited
 * and a liability/income/equity account rises when credited (its balance goes
 * more negative). Amounts are **integer minor units** (cents, paisa, …).
 *
 * ```ts
 * import { createLedger, post, balance, trialBalance } from "@lacspace/ledger";
 *
 * let book = createLedger();
 * book = post(book, { debit: "cash", credit: "sales", amount: 10000 });
 * balance(book, "cash");   //  10000
 * balance(book, "sales");  // -10000
 * trialBalance(book);      // sums to 0
 * ```
 *
 * Immutable — every operation returns a new {@link Ledger}. Zero dependencies,
 * isomorphic (ids use Web Crypto `getRandomValues`).
 */

/** A single posting line: a signed amount against an account (minor units). */
export interface LedgerLine {
  account: string;
  /** Signed amount in minor units. A transaction's lines MUST sum to 0. */
  amount: number;
}

/** One posted transaction. Its `lines` always sum to zero. */
export interface LedgerEntry {
  /** Unique id (crypto-random). */
  id: string;
  /** ISO-8601 timestamp of when it was posted. */
  at: string;
  lines: LedgerLine[];
  /** Optional external reference (invoice #, txn id, …). */
  ref?: string;
  /** Optional human-readable note. */
  memo?: string;
}

/** An immutable ledger — an ordered list of balanced entries. */
export interface Ledger {
  entries: LedgerEntry[];
}

/** A single row of a {@link statement}. */
export interface StatementRow {
  at: string;
  /** Net signed amount this entry moved on the account (minor units). */
  amount: number;
  ref?: string;
  memo?: string;
}

/** A single row of a {@link trialBalance}. */
export interface TrialBalanceRow {
  account: string;
  balance: number;
}

const HEX: string[] = [];
for (let i = 0; i < 256; i++) HEX.push((i + 0x100).toString(16).slice(1));

/** Crypto-random 16-byte hex id. Isomorphic via Web Crypto. */
function genId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || typeof c.getRandomValues !== "function") {
    throw new Error("Web Crypto getRandomValues is unavailable in this environment.");
  }
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  let out = "";
  for (let i = 0; i < 16; i++) out += HEX[b[i]!]!;
  return out;
}

function assertInteger(amount: number, label: string): void {
  if (!Number.isInteger(amount)) {
    throw new TypeError(`${label} must be an integer number of minor units, got ${amount}`);
  }
}

/** Create a new, empty ledger. */
export function createLedger(): Ledger {
  return { entries: [] };
}

/** Append a pre-built, already-balanced entry (immutable). */
function append(
  ledger: Ledger,
  lines: LedgerLine[],
  meta?: { ref?: string; memo?: string }
): Ledger {
  const entry: LedgerEntry = {
    id: genId(),
    at: new Date().toISOString(),
    lines,
    ...(meta?.ref !== undefined ? { ref: meta.ref } : {}),
    ...(meta?.memo !== undefined ? { memo: meta.memo } : {}),
  };
  return { entries: [...ledger.entries, entry] };
}

/**
 * Post a simple two-line transaction: `+amount` to `debit`, `-amount` to
 * `credit`. `amount` must be a positive integer (minor units). Returns a new
 * ledger — the input is never mutated.
 */
export function post(
  ledger: Ledger,
  tx: { debit: string; credit: string; amount: number; ref?: string; memo?: string }
): Ledger {
  assertInteger(tx.amount, "amount");
  if (tx.amount <= 0) {
    throw new RangeError(`post() amount must be positive, got ${tx.amount}`);
  }
  const lines: LedgerLine[] = [
    { account: tx.debit, amount: tx.amount },
    { account: tx.credit, amount: -tx.amount },
  ];
  return append(ledger, lines, { ref: tx.ref, memo: tx.memo });
}

/**
 * Post an arbitrary multi-line transaction. **Throws** if the signed line
 * amounts don't sum to exactly zero (or any amount isn't an integer).
 */
export function postMany(
  ledger: Ledger,
  lines: LedgerLine[],
  meta?: { ref?: string; memo?: string }
): Ledger {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new RangeError("postMany() requires at least one line");
  }
  let sum = 0;
  for (const line of lines) {
    assertInteger(line.amount, "line amount");
    sum += line.amount;
  }
  if (sum !== 0) {
    throw new RangeError(`unbalanced transaction: lines sum to ${sum}, expected 0`);
  }
  return append(ledger, lines.map((l) => ({ account: l.account, amount: l.amount })), meta);
}

/** Balance of an account: the sum of all its signed line amounts. */
export function balance(ledger: Ledger, account: string): number {
  let total = 0;
  for (const entry of ledger.entries) {
    for (const line of entry.lines) {
      if (line.account === account) total += line.amount;
    }
  }
  return total;
}

/**
 * Statement for one account: one row per entry that touches it, in order, with
 * the net signed amount that entry moved on the account.
 */
export function statement(ledger: Ledger, account: string): StatementRow[] {
  const rows: StatementRow[] = [];
  for (const entry of ledger.entries) {
    let net = 0;
    let touched = false;
    for (const line of entry.lines) {
      if (line.account === account) {
        net += line.amount;
        touched = true;
      }
    }
    if (touched) {
      rows.push({
        at: entry.at,
        amount: net,
        ...(entry.ref !== undefined ? { ref: entry.ref } : {}),
        ...(entry.memo !== undefined ? { memo: entry.memo } : {}),
      });
    }
  }
  return rows;
}

/**
 * Trial balance: every account with its balance, sorted by account name. Since
 * every entry is balanced, the balances always sum to exactly zero.
 */
export function trialBalance(ledger: Ledger): TrialBalanceRow[] {
  const totals = new Map<string, number>();
  for (const entry of ledger.entries) {
    for (const line of entry.lines) {
      totals.set(line.account, (totals.get(line.account) ?? 0) + line.amount);
    }
  }
  return [...totals.entries()]
    .map(([account, bal]) => ({ account, balance: bal }))
    .sort((a, b) => (a.account < b.account ? -1 : a.account > b.account ? 1 : 0));
}
