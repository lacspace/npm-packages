import type {
  Embedder,
  Metadata,
  MetadataFilter,
  VectorQueryOptions,
  VectorQueryResult,
  VectorRecord,
  VectorStoreLike,
} from "./types";

/**
 * A deterministic, network-free fake embedder for tests.
 *
 * Builds a small bag-of-words vector: every token bumps a dimension chosen by
 * a stable hash, so texts sharing words get similar vectors. Same input ⇒ same
 * output, always.
 */
export function fakeEmbedder(dim = 16): Embedder {
  return async (texts: string[]) =>
    texts.map((t) => {
      const v = new Array<number>(dim).fill(0);
      for (const word of t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
        let h = 0;
        for (let i = 0; i < word.length; i++) h = (h * 31 + word.charCodeAt(i)) >>> 0;
        v[h % dim]! += 1;
      }
      return v;
    });
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function matchesFilter(metadata: Metadata | undefined, filter: MetadataFilter): boolean {
  for (const [key, value] of Object.entries(filter)) {
    if (!metadata || metadata[key] !== value) return false;
  }
  return true;
}

/** An in-memory fake vector store with equality metadata filtering. */
export interface FakeStore extends VectorStoreLike {
  readonly records: Map<string, VectorRecord>;
  upsertCalls: number;
  queryCalls: number;
}

export function fakeStore(): FakeStore {
  const records = new Map<string, VectorRecord>();
  const store: FakeStore = {
    records,
    upsertCalls: 0,
    queryCalls: 0,
    upsert(recs: VectorRecord[]): void {
      store.upsertCalls += 1;
      for (const r of recs) records.set(r.id, r);
    },
    query(vector: number[], opts?: VectorQueryOptions): VectorQueryResult[] {
      store.queryCalls += 1;
      const k = opts?.k ?? 4;
      const filter = opts?.filter;
      let items = [...records.values()];
      if (filter) items = items.filter((r) => matchesFilter(r.metadata, filter));
      const scored: VectorQueryResult[] = items.map((r) => {
        const hit: VectorQueryResult = { id: r.id, score: cosine(vector, r.vector) };
        if (r.metadata) hit.metadata = r.metadata;
        if (r.text !== undefined) hit.text = r.text;
        return hit;
      });
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, k);
    },
  };
  return store;
}
