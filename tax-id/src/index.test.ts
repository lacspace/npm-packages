import { describe, test, expect } from "vitest";
import {
  validateVat, isValidVat, VAT_COUNTRIES, validateTaxId, isValidTaxId, TAX_ID_COUNTRIES,
  isValidGstin, isValidPan, isValidAbn, isValidAcn, isValidTfn, isValidIrd, isValidBn, isValidEin, isValidCpf, isValidCnpj,
  isValidCuit, isValidRut, isValidRfc, isValidNepalPan, isValidUen, isValidNpwp, isValidKrBrn, isValidJpCorporateNumber, isValidZaTaxNumber,
} from "./index";

/** Change the last digit (or the last digit of the body for letter-suffixed ids). */
function tweak(id: string): string {
  // Dutch numbers end in a "B01" sequence suffix that no checksum covers; change the body instead.
  const digits = [...id].map((c, k) => (/\d/.test(c) ? k : -1)).filter((k) => k >= 0);
  const i = id.startsWith("NL") ? digits[digits.length - 3]! : digits[digits.length - 1]!;
  return id.slice(0, i) + String((Number(id[i]) + 1) % 10) + id.slice(i + 1);
}

// Published numbers (tax authorities' own examples and well-known public companies).
const VALID_VAT: Array<[string, "checksum" | "format"]> = [
  ["ATU13585627", "checksum"], ["BE0428759497", "checksum"], ["BG175074752", "checksum"], ["CZ25123891", "checksum"],
  ["DE136695976", "checksum"], ["DK13585628", "checksum"], ["EE100931558", "checksum"], ["EL094259216", "checksum"],
  ["ESA28015865", "checksum"], ["ES54362315K", "checksum"], ["ESX2482300W", "checksum"], ["FI09853608", "checksum"], ["FR40303265045", "checksum"],
  ["HR33392005961", "checksum"], ["HU12892312", "checksum"], ["IE6388047V", "checksum"], ["IE8Z49289F", "checksum"], ["IT00743110157", "checksum"],
  ["LT119511515", "checksum"], ["LU10000356", "checksum"], ["MT11679112", "checksum"], ["NL004495445B01", "checksum"], ["NL123456789B13", "checksum"],
  ["PL8567346215", "checksum"], ["PT501964843", "checksum"], ["RO18547290", "checksum"], ["SE556188840401", "checksum"],
  ["SI50223054", "checksum"], ["SK2020317068", "checksum"], ["GB980780684", "checksum"], ["XI980780684", "checksum"],
  ["CY10259033P", "format"], ["LV40003009497", "format"], ["BG7501020018", "format"], ["GBGD001", "format"],
];

describe("EU + GB VAT", () => {
  test("published numbers validate with the expected strength", () => {
    const bad: string[] = [];
    for (const [vat, strength] of VALID_VAT) {
      const r = validateVat(vat);
      if (!r.valid || r.strength !== strength) bad.push(`${vat}: ${JSON.stringify(r)}`);
    }
    expect(bad).toEqual([]);
  });

  test("a changed digit fails every checksum scheme", () => {
    for (const [vat, strength] of VALID_VAT) {
      if (strength !== "checksum") continue;
      expect(isValidVat(tweak(vat)), vat).toBe(false);
    }
  });

  test("separators, case and a separate country argument", () => {
    expect(validateVat("de 136 695 976")).toMatchObject({ valid: true, normalized: "DE136695976" });
    expect(validateVat("136695976", "de")).toMatchObject({ valid: true, country: "DE" });
    expect(validateVat("EL094259216", "GR")).toMatchObject({ valid: true, country: "EL" });
    expect(validateVat("094259216", "GR")).toMatchObject({ valid: true, country: "EL" });
    expect(validateVat("BE 0428.759.497")).toMatchObject({ valid: true, normalized: "BE0428759497" });
    expect(validateVat("BE 428759497")).toMatchObject({ valid: true, normalized: "BE0428759497" }); // old 9-digit form
    expect(validateVat("US123456789").valid).toBe(false);
    expect(validateVat("").valid).toBe(false);
    expect(VAT_COUNTRIES).toContain("XI");
    expect(VAT_COUNTRIES).toHaveLength(29);
  });
});

