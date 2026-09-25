import { describe, test, expect } from "vitest";
import {
  countries, country, isCountryCode, flagEmoji, callingCode, countriesByCallingCode, countriesUsing,
  countriesInRegion, searchCountries, alpha2ToAlpha3, alpha3ToAlpha2, numericToAlpha2, callingCodes,
} from "./index";

const icu = new Intl.DisplayNames(["en"], { type: "region" });
const icuCurrencies = new Set((Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("currency"));
// Currencies newer than this Node's ICU data (Caribbean guilder 2025, Zimbabwe gold 2024).
const NEWER_THAN_ICU = new Set(["XCG", "ZWG"]);

describe("the table", () => {
  test("has all 249 ISO 3166-1 codes, unique in every code column", () => {
    const all = countries();
    expect(all).toHaveLength(249);
    for (const key of ["alpha2", "alpha3", "numeric"] as const) expect(new Set(all.map((c) => c[key])).size).toBe(249);
    for (const c of all) {
      expect(c.alpha2).toMatch(/^[A-Z]{2}$/);
      expect(c.alpha3).toMatch(/^[A-Z]{3}$/);
      expect(c.numeric).toMatch(/^\d{3}$/);
      expect(c.tld).toMatch(/^\.[a-z]{2}$/);
      expect(c.flag).toHaveLength(4);
      for (const cc of c.callingCodes) expect(cc).toMatch(/^\d{1,4}$/);
      for (const cur of c.currencies) expect(icuCurrencies.has(cur) || NEWER_THAN_ICU.has(cur), `${c.alpha2} currency ${cur}`).toBe(true);
    }
  });

  test("every alpha-2 is a region ICU knows, and ICU's English name finds the same country", () => {
    const misses: string[] = [];
    for (const c of countries()) {
      const icuName = icu.of(c.alpha2);
      expect(icuName, c.alpha2).not.toBe(c.alpha2); // ICU echoes unknown codes
      const found = country(icuName!);
      if (found?.alpha2 !== c.alpha2) misses.push(`${c.alpha2}: ICU says "${icuName}", lookup gave ${found?.alpha2 ?? "nothing"}`);
    }
    expect(misses).toEqual([]);
  });

  test("only Antarctica has no currency; every other country has at least one calling code and currency", () => {
    for (const c of countries()) {
      expect(c.callingCodes.length, c.alpha2).toBeGreaterThan(0);
      if (c.alpha2 !== "AQ") expect(c.currencies.length, c.alpha2).toBeGreaterThan(0);
    }
  });
});

describe("lookup", () => {
  test("by any code, name or alias, in any case", () => {
    const np = country("NP")!;
    expect(np).toMatchObject({ alpha2: "NP", alpha3: "NPL", numeric: "524", name: "Nepal", callingCodes: ["977"], currencies: ["NPR"], tld: ".np", region: "Asia", flag: "🇳🇵" });
    for (const q of ["np", "npl", "524", 524, "nepal", "NEPAL", " Nepal "]) expect(country(q)?.alpha2, String(q)).toBe("NP");
    expect(country("côte d'ivoire")?.alpha2).toBe("CI");
    expect(country("Cote dIvoire")?.alpha2).toBe("CI");
    expect(country("Republic of Korea")?.alpha2).toBe("KR");
    expect(country("South Korea")?.alpha2).toBe("KR");
    expect(country("UK")?.alpha2).toBe("GB");
    expect(country("USA")?.alpha2).toBe("US");
    expect(country("Türkiye")?.alpha2).toBe("TR");
    expect(country("Turkey")?.alpha2).toBe("TR");
    expect(country(4)?.alpha2).toBe("AF");
    expect(country("")).toBeUndefined();
    expect(country("Atlantis")).toBeUndefined();
    expect(country("ZZ")).toBeUndefined();
  });

  test("code helpers", () => {
    expect(isCountryCode("de")).toBe(true);
    expect(isCountryCode("XX")).toBe(false);
    expect(isCountryCode(12)).toBe(false);
    expect(alpha2ToAlpha3("gb")).toBe("GBR");
    expect(alpha3ToAlpha2("deu")).toBe("DE");
    expect(numericToAlpha2(840)).toBe("US");
    expect(numericToAlpha2("004")).toBe("AF");
    expect(flagEmoji("in")).toBe("🇮🇳");
    expect(flagEmoji("x")).toBe("");
  });

  test("calling codes: shared, split and reverse lookup", () => {
    expect(callingCode("IN")).toBe("91");
    expect(countriesByCallingCode("1").map((c) => c.alpha2)).toEqual(expect.arrayContaining(["US", "CA", "UM"]));
    expect(countriesByCallingCode("+44").map((c) => c.alpha2).sort()).toEqual(["GB", "GG", "IM", "JE"]);
    expect(countriesByCallingCode("1809")[0]?.alpha2).toBe("DO");
    expect(countriesByCallingCode("7").map((c) => c.alpha2).sort()).toEqual(["KZ", "RU"]);
    const codes = callingCodes();
    expect(codes.indexOf("1264")).toBeLessThan(codes.indexOf("1"));
  });

  test("currency and region groupings", () => {
    const euro = countriesUsing("eur").map((c) => c.alpha2);
    expect(euro).toEqual(expect.arrayContaining(["DE", "FR", "HR", "ME", "AD", "VA"]));
    expect(euro.length).toBeGreaterThanOrEqual(35);
    expect(countriesUsing("INR").map((c) => c.alpha2).sort()).toEqual(["BT", "IN"]);
    expect(countriesInRegion("Antarctica").map((c) => c.alpha2).sort()).toEqual(["AQ", "BV", "GS", "HM", "TF"]);
    const total = (["Africa", "Americas", "Antarctica", "Asia", "Europe", "Oceania"] as const).reduce((n, r) => n + countriesInRegion(r).length, 0);
    expect(total).toBe(249);
  });

  test("search ranks prefix over substring and knows aliases", () => {
    expect(searchCountries("uni").map((c) => c.alpha2)).toEqual(expect.arrayContaining(["AE", "GB", "US", "UM", "TZ"]));
    expect(searchCountries("united k")[0]?.alpha2).toBe("GB");
    expect(searchCountries("nep")[0]?.alpha2).toBe("NP");
    expect(searchCountries("guinea").map((c) => c.alpha2)).toEqual(expect.arrayContaining(["GN", "GW", "GQ", "PG"]));
    expect(searchCountries("holl")[0]?.alpha2).toBe("NL");
    expect(searchCountries("zzz")).toEqual([]);
    expect(searchCountries("a", 3)).toHaveLength(3);
  });
});
