import { describe, it, expect, afterEach } from "vitest";
import { audit, healthScore, shouldFail } from "./audit.js";
import type { AuditReport } from "./audit.js";
import { renderHuman, renderMarkdown, makeColor } from "./format.js";
import { makeProject } from "./_fixture.js";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function fixtureProject() {
  return makeProject({
    name: "demo-app",
    version: "1.0.0",
    dependencies: { good: "^1.0.0", copyleft: "^1.0.0", stale: "^1.0.0" },
    devDependencies: { unusedTool: "^1.0.0" },
    installed: {
      good: { version: "1.0.0", license: "MIT", files: { "i.js": "a".repeat(100) } },
      copyleft: { version: "2.0.0", license: "GPL-3.0", files: { "i.js": "b".repeat(50) } },
      stale: { version: "1.0.0", license: "ISC", files: { "i.js": "c".repeat(20) } },
      unusedTool: { version: "1.0.0", license: "MIT", files: { "i.js": "d".repeat(10) } },
      dup: { version: "1.0.0", license: "MIT", nested: {} },
    },
    source: {
      "src/index.ts": `import { g } from "good";\nimport { c } from "copyleft";\nimport { s } from "stale";\nimport { m } from "phantom";\n`,
    },
    lockfiles: { "package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: {} }) },
  });
}

describe("audit (full, offline)", () => {
  it("produces a complete report over a fixture project", async () => {
    const { dir, cleanup } = fixtureProject();
    cleanups.push(cleanup);
    const r = await audit(dir, { policy: { deny: ["GPL-*"] } });

    expect(r.projectName).toBe("demo-app");
    expect(r.lockfileType).toBe("npm-v3");
    expect(r.counts.declared).toBe(4);

    // licences
    expect(r.licenses.totals.permissive).toBeGreaterThanOrEqual(2);
    expect(r.licenses.totals["strong-copyleft"]).toBe(1);
    expect(r.licenses.violations.map((v) => v.name)).toContain("copyleft");

    // size
    expect(r.size.totalBytes).toBeGreaterThan(0);
    expect(r.size.entries[0]!.bytes).toBeGreaterThanOrEqual(r.size.entries.at(-1)!.bytes);

    // unused / missing
    expect(r.usage.unused).toContain("unusedTool");
    expect(r.usage.missing).toContain("phantom");
    expect(r.usage.missing).not.toContain("demo-app");

    // no network → no outdated section
    expect(r.outdated).toBeUndefined();
  });

  it("skips devDependencies under --prod", async () => {
    const { dir, cleanup } = fixtureProject();
    cleanups.push(cleanup);
    const r = await audit(dir, { prod: true });
    expect(r.counts.declared).toBe(3);
    // unusedTool is a devDep → not in the declared set now, so not "unused"
    expect(r.usage.unused).not.toContain("unusedTool");
  });

  it("runs the outdated check when a mock fetch is supplied", async () => {
    const { dir, cleanup } = fixtureProject();
    cleanups.push(cleanup);
    const fetchImpl = (async (url: string) => {
      const name = decodeURIComponent(url.split("/").pop()!);
      const latest: Record<string, string> = { good: "1.0.0", copyleft: "5.0.0", stale: "1.0.1", unusedTool: "1.0.0", dup: "1.0.0" };
      return { ok: true, status: 200, json: async () => ({ "dist-tags": { latest: latest[name] } }) };
    }) as never;
    const r = await audit(dir, { outdated: { fetchImpl } });
    expect(r.outdated).toBeDefined();
    expect(r.outdated!.majors).toBe(1); // copyleft 2→5
  });
});

describe("healthScore + shouldFail", () => {
  const base: AuditReport = {
    root: "/x", projectName: "x", projectVersion: "1.0.0", lockfileType: "npm-v3",
    hasNodeModules: true,
    counts: { declared: 1, installed: 1, distinct: 1 },
    licenses: { entries: [], totals: { permissive: 0, "weak-copyleft": 0, "strong-copyleft": 0, unknown: 0 }, byLicense: {}, violations: [] },
    size: { entries: [], totalBytes: 0, totalFiles: 0 },
    duplicates: [],
    usage: { imported: [], files: 0, unused: [], missing: [], ignoredTooling: [] },
    health: 0,
  };

  it("a clean report scores 100", () => {
    expect(healthScore(base)).toBe(100);
  });
  it("deducts for violations, missing, duplicates", () => {
    const r: AuditReport = {
      ...base,
      licenses: { ...base.licenses, violations: [{ name: "g", version: "1", license: "GPL-3.0", reason: "deny" }] },
      usage: { ...base.usage, missing: ["x"], unused: ["y"] },
    };
    expect(healthScore(r)).toBeLessThan(100);
  });

  it("shouldFail: licence violations always fail", () => {
    const r: AuditReport = {
      ...base,
      licenses: { ...base.licenses, violations: [{ name: "g", version: "1", license: "GPL-3.0", reason: "deny" }] },
    };
    expect(shouldFail(r, [])).toBe(true);
  });
  it("shouldFail: --fail-on gates the chosen category", () => {
    const r: AuditReport = { ...base, usage: { ...base.usage, unused: ["z"] } };
    expect(shouldFail(r, [])).toBe(false);
    expect(shouldFail(r, ["unused"])).toBe(true);
    expect(shouldFail(r, ["missing"])).toBe(false);
  });
});

describe("renderers", () => {
  it("renderHuman + renderMarkdown produce non-empty output", async () => {
    const { dir, cleanup } = fixtureProject();
    cleanups.push(cleanup);
    const r = await audit(dir, { policy: { deny: ["GPL-*"] }, gzip: true });
    const human = renderHuman(r, makeColor(false));
    expect(human).toContain("lacspace-deps");
    expect(human).toContain("Licences");
    expect(human).toContain("Install size");
    const md = renderMarkdown(r);
    expect(md).toContain("# Dependency audit");
    expect(md).toContain("| Category | Count |");
  });
});
