/**
 * A tiny, hand-written JSON-path evaluator used for response capture and
 * assertions. It understands a deliberately small, predictable dialect — no
 * `eval`, no regex-of-doom, no wildcards:
 *
 *   $                    the root value
 *   $.data.items         object keys via dots
 *   data.items           a leading `$` is optional
 *   $.items[0].id        array indices via brackets
 *   $.items[-1]          negative indices count from the end
 *   $['odd key'].x       bracketed / quoted keys (dots, spaces, etc.)
 *
 * Missing paths resolve to `undefined` rather than throwing, so an assertion
 * like `body.$.error exists` can be tested cleanly.
 */

/** One resolved step of a JSON path. */
export type JsonPathSegment =
  | { type: "key"; key: string }
  | { type: "index"; index: number };

const IDENT = /[A-Za-z0-9_$-]/;

/** Parse a path string into an ordered list of segments. Throws on syntax errors. */
export function parseJsonPath(path: string): JsonPathSegment[] {
  const s = path.trim();
  const segs: JsonPathSegment[] = [];
  let i = 0;
  if (s[i] === "$") i++;

  // Optional leading bare key (no dot), e.g. `data.items`.
  if (segs.length === 0 && i < s.length && s[i] !== "." && s[i] !== "[") {
    let j = i;
    while (j < s.length && IDENT.test(s[j]!)) j++;
    if (j === i) throw new Error(`Invalid JSON path: "${path}"`);
    segs.push({ type: "key", key: s.slice(i, j) });
    i = j;
  }

  while (i < s.length) {
    const ch = s[i];
    if (ch === ".") {
      i++;
      let j = i;
      while (j < s.length && IDENT.test(s[j]!)) j++;
      if (j === i) throw new Error(`Invalid JSON path: "${path}"`);
      segs.push({ type: "key", key: s.slice(i, j) });
      i = j;
    } else if (ch === "[") {
      i++;
      const quote = s[i];
      if (quote === "'" || quote === '"') {
        i++;
        let j = i;
        while (j < s.length && s[j] !== quote) j++;
        if (j >= s.length) throw new Error(`Unterminated quote in JSON path: "${path}"`);
        segs.push({ type: "key", key: s.slice(i, j) });
        i = j + 1;
      } else {
        let j = i;
        while (j < s.length && s[j] !== "]") j++;
        const raw = s.slice(i, j).trim();
        const num = Number(raw);
        if (raw === "" || !Number.isInteger(num)) {
          throw new Error(`Invalid array index "${raw}" in JSON path: "${path}"`);
        }
        segs.push({ type: "index", index: num });
        i = j;
      }
      if (s[i] !== "]") throw new Error(`Expected "]" in JSON path: "${path}"`);
      i++;
    } else {
      throw new Error(`Unexpected "${ch}" in JSON path: "${path}"`);
    }
  }
  return segs;
}

/**
 * Resolve `path` against `root`. Returns the value at the path, or `undefined`
 * if any step does not exist. `$` alone returns `root` itself.
 */
export function evalPath(root: unknown, path: string): unknown {
  const segs = parseJsonPath(path);
  let cur: unknown = root;
  for (const seg of segs) {
    if (cur === null || cur === undefined) return undefined;
    if (seg.type === "key") {
      if (typeof cur !== "object") return undefined;
      cur = (cur as Record<string, unknown>)[seg.key];
    } else {
      if (!Array.isArray(cur)) return undefined;
      const idx = seg.index < 0 ? cur.length + seg.index : seg.index;
      cur = cur[idx];
    }
  }
  return cur;
}
