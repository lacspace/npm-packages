import { test, expect } from "vitest";
import { createVectorStore, fromJSON } from "./index";
import type { VectorRecord } from "./index";

function seed() {
  const store = createVectorStore({ metric: "cosine" });
  store.upsert([
    { id: "a", vector: [1, 0], text: "east", metadata: { lang: "en" } },
    { id: "b", vector: [0, 1], text: "north", metadata: { lang: "en" } },
    { id: "c", vector: [-1, 0], text: "west", metadata: { lang: "fr" } },
  ]);
  return store;
}

test("upsert single record and read size / has / get", () => {
  const store = createVectorStore();
  store.upsert({ id: "x", vector: [1, 2, 3], text: "hi" });
  expect(store.size).toBe(1);
  expect(store.has("x")).toBe(true);
  expect(store.get("x")?.text).toBe("hi");
  expect(store.get("missing")).toBeUndefined();
});

test("upsert array and overwrite by id", () => {
  const store = createVectorStore();
  store.upsert([
    { id: "a", vector: [1, 0] },
    { id: "b", vector: [0, 1] },
  ]);
  expect(store.size).toBe(2);
  store.upsert({ id: "a", vector: [0.5, 0.5], text: "updated" });
  expect(store.size).toBe(2);
  expect(store.get("a")?.text).toBe("updated");
  expect(store.get("a")?.vector).toEqual([0.5, 0.5]);
});

test("delete and clear", () => {
  const store = seed();
  expect(store.delete("a")).toBe(true);
  expect(store.delete("a")).toBe(false);
  expect(store.size).toBe(2);
  store.clear();
  expect(store.size).toBe(0);
});

test("all() returns clones, not internal references", () => {
  const store = seed();
  const all = store.all();
  expect(all).toHaveLength(3);
  (all[0] as VectorRecord).vector[0] = 999;
  // mutating the returned copy must not corrupt the store
  expect(store.get(all[0]!.id)?.vector[0]).not.toBe(999);
});

test("get returns a clone (mutation-safe)", () => {
  const store = seed();
  const rec = store.get("a")!;
  rec.metadata!.lang = "zz";
  expect(store.get("a")?.metadata?.lang).toBe("en");
});

test("query returns nearest first by cosine", () => {
  const store = seed();
  const hits = store.query([0.9, 0.1], { k: 3 });
  expect(hits[0]?.id).toBe("a"); // closest to east
  expect(hits[hits.length - 1]?.id).toBe("c"); // opposite direction
  // scores strictly non-increasing
  for (let i = 1; i < hits.length; i++) {
    expect(hits[i - 1]!.score).toBeGreaterThanOrEqual(hits[i]!.score);
  }
});

test("query respects k", () => {
  const store = seed();
  expect(store.query([1, 0], { k: 1 })).toHaveLength(1);
  expect(store.query([1, 0], { k: 2 })).toHaveLength(2);
});

test("query default k is 10 (returns all when fewer)", () => {
  const store = seed();
  expect(store.query([1, 0])).toHaveLength(3);
});

test("query filter is applied", () => {
  const store = seed();
  const hits = store.query([1, 0], {
    filter: (r) => r.metadata?.lang === "fr",
  });
  expect(hits).toHaveLength(1);
  expect(hits[0]?.id).toBe("c");
});

test("query minScore drops low hits", () => {
  const store = seed();
  const hits = store.query([1, 0], { minScore: 0.5 });
  // only "a" (cos 1) clears 0.5; b is 0, c is -1
  expect(hits.map((h) => h.id)).toEqual(["a"]);
});

test("query includeVectors toggles vector on the result", () => {
  const store = seed();
  expect(store.query([1, 0], { k: 1 })[0]?.vector).toBeUndefined();
  expect(store.query([1, 0], { k: 1, includeVectors: true })[0]?.vector).toEqual([1, 0]);
});

test("query carries metadata and text through", () => {
  const store = seed();
  const top = store.query([1, 0], { k: 1 })[0]!;
  expect(top.text).toBe("east");
  expect(top.metadata).toEqual({ lang: "en" });
});

