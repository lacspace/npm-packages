import { test, expect } from "vitest";
import { generatePassphrase, generatePassword } from "./generate";
import { WORDLIST } from "./wordlist";

test("passphrase has the requested number of words and separator", () => {
  const p = generatePassphrase({ words: 5, separator: "." });
  const parts = p.split(".");
  expect(parts).toHaveLength(5);
  for (const w of parts) expect(WORDLIST).toContain(w);
});

test("passphrase capitalize + includeNumber", () => {
  const p = generatePassphrase({ words: 3, capitalize: true, includeNumber: true, separator: "-" });
  const parts = p.split("-");
  expect(parts).toHaveLength(4); // 3 words + trailing number
  expect(/^[A-Z]/.test(parts[0]!)).toBe(true);
  expect(/^\d$/.test(parts[3]!)).toBe(true);
});

test("passphrases are effectively unique across generations", () => {
  const set = new Set<string>();
  for (let i = 0; i < 50; i++) set.add(generatePassphrase({ words: 6 }));
  expect(set.size).toBe(50);
});

test("password respects requested length and default classes", () => {
  const pw = generatePassword({ length: 20 });
  expect(pw).toHaveLength(20);
  expect(/[a-z]/.test(pw)).toBe(true);
  expect(/[A-Z]/.test(pw)).toBe(true);
  expect(/[0-9]/.test(pw)).toBe(true);
  expect(/[^a-zA-Z0-9]/.test(pw)).toBe(true);
});

test("password class controls exclude disabled classes", () => {
  const pw = generatePassword({ length: 24, symbols: false, uppercase: false });
  expect(pw).toHaveLength(24);
  expect(/[^a-z0-9]/.test(pw)).toBe(false); // only lowercase + digits
});

test("avoidAmbiguous drops confusable characters", () => {
  for (let i = 0; i < 20; i++) {
    const pw = generatePassword({ length: 30, avoidAmbiguous: true });
    expect(/[0O1lI]/.test(pw)).toBe(false);
  }
});

test("generated passwords are unique and throw when no class enabled", () => {
  const set = new Set<string>();
  for (let i = 0; i < 50; i++) set.add(generatePassword({ length: 16 }));
  expect(set.size).toBe(50);
  expect(() => generatePassword({ lowercase: false, uppercase: false, digits: false, symbols: false })).toThrow();
});
