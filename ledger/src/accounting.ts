/**
 * @lacspace/ledger — accounting layer (additive, New in 1.1.0)
 *
 * A double-entry **journal** built on top of a **chart of accounts**. Where the
 * core {@link Ledger} models a transaction as signed lines that sum to zero,
 * this layer speaks the accountant's language directly: typed accounts with a
 * **normal balance** (debit or credit), journal entries written as explicit
 * `debit` / `credit` **legs** (debits must equal credits, ≥ 2 legs), a
 * **trial balance** report that flags when it is out of balance, simple
 * **Balance Sheet** and **Income Statement** derivations, **period** filtering
 * and a period-**close** helper, plus **idempotent** posting keyed on entry id.
 *
 * Everything stays in **integer minor units** (cents, paisa, …) — no floats,
 * every entry balances to the unit, and balances are exact integer sums. All
 * operations are immutable (they return a new value) and dependency-free, and
 * ids use Web Crypto so the module is isomorphic, exactly like the core.
 *
 * ```ts
 * import { createChart, createJournal, postEntry, balanceSheet } from "@lacspace/ledger";
 *
 * const chart = createChart([
 *   { code: "cash",   type: "asset" },
 *   { code: "equity", type: "equity" },
 *   { code: "sales",  type: "income" },
 * ]);
 * let j = createJournal(chart);
 * j = postEntry(j, { id: "seed", legs: [
 *   { account: "cash",   debit: 100000 },
 *   { account: "equity", credit: 100000 },
 * ]});
 * j = postEntry(j, { legs: [
 *   { account: "cash",  debit: 5000 },
 *   { account: "sales", credit: 5000 },
 * ]});
 * balanceSheet(j).balanced; // true — assets == liabilities + equity (+ net income)
 * ```
 */

import type { Ledger, LedgerLine } from "./index";

/** The five classic account types. */
export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

/** Which side an account normally carries a positive balance on. */
export type NormalSide = "debit" | "credit";

/** A chart-of-accounts entry. */
export interface Account {
  /** Stable account code / key (e.g. `"cash"`, `"1000"`). */
  code: string;
  type: AccountType;
  /** Optional human-readable name. */
  name?: string;
}

/** An immutable chart of accounts. */
export interface Chart {
  accounts: Account[];
}

/**
 * A single leg of a journal entry: an account with **either** a `debit` **or** a
 * `credit`, given as a positive integer number of minor units.
 */
export interface JournalLeg {
  account: string;
  /** Positive minor units debited to `account` (mutually exclusive with `credit`). */
  debit?: number;
  /** Positive minor units credited to `account` (mutually exclusive with `debit`). */
  credit?: number;
}

/** One posted journal entry. Its debits always equal its credits. */
export interface JournalEntry {
  /** Idempotency / audit id (caller-supplied or crypto-random). */
  id: string;
  /** ISO-8601 timestamp of when it took effect. */
  at: string;
  legs: JournalLeg[];
  ref?: string;
  memo?: string;
}

/** An immutable double-entry journal bound to a {@link Chart}. */
export interface Journal {
  chart: Chart;
  entries: JournalEntry[];
  /** Ids already posted — posting the same id again is a no-op. */
  posted: string[];
}

/** A half-open reporting period `[start, end)`. Both bounds are optional. */
export interface Period {
  /** Inclusive lower bound (ISO-8601). Entries before this are excluded. */
  start?: string;
  /** Exclusive upper bound (ISO-8601). Entries at/after this are excluded. */
  end?: string;
}

/** A single row of a {@link trialBalanceReport}. */
export interface TrialBalanceReportRow {
  account: string;
  type?: AccountType;
  /** Debit-side balance (0 if the account nets to a credit). */
  debit: number;
  /** Credit-side balance (0 if the account nets to a debit). */
  credit: number;
}

/** A trial balance with column totals and an out-of-balance flag. */
export interface TrialBalanceReport {
  rows: TrialBalanceReportRow[];
  totalDebit: number;
  totalCredit: number;
  /** `true` iff `totalDebit === totalCredit`. */
  balanced: boolean;
}

