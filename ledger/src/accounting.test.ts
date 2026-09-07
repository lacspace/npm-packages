import { test, expect } from "vitest";
import {
  createChart,
  createJournal,
  postEntry,
  normalBalance,
  accountType,
  accountBalance,
  trialBalanceReport,
  balanceSheet,
  incomeStatement,
  filterByPeriod,
  closePeriod,
  toLedger,
  balance,
  trialBalance,
} from "./index";

function demoChart() {
  return createChart([
    { code: "cash", type: "asset", name: "Cash" },
    { code: "ar", type: "asset" },
    { code: "loan", type: "liability" },
    { code: "equity", type: "equity" },
    { code: "sales", type: "income" },
    { code: "rent", type: "expense" },
  ]);
}

test("normalBalance maps each account type to the correct side", () => {
  expect(normalBalance("asset")).toBe("debit");
  expect(normalBalance("expense")).toBe("debit");
  expect(normalBalance("liability")).toBe("credit");
  expect(normalBalance("equity")).toBe("credit");
  expect(normalBalance("income")).toBe("credit");
});

test("createChart rejects duplicate codes and unknown types", () => {
  expect(() => createChart([{ code: "cash", type: "asset" }, { code: "cash", type: "asset" }])).toThrow(
    /duplicate/
  );
  // @ts-expect-error invalid type at runtime
  expect(() => createChart([{ code: "x", type: "bogus" }])).toThrow(TypeError);
  expect(() => createChart([{ code: "", type: "asset" }])).toThrow(TypeError);
});

test("accountType looks up a code in the chart", () => {
  const chart = demoChart();
  expect(accountType(chart, "cash")).toBe("asset");
  expect(accountType(chart, "sales")).toBe("income");
  expect(accountType(chart, "missing")).toBeUndefined();
});

test("postEntry writes a balanced multi-leg entry", () => {
  let j = createJournal(demoChart());
  j = postEntry(j, {
    legs: [
      { account: "cash", debit: 9700 },
      { account: "rent", debit: 300 },
      { account: "sales", credit: 10000 },
    ],
    memo: "sale less fee",
  });
  expect(j.entries).toHaveLength(1);
  expect(j.entries[0]!.id).toMatch(/^[0-9a-f]{32}$/);
  const legSum = j.entries[0]!.legs.reduce((s, l) => s + (l.debit ?? 0) - (l.credit ?? 0), 0);
  expect(legSum).toBe(0);
});

test("postEntry rejects an unbalanced entry with a clear error", () => {
  const j = createJournal(demoChart());
  expect(() =>
    postEntry(j, {
      legs: [
        { account: "cash", debit: 100 },
        { account: "sales", credit: 90 },
      ],
    })
  ).toThrow(/unbalanced journal entry: debits 100 != credits 90/);
});

test("postEntry rejects legs with both/neither debit and credit, and <2 legs", () => {
  const j = createJournal(demoChart());
  expect(() =>
    postEntry(j, {
      legs: [
        { account: "cash", debit: 100, credit: 100 },
        { account: "sales", credit: 100 },
      ] as never,
    })
  ).toThrow(/exactly one of debit or credit/);
  expect(() =>
    postEntry(j, {
      legs: [
        { account: "cash" } as never,
        { account: "sales", credit: 0 } as never,
      ],
    })
  ).toThrow(/exactly one of debit or credit/);
  expect(() => postEntry(j, { legs: [{ account: "cash", debit: 100 }] })).toThrow(/at least two legs/);
});

test("postEntry rejects non-integer and non-positive leg amounts and unknown accounts", () => {
  const j = createJournal(demoChart());
  expect(() =>
    postEntry(j, {
      legs: [
        { account: "cash", debit: 100.5 },
        { account: "sales", credit: 100.5 },
      ],
    })
  ).toThrow(TypeError);
  expect(() =>
    postEntry(j, {
      legs: [
        { account: "cash", debit: -100 },
        { account: "sales", credit: -100 },
      ],
    })
  ).toThrow(/positive/);
  expect(() =>
    postEntry(j, {
      legs: [
        { account: "nope", debit: 100 },
        { account: "sales", credit: 100 },
      ],
    })
  ).toThrow(/unknown account/);
});

