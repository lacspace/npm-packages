/**
 * Filesystem walking and hand-written glob matching (zero deps).
 *
 * A path argument may be a plain file, a directory (walked recursively), or a
 * glob pattern (`*`, `**`, `?`, `[abc]`). Directories are expanded to all files
 * beneath them, honouring the skip rules below.
 */
import { readdirSync, statSync, existsSync } from "node:fs";
import { join, sep, posix, basename } from "node:path";

export interface WalkOptions {
  /** Include `.map` source-map files. Default false. */
  includeMaps?: boolean;
  /** Include dotfiles / dot-directories. Default false. */
  includeHidden?: boolean;
  /** Descend into `node_modules`. Default false. */
  includeNodeModules?: boolean;
}

/** True when the segment contains glob metacharacters. */
export function isGlob(p: string): boolean {
  return /[*?[\]]/.test(p);
}

/**
 * Convert a glob to a RegExp source string.
 * - `**` matches any number of path segments (including none).
 * - `*` matches within a single segment (not `/`).
 * - `?` matches a single non-`/` char.
 * - `[...]` is a character class (a leading `!` negates).
 */
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]!;
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        // `**` — consume, plus an optional following slash.
        i++;
        if (glob[i + 1] === "/") i++;
        re += "(?:.*/)?";
      } else {
        re += "[^/]*";
      }
    } else if (ch === "?") {
      re += "[^/]";
    } else if (ch === "[") {
      let j = i + 1;
      let cls = "";
      let neg = false;
      if (glob[j] === "!" || glob[j] === "^") {
        neg = true;
        j++;
      }
      while (j < glob.length && glob[j] !== "]") {
        const c = glob[j]!;
        cls += /[.^$*+?()[\]{}|\\]/.test(c) ? "\\" + c : c;
        j++;
      }
      if (j >= glob.length) {
        // Unterminated class — treat `[` literally.
        re += "\\[";
      } else {
        re += "[" + (neg ? "^" : "") + cls + "]";
        i = j;
      }
    } else if (/[.^$+(){}|\\]/.test(ch)) {
      re += "\\" + ch;
    } else {
      re += ch;
    }
  }
  return new RegExp("^" + re + "$");
}

/** Match a path against a glob. Both are normalised to forward slashes. */
export function matchGlob(glob: string, path: string): boolean {
  const g = glob.split(sep).join("/");
  const p = path.split(sep).join("/");
  return globToRegExp(g).test(p);
}

function shouldSkipEntry(name: string, opts: WalkOptions): boolean {
  if (!opts.includeHidden && name.startsWith(".")) return true;
  if (!opts.includeNodeModules && name === "node_modules") return true;
  return false;
}

function shouldSkipFile(name: string, opts: WalkOptions): boolean {
  if (shouldSkipEntry(name, opts)) return true;
  if (!opts.includeMaps && name.endsWith(".map")) return true;
  return false;
}

/** Recursively collect files under a directory, applying skip rules. */
export function walkDir(dir: string, opts: WalkOptions = {}): string[] {
  const out: string[] = [];
  const stack: string[] = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const name = e.name;
      const full = join(cur, name);
      if (e.isDirectory()) {
        if (shouldSkipEntry(name, opts)) continue;
        stack.push(full);
      } else if (e.isFile()) {
        if (shouldSkipFile(name, opts)) continue;
        out.push(full);
      }
    }
  }
  return out;
}

/**
 * Split a glob into its non-glob base directory and the glob remainder.
 * e.g. `src/**\/*.js` → { base: "src", pattern: "**\/*.js" }.
 */
export function splitGlobBase(glob: string): { base: string; pattern: string } {
  const parts = glob.split(/[\\/]/);
  const baseParts: string[] = [];
  let i = 0;
  for (; i < parts.length; i++) {
    if (isGlob(parts[i]!)) break;
    baseParts.push(parts[i]!);
  }
  const patternParts = parts.slice(i);
  // If the whole thing was non-glob, the last part is the file itself.
  const base = baseParts.slice(0, patternParts.length ? baseParts.length : -1).join("/") || ".";
  return { base, pattern: patternParts.join("/") };
}

/**
 * Resolve a list of path/glob arguments to a de-duplicated, sorted list of
 * files (relative to `cwd`). Directories are walked; globs are matched;
 * plain files are included as-is.
 */
export function resolveInputs(inputs: string[], cwd: string, opts: WalkOptions = {}): string[] {
  const found = new Set<string>();
  const add = (full: string): void => {
    // Normalise to a cwd-relative, forward-slash path for reporting/dedupe.
    const rel = posix.normalize(full.split(sep).join("/"));
    found.add(rel);
  };

  for (const input of inputs) {
    const full = join(cwd, input);
    if (!isGlob(input) && existsSync(full)) {
      const st = statSync(full);
      if (st.isDirectory()) {
        for (const f of walkDir(full, opts)) add(relFrom(cwd, f));
      } else if (st.isFile()) {
        // Explicit file: honour it even if hidden/.map.
        add(input.split(sep).join("/"));
      }
      continue;
    }
    // Glob path.
    const { base, pattern } = splitGlobBase(input);
    const baseDir = join(cwd, base);
    if (!existsSync(baseDir)) continue;
    const full2 = globToRegExp(pattern.split(sep).join("/"));
    for (const f of walkDir(baseDir, opts)) {
      const rel = relFrom(baseDir, f);
      if (full2.test(rel) || matchGlobBasename(pattern, f)) {
        add(relFrom(cwd, f));
      }
    }
  }
  return [...found].sort();
}

function matchGlobBasename(pattern: string, file: string): boolean {
  // A bare `*.js`-style pattern (no slash) should match on basename too.
  if (pattern.includes("/")) return false;
  return globToRegExp(pattern).test(basename(file));
}

function relFrom(from: string, full: string): string {
  const a = from.split(sep).join("/").replace(/\/$/, "");
  const b = full.split(sep).join("/");
  if (b.startsWith(a + "/")) return b.slice(a.length + 1);
  return b;
}
