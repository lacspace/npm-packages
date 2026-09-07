import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkProject } from "./check.js";
import { generateLicense } from "./generate.js";
import { addHeader, styleForFile } from "./headers.js";

let root: string;

function write(rel: string, content: string): void {
  const full = join(root, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "lac-lic-check-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("checkProject — LICENSE presence & match", () => {
  it("fails when there is no LICENSE file", () => {
    write("package.json", JSON.stringify({ name: "p", license: "MIT" }));
    const r = checkProject({ cwd: root });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "no-license-file")).toBe(true);
  });

  it("passes when LICENSE matches package.json", () => {
    write("LICENSE", generateLicense("MIT", { holder: "X", year: 2026 }).text);
    write("package.json", JSON.stringify({ name: "p", license: "MIT" }));
    const r = checkProject({ cwd: root });
    expect(r.detected).toBe("MIT");
    expect(r.declared).toBe("MIT");
    expect(r.licenseMatches).toBe(true);
    expect(r.ok).toBe(true);
  });

  it("flags a mismatch between LICENSE and package.json", () => {
    write("LICENSE", generateLicense("Apache-2.0", { holder: "X" }).text);
    write("package.json", JSON.stringify({ name: "p", license: "MIT" }));
    const r = checkProject({ cwd: root });
    expect(r.detected).toBe("Apache-2.0");
    expect(r.licenseMatches).toBe(false);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "license-mismatch")).toBe(true);
  });

  it('accepts a "SEE LICENSE IN LICENSE" declaration', () => {
    write("LICENSE", generateLicense("MIT", { holder: "X" }).text);
    write("package.json", JSON.stringify({ name: "p", license: "SEE LICENSE IN LICENSE" }));
    const r = checkProject({ cwd: root });
    expect(r.ok).toBe(true);
  });
});

describe("checkProject — --require-headers exit behaviour", () => {
  const style = styleForFile("a.ts")!;

  it("fails when a source file is missing its header", () => {
    write("LICENSE", generateLicense("MIT", { holder: "X" }).text);
    write("package.json", JSON.stringify({ name: "p", license: "MIT" }));
    write("src/a.ts", "export const a = 1;\n");
    const r = checkProject({ cwd: root, requireHeaders: true });
    expect(r.ok).toBe(false);
    expect(r.missingHeaders.length).toBe(1);
    expect(r.issues.some((i) => i.code === "missing-header")).toBe(true);
  });

  it("passes when every source file has a header", () => {
    write("LICENSE", generateLicense("MIT", { holder: "X" }).text);
    write("package.json", JSON.stringify({ name: "p", license: "MIT" }));
    const withH = addHeader("export const a = 1;\n", style, { id: "MIT", holder: "X", year: 2026 }).content;
    write("src/a.ts", withH);
    write("src/b.ts", addHeader("export const b = 2;\n", style, { id: "MIT" }).content);
    const r = checkProject({ cwd: root, requireHeaders: true });
    expect(r.missingHeaders.length).toBe(0);
    expect(r.headersChecked).toBe(2);
    expect(r.ok).toBe(true);
  });

  it("respects a custom --src directory", () => {
    write("LICENSE", generateLicense("MIT", { holder: "X" }).text);
    write("package.json", JSON.stringify({ name: "p", license: "MIT" }));
    write("lib/a.ts", "export const a = 1;\n");
    const r = checkProject({ cwd: root, requireHeaders: true, src: "lib" });
    expect(r.missingHeaders.length).toBe(1);
  });
});
