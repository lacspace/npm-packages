import { describe, test, expect } from "vitest";
import { currencies, currency, isCurrencyCode, minorUnits, currencySymbol, currencyName, toMinor, fromMinor, formatCurrency, FUND_CODES } from "./index";

const intl = Intl as unknown as { supportedValuesOf(k: string): string[] };
const icuCodes = new Set(intl.supportedValuesOf("currency"));
const icuName = new Intl.DisplayNames(["en"], { type: "currency" });
// ISO 4217 minor units where ICU's *cash* rounding data differs from the ISO list.
const ICU_DIFFERS = new Set(["IQD", "MGA", "HUF", "TWD"]);
// Codes newer than this Node's ICU: Caribbean guilder (2025), Zimbabwe gold (2024).
const NEWER_THAN_ICU = new Set(["XCG", "ZWG"]);

describe("the table vs ICU", () => {
  test("every code is unique, numeric codes are unique, and ICU knows all but the newest", () => {
    const all = currencies();
    expect(new Set(all.map((c) => c.code)).size).toBe(all.length);
    expect(new Set(all.map((c) => c.numeric)).size).toBe(all.length);
    for (const c of all) {
      expect(c.code).toMatch(/^[A-Z]{3}$/);
      expect(c.numeric).toMatch(/^\d{3}$/);
      // ICU lists display currencies only: no X-codes and no fund codes.
      if (!NEWER_THAN_ICU.has(c.code) && !c.isSpecial && !FUND_CODES.has(c.code)) expect(icuCodes.has(c.code), `${c.code} unknown to ICU`).toBe(true);
    }
  });

  test("ICU has no currency this table lacks (except retired ones ICU keeps)", () => {
    const ours = new Set(currencies().map((c) => c.code));
    const missing = [...icuCodes].filter((c) => !ours.has(c));
    // ICU keeps some codes ISO has retired (e.g. SLL, ZWL); anything else here is a gap in our table.
    const retired = new Set(["ANG", "SLL", "ZWL", "VEF", "MRO", "STD", "ZMK", "BYR", "LTL", "LVL", "EEK", "CUC", "HRK"]);
    expect(missing.filter((c) => !retired.has(c))).toEqual([]);
  });

  test("minor units follow ISO 4217: the non-2 currencies are exactly the published set", () => {
    // ICU rounds many currencies to cash units (AFN, IDR, COP → 0), so it is not the oracle here;
    // the ISO list itself is: every active currency has 2 minor units except these.
    const zero = ["BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "UYI", "VND", "VUV", "XAF", "XOF", "XPF"];
    const three = ["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"];
    const four = ["CLF", "UYW"];
    const byUnits = (n: number) => currencies({ special: false }).filter((c) => c.minorUnits === n).map((c) => c.code).sort();
    expect(byUnits(0)).toEqual(zero.sort());
    expect(byUnits(3)).toEqual(three.sort());
    expect(byUnits(4)).toEqual(four.sort());
    expect(currencies({ special: false }).filter((c) => ![0, 2, 3, 4].includes(c.minorUnits))).toEqual([]);
  });

  test("names agree with ICU for the majors", () => {
    for (const [code, name] of [["USD", "US Dollar"], ["EUR", "Euro"], ["NPR", "Nepalese Rupee"], ["INR", "Indian Rupee"], ["JPY", "Japanese Yen"], ["GBP", "British Pound"]]) {
      expect(icuName.of(code!)).toBe(name);
    }
    expect(currencyName("USD")).toBe("US Dollar");
  });
});

describe("lookup and helpers", () => {
  test("by code or numeric, any case", () => {
    expect(currency("npr")).toMatchObject({ code: "NPR", numeric: "524", minorUnits: 2, name: "Nepalese Rupee", symbol: "रू" });
    expect(currency(978)?.code).toBe("EUR");
    expect(currency("978")?.code).toBe("EUR");
    expect(currency("XYZ")).toBeUndefined();
    expect(isCurrencyCode("usd")).toBe(true);
    expect(isCurrencyCode("US")).toBe(false);
  });

  test("minor units: 0, 2, 3, 4 and special codes", () => {
    expect([minorUnits("JPY"), minorUnits("USD"), minorUnits("BHD"), minorUnits("CLF"), minorUnits("XAU"), minorUnits("nope")]).toEqual([0, 2, 3, 4, 0, 2]);
    expect(currencies({ special: false }).every((c) => !c.isSpecial)).toBe(true);
    expect(currencies({ special: false, funds: false }).every((c) => c.kind === "currency")).toBe(true);
    expect(currency("CLF")?.kind).toBe("fund");
    expect(currency("XAU")?.isSpecial).toBe(true);
  });

  test("toMinor rounds the decimal the caller wrote", () => {
    expect(toMinor(19.99, "USD")).toBe(1999);
    expect(toMinor(1.005, "USD")).toBe(101);
    expect(toMinor(1234, "JPY")).toBe(1234);
    expect(toMinor(1.2345, "BHD")).toBe(1235);
    expect(toMinor(-2.5, "USD")).toBe(-250);
    expect(fromMinor(1999, "USD")).toBe(19.99);
  });

  test("formatCurrency is deterministic across locales", () => {
    expect(formatCurrency(1234.5, "USD")).toBe("$1,234.50");
    expect(formatCurrency(1234, "JPY")).toBe("¥1,234");
    expect(formatCurrency(1234.5, "EUR", { locale: "de" })).toBe("1.234,50 €");
    expect(formatCurrency(1234.5, "EUR", { locale: "fr" })).toBe("1 234,50 €");
    expect(formatCurrency(1234.5, "CHF", { locale: "ch" })).toBe("CHF1'234.50");
    expect(formatCurrency(1234567.89, "INR", { locale: "in" })).toBe("₹12,34,567.89");
    expect(formatCurrency(-99.5, "USD", { display: "code" })).toBe("-99.50 USD");
    expect(formatCurrency(0.5, "BHD", { display: "none" })).toBe("0.500");
    expect(formatCurrency(1234.5678, "USD", { decimals: 0 })).toBe("$1,235");
    expect(currencySymbol("XXX")).toBe("XXX");
  });
});
