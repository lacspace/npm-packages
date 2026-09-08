export type {
  Chunk,
  LengthFn,
  SplitTextOptions,
  SplitMarkdownOptions,
  SplitCodeOptions,
  SplitUnitOptions,
  MergeSmallChunksOptions,
  DocumentInput,
  DocumentChunk,
  SplitDocumentsOptions,
} from "./types";

export { splitText, chunks } from "./text";
export { splitMarkdown } from "./markdown";
export { splitCode } from "./code";
export { splitBySentences, splitByParagraphs } from "./sentences";
export { mergeSmallChunks } from "./merge";
export { splitDocuments } from "./documents";
export { approxTokenLength, wordLength } from "./tokens";

export { DEFAULT_SEPARATORS, DEFAULT_CHUNK_SIZE, DEFAULT_OVERLAP } from "./core";
