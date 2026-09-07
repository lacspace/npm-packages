/**
 * Pure (isomorphic) helpers for the jest-compatible `.snap` file format:
 *
 * ```
 * // Lacspace Snapshot v1
 *
 * exports[`my snapshot 1`] = `
 * Object {
 *   "a": 1,
 * }
 * `;
 * ```
 *
 * Each stored value is wrapped in a leading and trailing newline and has its
 * backticks, backslashes and `${` sequences escaped, so the file remains a
 * valid CommonJS module that can also be re-parsed by this module.
 */

export const SNAPSHOT_FILE_HEADER = "// Lacspace Snapshot v1";

/** Escape a string so it is safe inside a backtick-quoted template literal. */
export function escapeForSnap(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

/** Reverse {@link escapeForSnap}. */
export function unescapeFromSnap(str: string): string {
  return str.replace(/\\(.)/g, "$1");
}

/** Wrap serialized content the way the `.snap` file stores it (surrounding newlines). */
function storeForm(content: string): string {
  return `\n${content}\n`;
}

/** Strip the surrounding newlines a stored `.snap` value carries. */
function readForm(stored: string): string {
  let s = stored;
  if (s.startsWith("\n")) s = s.slice(1);
  if (s.endsWith("\n")) s = s.slice(0, -1);
  return s;
}

/**
 * Render a full `.snap` file from a map of `name -> serialized snapshot`.
 * Keys are sorted for deterministic file output.
 */
export function serializeSnapshotFile(snapshots: Record<string, string>): string {
  const keys = Object.keys(snapshots).sort();
  const blocks = keys.map((key) => {
    const value = storeForm(snapshots[key] ?? "");
    return `exports[\`${escapeForSnap(key)}\`] = \`${escapeForSnap(value)}\`;`;
  });
  return `${SNAPSHOT_FILE_HEADER}\n\n${blocks.join("\n\n")}\n`;
}

/**
 * Parse a `.snap` file back into a map of `name -> serialized snapshot`.
 * Tolerant of arbitrary whitespace between assignments.
 */
export function parseSnapshotFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Match: exports[`<key>`] = `<value>`;  where key/value may contain escaped chars.
  const re = /exports\[`((?:\\.|[^`\\])*)`\]\s*=\s*`((?:\\.|[^`\\])*)`;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const key = unescapeFromSnap(m[1] ?? "");
    const value = unescapeFromSnap(m[2] ?? "");
    result[key] = readForm(value);
  }
  return result;
}