test("queryById excludes self by default and can include it", () => {
  const store = seed();
  const without = store.queryById("a");
  expect(without.map((h) => h.id)).not.toContain("a");
  const withSelf = store.queryById("a", { includeSelf: true });
  expect(withSelf[0]?.id).toBe("a"); // self is most similar to itself
});

test("queryById throws on unknown id", () => {
  const store = seed();
  expect(() => store.queryById("nope")).toThrow(/no record/);
});

test("dot metric ranks by raw dot product", () => {
  const store = createVectorStore({ metric: "dot" });
  store.upsert([
    { id: "small", vector: [1, 1] },
    { id: "big", vector: [10, 10] },
  ]);
  const hits = store.query([1, 1], { k: 2 });
  expect(hits[0]?.id).toBe("big"); // larger magnitude wins under dot
});

test("euclidean metric ranks nearest first with higher score", () => {
  const store = createVectorStore({ metric: "euclidean" });
  store.upsert([
    { id: "near", vector: [0, 0] },
    { id: "far", vector: [10, 10] },
  ]);
  const hits = store.query([0.1, 0.1], { k: 2 });
  expect(hits[0]?.id).toBe("near");
  expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);
});

test("dimensions is adopted from first vector when not set", () => {
  const store = createVectorStore();
  expect(store.dimensions).toBeNull();
  store.upsert({ id: "a", vector: [1, 2, 3] });
  expect(store.dimensions).toBe(3);
});

test("dimension-mismatch guard on upsert", () => {
  const store = createVectorStore({ dimensions: 3 });
  expect(() => store.upsert({ id: "a", vector: [1, 2] })).toThrow(/dimension mismatch/);
  // adopted-dimension guard too
  const auto = createVectorStore();
  auto.upsert({ id: "a", vector: [1, 2] });
  expect(() => auto.upsert({ id: "b", vector: [1, 2, 3] })).toThrow(/dimension mismatch/);
});

test("dimension-mismatch guard on query", () => {
  const store = seed(); // 2-D
  expect(() => store.query([1, 2, 3])).toThrow(/dimension mismatch/);
});

test("upsert rejects non-finite values and empty ids atomically", () => {
  const store = createVectorStore();
  expect(() => store.upsert({ id: "", vector: [1] })).toThrow(/id/);
  expect(() => store.upsert({ id: "a", vector: [Number.NaN] })).toThrow(/finite/);
  // batch with one bad item writes nothing (atomic validation)
  expect(() =>
    store.upsert([
      { id: "ok", vector: [1, 2] },
      { id: "bad", vector: [Infinity, 2] },
    ]),
  ).toThrow(/finite/);
  expect(store.size).toBe(0);
});

test("toJSON / fromJSON round-trips records, metric and dimensions", () => {
  const store = createVectorStore({ metric: "euclidean" });
  store.upsert([
    { id: "a", vector: [1, 0], text: "east", metadata: { n: 1 } },
    { id: "b", vector: [0, 1] },
  ]);
  const json = store.toJSON();
  expect(json.version).toBe(1);
  expect(json.metric).toBe("euclidean");
  expect(json.dimensions).toBe(2);

  const roundTripped = JSON.parse(JSON.stringify(json));
  const restored = fromJSON(roundTripped);
  expect(restored.metric).toBe("euclidean");
  expect(restored.dimensions).toBe(2);
  expect(restored.size).toBe(2);
  expect(restored.get("a")?.text).toBe("east");
  expect(restored.get("a")?.metadata).toEqual({ n: 1 });
  // queries behave identically after restore
  expect(restored.query([1, 0], { k: 1 })[0]?.id).toBe("a");
});

test("load() replaces contents and is chainable", () => {
  const store = seed();
  const snapshot = store.toJSON();
  const fresh = createVectorStore();
  fresh.upsert({ id: "temp", vector: [9, 9] });
  const ret = fresh.load(snapshot);
  expect(ret).toBe(fresh);
  expect(fresh.has("temp")).toBe(false);
  expect(fresh.size).toBe(3);
});

test("load rejects unsupported version", () => {
  const store = createVectorStore();
  expect(() => store.load({ version: 2 } as never)).toThrow(/version 1/);
});
