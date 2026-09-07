/**
 * Template / expression fields (0.2.0). A template is a literal string with
 * `{{ ... }}` interpolation holes. Each hole is resolved, in row order, as one
 * of two things:
 *
 *   1. the name of a field already present on the current row (`{{firstName}}`),
 *   2. otherwise a generator spec that is compiled and evaluated
 *      (`{{uuid}}`, `{{int(1..9)}}`, `{{oneOf(a|b)}}`).
 *
 * So `template({{firstName}} {{lastName}})` reuses earlier fields, while
 * `template({{username}}@{{domain}})` mixes an earlier field with fresh
 * generators. Everything stays deterministic under the seed because it draws
 * from the same RNG as every other field.
 *
 * Written as `key:template(<body>)` inline, or `"key": "template(<body>)"` in a
 * JSON schema.
 */
import type { GenContext } from "./generators.js";
import type { Spec } from "./schema.js";

const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;

/**
 * Compile a template body (the text inside `template(...)`) into a `Spec`.
 * `compile` is injected to avoid an import cycle with the schema module; it must
 * turn a generator spec string into a resolver (i.e. `specFromString`).
 */
export function compileTemplate(body: string, compile: (spec: string) => Spec): Spec {
  // Pre-compile the holes that are NOT plain row-field references-only. We keep
  // the token text and lazily decide per-row whether it's a row field, because a
  // token like `username` could be either an existing column or a generator.
  const tokens: string[] = [];
  let m: RegExpExecArray | null;
  HOLE.lastIndex = 0;
  while ((m = HOLE.exec(body)) !== null) tokens.push(m[1]!.trim());

  // Cache compiled specs for generator-style tokens so we don't reparse per row.
  const specCache = new Map<string, Spec>();
  const specFor = (token: string): Spec => {
    let s = specCache.get(token);
    if (!s) {
      s = compile(token);
      specCache.set(token, s);
    }
    return s;
  };

  return (ctx: GenContext): string => {
    HOLE.lastIndex = 0;
    return body.replace(HOLE, (_full, rawToken: string) => {
      const token = String(rawToken).trim();
      // A bare identifier that already exists on the row → reuse its value.
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(token) && token in ctx.row) {
        const v = ctx.row[token];
        return v === null || v === undefined ? "" : String(v);
      }
      // Otherwise evaluate it as a generator spec.
      const v = specFor(token)(ctx);
      return v === null || v === undefined ? "" : String(v);
    });
  };
}

/** True if a raw field spec string is a `template(...)` expression. */
export function isTemplateSpec(raw: string): boolean {
  return /^template\((.*)\)$/s.test(raw.trim());
}

/** Extract the body from `template(<body>)`. Assumes `isTemplateSpec` passed. */
export function templateBody(raw: string): string {
  const m = /^template\(([\s\S]*)\)$/.exec(raw.trim());
  return m ? m[1]! : "";
}