test("posting the same entry id twice is an idempotent no-op", () => {
  let j = createJournal(demoChart());
  const entry = {
    id: "seed-1",
    legs: [
      { account: "cash", debit: 100000 },
      { account: "equity", credit: 100000 },
    ],
  };
  j = postEntry(j, entry);
  const again = postEntry(j, entry);
  expect(again).toBe(j); // exact same reference — nothing appended
  expect(again.entries).toHaveLength(1);
});

test("accountBalance respects each account's normal side", () => {
  let j = createJournal(demoChart());
  j = postEntry(j, {
    legs: [
      { account: "cash", debit: 100000 },
      { account: "equity", credit: 100000 },
    ],
  });
  j = postEntry(j, {
    legs: [
      { account: "cash", debit: 5000 },
      { account: "sales", credit: 5000 },
    ],
  });
  j = postEntry(j, {
    legs: [
      { account: "rent", debit: 2000 },
      { account: "cash", credit: 2000 },
    ],
  });
  expect(accountBalance(j, "cash")).toBe(103000); // asset, net debit
  expect(accountBalance(j, "equity")).toBe(100000); // credit-normal, positive
  expect(accountBalance(j, "sales")).toBe(5000); // income, credit-normal, positive
  expect(accountBalance(j, "rent")).toBe(2000); // expense, debit-normal, positive
});

test("trialBalanceReport totals debits == credits and flags balanced", () => {
  let j = createJournal(demoChart());
  j = postEntry(j, {
    legs: [
      { account: "cash", debit: 100000 },
      { account: "equity", credit: 100000 },
    ],
  });
  j = postEntry(j, {
    legs: [
      { account: "rent", debit: 2000 },
      { account: "cash", credit: 2000 },
    ],
  });
  const tb = trialBalanceReport(j);
  expect(tb.balanced).toBe(true);
  expect(tb.totalDebit).toBe(tb.totalCredit);
  expect(tb.totalDebit).toBe(100000); // cash 98000 + rent 2000
  expect(tb.rows.map((r) => r.account)).toEqual(["cash", "equity", "rent"]);
  const equityRow = tb.rows.find((r) => r.account === "equity")!;
  expect(equityRow.credit).toBe(100000);
  expect(equityRow.debit).toBe(0);
  expect(equityRow.type).toBe("equity");
});

test("trialBalanceReport flags an out-of-balance journal (corrupted entries)", () => {
  const j = createJournal(demoChart());
  // Fabricate a corrupt entry that bypasses postEntry's validation.
  const corrupt = {
    ...j,
    entries: [
      { id: "bad", at: new Date().toISOString(), legs: [{ account: "cash", debit: 100 }] },
    ],
  };
  const tb = trialBalanceReport(corrupt as never);
  expect(tb.balanced).toBe(false);
  expect(tb.totalDebit).toBe(100);
  expect(tb.totalCredit).toBe(0);
});

test("balanceSheet balances: assets == liabilities + equity + net income", () => {
  let j = createJournal(demoChart());
  j = postEntry(j, {
    legs: [
      { account: "cash", debit: 100000 },
      { account: "equity", credit: 100000 },
    ],
  });
  j = postEntry(j, {
    legs: [
      { account: "cash", debit: 30000 },
      { account: "loan", credit: 30000 },
    ],
  });
  j = postEntry(j, {
    legs: [
      { account: "cash", debit: 5000 },
      { account: "sales", credit: 5000 },
    ],
  });
  j = postEntry(j, {
    legs: [
      { account: "rent", debit: 2000 },
      { account: "cash", credit: 2000 },
    ],
  });
  const bs = balanceSheet(j);
  expect(bs.assets).toBe(133000); // cash 133000
  expect(bs.liabilities).toBe(30000);
  expect(bs.equity).toBe(100000);
  expect(bs.netIncome).toBe(3000); // 5000 income - 2000 expense
  expect(bs.totalLiabilitiesAndEquity).toBe(133000);
  expect(bs.balanced).toBe(true);
});

