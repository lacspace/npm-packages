import { beforeEach, describe, expect, it } from "vitest";
import { deepAwait, defineFactory, resetSequences, seed } from "./index";

describe("deepAwait()", () => {
  it("resolves promise-valued fields of a plain object", async () => {
    const out = await deepAwait({
      a: Promise.resolve(1),
      b: 2,
      nested: { c: Promise.resolve("x") },
    });
    expect(out).toEqual({ a: 1, b: 2, nested: { c: "x" } });
  });

  it("resolves promises inside arrays", async () => {
    const out = await deepAwait([Promise.resolve(1), 2, Promise.resolve(3)]);
    expect(out).toEqual([1, 2, 3]);
  });

  it("leaves Date and other non-plain values untouched", async () => {
    const d = new Date("2020-01-01");
    const out = await deepAwait({ when: d, n: 5 });
    expect(out.when).toBe(d);
    expect(out.n).toBe(5);
  });

  it("returns primitives as-is", async () => {
    expect(await deepAwait(42)).toBe(42);
    expect(await deepAwait("hi")).toBe("hi");
  });
});

describe("Factory.buildAsync()", () => {
  beforeEach(() => {
    seed(2024);
    resetSequences();
  });

  it("resolves promise fields produced by build(ctx)", async () => {
    const user = defineFactory({
      name: "async-user",
      build: (ctx) => ({
        id: ctx.sequence,
        token: Promise.resolve(`tok-${ctx.sequence}`),
      }),
    });
    const u = await user.buildAsync();
    expect(u).toEqual({ id: 1, token: "tok-1" });
  });

  it("buildListAsync resolves each object", async () => {
    const f = defineFactory({
      build: (ctx) => ({ id: ctx.sequence, v: Promise.resolve(ctx.sequence * 2) }),
    });
    const list = await f.buildListAsync(3);
    expect(list).toEqual([
      { id: 1, v: 2 },
      { id: 2, v: 4 },
      { id: 3, v: 6 },
    ]);
  });

  it("stays deterministic across identical seeds", async () => {
    const f = defineFactory({
      name: "async-det",
      build: (ctx) => ({ n: ctx.int(1, 1000), token: Promise.resolve(ctx.uuid()) }),
    });
    const a = await f.buildAsync();
    seed(2024);
    resetSequences();
    const b = await f.buildAsync();
    expect(b).toEqual(a);
  });
});
