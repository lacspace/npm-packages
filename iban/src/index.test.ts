import { describe, test, expect } from "vitest";
import { REGISTRY } from "./registry";
import { parseIban, isValidIban, generateIban, formatIban, electronicIban, ibanCountries, exampleIban, ibanLength, mod97, parseBic, isValidBic, isValidIsin, isinCheckDigit } from "./index";

describe("registry", () => {
  test("every example IBAN validates: length, format and check digits (a typo would fail MOD 97)", () => {
    const bad: string[] = [];
    for (const [country, length, , example] of REGISTRY) {
      const r = parseIban(example);
      if (!r.valid) bad.push(`${country}: ${example} → ${r.reason}`);
      else if (example.length !== length) bad.push(`${country}: example length ${example.length} ≠ ${length}`);
    }
    expect(bad).toEqual([]);
    expect(ibanCountries().length).toBe(REGISTRY.length);
  });

  test("altering one character of any example is caught", () => {
    for (const [, , , example] of REGISTRY) {
      const i = example.length - 3;
      const ch = example[i]!;
      const replaced = /\d/.test(ch) ? String((Number(ch) + 1) % 10) : ch === "Z" ? "A" : String.fromCharCode(ch.charCodeAt(0) + 1);
      expect(isValidIban(example.slice(0, i) + replaced + example.slice(i + 1)), example).toBe(false);
    }
  });
});

describe("parse and format", () => {
  test("well-known IBANs parse into bank / branch / account", () => {
    expect(parseIban("GB82 WEST 1234 5698 7654 32")).toMatchObject({
      valid: true, country: "GB", checkDigits: "82", bankCode: "WEST", branchCode: "123456", accountNumber: "98765432", sepa: true,
      electronic: "GB82WEST12345698765432", formatted: "GB82 WEST 1234 5698 7654 32",
    });
    expect(parseIban("de89-3704-0044-0532-0130-00")).toMatchObject({ valid: true, bankCode: "37040044", accountNumber: "0532013000" });
    expect(parseIban("FR14 2004 1010 0505 0001 3M02 606")).toMatchObject({ valid: true, bankCode: "20041", branchCode: "01005", accountNumber: "0500013M026" });
    expect(parseIban("IT60 X054 2811 1010 0000 0123 456")).toMatchObject({ valid: true, bankCode: "05428", branchCode: "11101", accountNumber: "000000123456" });
    expect(parseIban("NL91 ABNA 0417 1643 00")).toMatchObject({ valid: true, bankCode: "ABNA", accountNumber: "0417164300" });
    expect(parseIban("SA03 8000 0000 6080 1016 7519")).toMatchObject({ valid: true, sepa: false, bankCode: "80" });
  });

  test("each failure has a reason", () => {
    expect(parseIban("")).toEqual({ valid: false, reason: "empty" });
    expect(parseIban("GB82 WEST 1234 5698 7654 3!")).toMatchObject({ reason: "characters" });
    expect(parseIban("US64SVBKUS6S3300958879")).toMatchObject({ reason: "country", country: "US" });
    expect(parseIban("GB82WEST123456987654321")).toMatchObject({ reason: "length" });
    expect(parseIban("GB82WEST1234569876543A")).toMatchObject({ reason: "format" });
    expect(parseIban("GB83WEST12345698765432")).toMatchObject({ reason: "check-digits" });
    expect(parseIban("gb82west12345698765432").valid).toBe(true);
  });

  test("generateIban computes check digits that parse back; helpers", () => {
    expect(generateIban("DE", "370400440532013000")).toBe("DE89370400440532013000");
    expect(generateIban("gb", "WEST 1234 5698 7654 32")).toBe("GB82WEST12345698765432");
    expect(() => generateIban("US", "123")).toThrow(/registry/);
    expect(() => generateIban("DE", "123")).toThrow(/format/);
    expect(formatIban("gb82west12345698765432")).toBe("GB82 WEST 1234 5698 7654 32");
    expect(electronicIban(" gb82 west-1234 ")).toBe("GB82WEST1234");
    expect(exampleIban("np")).toBeUndefined();
    expect(exampleIban("DE")).toBe("DE89370400440532013000");
    expect(ibanLength("NO")).toBe(15);
    expect(mod97("WEST12345698765432GB82")).toBe(1);
  });
});

describe("BIC", () => {
  test("8 and 11 character BICs, primary office and test flags", () => {
    expect(parseBic("DEUTDEFF")).toMatchObject({ valid: true, bankCode: "DEUT", country: "DE", locationCode: "FF", primaryOffice: true, test: false });
    expect(parseBic("deut de ff 500")).toMatchObject({ valid: true, branchCode: "500", primaryOffice: false, bic: "DEUTDEFF500" });
    expect(parseBic("DEUTDEFFXXX")).toMatchObject({ primaryOffice: true });
    expect(parseBic("DEUTDEF0")).toMatchObject({ test: true });
    expect(isValidBic("NWBKGB2L")).toBe(true);
    expect(isValidBic("NWBKG2L")).toBe(false);
    expect(isValidBic("1234GB2L")).toBe(false);
    expect(isValidBic("NWBKGB2L12")).toBe(false);
  });
});

describe("ISIN", () => {
  test("published ISINs validate and a changed digit fails", () => {
    for (const isin of ["US0378331005", "US5949181045", "GB0002634946", "DE000BAY0017", "AU0000XVGZA3", "NL0000009165", "FR0000120271", "JP3633400001", "CH0038863350", "IE00B4L5Y983"]) {
      expect(isValidIsin(isin), isin).toBe(true);
      expect(isValidIsin(isin.slice(0, -1) + String((Number(isin.slice(-1)) + 1) % 10)), isin).toBe(false);
    }
    expect(isinCheckDigit("US037833100")).toBe("5");
    expect(isValidIsin("US03783310")).toBe(false);
  });
});
