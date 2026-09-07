import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkProject } from "./check.js";
import { generateLicense } from "./generate.js";
import { detectLicense } from "./detect.js";
import { addHeader, styleForFile, hasHeader } from "./headers.js";

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

  it("reports an empty fixed[] when fix is off", () => {
    write("LICENSE", generateLicense("MIT", { holder: "X" }).text);
    write("package.json", JSON.stringify({ name: "p", license: "MIT" }));
    const r = checkProject({ cwd: root });
    expect(r.fixed).toEqual([]);
  });
});

describe("checkProject — --fix", () => {
  const style = styleForFile("a.ts")!;

  it("writes a missing LICENSE from the declared licence", () => {
    write("package.json", JSON.stringify({ name: "p", license: "MIT", author: "Acme" }));
    const r = checkProject({ cwd: root, fix: true });
    expect(existsSync(join(root, "LICENSE"))).toBe(true);
    expect(detectLicense(readFileSync(join(root, "LICENSE"), "utf8"))).toBe("MIT");
    expect(r.fixed.some((f) => /Wrote LICENSE/.test(f))).toBe(true);
    expect(r.ok).toBe(true);
  });

  it("leaves the no-license-file issue when the declaration is unresolvable", () => {
    write("package.json", JSON.stringify({ name: "p", license: "SEE LICENSE IN LICENSE" }));
    const r = checkProject({ cwd: root, fix: true });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.code === "no-license-file")).toBe(true);
    expect(existsSync(join(root, "LICENSE"))).toBe(false);
  });

  it("aligns package.json license to the detected LICENSE", () => {
    write("LICENSE", generateLicense("Apache-2.0", { holder: "X" }).text);
    write("package.json", JSON.stringify({ name: "p", license: "MIT" }));
    const r = checkProject({ cwd: root, fix: true });
    expect(r.licenseMatches).toBe(true);
    expect(r.declared).toBe("Apache-2.0");
    expect(r.fixed.some((f) => /package\.json/.test(f))).toBe(true);
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.license).toBe("Apache-2.0");
    expect(r.ok).toBe(true);
  });

  it("adds missing headers to source files", () => {
    write("LICENSE", generateLicense("MIT", { holder: "X" }).text);
    write("package.json", JSON.stringify({ name: "p", license: "MIT", author: "Acme" }));
    write("src/a.ts", "export const a = 1;\n");
    const r = checkProject({ cwd: root, requireHeaders: true, fix: true });
    expect(r.missingHeaders).toEqual([]);
    expect(r.ok).toBe(true);
    expect(hasHeader(readFileSync(join(root, "src/a.ts"), "utf8"), style)).toBe(true);
    expect(r.fixed.some((f) => /Added header/.test(f))).toBe(true);
  });

  it("is idempotent — a second fixed run makes no repairs", () => {
    write("package.json", JSON.stringify({ name: "p", license: "MIT", author: "Acme" }));
    write("src/a.ts", "export const a = 1;\n");
    checkProject({ cwd: root, requireHeaders: true, fix: true });
    const second = checkProject({ cwd: root, requireHeaders: true, fix: true });
    expect(second.fixed).toEqual([]);
    expect(second.ok).toBe(true);
  });
});
