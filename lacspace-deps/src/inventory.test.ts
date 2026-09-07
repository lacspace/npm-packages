import { describe, it, expect, afterEach } from "vitest";
import {
  buildInventory,
  normalizeLicense,
  collectDeclared,
  detectLockfile,
  parseYarnLockDirect,
  parsePnpmLockDirect,
} from "./inventory.js";
import { makeProject } from "./_fixture.js";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe("normalizeLicense", () => {
  it("handles string, {type}, and legacy licenses[]", () => {
    expect(normalizeLicense({ license: "MIT" })).toBe("MIT");
    expect(normalizeLicense({ license: { type: "ISC" } })).toBe("ISC");
    expect(normalizeLicense({ licenses: [{ type: "MIT" }] })).toBe("MIT");
    expect(normalizeLicense({ licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] })).toBe("(MIT OR Apache-2.0)");
    expect(normalizeLicense({})).toBeNull();
  });
});

describe("collectDeclared", () => {
  it("collects all four dependency kinds with type tags", () => {
    const declared = collectDeclared({
      dependencies: { a: "^1" },
      devDependencies: { b: "^2" },
      peerDependencies: { c: "^3" },
      optionalDependencies: { d: "^4" },
    });
    expect(declared).toHaveLength(4);
    expect(declared.find((x) => x.name === "b")!.type).toBe("dev");
    expect(declared.find((x) => x.name === "c")!.type).toBe("peer");
  });
});

describe("detectLockfile", () => {
  it("detects an npm v3 lockfile", () => {
    const { dir, cleanup } = makeProject({
      lockfiles: { "package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: {} }) },
    });
    cleanups.push(cleanup);
    expect(detectLockfile(dir)).toBe("npm-v3");
  });
  it("detects a yarn lockfile", () => {
    const { dir, cleanup } = makeProject({ lockfiles: { "yarn.lock": "# yarn\n" } });
    cleanups.push(cleanup);
    expect(detectLockfile(dir)).toBe("yarn");
  });
  it("returns none when no lockfile is present", () => {
    const { dir, cleanup } = makeProject({});
    cleanups.push(cleanup);
    expect(detectLockfile(dir)).toBe("none");
  });
});

describe("parseYarnLockDirect", () => {
  it("extracts name→version from yarn v1 blocks", () => {
    const text = `
lodash@^4.17.0:
  version "4.17.21"
  resolved "https://registry.yarnpkg.com/lodash/-/lodash-4.17.21.tgz"

"@scope/pkg@^1.2.0":
  version "1.2.3"
`;
    const map = parseYarnLockDirect(text);
    expect(map.get("lodash")).toBe("4.17.21");
    expect(map.get("@scope/pkg")).toBe("1.2.3");
  });
});

describe("parsePnpmLockDirect", () => {
  it("extracts name@version keys", () => {
    const text = `
packages:

  /lodash@4.17.21:
    resolution: {integrity: sha512-x}

  /@scope/pkg@1.2.3:
    resolution: {integrity: sha512-y}
`;
    const map = parsePnpmLockDirect(text);
    expect(map.get("lodash")).toBe("4.17.21");
    expect(map.get("@scope/pkg")).toBe("1.2.3");
  });
});

describe("buildInventory (fs)", () => {
  it("scans node_modules for installed packages incl. scoped + nested", () => {
    const { dir, cleanup } = makeProject({
      name: "app",
      dependencies: { "@scope/lib": "^1.0.0", foo: "^1.0.0" },
      devDependencies: { tool: "^1.0.0" },
      installed: {
        "@scope/lib": { version: "1.2.0", license: "MIT" },
        foo: {
          version: "1.0.0",
          license: "Apache-2.0",
          nested: { bar: { version: "2.0.0", license: "ISC" } },
        },
        tool: { version: "1.0.0", license: "BSD-3-Clause" },
      },
      lockfiles: { "package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: {} }) },
    });
    cleanups.push(cleanup);
    const inv = buildInventory(dir);
    expect(inv.projectName).toBe("app");
    expect(inv.lockfileType).toBe("npm-v3");
    expect(inv.hasNodeModules).toBe(true);
    const names = inv.installed.map((p) => p.name).sort();
    expect(names).toEqual(["@scope/lib", "bar", "foo", "tool"]);
    const scoped = inv.installed.find((p) => p.name === "@scope/lib")!;
    expect(scoped.direct).toBe(true);
    expect(scoped.license).toBe("MIT");
    const nested = inv.installed.find((p) => p.name === "bar")!;
    expect(nested.depth).toBe(1);
    expect(nested.direct).toBe(false);
    const tool = inv.installed.find((p) => p.name === "tool")!;
    expect(tool.dev).toBe(true);
  });

  it("honours --prod by dropping devDependencies", () => {
    const { dir, cleanup } = makeProject({
      dependencies: { a: "^1" },
      devDependencies: { b: "^1" },
    });
    cleanups.push(cleanup);
    const inv = buildInventory(dir, { prod: true });
    expect(inv.declared.map((d) => d.name)).toEqual(["a"]);
  });

  it("throws a clear error when package.json is missing", () => {
    const { dir, cleanup } = makeProject({});
    cleanups.push(cleanup);
    // remove the package.json by pointing at a subdir with none
    expect(() => buildInventory(`${dir}/nope`)).toThrow(/package\.json/);
  });
});
