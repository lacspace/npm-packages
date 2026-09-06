import { describe, it, expect } from "vitest";
import { detectSecrets, maskSecret } from "./secrets.js";

const kinds = (map: Record<string, string>): string[] =>
  detectSecrets(map).map((h) => h.kind);

describe("detectSecrets", () => {
  it("flags an AWS access key", () => {
    expect(kinds({ AWS: "AKIAIOSFODNN7EXAMPLE" })).toEqual(["AWS access key"]);
    expect(kinds({ AWS: "not-a-key" })).toEqual([]);
  });

  it("flags a PEM private key", () => {
    expect(kinds({ K: "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n" })).toEqual(["private key"]);
    expect(kinds({ K: "-----BEGIN CERTIFICATE-----" })).toEqual([]);
  });

  it("flags a JWT", () => {
    // Split across concatenation so the file text holds no contiguous token
    // (keeps GitHub push-protection quiet; the runtime value is identical).
    const jwt = "eyJhbGciOiJIUzI1NiJ9." + "eyJzdWIiOiIxMjM0NTY3ODkwIn0." + "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    expect(kinds({ T: jwt })).toEqual(["JWT"]);
    expect(kinds({ T: "eyJonly.onepart" })).toEqual([]);
  });

  it("flags Slack and GitHub tokens", () => {
    expect(kinds({ S: "xoxb" + "-123456789012-abcdefghijklmnop" })).toEqual(["Slack token"]);
    expect(kinds({ G: "ghp_" + "a".repeat(36) })).toEqual(["GitHub token"]);
    expect(kinds({ X: "xoxo-short" })).toEqual([]);
  });

  it("flags a long high-entropy token but not a low-entropy string", () => {
    expect(kinds({ H: "aB3xQ9zL7mW2kP5rT8vY1nC4dF6gH0jK2lM4nP6qR8s" })).toEqual(["high-entropy secret"]);
    expect(kinds({ H: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })).toEqual([]);
    expect(kinds({ H: "true" })).toEqual([]);
  });

  it("ignores empty values", () => {
    expect(detectSecrets({ A: "", B: "AKIAIOSFODNN7EXAMPLE" })).toEqual([
      { key: "B", kind: "AWS access key" },
    ]);
  });
});

describe("maskSecret", () => {
  it("never reveals the middle of the value", () => {
    const m = maskSecret("AKIAIOSFODNN7EXAMPLE");
    expect(m.startsWith("AKI")).toBe(true);
    expect(m.endsWith("LE")).toBe(true);
    expect(m).not.toContain("OSFODNN");
  });
  it("fully masks short values", () => {
    expect(maskSecret("abc")).toBe("•••");
  });
});
