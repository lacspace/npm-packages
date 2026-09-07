/**
 * Composition & formatting helpers — small pure functions that return strings,
 * so you can assemble prompt fragments with `join(...)`.
 */

import { toText, type Renderable } from "./render.js";

/** A titled section: a Markdown `## heading` followed by its body. */
export function section(title: string, body: Renderable): string {
  return `## ${title}\n\n${toText(body)}`;
}

/** A bulleted list — one `- item` per line. */
export function list(items: readonly (string | number)[]): string {
  return items.map((i) => `- ${i}`).join("\n");
}

/** A numbered list — `1. item`, `2. item`, … */
export function numbered(items: readonly (string | number)[]): string {
  return items.map((i, idx) => `${idx + 1}. ${i}`).join("\n");
}

/**
 * An XML-style tag block, Anthropic's recommended way to delimit context:
 *
 * ```ts
 * xml("document", "…text…");
 * // <document>
 * // …text…
 * // </document>
 * ```
 */
export function xml(tag: string, content: Renderable): string {
  return `<${tag}>\n${toText(content)}\n</${tag}>`;
}

/** Pretty-printed JSON (2-space indent). Compose with {@link codeBlock} to fence it. */
export function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** A fenced code block: ```lang … ``` */
export function codeBlock(lang: string, code: string): string {
  return `\`\`\`${lang}\n${code}\n\`\`\``;
}

/**
 * Join prompt fragments with blank lines between them. Strings and {@link
 * Prompt}s (rendered with no vars) are accepted; empty/blank parts are dropped.
 */
export function join(...parts: (Renderable | null | undefined | false)[]): string {
  return parts
    .filter((p): p is Renderable => !!p)
    .map(toText)
    .filter((s) => s.length > 0)
    .join("\n\n");
}
