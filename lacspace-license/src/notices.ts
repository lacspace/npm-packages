import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { readPackageJson, licenseId, authorName } from "./pkg.js";

/** One dependency discovered in node_modules. */
export interface DependencyNotice {
  name: string;
  version: string;
  license: string;
  author?: string;
  repository?: string;
  /** Best-effort bundled licence text from the package's LICENSE file. */
  licenseText?: string;
}

/** Options for scanning node_modules. */
export interface NoticesOptions {
  /** node_modules directory (default: <cwd>/node_modules). */
  modulesDir?: string;
  /** The root package.json path, used for --prod filtering. */
  rootPackage?: string;
  /** Only include production dependencies (walk root.dependencies transitively). */
  prod?: boolean;
  /** Include the bundled licence text of each package (default true). */
  includeText?: boolean;
}

const LICENSE_FILE_RE = /^licen[sc]e(\.(md|txt|rst))?$/i;

function readLicenseText(pkgDir: string): string | undefined {
  try {
    for (const name of readdirSync(pkgDir)) {
      if (LICENSE_FILE_RE.test(name)) {
        const p = join(pkgDir, name);
        if (statSync(p).isFile()) return readFileSync(p, "utf8").trim();
      }
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function listPackageDirs(modulesDir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(modulesDir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === ".bin" || name === ".cache" || name.startsWith(".")) continue;
    const full = join(modulesDir, name);
    if (!safeIsDir(full)) continue;
    if (name.startsWith("@")) {
      // scoped: one level deeper
      for (const sub of safeReaddir(full)) {
        const scopedDir = join(full, sub);
        if (safeIsDir(scopedDir)) out.push(scopedDir);
      }
    } else {
      out.push(full);
    }
  }
  return out;
}

function safeIsDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
function safeReaddir(p: string): string[] {
  try {
    return readdirSync(p);
  } catch {
    return [];
  }
}

/** Compute the set of production dependency names reachable from a root package. */
function prodDependencyNames(rootPackagePath: string, modulesDir: string): Set<string> {
  const result = new Set<string>();
  const root = readPackageJson(rootPackagePath);
  if (!root) return result;
  const seed = collectDeps(root.raw, ["dependencies", "optionalDependencies", "peerDependencies"]);
  const queue = [...seed];
  while (queue.length) {
    const name = queue.shift()!;
    if (result.has(name)) continue;
    result.add(name);
    const info = readPackageJson(join(modulesDir, ...name.split("/"), "package.json"));
    if (!info) continue;
    for (const dep of collectDeps(info.raw, ["dependencies", "optionalDependencies"])) {
      if (!result.has(dep)) queue.push(dep);
    }
  }
  return result;
}

function collectDeps(raw: Record<string, unknown>, keys: string[]): string[] {
  const out: string[] = [];
  for (const key of keys) {
    const obj = raw[key];
    if (obj && typeof obj === "object") out.push(...Object.keys(obj as Record<string, unknown>));
  }
  return out;
}

/**
 * Scan a node_modules tree and collect a licence notice for every installed
 * package. Zero network — purely reads the files on disk.
 */
export function scanDependencies(opts: NoticesOptions = {}): DependencyNotice[] {
  const modulesDir = opts.modulesDir ?? join(process.cwd(), "node_modules");
  const includeText = opts.includeText !== false;
  const prodOnly = opts.prod === true;
  const prodSet = prodOnly && opts.rootPackage
    ? prodDependencyNames(opts.rootPackage, modulesDir)
    : null;

  const notices: DependencyNotice[] = [];
  for (const dir of listPackageDirs(modulesDir)) {
    const info = readPackageJson(join(dir, "package.json"));
    if (!info || !info.name) continue;
    if (prodSet && !prodSet.has(info.name)) continue;
    const repo = info.raw.repository;
    let repository: string | undefined;
    if (typeof repo === "string") repository = repo;
    else if (repo && typeof repo === "object" && typeof (repo as Record<string, unknown>).url === "string") {
      repository = (repo as Record<string, unknown>).url as string;
    }
    const notice: DependencyNotice = {
      name: info.name,
      version: info.version ?? "0.0.0",
      license: licenseId(info.raw.license) ?? licenseId(info.raw.licenses) ?? "UNKNOWN",
      ...(authorName(info.raw.author) ? { author: authorName(info.raw.author)! } : {}),
      ...(repository ? { repository } : {}),
    };
    if (includeText) {
      const text = readLicenseText(dir);
      if (text) notice.licenseText = text;
    }
    notices.push(notice);
  }
  notices.sort((a, b) => a.name.localeCompare(b.name));
  return notices;
}

/** Group notices by their licence id. */
export function groupByLicense(notices: DependencyNotice[]): Map<string, DependencyNotice[]> {
  const groups = new Map<string, DependencyNotice[]>();
  for (const n of notices) {
    const key = n.license || "UNKNOWN";
    const arr = groups.get(key) ?? [];
    arr.push(n);
    groups.set(key, arr);
  }
  return new Map([...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

/** Output format for a notices document. */
export type NoticesFormat = "md" | "txt";

/**
 * Render a THIRD-PARTY-NOTICES document (Markdown or plain text) from a set of
 * dependency notices, grouped by licence.
 */
export function renderNotices(
  notices: DependencyNotice[],
  opts: { format?: NoticesFormat; includeText?: boolean; title?: string } = {},
): string {
  const format = opts.format ?? "md";
  const includeText = opts.includeText !== false;
  const title = opts.title ?? "Third-Party Notices";
  const groups = groupByLicense(notices);
  const lines: string[] = [];

  if (format === "md") {
    lines.push(`# ${title}`, "");
    lines.push(
      `This product bundles the following third-party packages. ${notices.length} ` +
      `package${notices.length === 1 ? "" : "s"}, ${groups.size} licence${groups.size === 1 ? "" : "s"}.`,
      "",
    );
    for (const [license, deps] of groups) {
      lines.push(`## ${license}`, "");
      for (const d of deps) {
        lines.push(`- **${d.name}** \`${d.version}\`${d.author ? ` — ${d.author}` : ""}`);
      }
      lines.push("");
      if (includeText) {
        for (const d of deps) {
          if (!d.licenseText) continue;
          lines.push(`<details><summary>${d.name}@${d.version} — licence text</summary>`, "", "```", d.licenseText, "```", "", "</details>", "");
        }
      }
    }
  } else {
    lines.push(title, "=".repeat(title.length), "");
    lines.push(`${notices.length} packages, ${groups.size} licences.`, "");
    for (const [license, deps] of groups) {
      lines.push(license, "-".repeat(license.length));
      for (const d of deps) {
        lines.push(`  ${d.name}@${d.version}${d.author ? ` (${d.author})` : ""}`);
      }
      lines.push("");
      if (includeText) {
        for (const d of deps) {
          if (!d.licenseText) continue;
          lines.push(`--- ${d.name}@${d.version} ---`, d.licenseText, "");
        }
      }
    }
  }
  return lines.join("\n").replace(/\n+$/g, "") + "\n";
}
