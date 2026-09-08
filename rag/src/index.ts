export { createRag, DEFAULT_K, DEFAULT_ID_PREFIX } from "./rag";
export {
  buildContext,
  buildPrompt,
  DEFAULT_SYSTEM,
  DEFAULT_SEPARATOR,
} from "./context";
export { simpleSplit, defaultSplitter, normalizeSplitOutput } from "./split";
export type { SimpleSplitOptions } from "./split";

export type {
  Awaitable,
  Metadata,
  MetadataFilter,
  Embedder,
  Splitter,
  VectorRecord,
  VectorQueryResult,
  VectorQueryOptions,
  VectorStoreLike,
  RagDocument,
  RetrievedChunk,
  IndexOptions,
  IndexResult,
  RetrieveOptions,
  ContextTemplate,
  BuildContextOptions,
  PromptTemplate,
  BuildPromptOptions,
  BuiltPrompt,
  Generate,
  AnswerOptions,
  RagOptions,
  Rag,
} from "./types";
