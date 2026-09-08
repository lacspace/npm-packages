import type { Chunk, MergeSmallChunksOptions } from "./types";
import { charLength } from "./core";

/**
 * Merge undersized neighbouring chunks together — a common RAG post-processing
 * step that eliminates tiny, low-signal fragments (a stray heading, a dangling
 * trailing sentence) by folding them into an adjacent chunk.
 *
 * A chunk whose measured length is below `minChunkSize` is joined to a
 * neighbour, provided the combined length does not exceed `maxChunkSize`
 * (defaults to `Infinity`, i.e. no upper bound). Merging concatenates chunk
 * text with `joiner` (default `"\n\n"`) and spans the union of source offsets
 * (`start` of the first, `end` of the last). Output chunks are re-`index`ed
 * from `0`.
 *
 * This never *splits* — it only combines — so it is safe to run on the output
 * of any splitter (including {@link splitMarkdown}, whose `text` may carry a
 * breadcrumb prefix; concatenation preserves those prefixes).
 *
 * @returns A new, re-indexed chunk list; the input is not mutated.
 */
export function mergeSmallChunks(
  chunks: readonly Chunk[],
  opts: MergeSmallChunksOptions = {},
): Chunk[] {
  const minChunkSize = opts.minChunkSize ?? 0;
  const maxChunkSize = opts.maxChunkSize ?? Infinity;
  const lengthFn = opts.lengthFn ?? charLength;
  const joiner = opts.joiner ?? "\n\n";

  if (minChunkSize < 0) throw new RangeError("minChunkSize must be >= 0");
  if (maxChunkSize <= 0) throw new RangeError("maxChunkSize must be greater than 0");
  if (chunks.length === 0) return [];
  if (minChunkSize === 0) return chunks.map((c, i) => ({ ...c, index: i }));

  const out: Chunk[] = [];
  // The accumulator holds a group of source chunks that will become one chunk.
  let group: Chunk[] = [];

  const groupText = (g: Chunk[]) => g.map((c) => c.text).join(joiner);
  const flush = () => {
    if (group.length === 0) return;
    const first = group[0]!;
    const last = group[group.length - 1]!;
    out.push({
      text: groupText(group),
      index: out.length,
      start: first.start,
      end: last.end,
    });
    group = [];
  };

  for (const c of chunks) {
    if (group.length === 0) {
      group = [c];
      continue;
    }
    const currentLen = lengthFn(groupText(group));
    const combinedLen = lengthFn(groupText([...group, c]));
    // Keep absorbing while the group is still too small, as long as we do not
    // blow past the ceiling.
    if (currentLen < minChunkSize && combinedLen <= maxChunkSize) {
      group.push(c);
    } else {
      flush();
      group = [c];
    }
  }

  // The final group may still be under `minChunkSize`; if so, fold it back into
  // the previous emitted chunk when that stays under `maxChunkSize`.
  if (group.length > 0) {
    const tailLen = lengthFn(groupText(group));
    const prev = out[out.length - 1];
    if (tailLen < minChunkSize && prev) {
      const combined = lengthFn([prev.text, groupText(group)].join(joiner));
      if (combined <= maxChunkSize) {
        prev.text = [prev.text, groupText(group)].join(joiner);
        prev.end = group[group.length - 1]!.end;
        group = [];
      }
    }
    flush();
  }

  return out;
}
