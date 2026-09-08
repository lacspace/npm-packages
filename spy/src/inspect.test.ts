import { describe, it, expect } from "vitest";
import { spy, spyOn, stub, resetAll, restoreAll } from "./index";

describe("spy — inspection helpers", () => {
  it("returnValues collects returned values and skips throws", () => {
    const s = spy((n: number) => {
      if (n < 0) throw new Error("neg");
      return n * 2;
    });
    s(1);
    expect(() => s(-1)).toThrow("neg");
    s(3);
    expect(s.returnValues).toEqual([2, 6]);
  });

  it("nthCall returns the 1-based argument tuple or undefined", () => {
    const s = spy();
    s("a");
    s("b");
    expect(s.nthCall(1)).toEqual(["a"]);
    expect(s.nthCall(2)).toEqual(["b"]);
    expect(s.nthCall(3)).toBeUndefined();
    expect(s.nthCall(0)).toBeUndefined();
  });

  it("nthCalledWith deep-matches a specific call", () => {
    const s = spy();
    s(1, 2);
    s({ ok: true });
    expect(s.nthCalledWith(1, 1, 2)).toBe(true);
    expect(s.nthCalledWith(2, { ok: true })).toBe(true);
    expect(s.nthCalledWith(2, { ok: false })).toBe(false);
    expect(s.nthCalledWith(5, "x")).toBe(false);
  });

  it("calledOnceWith requires exactly one matching call", () => {
    const s = spy();
    s("only");
    expect(s.calledOnceWith("only")).toBe(true);
    s("again");
    expect(s.calledOnceWith("only")).toBe(false);
  });
});

describe("spy — rejectsOnce / callsFakeOnce", () => {
  it("rejectsOnce queues a single rejection then falls back", async () => {
    const s = spy().resolves("ok");
    s.rejectsOnce(new Error("boom"));
    await expect(s()).rejects.toThrow("boom");
    await expect(s()).resolves.toBe("ok");
  });

  it("callsFakeOnce delegates once then falls back to default", () => {
    const s = spy().returns(0);
    s.callsFakeOnce((n: number) => n + 100);
    expect(s(5)).toBe(105);
    expect(s(5)).toBe(0);
  });

  it("once methods interleave FIFO across kinds", async () => {
    const s = spy().returns("D");
    s.returnsOnce("A").callsFakeOnce(() => "B").rejectsOnce(new Error("C"));
    expect(s()).toBe("A");
    expect(s()).toBe("B");
    await expect(s()).rejects.toThrow("C");
    expect(s()).toBe("D");
  });
});

describe("resetAll", () => {
  it("clears history of active spyOn/stub spies without restoring", () => {
    const obj = { save: (x: number) => x, kill: () => "real" };
    const save = spyOn(obj, "save");
    const kill = stub(obj, "kill", () => "stubbed");

    obj.save(1);
    obj.kill();
    expect(save.callCount).toBe(1);
    expect(kill.callCount).toBe(1);

    resetAll();
    expect(save.callCount).toBe(0);
    expect(kill.callCount).toBe(0);

    // Patches survive resetAll (behaviour kept).
    expect(obj.save(2)).toBe(2);
    expect(obj.kill()).toBe("stubbed");
    expect(save.callCount).toBe(1);

    restoreAll();
    expect(obj.kill()).toBe("real");
  });

  it("is a no-op when nothing is registered", () => {
    restoreAll();
    expect(() => resetAll()).not.toThrow();
  });
});
