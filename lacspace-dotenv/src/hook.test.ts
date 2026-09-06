import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hookScript, installHook, HOOK_MARKER } from "./hook.js";

describe("hookScript", () => {
  it("runs the strict lint on staged .env files and carries our marker", () => {
    const s = hookScript();
    expect(s.startsWith("#!/bin/sh")).toBe(true);
    expect(s).toContain(HOOK_MARKER);
    expect(s).toContain("lacspace-dotenv lint --deny-secrets");
    expect(s).toContain("git diff --cached");
  });
});

describe("installHook", () => {
  it("writes an executable pre-commit hook into .git/hooks", () => {
    const repo = mkdtempSync(join(tmpdir(), "lsdotenv-"));
    mkdirSync(join(repo, ".git"));
    const { path, replaced } = installHook({ cwd: repo });
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toContain(HOOK_MARKER);
    expect(statSync(path).mode & 0o100).toBeTruthy(); // owner-executable
    expect(replaced).toBe(false);
  });

  it("refuses to clobber a foreign hook unless forced", () => {
    const repo = mkdtempSync(join(tmpdir(), "lsdotenv-"));
    mkdirSync(join(repo, ".git", "hooks"), { recursive: true });
    writeFileSync(join(repo, ".git", "hooks", "pre-commit"), "#!/bin/sh\necho mine\n");
    expect(() => installHook({ cwd: repo })).toThrow(/already exists/);
    const { replaced } = installHook({ cwd: repo, force: true });
    expect(replaced).toBe(true);
  });

  it("throws when there is no .git directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "lsdotenv-"));
    expect(() => installHook({ cwd: dir })).toThrow(/git/);
  });
});
