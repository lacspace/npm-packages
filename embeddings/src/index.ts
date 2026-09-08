export type {
  Vector,
  EmbedProvider,
  EmbedOptions,
  ResolvedEmbedOptions,
  EmbedRequest,
  EmbedAdapter,
  Embedder,
  FetchLike,
  SimilarityHit,
} from "./types";

export { embed, embedOne, createEmbedder, DEFAULT_BATCH_SIZE } from "./embed";

export {
  getAdapter,
  DEFAULT_BASE_URL,
  EmbeddingError,
} from "./providers";

export {
  cosineSimilarity,
  dotProduct,
  euclideanDistance,
  normalize,
  magnitude,
  meanPool,
  topKSimilar,
  VectorError,
} from "./vector";
