import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  authorName, licenseId, findPackageJson, findLicenseFile, expandGlobs, globToRegExp,
} from "./pkg.js";

describe("authorName", () => {
  it("parses a string author", () => {
    expect(authorName("Jane Doe <jane@x.com> (https://x.com)")).toBe("Jane Doe");
    expect(authorName("Lacspace")).toBe("Lacspace");
  });
  it("parses an object author", () => {
    expect(authorName({ name: "Acme", email: "a@b.c" })).toBe("Acme");
  });
  it("returns undefined for nothing", () => {
    expect(authorName(undefined)).toBeUndefined();
  });
});

describe("licenseId", () => {
  it("reads a string, object, or array license", () => {
    expect(licenseId("MIT")).toBe("MIT");
    expect(licenseId({ type: "ISC" })).toBe("ISC");
    expect(licenseId([{ type: "Apache-2.0" }])).toBe("Apache-2.0");
    expect(licenseId(undefined)).toBeUndefined();
  });
});

describe("globToRegExp", () => {
  it("matches * within a segment", () => {
    expect(globToRegExp("src/*.ts").test("src/a.ts")).toBe(true);
    expect(globToRegExp("src/*.ts").test("src/sub/a.ts")).toBe(false);
  });
  it("matches ** across segments", () => {
    expect(globToRegExp("src/**/*.ts").test("src/a/b/c.ts")).toBe(true);
  });
  it("matches brace alternation", () => {
    const re = globToRegExp("src/**/*.{ts,js}");
    expect(re.test("src/a.ts")).toBe(true);
    expect(re.test("src/a.js")).toBe(true);
    expect(re.test("src/a.css")).toBe(false);
  });
});

describe("findPackageJson / findLicenseFile / expandGlobs", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "lac-lic-pkg-"));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("walks up to the nearest package.json", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "root", license: "MIT", author: "A" }));
    mkdirSync(join(root, "src", "deep"), { recursive: true });
    const info = findPackageJson(join(root, "src", "deep"));
    expect(info?.name).toBe("root");
    expect(info?.license).toBe("MIT");
    expect(info?.author).toBe("A");
  });

  it("finds a LICENSE file case-insensitively", () => {
    writeFileSync(join(root, "LICENSE.md"), "MIT License");
    expect(findLicenseFile(root)).toBe(join(root, "LICENSE.md"));
  });

  it("expands globs against the filesystem", () => {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "a.ts"), "");
    writeFileSync(join(root, "src", "b.js"), "");
    writeFileSync(join(root, "src", "c.css"), "");
    const files = expandGlobs(["src/**/*.{ts,js}"], root);
    expect(files.length).toBe(2);
    expect(files.some((f) => f.endsWith("a.ts"))).toBe(true);
    expect(files.some((f) => f.endsWith("c.css"))).toBe(false);
  });
});
