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
