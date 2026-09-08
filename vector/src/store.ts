import type {
  DistanceMetric,
  QueryByIdOptions,
  QueryOptions,
  QueryResult,
  SerializedStore,
  VectorRecord,
  VectorStore,
  VectorStoreOptions,
} from "./types";
import { similarityFor } from "./metrics";

function cloneRecord(rec: VectorRecord): VectorRecord {
  const out: VectorRecord = { id: rec.id, vector: rec.vector.slice() };
  if (rec.text !== undefined) out.text = rec.text;
  if (rec.metadata !== undefined) out.metadata = { ...rec.metadata };
  return out;
}

function validateVector(vector: unknown, dims: number | null): void {
  if (!Array.isArray(vector)) {
    throw new Error("vector must be an array of numbers");
  }
  for (let i = 0; i < vector.length; i++) {
    const v = vector[i];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error(`vector[${i}] must be a finite number`);
    }
  }
  if (dims !== null && vector.length !== dims) {
    throw new Error(
      `vector dimension mismatch: expected ${dims}, got ${vector.length}`,
    );
  }
}

class InMemoryVectorStore implements VectorStore {
  #records = new Map<string, VectorRecord>();
  #metric: DistanceMetric;
  #dims: number | null;
  #similarity: (a: number[], b: number[]) => number;

  constructor(opts: VectorStoreOptions = {}) {
    this.#metric = opts.metric ?? "cosine";
    this.#dims = opts.dimensions ?? null;
    this.#similarity = similarityFor(this.#metric);
  }

  get metric(): DistanceMetric {
    return this.#metric;
  }

  get dimensions(): number | null {
    return this.#dims;
  }

  get size(): number {
    return this.#records.size;
  }

  upsert(records: VectorRecord | VectorRecord[]): void {
    const list = Array.isArray(records) ? records : [records];
    // Validate every record first so a bad item never leaves a partial write.
    for (const rec of list) {
      if (!rec || typeof rec.id !== "string" || rec.id === "") {
        throw new Error("each record needs a non-empty string id");
      }
      validateVector(rec.vector, this.#dims);
    }
    for (const rec of list) {
      if (this.#dims === null) this.#dims = rec.vector.length;
      this.#records.set(rec.id, cloneRecord(rec));
    }
  }

  get(id: string): VectorRecord | undefined {
    const rec = this.#records.get(id);
    return rec ? cloneRecord(rec) : undefined;
  }

  delete(id: string): boolean {
    return this.#records.delete(id);
  }

  has(id: string): boolean {
    return this.#records.has(id);
  }

  clear(): void {
    this.#records.clear();
  }

  all(): VectorRecord[] {
    const out: VectorRecord[] = [];
    for (const rec of this.#records.values()) out.push(cloneRecord(rec));
    return out;
  }

  query(vector: number[], opts: QueryOptions = {}): QueryResult[] {
    validateVector(vector, this.#dims);
    return this.#rank(vector, opts, null);
  }

  queryById(id: string, opts: QueryByIdOptions = {}): QueryResult[] {
    const rec = this.#records.get(id);
    if (!rec) throw new Error(`no record with id "${id}"`);
    const excludeId = opts.includeSelf ? null : id;
    return this.#rank(rec.vector, opts, excludeId);
  }

  #rank(
    vector: number[],
    opts: QueryOptions,
    excludeId: string | null,
  ): QueryResult[] {
    const k = opts.k ?? 10;
    const filter = opts.filter;
    const minScore = opts.minScore;
    const includeVectors = opts.includeVectors ?? false;

    const scored: QueryResult[] = [];
    for (const rec of this.#records.values()) {
      if (excludeId !== null && rec.id === excludeId) continue;
      if (filter && !filter(rec)) continue;
      const score = this.#similarity(vector, rec.vector);
      if (minScore !== undefined && score < minScore) continue;
      const hit: QueryResult = { id: rec.id, score };
      if (rec.metadata !== undefined) hit.metadata = { ...rec.metadata };
      if (rec.text !== undefined) hit.text = rec.text;
      if (includeVectors) hit.vector = rec.vector.slice();
      scored.push(hit);
    }

    // Best-first; stable tie-break by id keeps results deterministic.
    scored.sort((a, b) => (b.score - a.score) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return k >= 0 ? scored.slice(0, k) : scored;
  }

  toJSON(): SerializedStore {
    return {
      version: 1,
      metric: this.#metric,
      dimensions: this.#dims,
      records: this.all(),
    };
  }

  load(data: SerializedStore): VectorStore {
    if (!data || data.version !== 1) {
      throw new Error("unsupported serialized store (expected version 1)");
    }
    this.#metric = data.metric ?? "cosine";
    this.#similarity = similarityFor(this.#metric);
    this.#dims = data.dimensions ?? null;
    this.#records.clear();
    this.upsert(data.records ?? []);
    return this;
  }
}

/**
 * Create an in-memory, brute-force vector store for RAG / semantic search.
 *
 * It holds records `{ id, vector, metadata?, text? }`, compares them with the
 * chosen {@link DistanceMetric}, and answers k-NN queries best-first. Everything
 * is pure in-process JavaScript — zero dependencies, isomorphic, no IO.
 *
 * @example
 * const store = createVectorStore({ metric: "cosine" });
 * store.upsert([{ id: "a", vector: [1, 0], text: "hello" }]);
 * const hits = store.query([0.9, 0.1], { k: 5 });
 */
export function createVectorStore(opts?: VectorStoreOptions): VectorStore {
  return new InMemoryVectorStore(opts);
}

/** Rehydrate a store from a {@link SerializedStore} snapshot (e.g. from disk/KV). */
export function fromJSON(data: SerializedStore): VectorStore {
  return new InMemoryVectorStore().load(data);
}
