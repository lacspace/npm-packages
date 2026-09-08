import { test, expect } from "vitest";
import {
  toReadableStream,
  toAsyncIterable,
  withAbort,
  StreamAbortError,
} from "./index";

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

async function* range(n: number): AsyncIterable<number> {
  for (let i = 0; i < n; i++) yield i;
}

test("toReadableStream round-trips through toAsyncIterable", async () => {
  const stream = toReadableStream(range(4));
  expect(stream).toBeInstanceOf(ReadableStream);
  const out = await collect(toAsyncIterable<number>(stream));
  expect(out).toEqual([0, 1, 2, 3]);
});

test("toReadableStream propagates source errors to the reader", async () => {
  async function* boom(): AsyncIterable<number> {
    yield 1;
    throw new Error("kaboom");
  }
  const reader = toReadableStream(boom()).getReader();
  expect((await reader.read()).value).toBe(1);
  await expect(reader.read()).rejects.toThrow("kaboom");
});

test("toReadableStream calls the source's return() on cancel", async () => {
  let cleaned = false;
  async function* src(): AsyncIterable<number> {
    try {
      yield 1;
      yield 2;
    } finally {
      cleaned = true;
    }
  }
  const stream = toReadableStream(src());
  const reader = stream.getReader();
  await reader.read();
  await reader.cancel();
  expect(cleaned).toBe(true);
});

test("withAbort passes items through when never aborted", async () => {
  const ctrl = new AbortController();
  const out = await collect(withAbort(range(3), ctrl.signal));
  expect(out).toEqual([0, 1, 2]);
});

test("withAbort throws StreamAbortError when the signal fires mid-stream", async () => {
  const ctrl = new AbortController();
  async function* slow(): AsyncIterable<number> {
    let i = 0;
    for (;;) {
      await new Promise((r) => setTimeout(r, 5));
      yield i++;
    }
  }
  const run = (async () => {
    const seen: number[] = [];
    for await (const v of withAbort(slow(), ctrl.signal)) {
      seen.push(v);
      if (v === 1) setTimeout(() => ctrl.abort(), 0);
    }
    return seen;
  })();
  await expect(run).rejects.toBeInstanceOf(StreamAbortError);
});

test("withAbort throws immediately if the signal is already aborted", async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  await expect(collect(withAbort(range(3), ctrl.signal))).rejects.toBeInstanceOf(
    StreamAbortError,
  );
});

test("withAbort can throw the signal's own reason", async () => {
  const ctrl = new AbortController();
  const reason = new Error("user cancelled");
  ctrl.abort(reason);
  await expect(
    collect(withAbort(range(3), ctrl.signal, { throwReason: true })),
  ).rejects.toBe(reason);
});

test("withAbort runs the source's return() cleanup on abort", async () => {
  const ctrl = new AbortController();
  let cleaned = false;
  async function* src(): AsyncIterable<number> {
    try {
      let i = 0;
      for (;;) {
        await new Promise((r) => setTimeout(r, 5));
        yield i++;
      }
    } finally {
      cleaned = true;
    }
  }
  const run = (async () => {
    for await (const v of withAbort(src(), ctrl.signal)) {
      if (v === 0) ctrl.abort();
    }
  })();
  await run.catch(() => {});
  expect(cleaned).toBe(true);
});