/** A simple Balance Sheet snapshot (all values in minor units). */
export interface BalanceSheet {
  assets: number;
  liabilities: number;
  equity: number;
  /** Income − expense for the period, folded into owners' equity. */
  netIncome: number;
  /** `liabilities + equity + netIncome`. */
  totalLiabilitiesAndEquity: number;
  /** `true` iff `assets === liabilities + equity + netIncome`. */
  balanced: boolean;
}

/** A simple Income Statement for a period (all values in minor units). */
export interface IncomeStatement {
  income: number;
  expense: number;
  /** `income − expense`. */
  net: number;
}

// ---- internals (self-contained; mirror the core's helpers) -----------------

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

const ACCOUNT_TYPES: AccountType[] = ["asset", "liability", "equity", "income", "expense"];

function isAccountType(t: unknown): t is AccountType {
  return typeof t === "string" && ACCOUNT_TYPES.indexOf(t as AccountType) !== -1;
}

/** Build a prototype-safe code → Account map for a chart. */
function chartMap(chart: Chart): Map<string, Account> {
  const m = new Map<string, Account>();
  for (const a of chart.accounts) m.set(a.code, a);
  return m;
}

function toMs(iso: string, label: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new TypeError(`${label} must be an ISO-8601 date string, got ${iso}`);
  return ms;
}

/** Filter entries to those whose `at` falls in `[start, end)`. */
function withinPeriod(entries: JournalEntry[], period?: Period): JournalEntry[] {
  if (!period || (period.start === undefined && period.end === undefined)) return entries;
  const lo = period.start !== undefined ? toMs(period.start, "period.start") : -Infinity;
  const hi = period.end !== undefined ? toMs(period.end, "period.end") : Infinity;
  return entries.filter((e) => {
    const t = toMs(e.at, "entry.at");
    return t >= lo && t < hi;
  });
}

/** Signed sum (debit-positive, credit-negative) of one account's legs. */
function signedSum(entries: JournalEntry[], account: string): number {
  let s = 0;
  for (const e of entries) {
    for (const leg of e.legs) {
      if (leg.account === account) s += (leg.debit ?? 0) - (leg.credit ?? 0);
    }
  }
  return s;
}

// ---- public API ------------------------------------------------------------

/**
 * The normal balance side for an account type: **asset** and **expense** are
 * debit-normal; **liability**, **equity** and **income** are credit-normal.
 */
export function normalBalance(type: AccountType): NormalSide {
  return type === "asset" || type === "expense" ? "debit" : "credit";
}

/**
 * Build an immutable {@link Chart}. Throws on an unknown account type, a missing
 * code, or a duplicate code.
 */
export function createChart(accounts: Account[]): Chart {
  const seen = new Map<string, true>();
  const out: Account[] = [];
  for (const a of accounts) {
    if (!a || typeof a.code !== "string" || a.code.length === 0) {
      throw new TypeError("each account needs a non-empty string code");
    }
    if (!isAccountType(a.type)) {
      throw new TypeError(`unknown account type "${String(a.type)}" for account ${a.code}`);
    }
    if (seen.get(a.code)) throw new RangeError(`duplicate account code: ${a.code}`);
    seen.set(a.code, true);
    out.push({ code: a.code, type: a.type, ...(a.name !== undefined ? { name: a.name } : {}) });
  }
  return { accounts: out };
}

/** Look up an account's type in the chart, or `undefined` if not present. */
export function accountType(chart: Chart, code: string): AccountType | undefined {
  return chartMap(chart).get(code)?.type;
}

/** Create a new, empty journal bound to `chart`. */
export function createJournal(chart: Chart): Journal {
  return { chart, entries: [], posted: [] };
}

/**
 * Post a balanced journal entry (immutable). Each leg carries **exactly one** of
 * `debit`/`credit` as a positive integer (minor units); there must be **≥ 2
 * legs** and **total debits must equal total credits**, otherwise it throws.
 * Accounts must exist in the chart (unless the chart is empty).
 *
 * **Idempotent:** if `entry.id` was already posted, the journal is returned
 * unchanged (a no-op) — safe to retry the same entry.
 */
