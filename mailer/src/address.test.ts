import { describe, it, expect } from "vitest";
import {
  parseAddress,
  parseAddressList,
  formatAddress,
  formatAddressList,
  isValidEmail,
  invalidAddresses,
  encodeMimeWord,
} from "./index";

describe("parseAddress", () => {
  it("parses a bare address", () => {
    expect(parseAddress("a@b.com")).toEqual({ address: "a@b.com" });
  });
  it('parses a "Name <addr>" mailbox and strips quotes', () => {
    expect(parseAddress('"Bob Smith" <bob@x.com>')).toEqual({ name: "Bob Smith", address: "bob@x.com" });
  });
});

describe("parseAddressList", () => {
  it("splits multiple addresses, respecting commas inside display names", () => {
    const list = parseAddressList('"Smith, Bob" <bob@x.com>, alice@y.com');
    expect(list).toEqual([
      { name: "Smith, Bob", address: "bob@x.com" },
      { address: "alice@y.com" },
    ]);
  });
});

describe("formatAddress", () => {
  it("quotes names with special characters", () => {
    expect(formatAddress({ name: "Bob, Jr", address: "b@x.com" })).toBe('"Bob, Jr" <b@x.com>');
  });
  it("RFC 2047 encodes non-ASCII display names", () => {
    const out = formatAddress({ name: "Añez", address: "a@x.com" });
    expect(out).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <a@x\.com>$/);
  });
  it("formats a list", () => {
    expect(formatAddressList(["a@x.com", { name: "B", address: "b@x.com" }])).toBe("a@x.com, B <b@x.com>");
  });
});

describe("isValidEmail", () => {
  it("accepts valid and rejects invalid", () => {
    expect(isValidEmail("user.name@sub.example.com")).toBe(true);
    expect(isValidEmail("no-at-sign")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a@b.com\r\nBcc: evil@x")).toBe(false);
  });
  it("invalidAddresses lists the bad ones", () => {
    expect(invalidAddresses(["ok@x.com", "bad"])).toEqual(["bad"]);
  });
});

describe("encodeMimeWord", () => {
  it("produces a decodable base64 encoded-word", () => {
    const w = encodeMimeWord("héllo");
    const b64 = w.replace(/^=\?UTF-8\?B\?/, "").replace(/\?=$/, "");
    expect(Buffer.from(b64, "base64").toString("utf8")).toBe("héllo");
  });
});
