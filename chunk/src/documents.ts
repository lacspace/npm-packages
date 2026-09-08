import type {
  Chunk,
  DocumentChunk,
  DocumentInput,
  SplitDocumentsOptions,
  SplitTextOptions,
} from "./types";
import { splitText } from "./text";

/**
 * Chunk a whole corpus of documents in one call — the batch entry point for
 * building a retrieval index. Each document is split with `opts.splitter`
 * (default {@link splitText}) and every resulting chunk is tagged with which
 * document it came from and its position **within that document**.
 *
 * Documents may be plain strings or `{ id?, text, metadata? }` objects. When no
 * `id` is given, the document's array position (as a string) is used. Any
 * `metadata` on the document is carried onto each of its chunks unchanged.
 *
 * The returned `index` is global (position in the flat returned list); the
 * per-document ordinal is `docIndex`, and `docId` identifies the source
 * document. Source offsets (`start`/`end`) remain relative to that document's
 * own text.
 *
 * @returns A flat list of {@link DocumentChunk}s across all documents.
 */
export function splitDocuments(
  docs: readonly DocumentInput[],
  opts: SplitDocumentsOptions = {},
): DocumentChunk[] {
  const splitter: (text: string, o?: SplitTextOptions) => Chunk[] =
    opts.splitter ?? splitText;

  const out: DocumentChunk[] = [];
  for (let d = 0; d < docs.length; d++) {
    const raw = docs[d]!;
    const doc =
      typeof raw === "string" ? { id: String(d), text: raw } : raw;
    const docId = doc.id ?? String(d);
    const metadata = typeof raw === "string" ? undefined : doc.metadata;

    const pieces = splitter(doc.text ?? "", opts);
    for (let i = 0; i < pieces.length; i++) {
      const c = pieces[i]!;
      out.push({
        text: c.text,
        index: out.length,
        start: c.start,
        end: c.end,
        docId,
        docIndex: i,
        ...(metadata !== undefined ? { metadata } : {}),
      });
    }
  }
  return out;
}
