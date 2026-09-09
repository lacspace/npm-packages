import { test, expect } from "vitest";
import { createEmitter } from "./index";

type Events = {
  login: { userId: string };
  logout: void;
  message: string;
  tick: number;
};

/* ------------------------------ on / emit ------------------------------ */

test("on subscribes and emit delivers the payload", () => {
  const bus = createEmitter<Events>();
  const seen: string[] = [];
  bus.on("message", (text) => seen.push(text));
  bus.emit("message", "hi");
  bus.emit("message", "there");
  expect(seen).toEqual(["hi", "there"]);
});

test("emit to an event with no listeners is a harmless no-op", () => {
  const bus = createEmitter<Events>();
  expect(() => bus.emit("tick", 1)).not.toThrow();
});

test("multiple listeners for one event all fire, in registration order", () => {
  const bus = createEmitter<Events>();
  const order: number[] = [];
  bus.on("tick", () => order.push(1));
  bus.on("tick", () => order.push(2));
  bus.on("tick", () => order.push(3));
  bus.emit("tick", 0);
  expect(order).toEqual([1, 2, 3]);
});

test("listeners on different events are independent", () => {
  const bus = createEmitter<Events>();
  let msg = 0;
  let tick = 0;
  bus.on("message", () => msg++);
  bus.on("tick", () => tick++);
  bus.emit("message", "x");
  expect(msg).toBe(1);
  expect(tick).toBe(0);
});

/* ------------------------------ unsubscribe ------------------------------ */

test("on returns an unsubscribe function that stops delivery", () => {
  const bus = createEmitter<Events>();
  let count = 0;
  const off = bus.on("tick", () => count++);
  bus.emit("tick", 1);
  off();
  bus.emit("tick", 2);
  expect(count).toBe(1);
});

test("the unsubscribe function is idempotent", () => {
  const bus = createEmitter<Events>();
  let count = 0;
  const off = bus.on("tick", () => count++);
  off();
  off();
  bus.emit("tick", 1);
  expect(count).toBe(0);
});

test("the same handler subscribed once is only registered once (deduped)", () => {
  const bus = createEmitter<Events>();
  let count = 0;
  const h = () => count++;
  bus.on("tick", h);
  bus.on("tick", h);
  expect(bus.listenerCount("tick")).toBe(1);
  bus.emit("tick", 1);
  expect(count).toBe(1);
});

/* ------------------------------ once ------------------------------ */

test("once fires exactly one time then auto-unsubscribes", () => {
  const bus = createEmitter<Events>();
  let count = 0;
  bus.once("tick", () => count++);
  bus.emit("tick", 1);
  bus.emit("tick", 2);
  bus.emit("tick", 3);
  expect(count).toBe(1);
  expect(bus.listenerCount("tick")).toBe(0);
});

test("once receives the payload of the first emit", () => {
  const bus = createEmitter<Events>();
  let seen: number | undefined;
  bus.once("tick", (n) => (seen = n));
  bus.emit("tick", 42);
  expect(seen).toBe(42);
});

test("a pending once can be cancelled via its unsubscribe handle", () => {
  const bus = createEmitter<Events>();
  let count = 0;
  const off = bus.once("tick", () => count++);
  off();
  bus.emit("tick", 1);
  expect(count).toBe(0);
});

test("off(event, handler) cancels a pending once by original handler", () => {
  const bus = createEmitter<Events>();
  let count = 0;
  const h = () => count++;
  bus.once("tick", h);
  bus.off("tick", h);
  bus.emit("tick", 1);
  expect(count).toBe(0);
});

/* ------------------------------ off ------------------------------ */

test("off with a handler removes only that listener", () => {
  const bus = createEmitter<Events>();
  let a = 0;
  let b = 0;
  const ha = () => a++;
  const hb = () => b++;
  bus.on("tick", ha);
  bus.on("tick", hb);
  bus.off("tick", ha);
  bus.emit("tick", 1);
  expect(a).toBe(0);
  expect(b).toBe(1);
});

test("off without a handler removes every listener for the event", () => {
  const bus = createEmitter<Events>();
  let count = 0;
  bus.on("tick", () => count++);
  bus.on("tick", () => count++);
  bus.off("tick");
  bus.emit("tick", 1);
  expect(count).toBe(0);
  expect(bus.listenerCount("tick")).toBe(0);
});

test("off on an unknown event is a no-op", () => {
  const bus = createEmitter<Events>();
  expect(() => bus.off("logout")).not.toThrow();
});

/* ------------------------------ listenerCount ------------------------------ */

test("listenerCount reports per-event counts", () => {
  const bus = createEmitter<Events>();
  bus.on("tick", () => {});
  bus.on("tick", () => {});
  bus.on("message", () => {});
  expect(bus.listenerCount("tick")).toBe(2);
  expect(bus.listenerCount("message")).toBe(1);
  expect(bus.listenerCount("logout")).toBe(0);
});

test("listenerCount() with no argument totals every listener including wildcard", () => {
  const bus = createEmitter<Events>();
  bus.on("tick", () => {});
  bus.on("message", () => {});
  bus.onAny(() => {});
  expect(bus.listenerCount()).toBe(3);
});

/* ------------------------------ removeAllListeners ------------------------------ */

