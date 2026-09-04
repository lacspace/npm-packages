import { test, expect } from "vitest";
import {
  amountInWords,
  numberToWords,
  groupNepali,
  getCarrier,
  formatNPR,
  DISTRICTS,
  PROVINCES,
} from "./index";

test("amountInWords(1.999) carries paisa to rupees", () => {
  expect(amountInWords(1.999)).toBe("Rupees Two Only");
});

test("numberToWords(100000000000) has no 'undefined'", () => {
  const out = numberToWords(100000000000);
  expect(out).not.toContain("undefined");
  expect(out).toBe("One Hundred Arab");
});

test("groupNepali preserves the sign", () => {
  expect(groupNepali(-1234567)).toBe("-12,34,567");
  expect(groupNepali(1234567)).toBe("12,34,567");
});

test("getCarrier maps 976* to NTC (Ntc)", () => {
  expect(getCarrier("9761234567")).toBe("Ntc");
});

test("formatNPR grouping with decimals", () => {
  expect(formatNPR(1234567.5)).toBe("Rs. 12,34,567.50");
});

test("DISTRICTS has 77 entries and PROVINCES has 7", () => {
  expect(DISTRICTS.length).toBe(77);
  expect(PROVINCES.length).toBe(7);
});
