import { test, expect } from "vitest";
import { createMachine, assign, interpret, createActor } from "./index";

/* ------------------------------ fixtures ------------------------------ */

interface LightCtx {
  attempts: number;
}
type LightEv = { type: "TIMER" } | { type: "EMERGENCY" };

function trafficLight() {
  return createMachine<LightCtx, LightEv>({
    id: "traffic-light",
    initial: "green",
    context: { attempts: 0 },
    states: {
      green: { on: { TIMER: "yellow" } },
      yellow: { on: { TIMER: "red" } },
      red: {
        entry: assign((c) => ({ attempts: c.attempts + 1 })),
        on: { TIMER: "green" },
      },
    },
    on: { EMERGENCY: "red" },
  });
}

/* ------------------------------ initialState ------------------------------ */

test("initialState carries the initial value and context", () => {
  const m = trafficLight();
  expect(m.initialState.value).toBe("green");
  expect(m.initialState.context).toEqual({ attempts: 0 });
  expect(m.initialState.changed).toBe(false);
  expect(m.initialState.done).toBe(false);
});

test("initialState runs the initial state's entry actions", () => {
  const order: string[] = [];
  const m = createMachine<{}, { type: "X" }>({
    initial: "boot",
    states: { boot: { entry: () => order.push("entered") } },
  });
  expect(m.initialState.value).toBe("boot");
  expect(order).toEqual(["entered"]);
});

test("initialState defaults context to {} when omitted", () => {
  const m = createMachine<Record<string, unknown>, { type: "X" }>({
    initial: "a",
    states: { a: {} },
  });
  expect(m.initialState.context).toEqual({});
});

test("id defaults to 'machine' and is overridable", () => {
  expect(createMachine({ initial: "a", states: { a: {} } }).id).toBe("machine");
  expect(trafficLight().id).toBe("traffic-light");
});

/* ------------------------------ pure transition ------------------------------ */

test("transition moves state on a valid event", () => {
  const m = trafficLight();
  const next = m.transition(m.initialState, { type: "TIMER" });
  expect(next.value).toBe("yellow");
  expect(next.changed).toBe(true);
});

test("transition chains across states", () => {
  const m = trafficLight();
  let s = m.initialState;
  s = m.transition(s, { type: "TIMER" }); // yellow
  s = m.transition(s, { type: "TIMER" }); // red
  expect(s.value).toBe("red");
  expect(s.context.attempts).toBe(1); // red entry ran
  s = m.transition(s, { type: "TIMER" }); // green
  expect(s.value).toBe("green");
});

test("unknown event → changed:false and same state value", () => {
  const m = trafficLight();
  const init = m.initialState;
  const next = m.transition(init, { type: "NOPE" } as any);
  expect(next.changed).toBe(false);
  expect(next.value).toBe("green");
  expect(next.context).toBe(init.context); // same object, untouched
});

test("event with no transition in the current state → changed:false", () => {
  const m = trafficLight();
  const red = m.transition(m.transition(m.initialState, { type: "TIMER" }), {
    type: "TIMER",
  });
  // red has no entry for a made-up event
  const next = m.transition(red, { type: "UNKNOWN" } as any);
  expect(next.changed).toBe(false);
  expect(next.value).toBe("red");
});

test("transition is pure — the input snapshot is not mutated", () => {
  const m = trafficLight();
  const init = m.initialState;
  const snapshot = { ...init, context: { ...init.context } };
  m.transition(init, { type: "TIMER" });
  expect(init).toEqual(snapshot);
});

/* ------------------------------ guards ------------------------------ */

interface GateCtx {
  key: number;
}
type GateEv = { type: "PUSH"; force?: number };

test("guard picks the first passing transition", () => {
  const m = createMachine<GateCtx, GateEv>({
    initial: "closed",
    context: { key: 5 },
    states: {
      closed: {
        on: {
          PUSH: [
            { target: "locked", guard: (c) => c.key < 3 },
            { target: "open", guard: (c) => c.key >= 3 },
            { target: "fallback" },
          ],
        },
      },
      locked: {},
      open: {},
      fallback: {},
    },
  });
  expect(m.transition(m.initialState, { type: "PUSH" }).value).toBe("open");
});

