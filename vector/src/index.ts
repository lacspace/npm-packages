export type {
  VectorRecord,
  QueryResult,
  QueryOptions,
  QueryByIdOptions,
  VectorStore,
  VectorStoreOptions,
  DistanceMetric,
  SerializedStore,
} from "./types";

export { createVectorStore, fromJSON } from "./store";
export { cosine, dot, euclidean, euclideanSimilarity, similarityFor } from "./metrics";
