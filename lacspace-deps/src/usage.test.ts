import { describe, it, expect, afterEach } from "vitest";
import {
  specifierToPackage,
  extractSpecifiers,
  analyzeUsage,
  scanImports,
} from "./usage.js";
import type { DeclaredDep } from "./inventory.js";
import { makeProject } from "./_fixture.js";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe("specifierToPackage", () => {
  it("returns the package name for bare + subpath specifiers", () => {
    expect(specifierToPackage("lodash")).toBe("lodash");
    expect(specifierToPackage("lodash/fp")).toBe("lodash");
    expect(specifierToPackage("@scope/pkg")).toBe("@scope/pkg");
    expect(specifierToPackage("@scope/pkg/sub/deep")).toBe("@scope/pkg");
  });
  it("ignores relative, absolute, alias and protocol specifiers", () => {
    expect(specifierToPackage("./x")).toBeNull();
    expect(specifierToPackage("../../y")).toBeNull();
    expect(specifierToPackage("/abs")).toBeNull();
    expect(specifierToPackage("#internal")).toBeNull();
    expect(specifierToPackage("https://cdn/x.js")).toBeNull();
  });
  it("ignores node builtins with and without the node: prefix", () => {
    expect(specifierToPackage("fs")).toBeNull();
    expect(specifierToPackage("node:fs")).toBeNull();
    expect(specifierToPackage("node:fs/promises")).toBeNull();
    expect(specifierToPackage("path")).toBeNull();
  });
});

describe("extractSpecifiers", () => {
  it("finds import / export-from / require / dynamic-import", () => {
    const src = `
      import a from "alpha";
      import { b } from 'beta/sub';
      export { c } from "gamma";
      const d = require("delta");
      const e = await import("epsilon");
      import "side-effect";
    `;
    const found = extractSpecifiers(src).sort();
    expect(found).toContain("alpha");
    expect(found).toContain("beta/sub");
    expect(found).toContain("gamma");
    expect(found).toContain("delta");
    expect(found).toContain("epsilon");
    expect(found).toContain("side-effect");
  });
});

describe("analyzeUsage (fs)", () => {
  it("detects unused declared deps and missing imported deps", () => {
    const { dir, cleanup } = makeProject({
      name: "app",
      dependencies: { used: "^1.0.0", unusedDep: "^1.0.0", "@scope/lib": "^1.0.0" },
      source: {
        "src/index.ts": `import { x } from "used";\nimport y from "@scope/lib/sub";\nimport z from "not-declared";\n`,
      },
    });
    cleanups.push(cleanup);
    const declared: DeclaredDep[] = [
      { name: "used", range: "^1.0.0", type: "prod" },
      { name: "unusedDep", range: "^1.0.0", type: "prod" },
      { name: "@scope/lib", range: "^1.0.0", type: "prod" },
    ];
    const r = analyzeUsage(dir, declared);
    expect(r.unused).toEqual(["unusedDep"]);
    expect(r.missing).toEqual(["not-declared"]);
    expect(r.imported).toContain("used");
    expect(r.imported).toContain("@scope/lib");
  });

  it("does not flag @types/node or implicit build tooling as unused", () => {
    const { dir, cleanup } = makeProject({
      name: "app",
      devDependencies: { "@types/node": "^20.0.0", typescript: "^5.0.0", tsup: "^8.0.0" },
      source: { "src/i.ts": `import { readFileSync } from "node:fs";\n` },
    });
    cleanups.push(cleanup);
    const declared: DeclaredDep[] = [
      { name: "@types/node", range: "^20.0.0", type: "dev" },
      { name: "typescript", range: "^5.0.0", type: "dev" },
      { name: "tsup", range: "^8.0.0", type: "dev" },
    ];
    const r = analyzeUsage(dir, declared);
    expect(r.unused).toEqual([]);
    expect(r.ignoredTooling).toContain("typescript");
    expect(r.ignoredTooling).toContain("tsup");
  });

  it("skips node_modules/dist when scanning and honours selfName", () => {
    const { dir, cleanup } = makeProject({
      name: "self",
      dependencies: {},
      source: {
        "src/a.ts": `import self from "self";\n`,
        "dist/build.js": `require("should-be-ignored");\n`,
      },
      installed: { junk: { version: "1.0.0", files: { "index.js": `require("ignored-too")` } } },
    });
    cleanups.push(cleanup);
    const r = analyzeUsage(dir, [], { selfName: "self" });
    expect(r.missing).not.toContain("should-be-ignored");
    expect(r.missing).not.toContain("ignored-too");
    expect(r.missing).not.toContain("self");
  });

  it("scanImports counts scanned files", () => {
    const { dir, cleanup } = makeProject({
      name: "app",
      source: { "a.ts": `import "x"`, "b.js": `require("y")` },
    });
    cleanups.push(cleanup);
    const scan = scanImports(dir);
    expect(scan.files).toBe(2);
    expect(scan.imported.sort()).toEqual(["x", "y"]);
  });
});
