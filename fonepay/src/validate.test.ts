import { test, expect } from "vitest";
import {
  isValidAmount,
  isValidRequestDate,
  isValidPrn,
  validateRequest,
  generatePrn,
  FIELD_LIMITS,
  SANDBOX_GATEWAY_URL,
  LIVE_GATEWAY_URL,
  GATEWAY_URL,
} from "./index";

const goodRequest = {
  PID: "MERCHANT",
  PRN: "prn-0001",
  AMT: 1000,
  DT: "09/05/2026",
  R1: "order note",
  R2: "buyer ref",
  RU: "https://shop.me/return",
} as const;

test("isValidAmount accepts positive numbers with ≤ 2 decimals", () => {
  expect(isValidAmount(1000)).toBe(true);
  expect(isValidAmount("1000")).toBe(true);
  expect(isValidAmount("99.5")).toBe(true);
  expect(isValidAmount("0.05")).toBe(true);
});

test("isValidAmount rejects bad amounts", () => {
  expect(isValidAmount("10.999")).toBe(false);
  expect(isValidAmount("abc")).toBe(false);
  expect(isValidAmount("-5")).toBe(false);
  expect(isValidAmount("0")).toBe(false);
  expect(isValidAmount("")).toBe(false);
});

test("isValidRequestDate accepts real MM/DD/YYYY dates", () => {
  expect(isValidRequestDate("09/05/2026")).toBe(true);
  expect(isValidRequestDate("12/31/2026")).toBe(true);
  expect(isValidRequestDate("02/29/2024")).toBe(true); // leap year
});

test("isValidRequestDate rejects malformed or impossible dates", () => {
  expect(isValidRequestDate("13/01/2026")).toBe(false);
  expect(isValidRequestDate("2026-09-05")).toBe(false);
  expect(isValidRequestDate("9/5/2026")).toBe(false);
  expect(isValidRequestDate("02/30/2026")).toBe(false);
  expect(isValidRequestDate("")).toBe(false);
});

test("isValidPrn enforces non-empty, whitespace-free, bounded length", () => {
  expect(isValidPrn("prn-0001")).toBe(true);
  expect(isValidPrn("")).toBe(false);
  expect(isValidPrn("has space")).toBe(false);
  expect(isValidPrn("x".repeat(FIELD_LIMITS.PRN + 1))).toBe(false);
});

test("validateRequest passes a well-formed request", () => {
  const r = validateRequest(goodRequest);
  expect(r.valid).toBe(true);
  expect(r.issues).toEqual([]);
});

test("validateRequest flags a bad amount", () => {
  const r = validateRequest({ ...goodRequest, AMT: "10.999" });
  expect(r.valid).toBe(false);
  expect(r.issues.some((i) => i.field === "AMT")).toBe(true);
});

test("validateRequest flags a bad date", () => {
  const r = validateRequest({ ...goodRequest, DT: "2026-09-05" });
  expect(r.issues.some((i) => i.field === "DT")).toBe(true);
});

test("validateRequest flags over-length R1 / R2", () => {
  const r = validateRequest({
    ...goodRequest,
    R1: "x".repeat(FIELD_LIMITS.R1 + 1),
    R2: "y".repeat(FIELD_LIMITS.R2 + 1),
  });
  expect(r.issues.some((i) => i.field === "R1")).toBe(true);
  expect(r.issues.some((i) => i.field === "R2")).toBe(true);
});

test("validateRequest flags missing PID / PRN / RU", () => {
  const r = validateRequest({ ...goodRequest, PID: "", PRN: "", RU: "" });
  const fields = r.issues.map((i) => i.field);
  expect(fields).toContain("PID");
  expect(fields).toContain("PRN");
  expect(fields).toContain("RU");
});

test("generatePrn produces unique, well-shaped, prefixed values within the limit", () => {
  const a = generatePrn("ORD-");
  const b = generatePrn("ORD-");
  expect(a).not.toBe(b);
  expect(a.startsWith("ORD-")).toBe(true);
  expect(a.length).toBeLessThanOrEqual(FIELD_LIMITS.PRN);
  expect(isValidPrn(a)).toBe(true);
});

test("config presets match the gateway map", () => {
  expect(SANDBOX_GATEWAY_URL).toBe(GATEWAY_URL.test);
  expect(LIVE_GATEWAY_URL).toBe(GATEWAY_URL.prod);
});