test("guard reads event payload", () => {
  const m = createMachine<GateCtx, GateEv>({
    initial: "closed",
    context: { key: 0 },
    states: {
      closed: {
        on: {
          PUSH: [
            { target: "open", guard: (_c, e) => (e.force ?? 0) > 10 },
            { target: "stuck" },
          ],
        },
      },
      open: {},
      stuck: {},
    },
  });
  expect(m.transition(m.initialState, { type: "PUSH", force: 99 }).value).toBe("open");
  expect(m.transition(m.initialState, { type: "PUSH", force: 1 }).value).toBe("stuck");
});

test("all guards failing → changed:false, state unchanged", () => {
  const m = createMachine<GateCtx, GateEv>({
    initial: "closed",
    context: { key: 5 },
    states: {
      closed: {
        on: {
          PUSH: [
            { target: "a", guard: () => false },
            { target: "b", guard: () => false },
          ],
        },
      },
      a: {},
      b: {},
    },
  });
  const next = m.transition(m.initialState, { type: "PUSH" });
  expect(next.changed).toBe(false);
  expect(next.value).toBe("closed");
});

test("string-shorthand transition works", () => {
  const m = createMachine<{}, { type: "GO" }>({
    initial: "a",
    states: { a: { on: { GO: "b" } }, b: {} },
  });
  expect(m.transition(m.initialState, { type: "GO" }).value).toBe("b");
});

/* ------------------------------ actions & assign ------------------------------ */

test("internal (targetless) transition runs actions without changing value", () => {
  let ran = 0;
  const m = createMachine<{ n: number }, { type: "TICK" }>({
    initial: "run",
    context: { n: 0 },
    states: {
      run: {
        on: {
          TICK: {
            actions: [
              (c) => {
                ran++;
                c.n += 1;
              },
            ],
          },
        },
      },
    },
  });
  const next = m.transition(m.initialState, { type: "TICK" });
  expect(next.value).toBe("run");
  expect(next.changed).toBe(true);
  expect(next.context.n).toBe(1);
  expect(ran).toBe(1);
});

test("exit → transition → entry action ordering", () => {
  const order: string[] = [];
  const m = createMachine<{}, { type: "GO" }>({
    initial: "a",
    states: {
      a: {
        exit: () => order.push("exit:a"),
        on: { GO: { target: "b", actions: () => order.push("transition") } },
      },
      b: { entry: () => order.push("entry:b") },
    },
  });
  m.transition(m.initialState, { type: "GO" });
  expect(order).toEqual(["exit:a", "transition", "entry:b"]);
});

test("assign merges a partial into context immutably", () => {
  const m = createMachine<{ count: number; name: string }, { type: "INC" }>({
    initial: "a",
    context: { count: 0, name: "x" },
    states: {
      a: { on: { INC: { actions: assign((c) => ({ count: c.count + 1 })) } } },
    },
  });
  const init = m.initialState;
  const next = m.transition(init, { type: "INC" });
  expect(next.context).toEqual({ count: 1, name: "x" });
  // original untouched
  expect(init.context).toEqual({ count: 0, name: "x" });
  expect(next.context).not.toBe(init.context);
});

test("assign reads the event payload", () => {
  const m = createMachine<{ total: number }, { type: "ADD"; amount: number }>({
    initial: "a",
    context: { total: 0 },
    states: {
      a: { on: { ADD: { actions: assign((c, e) => ({ total: c.total + e.amount })) } } },
    },
  });
  const next = m.transition(m.initialState, { type: "ADD", amount: 7 });
  expect(next.context.total).toBe(7);
});

test("plain action top-level mutations do not leak back to the caller's context", () => {
  const m = createMachine<{ n: number }, { type: "GO" }>({
    initial: "a",
    context: { n: 0 },
    states: {
      a: {
        on: {
          GO: {
            target: "a",
            actions: (c) => {
              c.n = 99;
            },
          },
        },
      },
    },
  });
  const init = m.initialState;
  const next = m.transition(init, { type: "GO" });
  expect(next.context.n).toBe(99);
  expect(init.context.n).toBe(0); // context is shallow-cloned before actions run
});