test("removeAllListeners(event) clears just that event", () => {
  const bus = createEmitter<Events>();
  bus.on("tick", () => {});
  bus.on("message", () => {});
  bus.removeAllListeners("tick");
  expect(bus.listenerCount("tick")).toBe(0);
  expect(bus.listenerCount("message")).toBe(1);
});

test("removeAllListeners() clears everything including wildcard", () => {
  const bus = createEmitter<Events>();
  bus.on("tick", () => {});
  bus.on("message", () => {});
  bus.onAny(() => {});
  bus.removeAllListeners();
  expect(bus.listenerCount()).toBe(0);
});

/* ------------------------------ error isolation ------------------------------ */

test("a throwing listener does not stop the others", () => {
  const bus = createEmitter<Events>();
  const seen: number[] = [];
  bus.on("tick", () => seen.push(1));
  bus.on("tick", () => {
    throw new Error("boom");
  });
  bus.on("tick", () => seen.push(3));
  bus.emit("tick", 0);
  expect(seen).toEqual([1, 3]);
});

test("onError receives the thrown value and the event name", () => {
  const errors: Array<{ error: unknown; event: keyof Events }> = [];
  const bus = createEmitter<Events>({ onError: (error, event) => errors.push({ error, event }) });
  const boom = new Error("boom");
  bus.on("tick", () => {
    throw boom;
  });
  bus.emit("tick", 1);
  expect(errors).toHaveLength(1);
  expect(errors[0]!.error).toBe(boom);
  expect(errors[0]!.event).toBe("tick");
});

test("without onError a throwing listener is swallowed and emit still returns", () => {
  const bus = createEmitter<Events>();
  bus.on("tick", () => {
    throw new Error("boom");
  });
  expect(() => bus.emit("tick", 1)).not.toThrow();
});

/* ------------------------------ safe mutation during emit ------------------------------ */

test("a listener added during emit does not fire for the in-flight event", () => {
  const bus = createEmitter<Events>();
  let lateFired = false;
  bus.on("tick", () => {
    bus.on("tick", () => {
      lateFired = true;
    });
  });
  bus.emit("tick", 1);
  expect(lateFired).toBe(false);
  // but it does fire on the next emit
  bus.emit("tick", 2);
  expect(lateFired).toBe(true);
});

test("a listener removed during emit is not called after removal", () => {
  const bus = createEmitter<Events>();
  const seen: string[] = [];
  const second = () => seen.push("second");
  bus.on("tick", () => {
    seen.push("first");
    bus.off("tick", second);
  });
  bus.on("tick", second);
  bus.emit("tick", 1);
  expect(seen).toEqual(["first"]);
});

test("a listener that unsubscribes itself during emit is fine", () => {
  const bus = createEmitter<Events>();
  let count = 0;
  const off = bus.on("tick", () => {
    count++;
    off();
  });
  bus.emit("tick", 1);
  bus.emit("tick", 2);
  expect(count).toBe(1);
});

/* ------------------------------ waitFor ------------------------------ */

test("waitFor resolves with the next payload", async () => {
  const bus = createEmitter<Events>();
  const p = bus.waitFor("login");
  bus.emit("login", { userId: "u1" });
  await expect(p).resolves.toEqual({ userId: "u1" });
});

test("waitFor only resolves once even if the event fires again", async () => {
  const bus = createEmitter<Events>();
  const p = bus.waitFor("tick");
  bus.emit("tick", 1);
  bus.emit("tick", 2);
  await expect(p).resolves.toBe(1);
  expect(bus.listenerCount("tick")).toBe(0);
});

/* ------------------------------ onAny / offAny ------------------------------ */

test("onAny receives every event with its name and payload", () => {
  const bus = createEmitter<Events>();
  const seen: Array<[keyof Events, unknown]> = [];
  bus.onAny((event, payload) => seen.push([event, payload]));
  bus.emit("message", "hi");
  bus.emit("tick", 7);
  expect(seen).toEqual([
    ["message", "hi"],
    ["tick", 7],
  ]);
});

test("onAny returns an unsubscribe handle", () => {
  const bus = createEmitter<Events>();
  let count = 0;
  const off = bus.onAny(() => count++);
  bus.emit("tick", 1);
  off();
  bus.emit("tick", 2);
  expect(count).toBe(1);
});

test("offAny removes a wildcard listener", () => {
  const bus = createEmitter<Events>();
  let count = 0;
  const h = () => count++;
  bus.onAny(h);
  bus.offAny(h);
  bus.emit("tick", 1);
  expect(count).toBe(0);
});

test("wildcard and specific listeners both fire for the same emit", () => {
  const bus = createEmitter<Events>();
  const seen: string[] = [];
  bus.on("tick", () => seen.push("specific"));
  bus.onAny(() => seen.push("any"));
  bus.emit("tick", 1);
  expect(seen).toEqual(["specific", "any"]);
});

test("a throwing wildcard listener is isolated and routed to onError", () => {
  const errors: unknown[] = [];
  const bus = createEmitter<Events>({ onError: (e) => errors.push(e) });
  const boom = new Error("wild");
  bus.onAny(() => {
    throw boom;
  });
  let reached = false;
  bus.on("tick", () => (reached = true));
  bus.emit("tick", 1);
  expect(reached).toBe(true);
  expect(errors).toEqual([boom]);
});