describe("rest of the world", () => {
  test("India", () => {
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
    expect(isValidGstin("27AAPFU0939F1ZW")).toBe(false);
    expect(isValidGstin("99AAPFU0939F1ZV")).toBe(false); // wrong check for that state
    expect(isValidPan("AAPFU0939F")).toBe(true);
    expect(isValidPan("AAPXU0939F")).toBe(false); // X is not a holder type
  });

  test("Australia (ATO examples)", () => {
    expect(isValidAbn("51 824 753 556")).toBe(true);
    expect(isValidAbn("51 824 753 557")).toBe(false);
    expect(isValidAcn("004 085 616")).toBe(true);
    expect(isValidAcn("004 085 617")).toBe(false);
    expect(isValidTfn("123 456 782")).toBe(true);
    expect(isValidTfn("123 456 783")).toBe(false);
  });

  test("New Zealand IRD (IRD test numbers)", () => {
    expect(isValidIrd("49091850")).toBe(true);
    expect(isValidIrd("35901981")).toBe(true);
    expect(isValidIrd("49098576")).toBe(true);
    expect(isValidIrd("136410132")).toBe(true);
    expect(isValidIrd("136410133")).toBe(false);
    expect(isValidIrd("9125568")).toBe(false); // below range
  });

  test("Canada and US", () => {
    expect(isValidBn("123456782")).toBe(true); // Luhn
    expect(isValidBn("123456782RT0001")).toBe(true);
    expect(isValidBn("123456783")).toBe(false);
    expect(isValidEin("12-3456789")).toBe(true);
    expect(isValidEin("07-3456789")).toBe(false); // 07 was never issued
  });

  test("Brazil", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("529.982.247-26")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
  });

  test("Argentina, Chile, Mexico", () => {
    expect(isValidCuit("20-12345678-6")).toBe(true);
    expect(isValidCuit("20-12345678-7")).toBe(false);
    expect(isValidRut("12.345.678-5")).toBe(true);
    expect(isValidRut("12.345.678-4")).toBe(false);
    expect(isValidRut("5.000.001-K")).toBe(true); // sum mod 11 = 1 → check "K"
    expect(isValidRut("5.000.001-0")).toBe(false);
    expect(isValidRfc("GODE561231GR8")).toBe(true);
    expect(isValidRfc("ABC010101AAA")).toBe(true);
    expect(isValidRfc("ABC011301AAA")).toBe(false); // month 13
  });

  test("Asia-Pacific and South Africa", () => {
    expect(isValidNepalPan("301234567")).toBe(true);
    expect(isValidNepalPan("30123456")).toBe(false);
    expect(isValidUen("201912345A")).toBe(true);
    expect(isValidUen("T08LL1234A")).toBe(true);
    expect(isValidUen("12345678")).toBe(false);
    expect(isValidNpwp("01.234.567.8-901.000")).toBe(true);
    expect(isValidNpwp("1234")).toBe(false);
    expect(isValidKrBrn("123-45-67890")).toBe(false);
    expect(isValidKrBrn("220-81-62517")).toBe(true); // Samsung Electronics
    expect(isValidJpCorporateNumber("1180301018771")).toBe(true); // Toyota Motor Corporation
    expect(isValidJpCorporateNumber("1180301018772")).toBe(false);
    expect(isValidZaTaxNumber("0001339050")).toBe(true);
    expect(isValidZaTaxNumber("0001339051")).toBe(false);
  });
});

describe("validateTaxId front door", () => {
  test("routes by country and type, reports strength, normalises", () => {
    expect(validateTaxId("DE136695976")).toMatchObject({ valid: true, country: "DE", type: "vat", strength: "checksum", normalized: "DE136695976" });
    expect(validateTaxId("27AAPFU0939F1ZV", { country: "in" })).toMatchObject({ valid: true, type: "gstin", strength: "checksum" });
    expect(validateTaxId("AAPFU0939F", { country: "IN" })).toMatchObject({ valid: true, type: "pan", strength: "format" });
    expect(validateTaxId("51 824 753 556", { country: "AU" })).toMatchObject({ valid: true, type: "abn", normalized: "51824753556" });
    expect(validateTaxId("004 085 616", { country: "AU", type: "acn" })).toMatchObject({ valid: true, type: "acn" });
    expect(validateTaxId("004 085 616", { country: "AU", type: "abn" })).toMatchObject({ valid: false });
    expect(validateTaxId("11.222.333/0001-81", { country: "BR" })).toMatchObject({ valid: true, type: "cnpj" });
    expect(validateTaxId("136695976", { country: "DE", type: "vat" })).toMatchObject({ valid: true, normalized: "DE136695976" });
    expect(validateTaxId("136695977", { country: "DE", type: "vat" })).toMatchObject({ valid: false, reason: "checksum" });
    expect(validateTaxId("123", { country: "ZZ" })).toMatchObject({ valid: false, reason: "no scheme for ZZ" });
    expect(validateTaxId("123")).toMatchObject({ valid: false });
    expect(isValidTaxId("GB980780684")).toBe(true);
    expect(TAX_ID_COUNTRIES).toEqual(expect.arrayContaining(["DE", "GB", "GR", "IN", "AU", "NP", "JP"]));
  });
});
