import type {
  BuildContextOptions,
  BuildPromptOptions,
  BuiltPrompt,
  RetrievedChunk,
} from "./types";

/** Default system instruction for a grounded RAG prompt. */
export const DEFAULT_SYSTEM =
  "You are a helpful assistant. Answer the question using only the provided context. " +
  "If the answer is not contained in the context, say you don't know.";

/** Default separator between context blocks. */
export const DEFAULT_SEPARATOR = "\n\n";

function sourceLabel(chunk: RetrievedChunk): string {
  const src = chunk.metadata?.["source"];
  if (typeof src === "string" && src) return src;
  if (typeof src === "number") return String(src);
  return chunk.id;
}

function renderBlock(
  chunk: RetrievedChunk,
  index: number,
  opts: BuildContextOptions,
): string {
  if (opts.template) return opts.template(chunk, index);
  if (opts.withSources) return `[Source: ${sourceLabel(chunk)}]\n${chunk.text}`;
  return chunk.text;
}

/**
 * Assemble retrieved chunks into a single context string. **Pure** — it never
 * embeds or calls out anywhere.
 *
 * Blocks are rendered (optionally with `[Source: …]` headers or a custom
 * `template`) and joined with `separator`. When `maxChars` is set, blocks are
 * added until the next one would exceed the budget; if even the first block is
 * over budget it is truncated so the result never exceeds `maxChars`.
 */
export function buildContext(
  chunks: RetrievedChunk[],
  opts: BuildContextOptions = {},
): string {
  const separator = opts.separator ?? DEFAULT_SEPARATOR;
  const maxChars = opts.maxChars;

  const blocks = chunks.map((c, i) => renderBlock(c, i, opts));

  if (maxChars === undefined) return blocks.join(separator);
  if (maxChars <= 0) return "";

  let result = "";
  for (const block of blocks) {
    const candidate = result ? result + separator + block : block;
    if (candidate.length <= maxChars) {
      result = candidate;
      continue;
    }
    if (result === "") {
      // First block already over budget — truncate it to fit.
      return block.slice(0, maxChars);
    }
    break;
  }
  return result;
}

/**
 * Build a ready-to-send RAG prompt from a query and retrieved chunks. **Pure**
 * — it assembles strings only and never calls an LLM.
 *
 * Returns the `system`, `context` and `question` parts as well as the full
 * `prompt` string (assembled by `promptTemplate`, or a sensible default).
 */
export function buildPrompt(
  query: string,
  chunks: RetrievedChunk[],
  opts: BuildPromptOptions = {},
): BuiltPrompt {
  const system = opts.system ?? DEFAULT_SYSTEM;
  const context = buildContext(chunks, opts);
  const question = query;

  const prompt = opts.promptTemplate
    ? opts.promptTemplate({ system, context, question })
    : `${system}\n\nContext:\n${context}\n\nQuestion: ${question}\nAnswer:`;

  return { system, context, question, prompt };
}
