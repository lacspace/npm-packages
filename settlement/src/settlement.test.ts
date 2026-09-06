import { describe, it, expect } from "vitest";
import { settle, netFor, reconcile, payouts, type Entry } from "./index";

const ledger: Entry[] = [
  { account: "alice", amount: 1000, type: "sale" },
  { account: "bob", amount: 500, type: "sale" },
  { account: "alice", amount: -300, type: "fee" },
  { account: "carol", amount: -200, type: "refund" },
  { account: "bob", amount: -500, type: "chargeback" },
];

describe("settle — netting", () => {
  it("nets entries per account, sorted by account", () => {
    expect(settle(ledger)).toEqual([
      { account: "alice", balance: 700 },
      { account: "bob", balance: 0 },
      { account: "carol", balance: -200 },
    ]);
  });

  it("returns [] for empty input", () => {
    expect(settle([])).toEqual([]);
  });

  it("does not mutate the input", () => {
    const copy = JSON.parse(JSON.stringify(ledger));
    settle(ledger);
    expect(ledger).toEqual(copy);
  });
});

describe("netFor", () => {
  it("returns the net balance for one account", () => {
    expect(netFor(ledger, "alice")).toBe(700);
    expect(netFor(ledger, "bob")).toBe(0);
    expect(netFor(ledger, "carol")).toBe(-200);
  });

  it("returns 0 for an unknown account", () => {
    expect(netFor(ledger, "nobody")).toBe(0);
  });

  it("returns 0 for empty input", () => {
    expect(netFor([], "alice")).toBe(0);
  });
});

describe("reconcile", () => {
  it("returns only mismatches by default", () => {
    const out = reconcile(
      { alice: 700, bob: 0, carol: -200 },
      { alice: 700, bob: 50, carol: -250 },
    );
    expect(out).toEqual([
      { account: "bob", expected: 0, actual: 50, diff: 50 },
      { account: "carol", expected: -200, actual: -250, diff: -50 },
    ]);
  });

  it("includes matches when { all: true }", () => {
    const out = reconcile({ alice: 700 }, { alice: 700 }, { all: true });
    expect(out).toEqual([{ account: "alice", expected: 700, actual: 700, diff: 0 }]);
  });

  it("treats a missing side as 0", () => {
    const out = reconcile({ alice: 100 }, { bob: 40 });
    expect(out).toEqual([
      { account: "alice", expected: 100, actual: 0, diff: -100 },
      { account: "bob", expected: 0, actual: 40, diff: 40 },
    ]);
  });

  it("returns [] when everything matches", () => {
    expect(reconcile({ alice: 700 }, { alice: 700 })).toEqual([]);
  });

  it("does not read inherited props for a poisoned account key", () => {
    // regression: expected["constructor"] fell through to Object's constructor
    // (a function), making diff NaN. Absent own key must be treated as 0.
    const out = reconcile({}, { constructor: 100 });
    expect(out).toEqual([
      { account: "constructor", expected: 0, actual: 100, diff: 100 },
    ]);
  });

  it("handles a real own __proto__ key without leaking the prototype", () => {
    const actual = JSON.parse('{"__proto__": 42}') as Record<string, number>;
    const out = reconcile({}, actual);
    const line = out.find((d) => d.account === "__proto__");
    expect(line).toEqual({ account: "__proto__", expected: 0, actual: 42, diff: 42 });
  });

  it("does not mutate its inputs", () => {
    const exp = { a: 1 };
    const act = { a: 2, b: 3 };
    const expCopy = { ...exp };
    const actCopy = { ...act };
    reconcile(exp, act);
    expect(exp).toEqual(expCopy);
    expect(act).toEqual(actCopy);
  });
});

describe("settle — untrusted account keys", () => {
  it("nets a __proto__ account correctly without prototype pollution", () => {
    const out = settle([
      { account: "__proto__", amount: 100 },
      { account: "__proto__", amount: -30 },
      { account: "constructor", amount: 5 },
    ]);
    expect(out).toEqual([
      { account: "__proto__", balance: 70 },
      { account: "constructor", balance: 5 },
    ]);
    // global Object prototype stayed clean
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("truncates fractional amounts to whole minor units", () => {
    expect(netFor([{ account: "x", amount: 10.9 }], "x")).toBe(10);
    expect(settle([{ account: "x", amount: -10.9 }])).toEqual([{ account: "x", balance: -10 }]);
  });
});

describe("payouts", () => {
  it("returns only positive balances", () => {
    expect(payouts(ledger)).toEqual([{ account: "alice", payable: 700 }]);
  });

  it("excludes zero and negative balances", () => {
    const out = payouts([
      { account: "x", amount: -10 },
      { account: "y", amount: 0 },
      { account: "z", amount: 25 },
    ]);
    expect(out).toEqual([{ account: "z", payable: 25 }]);
  });

  it("returns [] for empty input", () => {
    expect(payouts([])).toEqual([]);
  });
});
