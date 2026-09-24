import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, symlinkSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

// This CLI has no unit-testable surface: nothing is exported and main() runs on
// import. Adding a main-module guard to change that would re-introduce the exact
// mechanism that silently killed create-lacspace-app 2.2.0-2.13.0 under npx (a
// bin is installed as a SYMLINK, Node resolves it before setting
// import.meta.url, so a naive guard is always false and the CLI exits 0 having
// done nothing). So we drive the real built bin as a black box instead, through
// a symlink, which tests exactly what a user gets from `npx`.

const pkgRoot = resolve(fileURLToPath(import.meta.url), "..", "..");
const bin = join(pkgRoot, "dist", "index.js");

function run(args: string[], cwd: string): { out: string; code: number } {
  try {
    const out = execFileSync(process.execPath, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { out, code: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return { out: `${e.stdout ?? ""}${e.stderr ?? ""}`, code: e.status ?? 1 };
  }
}

/** A directory that looks enough like a Next App Router project to scaffold into. */
function nextFixture(prefix: string, opts: { src?: boolean; next?: boolean; app?: boolean } = {}): string {
  const { src = false, next = true, app = true } = opts;
  const dir = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "fixture", private: true, ...(next ? { dependencies: { next: "15.0.0" } } : {}) }),
  );
  if (app) mkdirSync(join(dir, src ? "src/app" : "app"), { recursive: true });
  return dir;
}

const ok = ["--yes", "--name", "Acme", "--url", "https://acme.com"];

describe("create-lacspace-seo bin", () => {
  beforeAll(() => {
    if (!existsSync(bin)) execFileSync("npm", ["run", "build"], { cwd: pkgRoot, stdio: "ignore" });
  }, 300_000);

  it("scaffolds when invoked through a symlinked bin (the npx path)", () => {
    const dir = nextFixture("cls-symlink-");
    try {
      mkdirSync(join(dir, ".bin"));
      const link = join(dir, ".bin", "create-lacspace-seo");
      symlinkSync(bin, link);

      const { out, code } = run([link, ...ok], dir);

      expect(code).toBe(0);
      expect(out).not.toBe("");
      expect(existsSync(join(dir, "lib", "site.ts"))).toBe(true);
      expect(existsSync(join(dir, "app", "robots.txt", "route.ts"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("writes all six files and threads name + url into site.ts", () => {
    const dir = nextFixture("cls-files-");
    try {
      const { code } = run([bin, ...ok], dir);
      expect(code).toBe(0);
      for (const rel of [
        "lib/site.ts",
        "app/robots.txt/route.ts",
        "app/sitemap.xml/route.ts",
        "app/feed.xml/route.ts",
        "app/llms.txt/route.ts",
        "app/og/route.tsx",
      ]) {
        expect(existsSync(join(dir, rel)), rel).toBe(true);
      }
      const site = readFileSync(join(dir, "lib", "site.ts"), "utf8");
      expect(site).toContain('name: "Acme"');
      expect(site).toContain('url: "https://acme.com"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("follows a src/ layout when the project uses one", () => {
    const dir = nextFixture("cls-src-", { src: true });
    try {
      const { code } = run([bin, ...ok], dir);
      expect(code).toBe(0);
      expect(existsSync(join(dir, "src", "lib", "site.ts"))).toBe(true);
      expect(existsSync(join(dir, "src", "app", "robots.txt", "route.ts"))).toBe(true);
      // and must NOT have created a top-level app/ or lib/
      expect(existsSync(join(dir, "app"))).toBe(false);
      expect(existsSync(join(dir, "lib"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  // Regression: the og route shipped `export const runtime = "edge"`, which
  // Next 16 deprecates ("The Edge Runtime is deprecated") and which also opted
  // the route out of static generation. next/og runs fine on the Node runtime.
  it("generates an og route with no deprecated edge-runtime declaration", () => {
    const dir = nextFixture("cls-og-");
    try {
      run([bin, ...ok], dir);
      const og = readFileSync(join(dir, "app", "og", "route.tsx"), "utf8");
      expect(og).toContain("ImageResponse");
      expect(og).not.toMatch(/export\s+const\s+runtime\s*=/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("--no-og skips the og route but still writes the rest", () => {
    const dir = nextFixture("cls-noog-");
    try {
      const { code } = run([bin, ...ok, "--no-og"], dir);
      expect(code).toBe(0);
      expect(existsSync(join(dir, "app", "og", "route.tsx"))).toBe(false);
      expect(existsSync(join(dir, "app", "robots.txt", "route.ts"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("never overwrites an existing file unless --force is given", () => {
    const dir = nextFixture("cls-force-");
    try {
      mkdirSync(join(dir, "lib"), { recursive: true });
      writeFileSync(join(dir, "lib", "site.ts"), "// MINE\n");

      const first = run([bin, ...ok], dir);
      expect(first.code).toBe(0);
      expect(readFileSync(join(dir, "lib", "site.ts"), "utf8")).toBe("// MINE\n");
      expect(first.out).toContain("--force");

      const second = run([bin, ...ok, "--force"], dir);
      expect(second.code).toBe(0);
      expect(readFileSync(join(dir, "lib", "site.ts"), "utf8")).toContain('name: "Acme"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("accepts --name=value as well as --name value", () => {
    const dir = nextFixture("cls-eq-");
    try {
      const { code } = run([bin, "--yes", "--name=Equals Co", "--url=https://eq.test"], dir);
      expect(code).toBe(0);
      const site = readFileSync(join(dir, "lib", "site.ts"), "utf8");
      expect(site).toContain('name: "Equals Co"');
      expect(site).toContain('url: "https://eq.test"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("escapes quotes in the site name instead of emitting broken TypeScript", () => {
    const dir = nextFixture("cls-esc-");
    try {
      const { code } = run([bin, "--yes", '--name=Big "Quoted" Co', "--url=https://q.test"], dir);
      expect(code).toBe(0);
      const site = readFileSync(join(dir, "lib", "site.ts"), "utf8");
      expect(site).toContain('\\"Quoted\\"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it("fails with a clear message when --yes has no --name/--url", () => {
    const dir = nextFixture("cls-missing-");
    try {
      const { out, code } = run([bin, "--yes"], dir);
      expect(code).toBe(1);
      expect(out).toContain("--name and --url are required");
      expect(existsSync(join(dir, "lib", "site.ts"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("refuses a directory with no next dependency", () => {
    const dir = nextFixture("cls-notnext-", { next: false });
    try {
      const { out, code } = run([bin, ...ok], dir);
      expect(code).toBe(1);
      expect(out).toContain("next");
      expect(existsSync(join(dir, "lib", "site.ts"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("refuses a Next project with no app/ directory", () => {
    const dir = nextFixture("cls-noapp-", { app: false });
    try {
      const { out, code } = run([bin, ...ok], dir);
      expect(code).toBe(1);
      expect(out).toContain("app/");
      expect(existsSync(join(dir, "lib", "site.ts"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it("prints help and scaffolds nothing", () => {
    const dir = nextFixture("cls-help-");
    try {
      const { out, code } = run([bin, "--help"], dir);
      expect(code).toBe(0);
      expect(out).toContain("create-lacspace-seo");
      expect(existsSync(join(dir, "lib"))).toBe(false);
      expect(existsSync(join(dir, "app", "robots.txt"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
