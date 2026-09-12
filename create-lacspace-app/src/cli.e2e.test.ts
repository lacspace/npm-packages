import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, symlinkSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

// The published CLI is `dist/index.js`, and every package manager installs a bin
// as a SYMLINK (node_modules/.bin/create-lacspace-app -> ../create-lacspace-app/dist/index.js).
// Node resolves that symlink before setting import.meta.url, so a naive
// `import.meta.url === pathToFileURL(argv[1]).href` guard is ALWAYS false under
// `npx` / `npm i -g` and the CLI exits 0 having done nothing (regression in 2.2.0,
// fixed in 2.13.1). These tests run the real built bin through a symlink so that
// failure mode can never ship again.

const pkgRoot = resolve(fileURLToPath(import.meta.url), "..", "..");
const bin = join(pkgRoot, "dist", "index.js");

function run(cmd: string, args: string[], cwd: string): { out: string; code: number } {
  try {
    const out = execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { out, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { out: `${e.stdout ?? ""}${e.stderr ?? ""}`, code: e.status ?? 1 };
  }
}

describe("create-lacspace-app bin", () => {
  beforeAll(() => {
    if (!existsSync(bin)) execFileSync("npm", ["run", "build"], { cwd: pkgRoot, stdio: "ignore" });
  }, 300_000);

  it("scaffolds when invoked through a symlinked bin (the npx path)", () => {
    const dir = mkdtempSync(join(tmpdir(), "cla-symlink-"));
    try {
      mkdirSync(join(dir, ".bin"));
      const link = join(dir, ".bin", "create-lacspace-app");
      symlinkSync(bin, link);

      const { out, code } = run(process.execPath, [link, "sym-app", "--template", "portfolio", "--yes"], dir);

      expect(code).toBe(0);
      expect(out).not.toBe("");
      expect(existsSync(join(dir, "sym-app", "package.json"))).toBe(true);
      expect(existsSync(join(dir, "sym-app", "app", "page.tsx"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("scaffolds when invoked by its real path", () => {
    const dir = mkdtempSync(join(tmpdir(), "cla-direct-"));
    try {
      const { code } = run(process.execPath, [bin, "direct-app", "--template", "blog", "--yes"], dir);
      expect(code).toBe(0);
      expect(existsSync(join(dir, "direct-app", "package.json"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("prints help and version instead of scaffolding", () => {
    const dir = mkdtempSync(join(tmpdir(), "cla-help-"));
    try {
      const help = run(process.execPath, [bin, "--help"], dir);
      expect(help.code).toBe(0);
      expect(help.out.toLowerCase()).toContain("create-lacspace-app");

      const version = run(process.execPath, [bin, "--version"], dir);
      expect(version.code).toBe(0);
      expect(version.out).toMatch(/^create-lacspace-app \d+\.\d+\.\d+/);
      // --version must never scaffold anything.
      expect(existsSync(join(dir, "my-app"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("importing the library entry has no side effects", () => {
    const dir = mkdtempSync(join(tmpdir(), "cla-lib-"));
    try {
      const libEsm = join(pkgRoot, "dist", "lib.js");
      const code = `import("${libEsm.replace(/\\/g, "\\\\")}").then((m) => { console.log(typeof m.generateProject); });`;
      const { out } = run(process.execPath, ["--input-type=module", "-e", code], dir);
      expect(out.trim()).toBe("function");
      // Importing must never scaffold anything into the cwd.
      expect(existsSync(join(dir, "package.json"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
