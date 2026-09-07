import { test, expect } from "vitest";
import { validateRequest } from "./index";

const good = {
  MERCHANTID: "123",
  APPID: "APP123",
  APPNAME: "lacspace-shop",
  TXNID: "TXN001",
  TXNDATE: "05-09-2026",
  TXNCRNCY: "NPR",
  TXNAMT: 100000,
  REFERENCEID: "REF001",
  REMARKS: "order-1",
  PARTICULARS: "order-1",
} as const;

test("valid params → valid:true with no errors", () => {
  const r = validateRequest(good);
  expect(r.valid).toBe(true);
  expect(r.errors).toEqual([]);
});

test("decimal TXNAMT string is rejected (must be paisa integer)", () => {
  const r = validateRequest({ ...good, TXNAMT: "100.50" });
  expect(r.valid).toBe(false);
  expect(r.errors.some((e) => e.includes("TXNAMT"))).toBe(true);
});

test("zero / non-positive TXNAMT is rejected", () => {
  expect(validateRequest({ ...good, TXNAMT: 0 }).valid).toBe(false);
  expect(validateRequest({ ...good, TXNAMT: -5 }).valid).toBe(false);
  expect(validateRequest({ ...good, TXNAMT: "0" }).valid).toBe(false);
});

test("float number TXNAMT is rejected", () => {
  const r = validateRequest({ ...good, TXNAMT: 100.5 });
  expect(r.valid).toBe(false);
});

test("integer number and all-digit string TXNAMT are accepted", () => {
  expect(validateRequest({ ...good, TXNAMT: 1 }).valid).toBe(true);
  expect(validateRequest({ ...good, TXNAMT: "999999" }).valid).toBe(true);
});

test("TXNID longer than 20 chars is rejected", () => {
  const r = validateRequest({ ...good, TXNID: "A".repeat(21) });
  expect(r.valid).toBe(false);
  expect(r.errors.some((e) => e.includes("TXNID"))).toBe(true);
});

test("TXNID with non-alphanumeric chars is rejected", () => {
  expect(validateRequest({ ...good, TXNID: "TXN-001" }).valid).toBe(false);
});

test("invalid REFERENCEID is rejected", () => {
  expect(validateRequest({ ...good, REFERENCEID: "" }).valid).toBe(false);
  expect(validateRequest({ ...good, REFERENCEID: "REF 001" }).valid).toBe(false);
});

test("malformed TXNDATE format is rejected", () => {
  expect(validateRequest({ ...good, TXNDATE: "2026-09-05" }).valid).toBe(false);
  expect(validateRequest({ ...good, TXNDATE: "5-9-2026" }).valid).toBe(false);
});

test("impossible calendar date is rejected", () => {
  expect(validateRequest({ ...good, TXNDATE: "32-13-2026" }).valid).toBe(false);
  expect(validateRequest({ ...good, TXNDATE: "31-02-2026" }).valid).toBe(false);
});

test("non-NPR currency is rejected", () => {
  const r = validateRequest({ ...good, TXNCRNCY: "USD" });
  expect(r.valid).toBe(false);
  expect(r.errors.some((e) => e.includes("TXNCRNCY"))).toBe(true);
});

test("missing MERCHANTID / APPID / APPNAME are rejected", () => {
  expect(validateRequest({ ...good, MERCHANTID: "" }).valid).toBe(false);
  expect(validateRequest({ ...good, APPID: "" }).valid).toBe(false);
  expect(validateRequest({ ...good, APPNAME: "" }).valid).toBe(false);
});

test("multiple bad fields collect multiple errors", () => {
  const r = validateRequest({ ...good, TXNAMT: "1.5", TXNCRNCY: "USD", TXNID: "bad id" });
  expect(r.valid).toBe(false);
  expect(r.errors.length).toBeGreaterThanOrEqual(3);
});
