/** Index construction and persistence.
 *
 * `createIndex` / `addToIndex` are pure. `walkFiles`, `saveIndex` and
 * `loadIndex` touch the filesystem via `node:fs` and are the only impure bits;
 * they're kept small and isolated so the rest of the library stays testable. */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname, dirname } from "node:path";
import type { Provider, RagChunk, RagIndex } from "./types.js";
import { RagError } from "./types.js";

/** Create an empty index. */
export function createIndex(provider: Provider, embedModel: string): RagIndex {
  return {
    version: 1,
    provider,
    embedModel,
    dimension: 0,
    updatedAt: new Date().toISOString(),
    chunks: [],
  };
}

export interface AddChunkInput {
  id: string;
  text: string;
  source: string;
  vector: number[];
}

/**
 * Append chunks to an index (mutates and returns it). Sets the index dimension
 * from the first vector and rejects vectors of a different dimension.
 */
export function addToIndex(index: RagIndex, chunks: AddChunkInput[]): RagIndex {
  for (const c of chunks) {
    if (c.vector.length === 0) throw new RagError(`Chunk "${c.id}" has an empty vector`, "empty");
    if (index.dimension === 0) index.dimension = c.vector.length;
    else if (c.vector.length !== index.dimension) {
      throw new RagError(
        `Chunk "${c.id}" vector dimension ${c.vector.length} != index dimension ${index.dimension}`,
        "shape",
      );
    }
    index.chunks.push({ id: c.id, text: c.text, source: c.source, vector: c.vector });
  }
  index.updatedAt = new Date().toISOString();
  return index;
}

// --- filesystem ------------------------------------------------------------

export interface WalkOptions {
  /** File extensions to include (with leading dot). Defaults below. */
  extensions?: string[];
  /** Directory names to skip. Defaults below. */
  ignoreDirs?: string[];
  /** Skip files larger than this many bytes (default 1 MiB). */
  maxBytes?: number;
}

export const DEFAULT_EXTENSIONS = [
  ".txt", ".md", ".markdown", ".mdx", ".rst", ".org",
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
  ".json", ".jsonc", ".yaml", ".yml", ".toml",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift",
  ".c", ".h", ".cpp", ".hpp", ".cc", ".cs",
  ".php", ".sh", ".bash", ".zsh", ".sql", ".html", ".css", ".scss",
  ".vue", ".svelte", ".astro", ".env", ".ini", ".cfg", ".conf", ".csv",
];

export const DEFAULT_IGNORE_DIRS = [
  "node_modules", ".git", ".hg", ".svn", "dist", "build", "out",
  ".next", ".nuxt", ".cache", "coverage", ".turbo", ".vercel",
  "vendor", "__pycache__", ".venv", "venv", ".lacspace-rag",
];

const DEFAULT_MAX_BYTES = 1024 * 1024;

/** A file discovered by `walkFiles`. */
export interface WalkedFile {
  /** Absolute path. */
  path: string;
  /** Path relative to the walk root (stable id / display). */
  rel: string;
  /** Size in bytes. */
  bytes: number;
}

/**
 * Recursively collect indexable text files under `dir`, skipping ignored
 * directories, non-matching extensions, and files over `maxBytes`. Sorted by
 * relative path for deterministic output.
 */
export function walkFiles(dir: string, opts: WalkOptions = {}): WalkedFile[] {
  const exts = new Set((opts.extensions ?? DEFAULT_EXTENSIONS).map((e) => e.toLowerCase()));
  const ignore = new Set(opts.ignoreDirs ?? DEFAULT_IGNORE_DIRS);
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  let rootStat;
  try { rootStat = statSync(dir); } catch { throw new RagError(`Path not found: ${dir}`, "config"); }

  // A single file was passed directly — index it regardless of extension.
  if (rootStat.isFile()) {
    return [{ path: dir, rel: dir, bytes: rootStat.size }];
  }

  const out: WalkedFile[] = [];
  const walk = (current: string): void => {
    let entries: string[];
    try { entries = readdirSync(current); } catch { return; }
    for (const name of entries) {
      const full = join(current, name);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) {
        if (ignore.has(name)) continue;
        walk(full);
      } else if (st.isFile()) {
        if (!exts.has(extname(name).toLowerCase())) continue;
        if (st.size > maxBytes || st.size === 0) continue;
        out.push({ path: full, rel: relative(dir, full) || name, bytes: st.size });
      }
    }
  };
  walk(dir);
  out.sort((a, b) => a.rel.localeCompare(b.rel));
  return out;
}

/** Read a text file (UTF-8). Isolated so callers can stay pure/testable. */
export function readTextFile(path: string): string {
  return readFileSync(path, "utf8");
}

/** Write an index to disk as JSON, creating parent directories as needed. */
export function saveIndex(path: string, index: RagIndex): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(index), "utf8");
}

/** Load and validate an index from disk. */
export function loadIndex(path: string): RagIndex {
  let text: string;
  try { text = readFileSync(path, "utf8"); }
  catch { throw new RagError(`No index at ${path}. Run "index" first.`, "config"); }
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { throw new RagError(`Index at ${path} is not valid JSON`, "shape"); }
  const idx = parsed as Partial<RagIndex>;
  if (!idx || idx.version !== 1 || !Array.isArray(idx.chunks)) {
    throw new RagError(`Index at ${path} is not a valid lacspace-rag index`, "shape");
  }
  return idx as RagIndex;
}
