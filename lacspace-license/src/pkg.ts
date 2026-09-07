import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, relative, sep } from "node:path";

/** Minimal shape of the fields we read from a package.json. */
export interface PackageInfo {
  path: string;
  name?: string;
  version?: string;
  license?: string;
  author?: string;
  raw: Record<string, unknown>;
}

/** Normalize a package.json `author` (string or object) into a display name. */
export function authorName(author: unknown): string | undefined {
  if (!author) return undefined;
  if (typeof author === "string") {
    // "Name <email> (url)" → "Name"
    const m = author.match(/^([^<(]+)/);
    return (m?.[1] ?? author).trim() || undefined;
  }
  if (typeof author === "object") {
    const name = (author as Record<string, unknown>).name;
    if (typeof name === "string") return name.trim() || undefined;
  }
  return undefined;
}

/** Normalize a package.json `license` field (string, object, or array). */
export function licenseId(license: unknown): string | undefined {
  if (!license) return undefined;
  if (typeof license === "string") return license.trim() || undefined;
  if (Array.isArray(license)) {
    const first = license[0] as Record<string, unknown> | undefined;
    if (first && typeof first.type === "string") return first.type;
  }
  if (typeof license === "object") {
    const type = (license as Record<string, unknown>).type;
    if (typeof type === "string") return type;
  }
  return undefined;
}

/** Read and parse a package.json at an exact path (or null on any failure). */
export function readPackageJson(path: string): PackageInfo | null {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    return {
      path,
      name: typeof raw.name === "string" ? raw.name : undefined,
      version: typeof raw.version === "string" ? raw.version : undefined,
      license: licenseId(raw.license),
      author: authorName(raw.author),
      raw,
    };
  } catch {
    return null;
  }
}

/** Walk up from `startDir` to find the nearest package.json. */
export function findPackageJson(startDir = process.cwd()): PackageInfo | null {
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, "package.json");
    if (existsSync(candidate)) {
      const info = readPackageJson(candidate);
      if (info) return info;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const LICENSE_FILE_RE = /^licen[sc]e(\.(md|txt|rst))?$/i;

/** Find an existing LICENSE file in a directory (LICENSE/LICENCE/.md/.txt). */
export function findLicenseFile(dir = process.cwd()): string | null {
  try {
    for (const name of readdirSync(dir)) {
      if (LICENSE_FILE_RE.test(name)) return join(dir, name);
    }
  } catch {
    /* ignore */
  }
  return null;
}

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".hg", ".svn", "dist", "build", "out", "coverage",
  ".next", ".nuxt", ".cache", ".turbo", "vendor", "__pycache__", ".venv", "venv",
]);

/**
 * Recursively list files under `dir`, skipping common build/vendor folders and
 * dotfolders. Returns absolute paths.
 */
export function walkFiles(dir: string, opts: { ignore?: Set<string> } = {}): string[] {
  const ignore = opts.ignore ?? IGNORE_DIRS;
  const out: string[] = [];
  const visit = (d: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(d, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (ignore.has(name) || (name.startsWith(".") && name !== ".")) continue;
        visit(full);
      } else if (st.isFile()) {
        out.push(full);
      }
    }
  };
  visit(dir);
  return out;
}

/**
 * Tiny glob matcher supporting `*`, `**`, `?` and brace `{a,b}` alternation,
 * matched against a path relative to `base`. Zero-dependency.
 */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]!;
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        // ** → any path segments
        re += "(?:.*)";
        i++;
        if (glob[i + 1] === "/") i++;
      } else {
        re += "[^/]*";
      }
    } else if (ch === "?") {
      re += "[^/]";
    } else if (ch === ".") {
      re += "\\.";
    } else if (ch === "/") {
      re += "/";
    } else if (ch === "{") {
      const close = glob.indexOf("}", i);
      if (close > i) {
        const alts = glob.slice(i + 1, close).split(",").map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        re += "(?:" + alts.join("|") + ")";
        i = close;
      } else {
        re += "\\{";
      }
    } else if ("+^$()|[]\\".includes(ch)) {
      re += "\\" + ch;
    } else {
      re += ch;
    }
  }
  return new RegExp("^" + re + "$");
}

/**
 * Expand a list of glob patterns (and/or plain files/dirs) into a de-duplicated,
 * sorted list of matching files, relative to `base`.
 */
export function expandGlobs(patterns: string[], base = process.cwd()): string[] {
  const found = new Set<string>();
  for (const pattern of patterns) {
    const abs = resolve(base, pattern);
    // plain existing file
    if (existsSync(abs) && statSync(abs).isFile()) {
      found.add(abs);
      continue;
    }
    // plain existing directory → all files under it
    if (existsSync(abs) && statSync(abs).isDirectory()) {
      for (const f of walkFiles(abs)) found.add(f);
      continue;
    }
    // glob: walk from the deepest non-glob ancestor
    const norm = pattern.replace(/\\/g, "/");
    const parts = norm.split("/");
    const staticParts: string[] = [];
    for (const p of parts) {
      if (p.includes("*") || p.includes("?") || p.includes("{")) break;
      staticParts.push(p);
    }
    const rootRel = staticParts.slice(0, -1).join("/") || ".";
    const root = resolve(base, rootRel);
    const re = globToRegExp(norm);
    for (const f of walkFiles(root)) {
      const rel = relative(base, f).split(sep).join("/");
      if (re.test(rel)) found.add(f);
    }
  }
  return [...found].sort();
}
