import { buildContext, buildPrompt } from "./context";
import { defaultSplitter, normalizeSplitOutput } from "./split";
import type {
  AnswerOptions,
  IndexOptions,
  IndexResult,
  Metadata,
  Rag,
  RagDocument,
  RagOptions,
  RetrieveOptions,
  RetrievedChunk,
  VectorRecord,
} from "./types";

/** Default number of chunks returned by {@link Rag.retrieve}. */
export const DEFAULT_K = 4;

/** Default prefix for auto-generated chunk ids. */
export const DEFAULT_ID_PREFIX = "doc";

interface NormalizedDoc {
  id: string;
  text: string;
  metadata?: Metadata;
}

function normalizeDoc(
  doc: RagDocument,
  index: number,
  idPrefix: string,
): NormalizedDoc {
  if (typeof doc === "string") {
    return { id: `${idPrefix}-${index}`, text: doc };
  }
  return {
    id: doc.id ?? `${idPrefix}-${index}`,
    text: doc.text,
    metadata: doc.metadata,
  };
}

function mergeMetadata(
  base: Metadata | undefined,
  extra: Metadata | undefined,
): Metadata | undefined {
  if (!base && !extra) return undefined;
  // Document metadata wins on conflict.
  return { ...(extra ?? {}), ...(base ?? {}) };
}

/**
 * Create a RAG orchestrator that glues an injected embedder, vector store and
 * splitter into an index/retrieve/prompt pipeline.
 *
 * Zero hard dependencies: pass the Lacspace siblings (`@lacspace/embeddings`,
 * `@lacspace/vector`, `@lacspace/chunk`) or any compatible implementation.
 */
export function createRag(opts: RagOptions): Rag {
  const embed = opts.embed;
  const store = opts.store;
  const split = opts.split ?? defaultSplitter;
  const idPrefix = opts.idPrefix ?? DEFAULT_ID_PREFIX;
  const rootGenerate = opts.generate;

  if (typeof embed !== "function") {
    throw new TypeError("createRag: `embed` must be a function (texts) => Promise<number[][]>");
  }
  if (!store || typeof store.upsert !== "function" || typeof store.query !== "function") {
    throw new TypeError("createRag: `store` must have upsert() and query() methods");
  }

  async function index(
    docs: RagDocument | RagDocument[],
    indexOpts: IndexOptions = {},
  ): Promise<IndexResult> {
    const list = Array.isArray(docs) ? docs : [docs];
    const doChunk = indexOpts.chunk ?? true;

    const ids: string[] = [];
    const texts: string[] = [];
    const metas: (Metadata | undefined)[] = [];

    list.forEach((doc, i) => {
      const nd = normalizeDoc(doc, i, idPrefix);
      const meta = mergeMetadata(nd.metadata, indexOpts.metadata);

      const pieces = doChunk
        ? normalizeSplitOutput(split(nd.text, indexOpts.splitOptions))
        : [nd.text];

      // Guard against a splitter that returns nothing for non-empty text.
      const effective = pieces.length > 0 ? pieces : nd.text.trim() ? [nd.text] : [];

      effective.forEach((piece, ci) => {
        const id = effective.length > 1 || doChunk ? `${nd.id}#${ci}` : nd.id;
        ids.push(id);
        texts.push(piece);
        metas.push(meta);
      });
    });

    if (texts.length === 0) return { chunks: 0, ids: [] };

    const vectors = await embed(texts);
    if (vectors.length !== texts.length) {
      throw new Error(
        `embed returned ${vectors.length} vectors for ${texts.length} texts`,
      );
    }

    const records: VectorRecord[] = texts.map((text, i) => {
      const rec: VectorRecord = { id: ids[i]!, vector: vectors[i]!, text };
      const meta = metas[i];
      if (meta) rec.metadata = meta;
      return rec;
    });

    await store.upsert(records);
    return { chunks: records.length, ids };
  }

  async function retrieve(
    query: string,
    retrieveOpts: RetrieveOptions = {},
  ): Promise<RetrievedChunk[]> {
    const k = retrieveOpts.k ?? DEFAULT_K;
    const [vector] = await embed([query]);
    if (!vector) throw new Error("embed returned no vector for the query");

    const queryOpts: { k: number; filter?: Metadata } = { k };
    if (retrieveOpts.filter) queryOpts.filter = retrieveOpts.filter;

    const hits = await store.query(vector, queryOpts);
    const minScore = retrieveOpts.minScore;

    const chunks: RetrievedChunk[] = [];
    for (const hit of hits) {
      if (minScore !== undefined && hit.score < minScore) continue;
      const chunk: RetrievedChunk = {
        id: hit.id,
        text: hit.text ?? "",
        score: hit.score,
      };
      if (hit.metadata) chunk.metadata = hit.metadata;
      chunks.push(chunk);
    }
    return chunks;
  }

  async function answer(query: string, answerOpts: AnswerOptions = {}): Promise<string> {
    const generate = answerOpts.generate ?? rootGenerate;
    if (typeof generate !== "function") {
      throw new Error(
        "answer() requires a `generate` function — inject one into createRag({ generate }) or pass it in answer(query, { generate }).",
      );
    }
    const chunks = await retrieve(query, answerOpts);
    const { prompt } = buildPrompt(query, chunks, answerOpts);
    return generate(prompt);
  }

  return {
    index,
    retrieve,
    buildContext,
    buildPrompt,
    answer,
  };
}
