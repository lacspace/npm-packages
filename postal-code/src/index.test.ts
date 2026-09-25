import { describe, test, expect } from "vitest";
import { validatePostalCode, isValidPostalCode, formatPostalCode, hasPostalCodes, postalCodeCountries, examplePostalCode } from "./index";

describe("validate + normalise", () => {
  test("real codes in sloppy spellings come back in the national layout", () => {
    const cases: Array<[string, string, string]> = [
      ["sw1a 1aa", "GB", "SW1A 1AA"], ["SW1A1AA", "GB", "SW1A 1AA"], ["ec1a1bb", "GB", "EC1A 1BB"], ["m1 1ae", "GB", "M1 1AE"], ["gir 0aa", "GB", "GIR 0AA"],
      ["k1a0b1", "CA", "K1A 0B1"], ["K1A-0B1", "CA", "K1A 0B1"],
      ["90210", "US", "90210"], ["90210-1234", "US", "90210-1234"], ["902101234", "US", "90210-1234"],
      ["01310100", "BR", "01310-100"], ["01310-100", "BR", "01310-100"],
      ["1000001", "JP", "100-0001"], ["１００－０００１", "JP", "100-0001"],
      ["1012ab", "NL", "1012 AB"], ["1012 AB", "NL", "1012 AB"],
      ["d02x285", "IE", "D02 X285"], ["00001", "PL", "00-001"], ["1000001", "PT", "1000-001"],
      ["11122", "SE", "111 22"], ["11000", "CZ", "110 00"], ["10115", "DE", "10115"], ["110001", "IN", "110001"], ["44600", "NP", "44600"],
      ["lt01100", "LT", "LT-01100"], ["01100", "LT", "LT-01100"], ["l1009", "LU", "L-1009"], ["1009", "LU", "L-1009"], ["lv1010", "LV", "LV-1010"],
      ["C1001AAA", "AR", "C1001AAA"], ["1001", "AR", "1001"], ["12345", "SA", "12345"], ["123456789", "SA", "12345-6789"],
      ["00120", "VA", "00120"], ["47890", "SM", "47890"], ["98000", "MC", "98000"],
    ];
    for (const [input, country, want] of cases) {
      const r = validatePostalCode(input, country);
      expect(r.valid, `${country} ${input}: ${r.reason}`).toBe(true);
      expect(r.normalized, `${country} ${input}`).toBe(want);
      expect(formatPostalCode(input, country)).toBe(want);
    }
  });

  test("wrong shapes are rejected with a reason", () => {
    const bad: Array<[string, string]> = [
      ["1234", "US"], ["123456", "US"], ["12345-678", "US"], ["ABCDE", "US"],
      ["SW1A 1A", "GB"], ["SW1A 1AAA", "GB"], ["ZZ1 1CC", "GB"],
      ["K1A 0B", "CA"], ["D1A 0B1", "CA"], ["K1O 0B1", "CA"],
      ["1234", "DE"], ["123456", "DE"], ["0123AB", "NL"], ["1012 A", "NL"], ["012345", "IN"],
      ["00000", "VA"], ["12345", "MC"], ["123", "JP"], ["1000-00", "PT"], ["4444", "NP"],
    ];
    for (const [input, country] of bad) expect(validatePostalCode(input, country), `${country} ${input}`).toMatchObject({ valid: false, reason: "format" });
    expect(validatePostalCode("", "US")).toMatchObject({ valid: false, reason: "empty" });
    expect(validatePostalCode("12345", "ZZ")).toMatchObject({ valid: false, reason: "unknown-country" });
    expect(isValidPostalCode("abc", "GB")).toBe(false);
    expect(formatPostalCode("abc", "GB")).toBe("abc");
  });

  test("countries without postal codes accept an empty value and refuse a non-empty one", () => {
    expect(hasPostalCodes("AE")).toBe(false);
    expect(hasPostalCodes("HK")).toBe(false);
    expect(hasPostalCodes("np")).toBe(true);
    expect(validatePostalCode("", "AE")).toMatchObject({ valid: true, normalized: "" });
    expect(validatePostalCode("12345", "AE")).toMatchObject({ valid: false, reason: "no-postal-codes" });
  });

  test("every example is valid for its country", () => {
    for (const c of postalCodeCountries()) {
      const ex = examplePostalCode(c);
      if (ex === undefined) continue;
      expect(validatePostalCode(ex, c).valid, `${c} ${ex}`).toBe(true);
    }
    expect(postalCodeCountries().length).toBeGreaterThanOrEqual(120);
  });
});
