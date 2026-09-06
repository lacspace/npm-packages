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

  // ── 0.2.0 detectors — every fixture is split across concatenation so this
  // file never contains a contiguous token for GitHub push-protection to see.
  it("flags a Google API key", () => {
    expect(kinds({ G: "AIza" + "SyD" + "0123456789abcdef0123456789abcdef" })).toEqual(["Google API key"]);
    expect(kinds({ G: "AIzaShort" })).toEqual([]);
  });

  it("flags a Stripe live secret key", () => {
    expect(kinds({ S: "sk_live_" + "4eC39HqLyjWDarjtT1zdp7dc" })).toEqual(["Stripe secret key"]);
    expect(kinds({ S: "rk_live_" + "4eC39HqLyjWDarjtT1zdp7dc" })).toEqual(["Stripe secret key"]);
    expect(kinds({ S: "sk_test_" + "abc" })).toEqual([]);
  });

  it("flags an OpenAI API key", () => {
    expect(kinds({ O: "sk-" + "proj-" + "a1b2c3d4e5f6g7h8i9j0k1l2" })).toEqual(["OpenAI API key"]);
    expect(kinds({ O: "sk-" + "short" })).toEqual([]);
  });

  it("flags a SendGrid API key", () => {
    expect(kinds({ S: "SG." + "a1b2c3d4e5f6g7h8" + "." + "i9j0k1l2m3n4o5p6q7r8s9t0" })).toEqual(["SendGrid API key"]);
    expect(kinds({ S: "SG.short" })).toEqual([]);
  });

  it("flags a Twilio SID/key", () => {
    expect(kinds({ T: "AC" + "0123456789abcdef0123456789abcdef" })).toEqual(["Twilio key"]);
    expect(kinds({ T: "AC" + "tooshort" })).toEqual([]);
  });

  it("flags a database connection string with an embedded password", () => {
    expect(kinds({ D: "postgres://" + "user:s3cr3t@" + "db.host:5432/app" })).toEqual(["database connection string"]);
    expect(kinds({ D: "mysql://" + "user:pw@" + "localhost/app" })).toEqual(["database connection string"]);
    // no password (no `user:pass@`) → not flagged as a connection secret
    expect(kinds({ D: "postgres://" + "localhost:5432/app" })).toEqual([]);
  });

  it("honours the allowlist", () => {
    expect(detectSecrets({ PUBLIC: "AKIAIOSFODNN7EXAMPLE" }, { allow: ["PUBLIC"] })).toEqual([]);
    expect(detectSecrets({ PUBLIC: "AKIAIOSFODNN7EXAMPLE" })).toEqual([{ key: "PUBLIC", kind: "AWS access key" }]);
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
