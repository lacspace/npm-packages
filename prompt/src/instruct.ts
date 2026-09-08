/**
 * Output-format instruction helpers.
 *
 * Small pure functions that produce the *instruction text* which nudges a model
 * to answer in a machine-parseable shape — a JSON object, or exactly one value
 * from an enum. They return plain strings, so compose them with `join`,
 * `section` or drop them straight into a `messages().system(...)`. They only
 * describe the format; validating the model's reply is a separate concern (pair
 * with `@lacspace/validate`).
 */

import { json as toJson } from "./format.js";

/** Options for {@link jsonInstruction}. */
export interface JsonInstructionOptions {
  /**
   * An example object (or JSON-schema-like shape) showing the fields you want.
   * It is pretty-printed and shown to the model as the target shape.
   */
  shape?: unknown;
  /**
   * When `true` (the default) the model is told to return **only** the JSON —
   * no prose, no Markdown fences. Set `false` to allow surrounding text.
   */
  strict?: boolean;
  /** Leading sentence (default `"Respond with a single valid JSON …"`). */
  label?: string;
}

/**
 * Build an instruction asking the model to reply as JSON.
 *
 * ```ts
 * jsonInstruction({ shape: { sentiment: "positive", score: 0.9 } });
 * // Respond with a single valid JSON object and nothing else…
 * // Match this shape:
 * // {
 * //   "sentiment": "positive",
 * //   "score": 0.9
 * // }
 * ```
 */
export function jsonInstruction(opts: JsonInstructionOptions = {}): string {
  const strict = opts.strict ?? true;
  const label =
    opts.label ??
    `Respond with a single valid JSON ${
      Array.isArray(opts.shape) ? "array" : "object"
    }`;
  const parts: string[] = [
    strict
      ? `${label} and nothing else — no prose, no explanation, no Markdown code fences.`
      : `${label}.`,
  ];
  if (opts.shape !== undefined) {
    parts.push(`Match this shape:\n${toJson(opts.shape)}`);
  }
  return parts.join("\n");
}

/** Options for {@link enumInstruction}. */
export interface EnumInstructionOptions {
  /** Leading sentence (default `"Respond with exactly one of the following …"`). */
  label?: string;
  /** Separator shown between the allowed values (default `" | "`). */
  separator?: string;
  /** When `true` (default) append "Output only the value." */
  strict?: boolean;
}

/**
 * Build an instruction constraining the reply to one of a fixed set of values.
 *
 * ```ts
 * enumInstruction(["positive", "neutral", "negative"]);
 * // Respond with exactly one of the following values: positive | neutral | negative.
 * // Output only the value, with no other text.
 * ```
 */
export function enumInstruction(
  values: readonly (string | number)[],
  opts: EnumInstructionOptions = {},
): string {
  if (values.length === 0) {
    throw new Error("[@lacspace/prompt] enumInstruction() needs at least one value.");
  }
  const sep = opts.separator ?? " | ";
  const strict = opts.strict ?? true;
  const label = opts.label ?? "Respond with exactly one of the following values";
  let out = `${label}: ${values.join(sep)}.`;
  if (strict) out += "\nOutput only the value, with no other text.";
  return out;
}
