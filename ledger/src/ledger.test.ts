import { test, expect } from "vitest";
import {
  createLedger,
  post,
  postMany,
  balance,
  statement,
  trialBalance,
} from "./index";

test("createLedger starts empty", () => {
  expect(createLedger()).toEqual({ entries: [] });
});

test("post writes a balanced two-line entry that nets to 0", () => {
  const book = post(createLedger(), { debit: "cash", credit: "sales", amount: 10000 });
  expect(book.entries).toHaveLength(1);
  const entry = book.entries[0]!;
  expect(entry.lines).toEqual([
    { account: "cash", amount: 10000 },
    { account: "sales", amount: -10000 },
  ]);
  expect(entry.lines.reduce((s, l) => s + l.amount, 0)).toBe(0);
  expect(entry.id).toMatch(/^[0-9a-f]{32}$/);
  expect(typeof entry.at).toBe("string");
});

test("post is immutable — the input ledger is untouched", () => {
  const empty = createLedger();
  const next = post(empty, { debit: "cash", credit: "sales", amount: 500 });
  expect(empty.entries).toHaveLength(0);
  expect(next.entries).toHaveLength(1);
});

test("balance sums each account's signed lines", () => {
  let book = createLedger();
  book = post(book, { debit: "cash", credit: "sales", amount: 10000 });
  book = post(book, { debit: "cash", credit: "sales", amount: 2500 });
  book = post(book, { debit: "fees", credit: "cash", amount: 300 });
  expect(balance(book, "cash")).toBe(12200); // 10000 + 2500 - 300
  expect(balance(book, "sales")).toBe(-12500);
  expect(balance(book, "fees")).toBe(300);
  expect(balance(book, "unknown")).toBe(0);
});

test("trialBalance always sums to 0 and is sorted", () => {
  let book = createLedger();
  book = post(book, { debit: "cash", credit: "sales", amount: 10000 });
  book = post(book, { debit: "fees", credit: "cash", amount: 300 });
  const tb = trialBalance(book);
  expect(tb.map((r) => r.account)).toEqual(["cash", "fees", "sales"]);
  expect(tb.reduce((s, r) => s + r.balance, 0)).toBe(0);
});

test("postMany accepts a balanced multi-line entry", () => {
  const book = postMany(
    createLedger(),
    [
      { account: "cash", amount: 9700 },
      { account: "fees", amount: 300 },
      { account: "sales", amount: -10000 },
    ],
    { ref: "INV-1", memo: "sale less fee" }
  );
  expect(book.entries).toHaveLength(1);
  expect(balance(book, "cash")).toBe(9700);
  expect(trialBalance(book).reduce((s, r) => s + r.balance, 0)).toBe(0);
});

test("postMany throws on an unbalanced transaction", () => {
  expect(() =>
    postMany(createLedger(), [
      { account: "cash", amount: 100 },
      { account: "sales", amount: -90 },
    ])
  ).toThrow(/unbalanced/);
});

test("postMany throws on non-integer amounts", () => {
  expect(() =>
    postMany(createLedger(), [
      { account: "cash", amount: 100.5 },
      { account: "sales", amount: -100.5 },
    ])
  ).toThrow(TypeError);
});

test("post throws on non-positive amount", () => {
  expect(() => post(createLedger(), { debit: "a", credit: "b", amount: 0 })).toThrow(RangeError);
  expect(() => post(createLedger(), { debit: "a", credit: "b", amount: -5 })).toThrow(RangeError);
});

test("statement filters to entries touching the account", () => {
  let book = createLedger();
  book = post(book, { debit: "cash", credit: "sales", amount: 10000, ref: "A", memo: "sale" });
  book = post(book, { debit: "rent", credit: "bank", amount: 5000, ref: "B" });
  book = post(book, { debit: "fees", credit: "cash", amount: 300, memo: "wire fee" });

  const cash = statement(book, "cash");
  expect(cash).toHaveLength(2); // sale in, fee out
  expect(cash[0]).toEqual({ at: cash[0]!.at, amount: 10000, ref: "A", memo: "sale" });
  expect(cash[1]!.amount).toBe(-300);
  expect(cash[1]!.memo).toBe("wire fee");

  expect(statement(book, "rent")).toHaveLength(1);
  expect(statement(book, "nope")).toHaveLength(0);
});

test("post throws on a non-integer amount", () => {
  expect(() => post(createLedger(), { debit: "a", credit: "b", amount: 100.5 })).toThrow(TypeError);
});

test("post works on a frozen ledger and never mutates it", () => {
  const empty = Object.freeze(createLedger());
  Object.freeze(empty.entries);
  const next = post(empty, { debit: "cash", credit: "sales", amount: 100 });
  expect(empty.entries).toHaveLength(0);
  expect(next.entries).toHaveLength(1);
  expect(next).not.toBe(empty);
});

test("postMany copies its lines so later caller mutation cannot corrupt the book", () => {
  const lines = [
    { account: "cash", amount: 100 },
    { account: "sales", amount: -100 },
  ];
  const book = postMany(createLedger(), lines);
  lines[0]!.amount = 999999; // mutate the caller's array afterwards
  expect(balance(book, "cash")).toBe(100);
});

test("postMany rejects a 3-line entry that does not sum to zero", () => {
  expect(() =>
    postMany(createLedger(), [
      { account: "cash", amount: 9700 },
      { account: "fees", amount: 300 },
      { account: "sales", amount: -9999 },
    ])
  ).toThrow(/unbalanced/);
});

test("accounts named like prototype members balance safely", () => {
  let book = createLedger();
  book = post(book, { debit: "__proto__", credit: "constructor", amount: 500 });
  book = post(book, { debit: "constructor", credit: "__proto__", amount: 200 });
  expect(balance(book, "__proto__")).toBe(300); // 500 - 200
  expect(balance(book, "constructor")).toBe(-300);
  expect(trialBalance(book).reduce((s, r) => s + r.balance, 0)).toBe(0);
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});

test("statement rows follow posting order for repeated activity", () => {
  let book = createLedger();
  book = post(book, { debit: "cash", credit: "sales", amount: 100, memo: "a" });
  book = post(book, { debit: "fees", credit: "cash", amount: 30, memo: "b" });
  book = post(book, { debit: "cash", credit: "sales", amount: 50, memo: "c" });
  const rows = statement(book, "cash");
  expect(rows.map((r) => r.amount)).toEqual([100, -30, 50]);
  expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(balance(book, "cash"));
});
