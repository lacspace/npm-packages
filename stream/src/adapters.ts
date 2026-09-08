/**
 * Bridges between async iterables and WHATWG `ReadableStream`, plus `AbortSignal`
 * support. Complements {@link toAsyncIterable} (stream → iterable) with the
 * reverse direction and an abort wrapper. Zero-dependency, isomorphic.
 */

/**
 * Wrap an async iterable in a `ReadableStream` — the inverse of
 * {@link toAsyncIterable}. Pulls one item per `pull`, and calls the source's
 * `return()` when the stream is cancelled so upstream cleanup runs.
 *
 * ```ts
 * const body = toReadableStream(mapStream(parseSSE(src), (e) => e.data + "\n"));
 * ```
 */
export function toReadableStream<T>(
  source: AsyncIterable<T>,
): ReadableStream<T> {
  let it: AsyncIterator<T> | undefined;
  return new ReadableStream<T>({
    start() {
      it = source[Symbol.asyncIterator]();
    },
    async pull(controller) {
      try {
        const { done, value } = await it!.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (err) {
        controller.error(err);
      }
    },
    async cancel(reason) {
      if (it?.return) await it.return(reason);
    },
  });
}

/** Thrown by {@link withAbort} when the provided signal aborts. */
export class StreamAbortError extends Error {
  constructor(message = "The stream was aborted") {
    super(message);
    this.name = "StreamAbortError";
  }
}

/**
 * Make any async iterable abortable via an `AbortSignal`. Iteration stops as
 * soon as the signal fires (between items, or mid-`await` on the next item),
 * throwing — by default a {@link StreamAbortError}, or the signal's own
 * `reason` if `throwReason` is set. The source's `return()` is invoked so it can
 * clean up. If the signal is already aborted, it throws before the first item.
 *
 * ```ts
 * const ctrl = new AbortController();
 * setTimeout(() => ctrl.abort(), 5000);
 * for await (const c of withAbort(streamChat(res, opts), ctrl.signal)) { ... }
 * ```
 */
export async function* withAbort<T>(
  source: AsyncIterable<T>,
  signal: AbortSignal,
  options: { throwReason?: boolean } = {},
): AsyncIterable<T> {
  const fail = () =>
    options.throwReason && signal.reason !== undefined
      ? signal.reason
      : new StreamAbortError();

  if (signal.aborted) throw fail();

  const it = source[Symbol.asyncIterator]();
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(fail());
    signal.addEventListener("abort", onAbort, { once: true });
  });
  // Swallow the rejection if it never wins the race (avoids an unhandled rejection).
  aborted.catch(() => {});

  try {
    for (;;) {
      const next = it.next();
      const r = await Promise.race([next, aborted]);
      if (r.done) return;
      yield r.value;
    }
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
    if (it.return) await it.return();
  }
}
