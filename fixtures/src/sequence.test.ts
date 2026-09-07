import { beforeEach, describe, expect, it } from "vitest";
import { defineFactory, resetSequences, sequence } from "./index";

describe("sequence() standalone generator", () => {
  beforeEach(() => {
    resetSequences();
  });

  it("auto-increments from 1 by default", () => {
    const s = sequence();
    expect([s(), s(), s()]).toEqual([1, 2, 3]);
  });

  it("maps the counter through a function", () => {
    const email = sequence((n) => `user${n}@example.com`);
    expect(email()).toBe("user1@example.com");
    expect(email()).toBe("user2@example.com");
  });

  it("honours a custom start", () => {
    const s = sequence((n) => n, 100);
    expect([s(), s()]).toEqual([100, 101]);
  });

  it("peek shows the next value without advancing", () => {
    const s = sequence();
    expect(s.peek).toBe(1);
    s();
    expect(s.peek).toBe(2);
  });

  it("reset() restarts the individual counter", () => {
    const s = sequence();
    s();
    s();
    s.reset();
    expect(s()).toBe(1);
  });

  it("resetSequences() resets registered sequences", () => {
    const s = sequence();
    s();
    s();
    resetSequences();
    expect(s()).toBe(1);
  });

  it("works as a field generator inside a factory build", () => {
    const id = sequence();
    const f = defineFactory({ build: () => ({ id: id() }) });
    resetSequences();
    expect(f.buildList(3).map((x) => x.id)).toEqual([1, 2, 3]);
  });
});
