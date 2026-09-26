import { test, expect } from "vitest";
import {
  sqMetersToBigha, sqMetersToRopani, landToSqMeters, convertLand, formatBigha, formatRopani,
  amountInWords, amountInWordsNepali, amountInWordsNepaliRoman, numberToWords, numberToWordsNepali, numberToWordsNepaliRoman, formatCompactNPR,
  isValidVehiclePlate, isValidLandline, isValidPAN, isValidVAT,
  PROVINCES, DISTRICTS, findDistrict, provinceOfDistrict, findProvince,
  getCarrier, CARRIER_PREFIXES, CARRIER_STATUS, isValidNepaliMobile,
} from "./index";

/* 1 — bigha carry */
test("sqMetersToBigha carries 20 dhur into 1 kattha and 20 kattha into 1 bigha", () => {
  expect(sqMetersToBigha(landToSqMeters({ dhur: 20 }))).toEqual({ bigha: 0, kattha: 1, dhur: 0 });
  expect(sqMetersToBigha(landToSqMeters({ kattha: 19, dhur: 20 }))).toEqual({ bigha: 1, kattha: 0, dhur: 0 });
  expect(sqMetersToBigha(landToSqMeters({ bigha: 2, kattha: 7, dhur: 13 }))).toEqual({ bigha: 2, kattha: 7, dhur: 13 });
  expect(formatBigha(landToSqMeters({ kattha: 20 }))).toBe("1-0-0");
  expect(sqMetersToBigha(landToSqMeters({ dhur: 19.4 }))).toEqual({ bigha: 0, kattha: 0, dhur: 19 });
  expect(sqMetersToBigha(landToSqMeters({ dhur: 19.6 }))).toEqual({ bigha: 0, kattha: 1, dhur: 0 });
});

/* 4 — daam rounding + exact ratios */
test("ropani breakdown never shows 4 daam and unit ratios are exact", () => {
  expect(sqMetersToRopani(landToSqMeters({ ropani: 2, aana: 3, paisa: 1 }))).toEqual({ ropani: 2, aana: 3, paisa: 1, daam: 0 });
  expect(sqMetersToRopani(landToSqMeters({ aana: 15, paisa: 3, daam: 4 }))).toEqual({ ropani: 1, aana: 0, paisa: 0, daam: 0 });
  expect(sqMetersToRopani(landToSqMeters({ daam: 3.6 }))).toEqual({ ropani: 0, aana: 0, paisa: 1, daam: 0 });
  expect(formatRopani(landToSqMeters({ ropani: 1 }))).toBe("1-0-0-0");
  expect(convertLand(1, "ropani", "daam")).toBe(256);
  expect(convertLand(1, "ropani", "aana")).toBe(16);
  expect(convertLand(1, "bigha", "dhur")).toBe(400);
  expect(convertLand(1, "bigha", "kattha")).toBe(20);
  expect(convertLand(1, "ropani", "sqft")).toBeCloseTo(5476, 6);
});

/* 2 — rupee/paisa separator */
test("amount in words separates rupees and paisa in all three scripts", () => {
  expect(amountInWords(1500.5)).toBe("Rupees One Thousand Five Hundred and Fifty Paisa Only");
  expect(amountInWordsNepali(1500.5)).toBe("रुपैयाँ एक हजार पाँच सय र पचास पैसा मात्र");
  expect(amountInWordsNepaliRoman(1500.5)).toBe("Rupaiyan Ek Hajar Panch Saya ra Pachas Paisa Matra");
  expect(amountInWordsNepali(1500)).toBe("रुपैयाँ एक हजार पाँच सय मात्र");
});

/* 3 — kharab */
test("kharab scale in English, Nepali, Roman and compact", () => {
  expect(numberToWords(1e11)).toBe("One Kharab");
  expect(numberToWords(123456789012)).toBe("One Kharab Twenty Three Arab Forty Five Crore Sixty Seven Lakh Eighty Nine Thousand Twelve");
  expect(numberToWordsNepali(2e11)).toBe("दुई खरब");
  expect(numberToWordsNepaliRoman(2e11)).toBe("Dui Kharab");
  expect(formatCompactNPR(2.5e11)).toBe("Rs. 2.5 Kharab");
  expect(formatCompactNPR(2.5e11, { nepali: true })).toBe("Rs. 2.5 खरब");
  expect(numberToWords(1e13)).toBe("One Neel");
});

/* 5 — plates */
test("isValidVehiclePlate accepts zonal and embossed formats", () => {
  for (const ok of ["Ba 1 Pa 1234", "Ba 2 Kha 1234", "बा २ ख १२३४", "Ba 1-1234", "BAGMATI B AB 0123", "PROVINCE 3 B AB 0123", "Pradesh 3 01 002 KHA 1234", "3 B AB 0123", "प्रदेश ३ ख ०१२३", "Lu 1 Cha 9", "Province-3-01-002-KHA-1234"]) {
    expect(isValidVehiclePlate(ok), ok).toBe(true);
  }
  for (const bad of ["", "1234", "Ba", "Ba 1 Pa 12345", "Ba 1 Pa Cha Ma 12", "hello world", "9 B AB 0123 X"]) {
    expect(isValidVehiclePlate(bad), bad).toBe(false);
  }
});

/* 6 — Devanagari digits in validators */
test("landline and PAN accept Devanagari digits", () => {
  expect(isValidLandline("०१-४१२३४५६")).toBe(true);
  expect(isValidLandline("01-4123456")).toBe(true);
  expect(isValidPAN("३०१२३४५६७")).toBe(true);
  expect(isValidVAT("301234567")).toBe(true);
  expect(isValidPAN("३०१२३४५६")).toBe(false);
});

/* 7 — Nepali capitals */
test("every province has a Nepali capital name", () => {
  for (const p of PROVINCES) expect(p.capitalNp, p.name).toMatch(/[\u0900-\u097F]/);
  expect(findProvince("Lumbini")?.capitalNp).toBe("देउखुरी");
});

/* 8 — Nawalparasi */
test("Nawalparasi East/West are the official names and old names still resolve", () => {
  expect(DISTRICTS.length).toBe(77);
  expect(findDistrict("Nawalparasi East")?.province).toBe(4);
  expect(findDistrict("Nawalpur")?.name).toBe("Nawalparasi East");
  expect(findDistrict("Nawalparasi West")?.province).toBe(5);
  expect(findDistrict("Parasi")?.name).toBe("Nawalparasi West");
  expect(findDistrict("Nawalparasi (West of Bardaghat Susta)")?.name).toBe("Nawalparasi West");
  expect(provinceOfDistrict("Rukum East")?.name).toBe("Lumbini");
  expect(provinceOfDistrict("Rukum West")?.name).toBe("Karnali");
});

/* 9 — carriers */
test("carrier prefixes include Ncell 970 and mark defunct operators", () => {
  expect(getCarrier("9701234567")).toBe("Ncell");
  expect(getCarrier("9761234567")).toBe("Ntc");
  expect(getCarrier("+977 9812345678")).toBe("Ncell");
  expect(getCarrier("9611234567")).toBe("Smart Cell");
  expect(CARRIER_STATUS["Smart Cell"]).toBe("defunct");
  expect(CARRIER_STATUS.Ncell).toBe("active");
  expect(CARRIER_PREFIXES.Ncell).toContain("970");
  expect(isValidNepaliMobile("9701234567")).toBe(true);
});
