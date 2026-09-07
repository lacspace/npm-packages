import { describe, it, expect } from "vitest";
import { isLocale, LOCALES } from "./data.js";
import { parseFields, generateRows } from "./schema.js";

describe("locales", () => {
  it("isLocale accepts en/ne/es/fr and rejects others", () => {
    for (const l of ["en", "ne", "es", "fr"]) expect(isLocale(l)).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale("")).toBe(false);
  });

  it("every locale table has all required fields", () => {
    for (const key of ["en", "ne", "es", "fr"] as const) {
      const d = LOCALES[key];
      expect(d.firstNamesMale.length).toBeGreaterThan(0);
      expect(d.lastNames.length).toBeGreaterThan(0);
      expect(d.cities.length).toBeGreaterThan(0);
      expect(typeof d.country).toBe("string");
      expect(d.currency.code.length).toBe(3);
    }
  });

  it("es phone is a +34 mobile", () => {
    const rows = generateRows(parseFields("phone:phone"), { count: 20, seed: 1, locale: "es" });
    for (const r of rows) expect(String(r["phone"])).toMatch(/^\+34[67]\d{8}$/);
  });

  it("fr phone is a +33 mobile", () => {
    const rows = generateRows(parseFields("phone:phone"), { count: 20, seed: 1, locale: "fr" });
    for (const r of rows) expect(String(r["phone"])).toMatch(/^\+33[67]\d{8}$/);
  });

  it("es country/currency are Spain/EUR", () => {
    const rows = generateRows(parseFields("c:country,cur:currency"), { count: 3, seed: 1, locale: "es" });
    expect(rows[0]!["c"]).toBe("España");
    expect(rows[0]!["cur"]).toBe("EUR");
  });

  it("changing locale changes output deterministically", () => {
    const spec = "name:fullName,city:city";
    const en = generateRows(parseFields(spec), { count: 10, seed: 5, locale: "en" });
    const es = generateRows(parseFields(spec), { count: 10, seed: 5, locale: "es" });
    const es2 = generateRows(parseFields(spec), { count: 10, seed: 5, locale: "es" });
    expect(es).toEqual(es2); // deterministic
    expect(es).not.toEqual(en); // locale changes output
  });

  it("es names come from the Spanish tables", () => {
    const names = new Set(LOCALES.es.firstNamesMale.concat(LOCALES.es.firstNamesFemale));
    const rows = generateRows(parseFields("first:firstName"), { count: 15, seed: 2, locale: "es" });
    for (const r of rows) expect(names.has(String(r["first"]))).toBe(true);
  });
});
