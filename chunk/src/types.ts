/**
 * A single chunk of text with its position in the original document.
 *
 * `start`/`end` are **character offsets** into the source string, so
 * `source.slice(chunk.start, chunk.end)` is the chunk's source text.
 *
 * Note: for {@link splitMarkdown} with breadcrumbs enabled, `text` is
 * prefixed with the heading trail for context, while `start`/`end` still
 * point at the underlying source content.
 */
export interface Chunk {
  /** The chunk text (possibly breadcrumb-prefixed for Markdown). */
  text: string;
  /** Zero-based position of this chunk in the returned list. */
  index: number;
  /** Character offset in the source where this chunk's content begins. */
  start: number;
  /** Character offset in the source where this chunk's content ends (exclusive). */
  end: number;
}

/**
 * Measures the "length" of a piece of text against the chunk budget.
 *
 * Defaults to `text.length` (characters). Pass a token counter (e.g. a
 * tiktoken-style `encode(t).length`) to make chunking **token-aware**
 * without adding a hard dependency.
 */
export type LengthFn = (text: string) => number;

/** Options for {@link splitText} / {@link chunks}. */
export interface SplitTextOptions {
  /** Maximum length of a chunk, measured with `lengthFn`. Default `1000`. */
  chunkSize?: number;
  /** How much adjacent chunks overlap, measured with `lengthFn`. Default `100`. */
  chunkOverlap?: number;
  /**
   * Ordered list of separators, highest priority first. The splitter uses the
   * first separator that keeps pieces under `chunkSize`, falling back down the
   * list. Default `["\n\n", "\n", ". ", " ", ""]`.
   */
  separators?: string[];
  /** Length measurement. Default = string length. */
  lengthFn?: LengthFn;
}

/** Options for {@link splitMarkdown}. */
export interface SplitMarkdownOptions {
  /** Maximum length of a chunk. Default `1000`. */
  chunkSize?: number;
  /** Overlap applied when a single section must be split further. Default `100`. */
  chunkOverlap?: number;
  /** Separators used when a section is larger than `chunkSize`. */
  separators?: string[];
  /** Length measurement. Default = string length. */
  lengthFn?: LengthFn;
  /**
   * Prefix each chunk with its heading trail (breadcrumb) so retrieved chunks
   * keep their context. Default `true`.
   */
  includeBreadcrumb?: boolean;
  /** Joiner between headings in the breadcrumb. Default `" > "`. */
  breadcrumbSeparator?: string;
}

/** Options for {@link splitCode}. */
export interface SplitCodeOptions {
  /** Source language hint, e.g. `"ts"`, `"python"`, `"go"`. Required. */
  language: string;
  /** Maximum length of a chunk. Default `1000`. */
  chunkSize?: number;
  /** Overlap between chunks. Default `0`. */
  chunkOverlap?: number;
  /** Length measurement. Default = string length. */
  lengthFn?: LengthFn;
}

/** Options for {@link mergeSmallChunks}. */
export interface MergeSmallChunksOptions {
  /**
   * Chunks measuring below this are merged into a neighbour. Default `0`
   * (no merging — the input is returned re-indexed).
   */
  minChunkSize?: number;
  /**
   * Upper bound on a merged chunk's length; a merge that would exceed it is not
   * performed. Default `Infinity` (no ceiling).
   */
  maxChunkSize?: number;
  /** Length measurement. Default = string length. */
  lengthFn?: LengthFn;
  /** String inserted between merged chunk texts. Default `"\n\n"`. */
  joiner?: string;
}

/**
 * A document to feed {@link splitDocuments}: either a raw string or an object
 * with optional `id` and arbitrary `metadata` carried onto every chunk.
 */
export type DocumentInput =
  | string
  | {
      /** Identifier stamped onto each chunk as `docId`. Defaults to the array index. */
      id?: string;
      /** The document text to split. */
      text: string;
      /** Arbitrary metadata copied verbatim onto each of this document's chunks. */
      metadata?: Record<string, unknown>;
    };

/** A {@link Chunk} enriched with the document it came from. */
export interface DocumentChunk extends Chunk {
  /** Identifier of the source document (its `id`, or its array index as a string). */
  docId: string;
  /** Zero-based position of this chunk within its own document. */
  docIndex: number;
  /** Metadata copied from the source document, if any. */
  metadata?: Record<string, unknown>;
}

/** Options for {@link splitDocuments}. Extends {@link SplitTextOptions}. */
export interface SplitDocumentsOptions extends SplitTextOptions {
  /**
   * Splitter applied to each document. Default {@link splitText}. Pass any
   * chunker with the `(text, opts?) => Chunk[]` shape (e.g. `splitMarkdown`).
   */
  splitter?: (text: string, opts?: SplitTextOptions) => Chunk[];
}

/** Options for {@link splitBySentences} / {@link splitByParagraphs}. */
export interface SplitUnitOptions {
  /**
   * If set (> 0), sentences/paragraphs are merged into chunks up to this
   * budget. If omitted, each sentence/paragraph becomes its own chunk.
   */
  chunkSize?: number;
  /** Overlap applied when merging. Default `0`. */
  chunkOverlap?: number;
  /** Length measurement. Default = string length. */
  lengthFn?: LengthFn;
}
