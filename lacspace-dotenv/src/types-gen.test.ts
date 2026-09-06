import { describe, it, expect } from "vitest";
import { genTypes } from "./types-gen.js";
import { checkEnv } from "./check.js";

describe("genTypes", () => {
  it("emits an interface with one string field per key", () => {
    const src = genTypes(["API_KEY", "PORT"]);
    expect(src).toContain("export interface Env {");
    expect(src).toContain("  API_KEY: string;");
    expect(src).toContain("  PORT: string;");
  });

  it("emits a fail-fast runtime accessor", () => {
    const src = genTypes(["API_KEY"]);
    expect(src).toContain('const REQUIRED = ["API_KEY"] as const;');
    expect(src).toContain("export function readEnv(");
    expect(src).toContain("export const env: Env = readEnv();");
    expect(src).toContain("Missing required environment variables");
  });

  it("honours a custom interface name and can omit the accessor", () => {
    const src = genTypes(["A"], { interfaceName: "Config", accessor: false });
    expect(src).toContain("export interface Config {");
    expect(src).not.toContain("readEnv");
  });

  it("de-duplicates keys", () => {
    const src = genTypes(["A", "A", "B"]);
    expect(src.match(/A: string;/g)?.length).toBe(1);
  });
});

describe("checkEnv", () => {
  it("passes when every example key is present", () => {
    const res = checkEnv("API_KEY=\nPORT=\n", { API_KEY: "x", PORT: "3000" });
    expect(res).toEqual({ missing: [], ok: true });
  });

  it("fails and lists missing/empty keys", () => {
    const res = checkEnv("API_KEY=\nPORT=\nDB=\n", { API_KEY: "x", PORT: "" });
    expect(res.ok).toBe(false);
    expect(res.missing).toEqual(["PORT", "DB"]);
  });
});
