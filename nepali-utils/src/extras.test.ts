import { test, expect } from "vitest";
import {
  toNepaliDigits,
  toEnglishDigits,
  numberToWordsNepaliRoman,
  amountInWordsNepaliRoman,
  parseNPRToPaisa,
  formatNPRFromPaisa,
  isValidVehiclePlate,
  isValidCitizenshipNumber,
  findProvince,
  provinceOfDistrict,
  numberToWordsNepali,
} from "./index";

/* digit aliases */
test("toNepaliDigits / toEnglishDigits round-trip", () => {
  expect(toNepaliDigits("2081")).toBe("२०८१");
  expect(toEnglishDigits("२०८१")).toBe("2081");
  expect(toEnglishDigits(toNepaliDigits("1234567"))).toBe("1234567");
});

/* Roman Nepali words */
test("numberToWordsNepaliRoman parallels the Devanagari reading", () => {
  expect(numberToWordsNepaliRoman(1234567)).toBe("Bahra Lakh Chauntis Hajar Panch Saya Satsatthi");
  // same scale-word count as the Devanagari version
  expect(numberToWordsNepaliRoman(1234567).split(" ").length).toBe(
    numberToWordsNepali(1234567).split(" ").length,
  );
});

test("numberToWordsNepaliRoman small + zero + negative", () => {
  expect(numberToWordsNepaliRoman(0)).toBe("Sunya");
  expect(numberToWordsNepaliRoman(67)).toBe("Satsatthi");
  expect(numberToWordsNepaliRoman(100)).toBe("Ek Saya");
  expect(numberToWordsNepaliRoman(-5)).toBe("Mainas Panch");
});

test("numberToWordsNepaliRoman handles Arab (recursion) with no undefined", () => {
  const out = numberToWordsNepaliRoman(100000000000);
  expect(out).not.toContain("undefined");
  expect(out).toBe("Ek Saya Arab");
});

test("amountInWordsNepaliRoman wraps with Rupaiyan/Matra + paisa", () => {
  expect(amountInWordsNepaliRoman(1500.5)).toBe("Rupaiyan Ek Hajar Panch Saya Pachas Paisa Matra");
  expect(amountInWordsNepaliRoman(2)).toBe("Rupaiyan Dui Matra");
});

/* integer-paisa NPR */
test("parseNPRToPaisa reads formatted strings to integer paisa", () => {
  expect(parseNPRToPaisa("Rs. 12,34,567.50")).toBe(123456750);
  expect(parseNPRToPaisa("रू १,२३४.०५")).toBe(123405);
  expect(Number.isNaN(parseNPRToPaisa("abc"))).toBe(true);
});

test("formatNPRFromPaisa formats integer paisa", () => {
  expect(formatNPRFromPaisa(123456750)).toBe("Rs. 12,34,567.50");
  expect(formatNPRFromPaisa(5, { symbol: "" })).toBe("0.05");
  expect(formatNPRFromPaisa(123456750, { paisa: false })).toBe("Rs. 12,34,567");
  expect(formatNPRFromPaisa(-12345)).toBe("-Rs. 123.45");
  expect(formatNPRFromPaisa(123456750, { devanagari: true })).toBe("Rs. १२,३४,५६७.५०");
});

test("paisa format/parse round-trips exactly (no float drift)", () => {
  for (const p of [0, 5, 99, 100, 123456750, 999999999]) {
    expect(parseNPRToPaisa(formatNPRFromPaisa(p))).toBe(p);
  }
});

/* vehicle plate shape */
test("isValidVehiclePlate accepts common zonal/embossed shapes", () => {
  expect(isValidVehiclePlate("Ba 2 Kha 1234")).toBe(true);
  expect(isValidVehiclePlate("बा २ ख १२३४")).toBe(true);
  expect(isValidVehiclePlate("Ga 1 Pa 999")).toBe(true);
});

test("isValidVehiclePlate rejects junk", () => {
  expect(isValidVehiclePlate("")).toBe(false);
  expect(isValidVehiclePlate("123456")).toBe(false); // no letter token
  expect(isValidVehiclePlate("hello world foo bar baz")).toBe(false);
});

/* citizenship number shape */
test("isValidCitizenshipNumber accepts digit groups", () => {
  expect(isValidCitizenshipNumber("12-01-73-01234")).toBe(true);
  expect(isValidCitizenshipNumber("२३४५६७८९")).toBe(true);
  expect(isValidCitizenshipNumber("123456/789")).toBe(true);
});

test("isValidCitizenshipNumber rejects letters / wrong length", () => {
  expect(isValidCitizenshipNumber("12-AB-34")).toBe(false);
  expect(isValidCitizenshipNumber("12345")).toBe(false); // too short (5)
  expect(isValidCitizenshipNumber("1234567890123456")).toBe(false); // too long (16)
});

/* province lookups */
test("findProvince by number, English and Nepali name", () => {
  expect(findProvince(3)?.name).toBe("Bagmati");
  expect(findProvince("bagmati")?.number).toBe(3);
  expect(findProvince("बागमती")?.number).toBe(3);
  expect(findProvince("Nowhere")).toBeUndefined();
});

test("provinceOfDistrict maps district → province", () => {
  expect(provinceOfDistrict("Kathmandu")?.number).toBe(3);
  expect(provinceOfDistrict("काठमाडौं")?.name).toBe("Bagmati");
  expect(provinceOfDistrict("Kaski")?.name).toBe("Gandaki");
  expect(provinceOfDistrict("Atlantis")).toBeUndefined();
});