export function postEntry(
  journal: Journal,
  entry: { id?: string; at?: string; legs: JournalLeg[]; ref?: string; memo?: string }
): Journal {
  if (entry.id !== undefined && journal.posted.indexOf(entry.id) !== -1) {
    return journal; // idempotent no-op
  }
  if (!Array.isArray(entry.legs) || entry.legs.length < 2) {
    throw new RangeError("a journal entry needs at least two legs");
  }
  const map = chartMap(journal.chart);
  const strict = map.size > 0;
  const legs: JournalLeg[] = [];
  let debitSum = 0;
  let creditSum = 0;
  for (const leg of entry.legs) {
    const hasDebit = leg.debit !== undefined;
    const hasCredit = leg.credit !== undefined;
    if (hasDebit === hasCredit) {
      throw new RangeError(`leg for "${leg.account}" needs exactly one of debit or credit`);
    }
    const amount = hasDebit ? leg.debit! : leg.credit!;
    assertInteger(amount, "leg amount");
    if (amount <= 0) throw new RangeError(`leg amount must be positive, got ${amount}`);
    if (strict && !map.has(leg.account)) {
      throw new RangeError(`unknown account "${leg.account}" (not in chart)`);
    }
    if (hasDebit) {
      debitSum += amount;
      legs.push({ account: leg.account, debit: amount });
    } else {
      creditSum += amount;
      legs.push({ account: leg.account, credit: amount });
    }
  }
  if (debitSum !== creditSum) {
    throw new RangeError(`unbalanced journal entry: debits ${debitSum} != credits ${creditSum}`);
  }
  const id = entry.id ?? genId();
  const je: JournalEntry = {
    id,
    at: entry.at ?? new Date().toISOString(),
    legs,
    ...(entry.ref !== undefined ? { ref: entry.ref } : {}),
    ...(entry.memo !== undefined ? { memo: entry.memo } : {}),
  };
  return { chart: journal.chart, entries: [...journal.entries, je], posted: [...journal.posted, id] };
}

/**
 * The running balance of an account **respecting its normal side**: a
 * debit-normal account (asset/expense) reports a positive number when it carries
 * a net debit; a credit-normal account (liability/equity/income) reports a
 * positive number when it carries a net credit. Optionally restricted to a
 * period. Accounts absent from the chart are treated as debit-normal.
 */
export function accountBalance(journal: Journal, code: string, period?: Period): number {
  const entries = withinPeriod(journal.entries, period);
  const signed = signedSum(entries, code);
  const acc = chartMap(journal.chart).get(code);
  const side: NormalSide = acc ? normalBalance(acc.type) : "debit";
  const bal = side === "debit" ? signed : -signed;
  return bal === 0 ? 0 : bal; // normalise -0 → 0
}

/**
 * Compute a trial balance: every touched account placed in its debit or credit
 * column by the sign of its raw (debit-positive) balance, with column totals and
 * a `balanced` flag. Because every entry balances, a healthy journal always
 * reports `balanced: true`; the flag exists to surface corruption.
 */
