import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { globToRegExp, matchGlob, isGlob, walkDir, splitGlobBase, resolveInputs } from "./walk.js";

describe("isGlob", () => {
  it("detects glob metacharacters", () => {
    expect(isGlob("src/*.js")).toBe(true);
    expect(isGlob("a?b")).toBe(true);
    expect(isGlob("dist/app.js")).toBe(false);
  });
});

describe("globToRegExp / matchGlob", () => {
  it("* matches within a segment only", () => {
    expect(matchGlob("*.js", "app.js")).toBe(true);
    expect(matchGlob("*.js", "sub/app.js")).toBe(false);
  });

  it("** matches across segments", () => {
    expect(matchGlob("**/*.js", "app.js")).toBe(true);
    expect(matchGlob("**/*.js", "a/b/app.js")).toBe(true);
    expect(matchGlob("src/**/*.css", "src/x/y/z.css")).toBe(true);
  });

  it("? matches one non-slash char", () => {
    expect(matchGlob("a?c", "abc")).toBe(true);
    expect(matchGlob("a?c", "a/c")).toBe(false);
  });

  it("character classes work", () => {
    expect(matchGlob("file.[jt]s", "file.js")).toBe(true);
    expect(matchGlob("file.[jt]s", "file.ts")).toBe(true);
    expect(matchGlob("file.[jt]s", "file.cs")).toBe(false);
  });

  it("escapes regex specials in literals", () => {
    expect(globToRegExp("a.b+c").test("a.b+c")).toBe(true);
    expect(globToRegExp("a.b+c").test("axbxc")).toBe(false);
  });
});

describe("splitGlobBase", () => {
  it("splits a base directory from the glob remainder", () => {
    expect(splitGlobBase("src/**/*.js")).toEqual({ base: "src", pattern: "**/*.js" });
    expect(splitGlobBase("*.js")).toEqual({ base: ".", pattern: "*.js" });
  });
});

describe("walkDir + resolveInputs", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "lsize-walk-"));
    mkdirSync(join(dir, "dist"));
    mkdirSync(join(dir, "dist", "sub"));
    mkdirSync(join(dir, "dist", "node_modules"));
    mkdirSync(join(dir, "dist", ".cache"));
    writeFileSync(join(dir, "dist", "app.js"), "a");
    writeFileSync(join(dir, "dist", "app.js.map"), "map");
    writeFileSync(join(dir, "dist", "style.css"), "b");
    writeFileSync(join(dir, "dist", "sub", "chunk.js"), "c");
    writeFileSync(join(dir, "dist", "node_modules", "dep.js"), "d");
    writeFileSync(join(dir, "dist", ".cache", "x.js"), "e");
    writeFileSync(join(dir, "dist", ".env"), "secret");
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("walks a dir, skipping node_modules, dotfiles and .map by default", () => {
    const files = walkDir(join(dir, "dist")).map((f) => f.split("/").pop()).sort();
    expect(files).toContain("app.js");
    expect(files).toContain("style.css");
    expect(files).toContain("chunk.js");
    expect(files).not.toContain("app.js.map");
    expect(files).not.toContain("dep.js");
    expect(files).not.toContain("x.js");
    expect(files).not.toContain(".env");
  });

  it("opts in to maps, hidden and node_modules", () => {
    const files = walkDir(join(dir, "dist"), {
      includeMaps: true, includeHidden: true, includeNodeModules: true,
    }).map((f) => f.split("/").pop());
    expect(files).toContain("app.js.map");
    expect(files).toContain("dep.js");
    expect(files).toContain(".env");
  });

  it("resolveInputs expands a directory to cwd-relative paths", () => {
    const files = resolveInputs(["dist"], dir);
    expect(files).toContain("dist/app.js");
    expect(files).toContain("dist/sub/chunk.js");
    expect(files).not.toContain("dist/app.js.map");
  });

  it("resolveInputs matches a glob", () => {
    const files = resolveInputs(["dist/**/*.js"], dir);
    expect(files.sort()).toEqual(["dist/app.js", "dist/sub/chunk.js"]);
  });

  it("resolveInputs de-dupes overlapping inputs", () => {
    const files = resolveInputs(["dist", "dist/app.js"], dir);
    const appJs = files.filter((f) => f === "dist/app.js");
    expect(appJs.length).toBe(1);
  });

  it("resolveInputs honours an explicit .map file even though it's skipped by walk", () => {
    const files = resolveInputs(["dist/app.js.map"], dir);
    expect(files).toEqual(["dist/app.js.map"]);
  });
});
