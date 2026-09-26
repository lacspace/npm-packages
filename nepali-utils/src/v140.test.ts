import { test, expect } from "vitest";
import { isValidVehiclePlate, isValidNepaliMobile, normalizeMobile, numberToWords, numberToWordsNepali, numberToWordsNepaliRoman, formatCompactNPR, sqMetersToRopani, sqMetersToBigha, landToSqMeters } from "./index";

test("plates: province name + Pradesh/Province and 'Pradesh No'", () => {
  for (const ok of ["Bagmati Pradesh 01-002 Pa 1234", "बागमती प्रदेश ०१-००२ प १२३४", "Gandaki Province B AB 0123", "Pradesh No 3 01 002 Kha 1234", "Koshi Pradesh 1 01 001 Ka 12", "Ba 1 Pa 1234", "BAGMATI B AB 0123", "3 B AB 0123", "प्रदेश ३ ख ०१२३"]) expect(isValidVehiclePlate(ok), ok).toBe(true);
});
test("plates: province number must be 1-7", () => {
  for (const bad of ["Pradesh 9 01 002 Kha 1234", "9 B AB 0123", "प्रदेश ९ ख ०१२३", "Pradesh 0 01 002 Kha 1234", "Province 8 B AB 0123"]) expect(isValidVehiclePlate(bad), bad).toBe(false);
});
test("isValidNepaliMobile agrees with normalizeMobile", () => {
  for (const x of ["9771000000", "9771234567", "9841234567", "+9779841234567", "9779841234567", "+977 984-123 4567", "977984123456", "+9841234567", "1234567890"]) {
    expect(isValidNepaliMobile(x), x).toBe(normalizeMobile(x) !== null);
  }
  expect(normalizeMobile("9779841234567")).toBe("+9779841234567");
  expect(normalizeMobile("9771000000")).toBe("+9779771000000");
});
test("neel and padma", () => {
  expect(numberToWords(1e13)).toBe("One Neel");
  expect(numberToWords(2e15)).toBe("Two Padma");
  expect(numberToWordsNepali(1e13)).toBe("एक नील");
  expect(numberToWordsNepaliRoman(3e15)).toBe("Tin Padma");
  expect(formatCompactNPR(1.5e13)).toBe("Rs. 1.5 Neel");
});
test("land breakdown decimals option", () => {
  const m2 = landToSqMeters({ ropani: 1, aana: 2, daam: 1.37 });
  expect(sqMetersToRopani(m2)).toEqual({ ropani: 1, aana: 2, paisa: 0, daam: 1 });
  expect(sqMetersToRopani(m2, { decimals: 2 })).toEqual({ ropani: 1, aana: 2, paisa: 0, daam: 1.37 });
  expect(sqMetersToRopani(landToSqMeters({ paisa: 3, daam: 3.996 }), { decimals: 2 })).toEqual({ ropani: 0, aana: 1, paisa: 0, daam: 0 });
  expect(sqMetersToBigha(landToSqMeters({ kattha: 3, dhur: 7.25 }), { decimals: 2 })).toEqual({ bigha: 0, kattha: 3, dhur: 7.25 });
  expect(sqMetersToBigha(landToSqMeters({ dhur: 19.999 }), { decimals: 2 })).toEqual({ bigha: 0, kattha: 1, dhur: 0 });
});
