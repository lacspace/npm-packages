/**
 * Copy interpolation + i18n hooks.
 *
 * Templates take plain copy strings; callers localize by passing already-
 * translated copy. `interpolate()` fills `{{var}}` placeholders from either a
 * lookup object or a function, so a caller can wire it to any i18n backend.
 */

import { escapeHtml } from "./index";

/** A variable source: a lookup object, or a resolver function. */
export type InterpolateVars =
  | Record<string, string | number | boolean | null | undefined>
  | ((key: string) => string | number | boolean | null | undefined);

export interface InterpolateOptions {
  /** Replacement for unresolved keys. Default: leave the `{{key}}` untouched. */
  fallback?: string;
  /** HTML-escape resolved values before substitution. Default: false. */
  escape?: boolean;
}

/**
 * Replace `{{ key }}` placeholders in `template`.
 *
 * ```ts
 * interpolate("Hi {{name}}", { name: "Ada" });        // "Hi Ada"
 * interpolate("Hi {{name}}", (k) => dict[k]);         // function source
 * ```
 */
export function interpolate(
  template: string,
  vars: InterpolateVars = {},
  opts: InterpolateOptions = {},
): string {
  const lookup =
    typeof vars === "function"
      ? vars
      : (k: string) => (Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : undefined);

  return String(template).replace(/\{\{\s*([\w.$-]+)\s*\}\}/g, (whole, key) => {
    const v = lookup(key);
    if (v === undefined || v === null) return opts.fallback ?? whole;
    const s = String(v);
    return opts.escape ? escapeHtml(s) : s;
  });
}

/**
 * Build a localizer bound to a message catalog and (optionally) shared vars.
 * Returns `(key, extraVars?) => string`, resolving `dict[key]` (falling back to
 * the key itself) and interpolating placeholders — a tiny i18n hook.
 *
 * ```ts
 * const t = localize({ greeting: "Hola {{name}}" }, { name: "Ada" });
 * t("greeting");            // "Hola Ada"
 * t("missing");             // "missing"
 * ```
 */
export function localize(
  dict: Record<string, string>,
  vars: InterpolateVars = {},
  opts: InterpolateOptions = {},
): (key: string, extraVars?: InterpolateVars) => string {
  return (key, extraVars) => {
    const copy = dict[key] ?? key;
    if (extraVars === undefined) return interpolate(copy, vars, opts);
    // Merge: object sources combine; a function source in either wins by lookup order.
    const merged: InterpolateVars = (k: string) => {
      const fromExtra =
        typeof extraVars === "function"
          ? extraVars(k)
          : Object.prototype.hasOwnProperty.call(extraVars, k)
            ? extraVars[k]
            : undefined;
      if (fromExtra !== undefined && fromExtra !== null) return fromExtra;
      return typeof vars === "function"
        ? vars(k)
        : Object.prototype.hasOwnProperty.call(vars, k)
          ? vars[k]
          : undefined;
    };
    return interpolate(copy, merged, opts);
  };
}