/* ------------------------------ machine-level `on` ------------------------------ */

test("machine-level `on` fires from any state", () => {
  const m = trafficLight();
  const yellow = m.transition(m.initialState, { type: "TIMER" });
  const emergency = m.transition(yellow, { type: "EMERGENCY" });
  expect(emergency.value).toBe("red");
  expect(emergency.changed).toBe(true);
});

test("state-level transition takes precedence over machine-level for same event", () => {
  const m = createMachine<{}, { type: "E" }>({
    initial: "a",
    states: { a: { on: { E: "b" } }, b: {}, c: {} },
    on: { E: "c" },
  });
  expect(m.transition(m.initialState, { type: "E" }).value).toBe("b");
});

/* ------------------------------ final ------------------------------ */

test("reaching a final state sets done:true", () => {
  const m = createMachine<{}, { type: "GO" }>({
    initial: "idle",
    states: { idle: { on: { GO: "done" } }, done: { final: true } },
  });
  const next = m.transition(m.initialState, { type: "GO" });
  expect(next.value).toBe("done");
  expect(next.done).toBe(true);
});

/* ------------------------------ actor ------------------------------ */

test("actor start/send/getSnapshot", () => {
  const actor = interpret(trafficLight()).start();
  expect(actor.getSnapshot().value).toBe("green");
  actor.send({ type: "TIMER" });
  expect(actor.getSnapshot().value).toBe("yellow");
  expect(actor.state).toBe("yellow");
});

test("send before start() is a no-op", () => {
  const actor = interpret(trafficLight());
  actor.send({ type: "TIMER" });
  expect(actor.getSnapshot().value).toBe("green");
  actor.start();
  actor.send({ type: "TIMER" });
  expect(actor.state).toBe("yellow");
});

test("actor exposes live context", () => {
  const actor = interpret(trafficLight()).start();
  actor.send({ type: "TIMER" }); // yellow
  actor.send({ type: "TIMER" }); // red — entry increments attempts
  expect(actor.context.attempts).toBe(1);
});

test("subscribe emits immediately then on every change, and unsubscribe stops it", () => {
  const actor = interpret(trafficLight()).start();
  const seen: string[] = [];
  const off = actor.subscribe((s) => seen.push(s.value));
  expect(seen).toEqual(["green"]); // immediate
  actor.send({ type: "TIMER" });
  expect(seen).toEqual(["green", "yellow"]);
  off();
  actor.send({ type: "TIMER" });
  expect(seen).toEqual(["green", "yellow"]); // no more after unsubscribe
});

test("subscribe does not emit on a no-op (unchanged) send", () => {
  const actor = interpret(trafficLight()).start();
  const seen: string[] = [];
  actor.subscribe((s) => seen.push(s.value));
  actor.send({ type: "UNKNOWN" } as any);
  expect(seen).toEqual(["green"]); // only the immediate emit
});

test("stop() drops subscribers and freezes sends", () => {
  const actor = interpret(trafficLight()).start();
  const seen: string[] = [];
  actor.subscribe((s) => seen.push(s.value));
  actor.stop();
  actor.send({ type: "TIMER" });
  expect(actor.state).toBe("green");
  expect(seen).toEqual(["green"]);
});

test("can() reports whether an event would transition", () => {
  const actor = interpret(trafficLight()).start();
  expect(actor.can({ type: "TIMER" })).toBe(true);
  expect(actor.can({ type: "NOPE" } as any)).toBe(false);
});

test("matches() reflects the current state", () => {
  const actor = interpret(trafficLight()).start();
  expect(actor.matches("green")).toBe(true);
  expect(actor.matches("red")).toBe(false);
  actor.send({ type: "EMERGENCY" });
  expect(actor.matches("red")).toBe(true);
});

test("createActor is an alias for interpret", () => {
  expect(createActor).toBe(interpret);
  const actor = createActor(trafficLight()).start();
  expect(actor.state).toBe("green");
});
