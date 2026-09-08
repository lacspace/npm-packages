import { describe, it, expect, vi } from "vitest";
import { createNotifier } from "./core";

describe("createNotifier", () => {
  it("adds toasts newest-first and notifies subscribers", () => {
    const n = createNotifier();
    const seen: number[] = [];
    n.subscribe((t) => seen.push(t.length));
    const id = n.success("Saved");
    expect(typeof id).toBe("string");
    expect(n.getToasts()[0]!.message).toBe("Saved");
    expect(n.getToasts()[0]!.type).toBe("success");
    expect(seen).toContain(1);
  });

  it("sets the type via the shorthand methods", () => {
    const n = createNotifier();
    n.error("boom");
    n.info("fyi");
    const types = n.getToasts().map((t) => t.type);
    expect(types).toEqual(["info", "error"]); // newest first
  });

  it("caps at `max`, dropping the oldest", () => {
    const n = createNotifier({ max: 2 });
    n.notify("a");
    n.notify("b");
    n.notify("c");
    expect(n.getToasts().map((t) => t.message)).toEqual(["c", "b"]);
  });

  it("auto-dismisses after the duration", () => {
    vi.useFakeTimers();
    const n = createNotifier({ defaultDuration: 1000 });
    n.success("bye");
    expect(n.getToasts().length).toBe(1);
    vi.advanceTimersByTime(1000);
    expect(n.getToasts().length).toBe(0);
    vi.useRealTimers();
  });

  it("loading toasts are sticky (duration 0)", () => {
    vi.useFakeTimers();
    const n = createNotifier({ defaultDuration: 500 });
    n.loading("working");
    vi.advanceTimersByTime(5000);
    expect(n.getToasts().length).toBe(1);
    vi.useRealTimers();
  });

  it("dismiss and dismissAll work", () => {
    const n = createNotifier();
    const id = n.notify("x");
    n.notify("y");
    n.dismiss(id);
    expect(n.getToasts().map((t) => t.message)).toEqual(["y"]);
    n.dismissAll();
    expect(n.getToasts().length).toBe(0);
  });

  it("promise() flips loading → success and resolves with the value", async () => {
    const n = createNotifier();
    const value = await n.promise(Promise.resolve(42), {
      loading: "loading",
      success: (v) => `got ${v}`,
      error: "failed",
    });
    expect(value).toBe(42);
    expect(n.getToasts()[0]!.type).toBe("success");
    expect(n.getToasts()[0]!.message).toBe("got 42");
  });

  it("promise() flips loading → error and rejects", async () => {
    const n = createNotifier();
    await expect(
      n.promise(Promise.reject(new Error("nope")), { loading: "l", success: "s", error: (e) => (e as Error).message }),
    ).rejects.toThrow("nope");
    expect(n.getToasts()[0]!.type).toBe("error");
    expect(n.getToasts()[0]!.message).toBe("nope");
  });

  it("update() patches an existing toast in place", () => {
    const n = createNotifier();
    const id = n.loading("uploading");
    n.update(id, { type: "success", message: "done", duration: 0 });
    expect(n.getToasts().length).toBe(1);
    expect(n.getToasts()[0]!.type).toBe("success");
    expect(n.getToasts()[0]!.message).toBe("done");
  });

  it("unsubscribe stops notifications", () => {
    const n = createNotifier();
    const cb = vi.fn();
    const off = n.subscribe(cb);
    n.notify("a");
    off();
    n.notify("b");
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
