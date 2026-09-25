import { describe, test, expect } from "vitest";
import { parsePhone, isValidPhone, formatPhone, phoneCountry, RULED_COUNTRIES } from "./index";

describe("parsePhone", () => {
  test("international input in every spelling", () => {
    const want = { valid: true, country: "NP", callingCode: "977", national: "9801234567", e164: "+9779801234567", international: "+977 980 123 4567", nationalFormat: "0980 123 4567", type: "mobile" };
    for (const s of ["+977 980-123-4567", "+9779801234567", "00977 9801234567", "+977 (980) 123 4567", "+977.980.123.4567", "＋９７７９８０１２３４５６７"]) {
      expect(parsePhone(s), s).toMatchObject(want);
    }
  });

  test("national input needs a default country; trunk prefixes are dropped", () => {
    expect(parsePhone("07911 123456", { defaultCountry: "GB" })).toMatchObject({ e164: "+447911123456", nationalFormat: "07911 123456", type: "mobile" });
    expect(parsePhone("(202) 456-1111", { defaultCountry: "US" })).toMatchObject({ e164: "+12024561111", international: "+1 202 456 1111", nationalFormat: "(202) 456-1111" });
    expect(parsePhone("1-202-456-1111", { defaultCountry: "US" }).valid && parsePhone("1-202-456-1111", { defaultCountry: "US" })).toMatchObject({ e164: "+12024561111" });
    expect(parsePhone("98012 34567", { defaultCountry: "in" })).toMatchObject({ e164: "+919801234567", international: "+91 98012 34567", type: "mobile" });
    expect(parsePhone("030 18400-0", { defaultCountry: "DE" })).toMatchObject({ e164: "+4930184000" });
    expect(parsePhone("01 42 92 81 00", { defaultCountry: "FR" })).toMatchObject({ e164: "+33142928100", international: "+33 1 42 92 81 00", type: "fixed-or-mobile" });
    expect(parsePhone("0412 345 678", { defaultCountry: "AU" })).toMatchObject({ e164: "+61412345678", type: "mobile" });
    expect(parsePhone("9801234567", { defaultCountry: "NP" })).toMatchObject({ e164: "+9779801234567" });
    expect(parsePhone("8 912 345 67 89", { defaultCountry: "RU" })).toMatchObject({ e164: "+79123456789", country: "RU" });
    expect(parsePhone("9801234567")).toMatchObject({ valid: false, reason: "no-country" });
  });

  test("shared calling codes resolve by leading digits, else to the main country", () => {
    expect(phoneCountry("+1 416 555 0123")).toBe("CA");
    expect(phoneCountry("+1 212 555 0123")).toBe("US");
    expect(phoneCountry("+1 876 555 0123")).toBe("JM");
    expect(phoneCountry("+1 809 555 0123")).toBe("DO");
    expect(phoneCountry("+44 7911 123456")).toBe("GB");
    expect(phoneCountry("+7 912 345 67 89")).toBe("RU");
    expect(phoneCountry("+61 412 345 678")).toBe("AU");
  });

  test("rejections carry a reason", () => {
    expect(parsePhone("")).toMatchObject({ valid: false, reason: "empty" });
    expect(parsePhone("+977 98O1234567")).toMatchObject({ valid: false, reason: "characters" });
    expect(parsePhone("+999 123456")).toMatchObject({ valid: false, reason: "unknown-calling-code" });
    expect(parsePhone("+977 980123456")).toMatchObject({ valid: false, reason: "length", country: "NP" }); // 9 digits: NP is 8 or 10
    expect(parsePhone("+977 1 4211000")).toMatchObject({ valid: true, type: "fixed-or-mobile" }); // 8-digit Kathmandu landline
    expect(parsePhone("+91 1234567")).toMatchObject({ valid: false, reason: "length" });
    expect(parsePhone("+1 123 456 7890")).toMatchObject({ valid: false, reason: "leading-digits" });
    expect(parsePhone("+44 0207 946 0958")).toMatchObject({ valid: false, reason: "leading-digits" });
    expect(isValidPhone("hello", "US")).toBe(false);
  });

  test("extensions and formatting", () => {
    expect(parsePhone("+44 20 7946 0958 ext. 12")).toMatchObject({ valid: true, extension: "12", e164: "+442079460958" });
    expect(parsePhone("+1 (202) 456-1111 x99")).toMatchObject({ extension: "99" });
    expect(formatPhone("+442079460958")).toBe("+44 2079 460958");
    expect(formatPhone("+442079460958", "national")).toBe("02079 460958");
    expect(formatPhone("07911123456", "e164", "GB")).toBe("+447911123456");
    expect(formatPhone("+14155552671", "national")).toBe("(415) 555-2671");
    expect(formatPhone("not a number")).toBe("not a number");
  });

  test("countries without a specific rule still parse within E.164 limits", () => {
    expect(RULED_COUNTRIES).not.toContain("BT");
    expect(parsePhone("+975 17123456")).toMatchObject({ valid: true, country: "BT", type: "unknown", e164: "+97517123456" });
    expect(parsePhone("+975 1")).toMatchObject({ valid: false, reason: "length" });
  });
});
