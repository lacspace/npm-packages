import { describe, expect, it, vi } from "vitest";
import { contentHash, createLlmCache, memoryStore } from "./index.js";

describe("contentHash", () => {
  it("is stable and 32 hex chars", () => {
    expect(contentHash("hello")).toBe(contentHash("hello"));
    expect(contentHash("hello")).toMatch(/^[0-9a-f]{32}$/);
    expect(contentHash("hello")).not.toBe(contentHash("world"));
  });
});

describe("memoryStore", () => {
  it("stores, expires and evicts LRU", () => {
    const s = memoryStore({ maxEntries: 2 });
    s.set("a", { value: 1, storedAt: Date.now(), expiresAt: null });
    s.set("b", { value: 2, storedAt: Date.now(), expiresAt: Date.now() - 1 }); // already expired
    expect(s.get("a")!.value).toBe(1);
    expect(s.get("b")).toBeNull();
    s.set("c", { value: 3, storedAt: Date.now(), expiresAt: null });
    s.set("d", { value: 4, storedAt: Date.now(), expiresAt: null }); // over cap → evict LRU
    expect(s.size()).toBeLessThanOrEqual(2);
  });
});

describe("createLlmCache", () => {
  it("keys by model + promptVersion + variant + normalized input", () => {
    const c = createLlmCache();
    const base = { input: "Summarize this.", model: "gemini" };
    expect(c.key(base)).toBe(c.key({ input: "  Summarize   this.  ", model: "gemini" })); // normalized
    expect(c.key(base)).not.toBe(c.key({ ...base, model: "groq" }));
    expect(c.key(base)).not.toBe(c.key({ ...base, promptVersion: "v2" }));
    expect(c.key({ ...base, variant: { temp: 0.7 } })).toBe(c.key({ ...base, variant: { temp: 0.7 } }));
    expect(c.key({ ...base, variant: { temp: 0.7 } })).not.toBe(c.key({ ...base, variant: { temp: 0.2 } }));
  });

  it("get/set round-trips and counts hits/misses", async () => {
    const c = createLlmCache();
    const key = { input: "x", model: "gemini" };
    expect((await c.get(key)).hit).toBe(false);
    await c.set(key, { text: "hi" });
    const g = await c.get<{ text: string }>(key);
    expect(g.hit).toBe(true);
    expect(g.value!.text).toBe("hi");
    expect(c.stats()).toMatchObject({ hits: 1, misses: 1, sets: 1 });
  });

  it("wrap runs fn once then serves cache — the retry-after-429 case", async () => {
    const c = createLlmCache();
    const fn = vi.fn().mockResolvedValue({ answer: 42 });
    const key = { input: "same prompt", model: "groq" };
    const a = await c.wrap(key, fn);
    const b = await c.wrap(key, fn); // identical retry pays nothing
    expect(a).toEqual(b);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("respects TTL", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const c = createLlmCache({ ttlMs: 100 });
    await c.set({ input: "y" }, "v");
    expect((await c.get({ input: "y" })).hit).toBe(true);
    now += 101;
    expect((await c.get({ input: "y" })).hit).toBe(false);
    vi.restoreAllMocks();
  });

  it("stale-if-error returns the last good value when fn throws", async () => {
    const c = createLlmCache();
    const key = { input: "z" };
    await c.wrap(key, async () => "good");
    const v = await c.wrap(key, async () => { throw new Error("429"); }, { staleIfError: true });
    expect(v).toBe("good");
    await expect(c.wrap({ input: "never-cached" }, async () => { throw new Error("boom"); }, { staleIfError: true })).rejects.toThrow("boom");
  });

  it("works with a custom (async) store", async () => {
    const backing = new Map<string, unknown>();
    const c = createLlmCache({
      store: {
        get: async (k) => (backing.get(k) as never) ?? null,
        set: async (k, r) => void backing.set(k, r),
        delete: async (k) => void backing.delete(k),
      },
    });
    await c.set({ input: "q" }, "cached");
    expect((await c.get({ input: "q" })).value).toBe("cached");
    await c.delete({ input: "q" });
    expect((await c.get({ input: "q" })).hit).toBe(false);
  });
});
