// Test-only helper: build a tiny fake project (package.json + node_modules +
// lockfile + source) in a temp dir so the fs-based engine can be exercised
// without touching the real project. Not part of the published API.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface FakePkg {
  version: string;
  license?: unknown;
  licenses?: unknown;
  dependencies?: Record<string, string>;
  /** Extra files: relative path within the package dir → contents. */
  files?: Record<string, string>;
  /** Nested node_modules packages (for duplicate/transitive tests). */
  nested?: Record<string, FakePkg>;
}

export interface FakeProject {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  /** Installed packages keyed by name (may be scoped). */
  installed?: Record<string, FakePkg>;
  /** Source files: relative path → contents. */
  source?: Record<string, string>;
  /** Lockfile contents to write: filename → contents. */
  lockfiles?: Record<string, string>;
}

function writePkg(dir: string, name: string, pkg: FakePkg): void {
  const pkgDir = join(dir, ...name.split("/"));
  mkdirSync(pkgDir, { recursive: true });
  const manifest: Record<string, unknown> = { name, version: pkg.version };
  if (pkg.license !== undefined) manifest.license = pkg.license;
  if (pkg.licenses !== undefined) manifest.licenses = pkg.licenses;
  if (pkg.dependencies) manifest.dependencies = pkg.dependencies;
  writeFileSync(join(pkgDir, "package.json"), JSON.stringify(manifest));
  for (const [rel, content] of Object.entries(pkg.files ?? {})) {
    const f = join(pkgDir, rel);
    mkdirSync(join(f, ".."), { recursive: true });
    writeFileSync(f, content);
  }
  if (pkg.nested) {
    const nm = join(pkgDir, "node_modules");
    for (const [n, p] of Object.entries(pkg.nested)) writePkg(nm, n, p);
  }
}

/** Create a fake project on disk; returns the dir + a cleanup fn. */
export function makeProject(spec: FakeProject): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "lacdeps-"));
  const manifest: Record<string, unknown> = {
    name: spec.name ?? "fixture-app",
    version: spec.version ?? "1.0.0",
  };
  if (spec.dependencies) manifest.dependencies = spec.dependencies;
  if (spec.devDependencies) manifest.devDependencies = spec.devDependencies;
  if (spec.peerDependencies) manifest.peerDependencies = spec.peerDependencies;
  if (spec.optionalDependencies) manifest.optionalDependencies = spec.optionalDependencies;
  writeFileSync(join(dir, "package.json"), JSON.stringify(manifest, null, 2));

  if (spec.installed) {
    const nm = join(dir, "node_modules");
    mkdirSync(nm, { recursive: true });
    for (const [name, pkg] of Object.entries(spec.installed)) writePkg(nm, name, pkg);
  }
  for (const [rel, content] of Object.entries(spec.source ?? {})) {
    const f = join(dir, rel);
    mkdirSync(join(f, ".."), { recursive: true });
    writeFileSync(f, content);
  }
  for (const [file, content] of Object.entries(spec.lockfiles ?? {})) {
    writeFileSync(join(dir, file), content);
  }

  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
