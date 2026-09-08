/** Test helpers — a deterministic fake `fetch` and a keyword embedder. NEVER
 * hits the network; used only by *.test.ts. Not exported from the library. */

import type { FetchImpl } from "./types.js";

/** A tiny deterministic "embedding": a bag-of-words count over a fixed vocab. */
const VOCAB = [
  "install", "config", "port", "server", "database", "api", "key",
  "chunk", "embed", "search", "cat", "dog", "ollama", "license", "run",
];

export function fakeVector(text: string): number[] {
  const lower = text.toLowerCase();
  const words = lower.match(/[a-z]+/g) ?? [];
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  const v = VOCAB.map((term) => counts.get(term) ?? 0);
  // Add a tiny constant so all-zero texts still produce a non-zero vector.
  v.push(1);
  return v;
}

export interface FakeCall {
  url: string;
  body: any;
}

export interface FakeFetch {
  fetchImpl: FetchImpl;
  calls: FakeCall[];
}

export interface FakeOptions {
  /** Fixed chat answer. */
  answer?: string;
  /** Force a network failure (connection error). */
  throwConnection?: boolean;
  /** Force a non-2xx HTTP status. */
  httpStatus?: number;
  /** Return a malformed body for the matched endpoint. */
  malformed?: boolean;
}

/** Build a fake fetch that speaks both Ollama and OpenAI shapes. */
export function makeFakeFetch(opts: FakeOptions = {}): FakeFetch {
  const calls: FakeCall[] = [];
  const fetchImpl = (async (input: any, init?: any): Promise<Response> => {
    const url = String(input);
    const body = init?.body ? JSON.parse(init.body as string) : {};
    calls.push({ url, body });

    if (opts.throwConnection) throw new Error("ECONNREFUSED 127.0.0.1:11434");
    if (opts.httpStatus && opts.httpStatus >= 400) {
      return new Response("upstream error", { status: opts.httpStatus });
    }
    if (opts.malformed) return new Response("not json", { status: 200 });

    let payload: unknown;
    if (url.endsWith("/api/embeddings")) {
      payload = { embedding: fakeVector(String(body.prompt ?? "")) };
    } else if (url.endsWith("/v1/embeddings")) {
      const input2: string[] = body.input ?? [];
      payload = { data: input2.map((t) => ({ embedding: fakeVector(t) })) };
    } else if (url.endsWith("/api/chat")) {
      payload = { message: { role: "assistant", content: opts.answer ?? "ok" } };
    } else if (url.endsWith("/v1/chat/completions")) {
      payload = { choices: [{ message: { role: "assistant", content: opts.answer ?? "ok" } }] };
    } else {
      return new Response("not found", { status: 404 });
    }
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as FetchImpl;

  return { fetchImpl, calls };
}
