/**
 * Few-shot examples — turn `[{ input, output }]` pairs into either alternating
 * chat messages or an inline text block.
 */

import type { Message } from "./messages.js";

/** One input → output demonstration. */
export interface Example {
  input: string;
  output: string;
}

/** Options for {@link fewShot} in `messages` mode (the default). */
export interface FewShotMessagesOptions {
  format?: "messages";
}

/** Options for {@link fewShot} in `text` mode. */
export interface FewShotTextOptions {
  format: "text";
  /** Label before each input (default `"Input:"`). */
  inputLabel?: string;
  /** Label before each output (default `"Output:"`). */
  outputLabel?: string;
  /** Separator between examples (default a blank line). */
  separator?: string;
}

/**
 * Turn demonstrations into alternating `user` / `assistant` messages.
 *
 * ```ts
 * fewShot([{ input: "hi", output: "bonjour" }]);
 * // [{ role: "user", content: "hi" }, { role: "assistant", content: "bonjour" }]
 * ```
 */
export function fewShot(examples: Example[], opts?: FewShotMessagesOptions): Message[];
/**
 * Render demonstrations as a single labelled text block.
 *
 * ```ts
 * fewShot(pairs, { format: "text" });
 * // "Input: hi\nOutput: bonjour\n\nInput: bye\nOutput: au revoir"
 * ```
 */
export function fewShot(examples: Example[], opts: FewShotTextOptions): string;
export function fewShot(
  examples: Example[],
  opts: FewShotMessagesOptions | FewShotTextOptions = {},
): Message[] | string {
  if (opts.format === "text") {
    const inLabel = opts.inputLabel ?? "Input:";
    const outLabel = opts.outputLabel ?? "Output:";
    const sep = opts.separator ?? "\n\n";
    return examples
      .map((e) => `${inLabel} ${e.input}\n${outLabel} ${e.output}`)
      .join(sep);
  }
  const out: Message[] = [];
  for (const e of examples) {
    out.push({ role: "user", content: e.input });
    out.push({ role: "assistant", content: e.output });
  }
  return out;
}
