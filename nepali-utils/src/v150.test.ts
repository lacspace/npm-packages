import { test, expect } from "vitest";
import { amountInWords, amountInWordsNepali, amountInWordsNepaliRoman, splitAmount } from "./index";

test("string and parts inputs keep paisa exact past 13 digits", () => {
  const want = "Rupees Nine Neel Ninety Nine Kharab Ninety Nine Arab Ninety Nine Crore Ninety Nine Lakh Ninety Nine Thousand Nine Hundred Ninety Nine and One Paisa Only";
  expect(amountInWords("99999999999999.01")).toBe(want);
  expect(amountInWords({ rupees: 99999999999999, paisa: 1 })).toBe(want);
  expect(amountInWordsNepali("1500.50")).toBe("रुपैयाँ एक हजार पाँच सय र पचास पैसा मात्र");
  expect(amountInWordsNepaliRoman({ rupees: 2, paisa: 5 })).toBe("Rupaiyan Dui ra Panch Paisa Matra");
});
test("splitAmount parsing rules", () => {
  expect(splitAmount("Rs. 12,34,567.505")).toEqual({ rupees: 1234567, paisa: 51, negative: false });
  expect(splitAmount("1.999")).toEqual({ rupees: 2, paisa: 0, negative: false });
  expect(splitAmount("-0.5")).toEqual({ rupees: 0, paisa: 50, negative: true });
  expect(splitAmount("१२३.४५")).toEqual({ rupees: 123, paisa: 45, negative: false });
  expect(splitAmount(".75")).toEqual({ rupees: 0, paisa: 75, negative: false });
  expect(splitAmount({ rupees: 10, paisa: 150 })).toEqual({ rupees: 11, paisa: 50, negative: false });
  expect(splitAmount(-0)).toEqual({ rupees: 0, paisa: 0, negative: false });
  expect(() => splitAmount("abc")).toThrow(RangeError);
  expect(() => splitAmount("99999999999999999")).toThrow(RangeError);
});
test("number input still works as before", () => {
  expect(amountInWords(1500.5)).toBe("Rupees One Thousand Five Hundred and Fifty Paisa Only");
  expect(amountInWords(-2)).toBe("Minus Rupees Two Only");
});
