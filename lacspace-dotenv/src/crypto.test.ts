import { describe, it, expect } from "vitest";
import { encryptEnv, decryptEnv, isEncrypted } from "./crypto.js";

const SAMPLE = "API_KEY=abc123\nDB_URL=postgres://u:p@h/db\nEMPTY=\n";

describe("encryptEnv / decryptEnv", () => {
  it("round-trips a .env through encrypt → decrypt", () => {
    const enc = encryptEnv(SAMPLE, "correct horse battery staple");
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain("abc123"); // ciphertext, not plaintext
    expect(decryptEnv(enc, "correct horse battery staple")).toBe(SAMPLE);
  });

  it("produces different ciphertext each time (random salt + IV)", () => {
    const a = encryptEnv(SAMPLE, "pw");
    const b = encryptEnv(SAMPLE, "pw");
    expect(a).not.toBe(b);
    expect(decryptEnv(a, "pw")).toBe(decryptEnv(b, "pw"));
  });

  it("fails on a wrong passphrase", () => {
    const enc = encryptEnv(SAMPLE, "right");
    expect(() => decryptEnv(enc, "wrong")).toThrow(/wrong passphrase|decryption failed/i);
  });

  it("fails when the ciphertext is tampered with (GCM auth)", () => {
    const enc = encryptEnv(SAMPLE, "pw");
    const line = enc.split("\n").find((l) => l.startsWith("LSENC1:"))!;
    // flip a character deep in the base64 payload
    const tampered = enc.replace(line, line.slice(0, 40) + (line[40] === "A" ? "B" : "A") + line.slice(41));
    expect(() => decryptEnv(tampered, "pw")).toThrow();
  });
});
