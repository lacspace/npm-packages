/**
 * Frontmatter extraction — pull a `---` fenced YAML-ish block off the top of a
 * document into structured `data`, returning the remaining Markdown as `content`.
 *
 * A deliberately small, dependency-free YAML subset is supported (enough for the
 * frontmatter blogs and docs actually use):
 *   - `key: value` scalars — strings, numbers, booleans (`true`/`false`),
 *     `null`/`~`/empty, and single- or double-quoted strings
 *   - inline lists — `tags: [a, b, c]`
 *   - block lists —
 *       ```
 *       tags:
 *         - a
 *         - b
 *       ```
 *   - `#` comments and blank lines are ignored
 *
 * Anything more exotic (nested maps, anchors, multi-line scalars) is intentionally
 * NOT parsed — the raw string is kept instead. Zero dependencies · isomorphic.
 */

/** The result of {@link parseFrontmatter}: the parsed `data` map + the document body. */
export interface Frontmatter {
  /** Parsed key/value pairs from the frontmatter block (empty if none). */
  data: Record<string, unknown>;
  /** The Markdown body with the frontmatter block removed. */
  content: string;
}

/** Coerce a single scalar token to a boolean / number / null / string. */
function parseScalar(raw: string): unknown {
  const v = raw.trim();
  if (v === "") return null;
  // Quoted string — strip the matching quotes, no escape processing beyond `\"`.
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1).replace(/\\"/g, '"');
  }
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null" || v === "~") return null;
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(v)) return Number(v);
  return v;
}

/** Parse an inline list token: `[a, "b", 3]`. */
function parseInlineList(raw: string): unknown[] {
  const inner = raw.slice(1, -1).trim();
  if (inner === "") return [];
  return splitTopLevel(inner).map((item) => parseScalar(item));
}

/** Split on commas that are not inside quotes. */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let buf = "";
  let quote: string | null = null;
  for (const ch of s) {
    if (quote) {
      if (ch === quote) quote = null;
      buf += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
    } else if (ch === ",") {
      out.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.trim() !== "") out.push(buf);
  return out;
}

/**
 * Split a document into its frontmatter `data` and the remaining `content`.
 * If the source has no leading `---` block, `data` is `{}` and `content` is the
 * source unchanged (normalised to `\n` line endings).
 */
export function parseFrontmatter(src: string): Frontmatter {
  const text = src.replace(/\r\n?/g, "\n");
  // Must open with `---` on the very first line (optional leading BOM/whitespace-free).
  const open = /^---[ \t]*\n/.exec(text);
  if (!open) return { data: {}, content: text };

  const rest = text.slice(open[0].length);
  // Closing fence: a line that is exactly `---` or `...`.
  const close = /\n(?:---|\.\.\.)[ \t]*(?:\n|$)/.exec("\n" + rest);
  if (!close) return { data: {}, content: text };

  const block = ("\n" + rest).slice(1, close.index);
  const content = ("\n" + rest).slice(close.index + close[0].length);

  const data: Record<string, unknown> = {};
  const lines = block.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "" || /^\s*#/.test(line)) continue;
    const m = /^([A-Za-z0-9_.\-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!;
    const valueRaw = m[2]!.trim();

    if (valueRaw === "") {
      // Possible block list on following indented `- ` lines.
      const items: unknown[] = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1]!)) {
        items.push(parseScalar(lines[++i]!.replace(/^\s*-\s+/, "")));
      }
      data[key] = items;
    } else if (valueRaw.startsWith("[") && valueRaw.endsWith("]")) {
      data[key] = parseInlineList(valueRaw);
    } else {
      // Strip trailing inline `# comment` only when the value is unquoted.
      const cleaned = /^["']/.test(valueRaw) ? valueRaw : valueRaw.replace(/\s+#.*$/, "");
      data[key] = parseScalar(cleaned);
    }
  }

  return { data, content };
}
