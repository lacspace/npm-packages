/** Text chunking — split a document into overlapping windows for embedding. */

export interface ChunkOptions {
  /** Target chunk size in characters (default 800). */
  size?: number;
  /** Overlap between consecutive chunks in characters (default 100). */
  overlap?: number;
}

/**
 * Split `text` into overlapping chunks of roughly `size` characters.
 *
 * The splitter is paragraph/whitespace aware: it prefers to break on a
 * paragraph boundary, then a line, then a space near the target size, so
 * chunks don't cut words in half. Overlap is applied by rewinding the cursor.
 *
 * ```ts
 * chunkText("a".repeat(1800), { size: 800, overlap: 100 });
 * // three chunks (~800, ~800, remainder), each overlapping the last by ~100
 * ```
 */
export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const size = Math.max(1, Math.floor(opts.size ?? 800));
  const overlap = Math.max(0, Math.min(Math.floor(opts.overlap ?? 100), size - 1));
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const trimmed = normalized.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= size) return [trimmed];

  const chunks: string[] = [];
  let start = 0;
  while (start < trimmed.length) {
    let end = Math.min(start + size, trimmed.length);
    if (end < trimmed.length) {
      // Try to break on a nice boundary within the last ~30% of the window.
      const window = trimmed.slice(start, end);
      const floor = Math.floor(size * 0.6);
      const breakAt = findBreak(window, floor);
      if (breakAt > 0) end = start + breakAt;
    }
    const piece = trimmed.slice(start, end).trim();
    if (piece.length > 0) chunks.push(piece);
    if (end >= trimmed.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

/** Find the best break offset (>= floor) inside a window; -1 if none. */
function findBreak(window: string, floor: number): number {
  const candidates = ["\n\n", "\n", ". ", "! ", "? ", "; ", " "];
  for (const sep of candidates) {
    const idx = window.lastIndexOf(sep);
    if (idx >= floor) return idx + sep.length;
  }
  return -1;
}
