/**
 * Small, composable transforms over async iterables — the streaming equivalents
 * of `Array.prototype.map` / `filter` / `slice`, plus `buffer` and `tee`. Each
 * returns a new lazy async iterable and never buffers the whole stream (except
 * `tee`, which buffers only the items one branch has not yet consumed).
 *
 * These work on ANY `AsyncIterable`, so they compose with {@link streamChat},
 * {@link parseSSE}, {@link parseNDJSON}, or your own generators.
 */

/**
 * Map each item through `fn` (which may be async), preserving order.
 *
 * ```ts
 * for await (const s of mapStream(parseSSE(body), (ev) => ev.data)) console.log(s);
 * ```
 */
export async function* mapStream<T, U>(
  source: AsyncIterable<T>,
  fn: (value: T, index: number) => U | Promise<U>,
): AsyncIterable<U> {
  let i = 0;
  for await (const v of source) yield await fn(v, i++);
}

/** Keep only items for which `pred` (which may be async) returns truthy. */
export async function* filterStream<T>(
  source: AsyncIterable<T>,
  pred: (value: T, index: number) => boolean | Promise<boolean>,
): AsyncIterable<T> {
  let i = 0;
  for await (const v of source) {
    if (await pred(v, i++)) yield v;
  }
}

/** Yield at most the first `n` items, then stop (closing the source). */
export async function* takeStream<T>(
  source: AsyncIterable<T>,
  n: number,
): AsyncIterable<T> {
  if (n <= 0) return;
  let count = 0;
  for await (const v of source) {
    yield v;
    if (++count >= n) return;
  }
}

/**
 * Group items into arrays of up to `size`. The final batch may be shorter. A
 * non-positive `size` is treated as `1`.
 *
 * ```ts
 * for await (const rows of bufferStream(parseNDJSON(body), 100)) insertMany(rows);
 * ```
 */
export async function* bufferStream<T>(
  source: AsyncIterable<T>,
  size: number,
): AsyncIterable<T[]> {
  const cap = size > 0 ? Math.floor(size) : 1;
  let batch: T[] = [];
  for await (const v of source) {
    batch.push(v);
    if (batch.length >= cap) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length) yield batch;
}

/**
 * Split one async iterable into `n` independent async iterables, each of which
 * sees every item. The source is pulled on demand and items are buffered only
 * until every branch has consumed them, so a slow branch grows memory. Consume
 * the branches concurrently.
 *
 * ```ts
 * const [a, b] = tee(streamChat(res, { provider: "openai" }));
 * ```
 */
export function tee<T>(source: AsyncIterable<T>, n = 2): AsyncIterable<T>[] {
  const it = source[Symbol.asyncIterator]();
  // Per-branch queue of pending results; a shared pull chains onto a promise so
  // concurrent branches never call it.next() out of turn.
  const queues: Array<Array<IteratorResult<T>>> = Array.from(
    { length: n },
    () => [],
  );
  let pull: Promise<void> | null = null;

  const advance = async (): Promise<void> => {
    const r = await it.next();
    for (const q of queues) q.push(r);
  };

  const makeBranch = (i: number): AsyncIterable<T> => ({
    async *[Symbol.asyncIterator]() {
      for (;;) {
        if (queues[i]!.length === 0) {
          // Serialize pulls: only one advance() is in flight at a time.
          if (!pull) pull = advance().finally(() => (pull = null));
          await pull;
        }
        const r = queues[i]!.shift()!;
        if (r.done) return;
        yield r.value;
      }
    },
  });

  return Array.from({ length: n }, (_, i) => makeBranch(i));
}