export function trialBalanceReport(journal: Journal, period?: Period): TrialBalanceReport {
  const entries = withinPeriod(journal.entries, period);
  const totals = new Map<string, number>();
  for (const e of entries) {
    for (const leg of e.legs) {
      const delta = (leg.debit ?? 0) - (leg.credit ?? 0);
      totals.set(leg.account, (totals.get(leg.account) ?? 0) + delta);
    }
  }
  const cmap = chartMap(journal.chart);
  const rows: TrialBalanceReportRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  for (const [account, signed] of totals) {
    if (signed === 0) continue;
    const debit = signed > 0 ? signed : 0;
    const credit = signed < 0 ? -signed : 0;
    totalDebit += debit;
    totalCredit += credit;
    const t = cmap.get(account)?.type;
    rows.push({ account, ...(t !== undefined ? { type: t } : {}), debit, credit });
  }
  rows.sort((a, b) => (a.account < b.account ? -1 : a.account > b.account ? 1 : 0));
  return { rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

/** Sum the normal-side balances of every chart account of a given type. */
function sumByType(journal: Journal, type: AccountType, entries: JournalEntry[]): number {
  let total = 0;
  for (const a of journal.chart.accounts) {
    if (a.type !== type) continue;
    const signed = signedSum(entries, a.code);
    total += normalBalance(type) === "debit" ? signed : -signed;
  }
  return total;
}

/**
 * Derive a simple Balance Sheet for a period. Net income (income − expense) is
 * folded into equity so the accounting identity holds:
 * `assets === liabilities + equity + netIncome` (`balanced`).
 */
export function balanceSheet(journal: Journal, period?: Period): BalanceSheet {
  const entries = withinPeriod(journal.entries, period);
  const assets = sumByType(journal, "asset", entries);
  const liabilities = sumByType(journal, "liability", entries);
  const equity = sumByType(journal, "equity", entries);
  const income = sumByType(journal, "income", entries);
  const expense = sumByType(journal, "expense", entries);
  const netIncome = income - expense;
  const totalLiabilitiesAndEquity = liabilities + equity + netIncome;
  return {
    assets,
    liabilities,
    equity,
    netIncome,
    totalLiabilitiesAndEquity,
    balanced: assets === totalLiabilitiesAndEquity,
  };
}

/** Derive a simple Income Statement for a period: `income − expense = net`. */
export function incomeStatement(journal: Journal, period?: Period): IncomeStatement {
  const entries = withinPeriod(journal.entries, period);
  const income = sumByType(journal, "income", entries);
  const expense = sumByType(journal, "expense", entries);
  return { income, expense, net: income - expense };
}

/**
 * A new journal containing only the entries that fall in `period` (`[start,
 * end)`). Immutable — the source journal and its chart are unchanged.
 */
export function filterByPeriod(journal: Journal, period: Period): Journal {
  const entries = withinPeriod(journal.entries, period);
  return { chart: journal.chart, entries, posted: entries.map((e) => e.id) };
}

/**
 * Period-close helper: post one balanced closing entry that zeroes every income
 * and expense account (as of `period`, if given) and books the net result to
 * `equityAccount` (retained earnings). Returns a new journal; if there was no
 * income/expense activity to close, the journal is returned unchanged.
 */
export function closePeriod(
  journal: Journal,
  opts: { equityAccount: string; period?: Period; at?: string; id?: string; ref?: string; memo?: string }
): Journal {
  const entries = withinPeriod(journal.entries, opts.period);
  const legs: JournalLeg[] = [];
  let pnlSigned = 0; // debit-positive sum across income + expense accounts
  for (const a of journal.chart.accounts) {
    if (a.type !== "income" && a.type !== "expense") continue;
    const s = signedSum(entries, a.code);
    if (s === 0) continue;
    // reverse the account's balance to zero it out
    if (s > 0) legs.push({ account: a.code, credit: s });
    else legs.push({ account: a.code, debit: -s });
    pnlSigned += s;
  }
  if (legs.length === 0) return journal; // nothing to close
  // Offset to equity: a net debit (loss) reduces equity, a net credit (profit) raises it.
  if (pnlSigned > 0) legs.push({ account: opts.equityAccount, debit: pnlSigned });
  else if (pnlSigned < 0) legs.push({ account: opts.equityAccount, credit: -pnlSigned });
  return postEntry(journal, {
    legs,
    ...(opts.id !== undefined ? { id: opts.id } : {}),
    ...(opts.at !== undefined ? { at: opts.at } : {}),
    ...(opts.ref !== undefined ? { ref: opts.ref } : {}),
    memo: opts.memo ?? "Period close",
  });
}

/**
 * Project a {@link Journal} onto the core {@link Ledger} model — each leg becomes
 * a signed line (debit `+`, credit `−`) — so `balance`, `statement` and
 * `trialBalance` from the core work on journal data too.
 */
export function toLedger(journal: Journal): Ledger {
  return {
    entries: journal.entries.map((e) => ({
      id: e.id,
      at: e.at,
      lines: e.legs.map(
        (leg): LedgerLine => ({ account: leg.account, amount: (leg.debit ?? 0) - (leg.credit ?? 0) })
      ),
      ...(e.ref !== undefined ? { ref: e.ref } : {}),
      ...(e.memo !== undefined ? { memo: e.memo } : {}),
    })),
  };
}
