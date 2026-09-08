import { test, expect } from "vitest";
import {
  mapStream,
  filterStream,
  takeStream,
  bufferStream,
  tee,
} from "./index";

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

async function* range(n: number): AsyncIterable<number> {
  for (let i = 0; i < n; i++) yield i;
}

test("mapStream transforms each item and passes the index", async () => {
  const out = await collect(mapStream(range(4), (v, i) => `${i}:${v * 2}`));
  expect(out).toEqual(["0:0", "1:2", "2:4", "3:6"]);
});

test("mapStream awaits async mappers in order", async () => {
  const out = await collect(
    mapStream(range(3), async (v) => {
      await Promise.resolve();
      return v + 100;
    }),
  );
  expect(out).toEqual([100, 101, 102]);
});

test("filterStream keeps only matching items", async () => {
  const out = await collect(filterStream(range(6), (v) => v % 2 === 0));
  expect(out).toEqual([0, 2, 4]);
});

test("filterStream supports async predicates", async () => {
  const out = await collect(
    filterStream(range(5), async (v) => v > 2),
  );
  expect(out).toEqual([3, 4]);
});

test("takeStream yields at most n items and stops early", async () => {
  let pulled = 0;
  async function* counted(): AsyncIterable<number> {
    for (let i = 0; ; i++) {
      pulled++;
      yield i;
    }
  }
  const out = await collect(takeStream(counted(), 3));
  expect(out).toEqual([0, 1, 2]);
  // The infinite source was not drained far past what take consumed.
  expect(pulled).toBeLessThanOrEqual(4);
});

test("takeStream with n<=0 yields nothing", async () => {
  expect(await collect(takeStream(range(5), 0))).toEqual([]);
  expect(await collect(takeStream(range(5), -2))).toEqual([]);
});

test("bufferStream groups items into fixed-size batches", async () => {
  const out = await collect(bufferStream(range(7), 3));
  expect(out).toEqual([[0, 1, 2], [3, 4, 5], [6]]);
});

test("bufferStream treats a non-positive size as 1", async () => {
  const out = await collect(bufferStream(range(3), 0));
  expect(out).toEqual([[0], [1], [2]]);
});

test("tee splits a stream so every branch sees every item", async () => {
  const [a, b] = tee(range(4)) as [AsyncIterable<number>, AsyncIterable<number>];
  const [ra, rb] = await Promise.all([collect(a), collect(b)]);
  expect(ra).toEqual([0, 1, 2, 3]);
  expect(rb).toEqual([0, 1, 2, 3]);
});

test("tee pulls the source exactly once regardless of branch count", async () => {
  let pulled = 0;
  async function* counted(): AsyncIterable<number> {
    for (let i = 0; i < 3; i++) {
      pulled++;
      yield i;
    }
  }
  const [a, b, c] = tee(counted(), 3) as [
    AsyncIterable<number>,
    AsyncIterable<number>,
    AsyncIterable<number>,
  ];
  const [ra, rb, rc] = await Promise.all([collect(a), collect(b), collect(c)]);
  expect(ra).toEqual([0, 1, 2]);
  expect(rb).toEqual([0, 1, 2]);
  expect(rc).toEqual([0, 1, 2]);
  expect(pulled).toBe(3); // not 9
});

test("transforms compose", async () => {
  const out = await collect(
    mapStream(
      filterStream(range(10), (v) => v % 2 === 0),
      (v) => v / 2,
    ),
  );
  expect(out).toEqual([0, 1, 2, 3, 4]);
});