test("incomeStatement computes income - expense = net", () => {
  let j = createJournal(demoChart());
  j = postEntry(j, {
    legs: [
      { account: "cash", debit: 12000 },
      { account: "sales", credit: 12000 },
    ],
  });
  j = postEntry(j, {
    legs: [
      { account: "rent", debit: 4500 },
      { account: "cash", credit: 4500 },
    ],
  });
  const is = incomeStatement(j);
  expect(is.income).toBe(12000);
  expect(is.expense).toBe(4500);
  expect(is.net).toBe(7500);
});

test("filterByPeriod restricts entries to a half-open [start, end) window", () => {
  let j = createJournal(demoChart());
  j = postEntry(j, {
    at: "2026-01-10T00:00:00.000Z",
    legs: [
      { account: "cash", debit: 1000 },
      { account: "sales", credit: 1000 },
    ],
  });
  j = postEntry(j, {
    at: "2026-02-10T00:00:00.000Z",
    legs: [
      { account: "cash", debit: 2000 },
      { account: "sales", credit: 2000 },
    ],
  });
  j = postEntry(j, {
    at: "2026-03-10T00:00:00.000Z",
    legs: [
      { account: "cash", debit: 4000 },
      { account: "sales", credit: 4000 },
    ],
  });
  const feb = filterByPeriod(j, { start: "2026-02-01T00:00:00.000Z", end: "2026-03-01T00:00:00.000Z" });
  expect(feb.entries).toHaveLength(1);
  expect(accountBalance(feb, "sales")).toBe(2000);
  // period arg on reports agrees with a pre-filtered journal
  expect(incomeStatement(j, { start: "2026-02-01T00:00:00.000Z", end: "2026-03-01T00:00:00.000Z" }).income).toBe(
    2000
  );
});

test("closePeriod zeroes income/expense and books net profit to equity", () => {
  let j = createJournal(demoChart());
  j = postEntry(j, {
    legs: [
      { account: "cash", debit: 12000 },
      { account: "sales", credit: 12000 },
    ],
  });
  j = postEntry(j, {
    legs: [
      { account: "rent", debit: 5000 },
      { account: "cash", credit: 5000 },
    ],
  });
  const netBefore = incomeStatement(j).net; // 7000
  const closed = closePeriod(j, { equityAccount: "equity" });
  expect(closed.entries).toHaveLength(3);
  // income & expense are flat after close
  expect(accountBalance(closed, "sales")).toBe(0);
  expect(accountBalance(closed, "rent")).toBe(0);
  // net profit moved into equity
  expect(accountBalance(closed, "equity")).toBe(netBefore); // 7000
  expect(trialBalanceReport(closed).balanced).toBe(true);
});

test("closePeriod with no P&L activity is a no-op", () => {
  let j = createJournal(demoChart());
  j = postEntry(j, {
    legs: [
      { account: "cash", debit: 100000 },
      { account: "equity", credit: 100000 },
    ],
  });
  const closed = closePeriod(j, { equityAccount: "equity" });
  expect(closed).toBe(j);
});

test("toLedger projects the journal onto the core Ledger model", () => {
  let j = createJournal(demoChart());
  j = postEntry(j, {
    legs: [
      { account: "cash", debit: 10000 },
      { account: "sales", credit: 10000 },
    ],
    ref: "INV-1",
  });
  const led = toLedger(j);
  // core balance() (debit-positive, credit-negative) works on it
  expect(balance(led, "cash")).toBe(10000);
  expect(balance(led, "sales")).toBe(-10000);
  expect(trialBalance(led).reduce((s, r) => s + r.balance, 0)).toBe(0);
  expect(led.entries[0]!.ref).toBe("INV-1");
});

test("accounts named like prototype members stay safe in the journal", () => {
  const chart = createChart([
    { code: "__proto__", type: "asset" },
    { code: "constructor", type: "income" },
  ]);
  let j = createJournal(chart);
  j = postEntry(j, {
    legs: [
      { account: "__proto__", debit: 500 },
      { account: "constructor", credit: 500 },
    ],
  });
  expect(accountBalance(j, "__proto__")).toBe(500);
  expect(accountBalance(j, "constructor")).toBe(500);
  expect(trialBalanceReport(j).balanced).toBe(true);
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});
