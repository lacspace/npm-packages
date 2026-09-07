import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanDependencies, groupByLicense, renderNotices } from "./notices.js";

let root: string;
let modulesDir: string;

function pkg(dir: string, json: Record<string, unknown>, licenseText?: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify(json));
  if (licenseText) writeFileSync(join(dir, "LICENSE"), licenseText);
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "lac-lic-notices-"));
  modulesDir = join(root, "node_modules");
  writeFileSync(join(root, "package.json"), JSON.stringify({
    name: "root", version: "1.0.0",
    dependencies: { alpha: "^1.0.0", "@scope/beta": "^2.0.0" },
    devDependencies: { gamma: "^3.0.0" },
  }));
  pkg(join(modulesDir, "alpha"), { name: "alpha", version: "1.2.3", license: "MIT", author: "Ann" }, "MIT License\n...");
  pkg(join(modulesDir, "@scope", "beta"), { name: "@scope/beta", version: "2.0.0", license: "Apache-2.0" }, "Apache License 2.0\n...");
  pkg(join(modulesDir, "gamma"), { name: "gamma", version: "3.1.0", license: "MIT" });
  // a package with a licenses[] array field
  pkg(join(modulesDir, "delta"), { name: "delta", version: "0.1.0", licenses: [{ type: "ISC" }] });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("scanDependencies", () => {
  it("finds every installed package, including scoped ones", () => {
    const deps = scanDependencies({ modulesDir });
    const names = deps.map((d) => d.name);
    expect(names).toContain("alpha");
    expect(names).toContain("@scope/beta");
    expect(names).toContain("gamma");
    expect(names).toContain("delta");
  });

  it("reads version, license (string and array), author and bundled text", () => {
    const deps = scanDependencies({ modulesDir });
    const alpha = deps.find((d) => d.name === "alpha")!;
    expect(alpha.version).toBe("1.2.3");
    expect(alpha.license).toBe("MIT");
    expect(alpha.author).toBe("Ann");
    expect(alpha.licenseText).toContain("MIT License");
    const delta = deps.find((d) => d.name === "delta")!;
    expect(delta.license).toBe("ISC");
  });

  it("--prod skips devDependencies", () => {
    const deps = scanDependencies({ modulesDir, rootPackage: join(root, "package.json"), prod: true });
    const names = deps.map((d) => d.name);
    expect(names).toContain("alpha");
    expect(names).toContain("@scope/beta");
    expect(names).not.toContain("gamma"); // dev only
  });

  it("omits bundled text when includeText is false", () => {
    const deps = scanDependencies({ modulesDir, includeText: false });
    expect(deps.every((d) => d.licenseText === undefined)).toBe(true);
  });
});

describe("groupByLicense + renderNotices", () => {
  it("groups by licence id", () => {
    const deps = scanDependencies({ modulesDir });
    const groups = groupByLicense(deps);
    expect(groups.get("MIT")!.map((d) => d.name).sort()).toEqual(["alpha", "gamma"]);
    expect(groups.has("Apache-2.0")).toBe(true);
    expect(groups.has("ISC")).toBe(true);
  });

  it("renders a markdown document", () => {
    const deps = scanDependencies({ modulesDir });
    const md = renderNotices(deps, { format: "md" });
    expect(md).toContain("# Third-Party Notices");
    expect(md).toContain("## MIT");
    expect(md).toContain("**alpha** `1.2.3`");
    expect(md.endsWith("\n")).toBe(true);
  });

  it("renders a plain-text document", () => {
    const deps = scanDependencies({ modulesDir });
    const txt = renderNotices(deps, { format: "txt", includeText: false });
    expect(txt).toContain("Third-Party Notices");
    expect(txt).toContain("alpha@1.2.3");
    expect(txt).not.toContain("**");
  });
});
