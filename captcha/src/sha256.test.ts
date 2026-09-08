import { describe, it, expect } from "vitest";
import { sha256Hex, hmacSha256Hex, timingSafeEqual } from "./sha256";

describe("sha256 (NIST vectors)", () => {
  it('hashes "" and "abc" correctly', () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("hashes the 448-bit block-boundary vector", () => {
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("hashes a long message that spans many blocks", () => {
    // 1,000,000 'a' → the classic NIST long test vector.
    expect(sha256Hex("a".repeat(1000000))).toBe(
      "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
    );
  });
});

describe("hmac-sha256 (RFC 4231 vectors)", () => {
  it("matches RFC 4231 test case 2", () => {
    // key = "Jefe", data = "what do ya want for nothing?"
    expect(hmacSha256Hex("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });

  it("matches RFC 4231 test case 1 (key of 0x0b*20)", () => {
    const key = new Uint8Array(20).fill(0x0b);
    expect(hmacSha256Hex(key, "Hi There")).toBe(
      "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
    );
  });
});

describe("timingSafeEqual", () => {
  it("is true only for identical strings", () => {
    expect(timingSafeEqual("deadbeef", "deadbeef")).toBe(true);
    expect(timingSafeEqual("deadbeef", "deadbeff")).toBe(false);
    expect(timingSafeEqual("dead", "deadbeef")).toBe(false);
  });
});
