# @lacspace/machine

A tiny, **fully type-safe finite state machine** for Node and the browser — declare states, events, guarded transitions, entry/exit/transition actions and a typed context. A lightweight xstate alternative for the 90% case (single-level states; no nested or parallel machinery). Zero dependencies, isomorphic, TypeScript-first.

```bash
npm i @lacspace/machine
```

## Quick start

```ts
import { createMachine, assign, interpret } from "@lacspace/machine";

interface Ctx { attempts: number }
type Ev = { type: "TIMER" } | { type: "EMERGENCY" };

const light = createMachine<Ctx, Ev>({
  id: "traffic-light",
  initial: "green",
  context: { attempts: 0 },
  states: {
    green:  { on: { TIMER: "yellow" } },
    yellow: { on: { TIMER: "red" } },
    red: {
      entry: assign((c) => ({ attempts: c.attempts + 1 })),
      on: { TIMER: "green" },
    },
  },
  on: { EMERGENCY: "red" }, // available from every state
});

const actor = interpret(light).start();
actor.subscribe((s) => console.log(s.value, s.context));
actor.send({ type: "TIMER" }); // -> "yellow"
```

## The pure core

Every machine exposes a **pure** `transition(state, event)` and a computed `initialState`.
Nothing is mutated — you get a fresh snapshot back:

```ts
type State = { value: string; context: Ctx; changed: boolean; done: boolean };

const s0 = light.initialState;              // { value: "green", ... }
const s1 = light.transition(s0, { type: "TIMER" }); // { value: "yellow", changed: true }
light.transition(s0, { type: "NOPE" });     // { value: "green", changed: false }
```

`changed` is `false` when the event matched no transition; `done` is `true` when the new
state is `final`. This makes machines trivial to unit-test and to drive from a reducer.

## Guards

List several transitions for one event — the **first whose guard passes wins** (a guardless
transition always passes). If none pass, the state is unchanged (`changed: false`).

```ts
const gate = createMachine<{ key: number }, { type: "PUSH" }>({
  initial: "closed",
  context: { key: 5 },
  states: {
    closed: {
      on: {
        PUSH: [
          { target: "locked", guard: (c) => c.key < 3 },
          { target: "open",   guard: (c) => c.key >= 3 },
          { target: "stuck" }, // fallback
        ],
      },
    },
    locked: {}, open: {}, stuck: {},
  },
});
```

## Actions & `assign`

Actions run on `entry`, `exit`, or during a transition. A **plain action** is
`(context, event) => void` and may mutate the context (it operates on a clone, so your
original snapshot is never touched). An **`assign` action** merges a partial in immutably:

```ts
import { assign } from "@lacspace/machine";

const counter = createMachine<{ total: number }, { type: "ADD"; amount: number }>({
  initial: "idle",
  context: { total: 0 },
  states: {
    idle: {
      on: {
        ADD: { actions: assign((c, e) => ({ total: c.total + e.amount })) }, // internal
      },
    },
  },
});
```

A transition with **no `target`** is *internal*: its actions run, but the state value is
unchanged. On an external transition the order is always **exit → transition → entry**.

## The actor

`interpret(machine)` (aliased `createActor`) gives you a live, stateful instance:

```ts
const actor = interpret(light).start();

actor.send({ type: "TIMER" });   // no-op until start() is called
actor.getSnapshot();             // current State
actor.state;                     // "yellow"
actor.context;                   // live context
actor.can({ type: "TIMER" });    // would this event transition? → boolean
actor.matches("yellow");         // → boolean

const off = actor.subscribe((s) => render(s));  // fires immediately, then on every change
off();                                          // unsubscribe
actor.stop();                                   // stop + drop subscribers
```

`subscribe` emits the current snapshot **immediately**, then again on every change (a no-op
event does not emit). `send` before `start()` is a no-op.

## API

| Export | What |
|---|---|
| `createMachine<C, E>(config)` | Compile a config into a `Machine` with `initialState` and a pure `transition`. |
| `assign<C, E>(updater)` | Action that immutably merges `updater(ctx, ev)`'s partial into the context. |
| `interpret(machine)` / `createActor(machine)` | Build a live `Actor`. |
| `Machine` | `.initialState`, `.transition(state, event)`, `.id`, `.config`. |
| `Actor` | `.start()`, `.stop()`, `.send(ev)`, `.getSnapshot()`, `.state`, `.context`, `.can(ev)`, `.matches(v)`, `.subscribe(fn)`. |
| `State<C>` | `{ value, context, changed, done }`. |

**Config:** `id?`, `initial`, `context?`, `states` (`{ on?, entry?, exit?, final? }`), `on?`
(machine-level transitions). **Transition:** a target string, or `{ target?, guard?, actions? }`.

## Why

- **Zero dependencies** — nothing to audit, tiny install.
- **Type-safe** — your context `C` and event union `E` flow through guards, actions and assigns.
- **Pure at the core** — `transition` is a pure function; the actor is a thin stateful shell on top.
- **Isomorphic** — identical API in Node, the browser, edge runtimes and workers.
- **Small surface** — states, events, guards, actions. The 90% you actually reach for.

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE). Part of the [@lacspace](https://developer.lacspace.com) developer platform.
