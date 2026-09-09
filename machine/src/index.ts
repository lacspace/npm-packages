/**
 * @lacspace/machine
 *
 * A tiny, fully type-safe finite state machine for Node and the browser.
 * Declare states, events, guarded transitions, entry/exit/transition actions
 * and a typed context — then drive it with a pure `transition()` or a live
 * actor. A lightweight xstate alternative for the 90% case: single-level
 * states, no nested or parallel machinery. Zero dependencies, isomorphic.
 *
 * @example
 * import { createMachine, assign, interpret } from "@lacspace/machine";
 *
 * interface Ctx { attempts: number }
 * type Ev = { type: "TIMER" } | { type: "ERROR" };
 *
 * const light = createMachine<Ctx, Ev>({
 *   id: "traffic-light",
 *   initial: "green",
 *   context: { attempts: 0 },
 *   states: {
 *     green:  { on: { TIMER: "yellow" } },
 *     yellow: { on: { TIMER: "red" } },
 *     red: {
 *       entry: assign((c) => ({ attempts: c.attempts + 1 })),
 *       on: { TIMER: "green" },
 *     },
 *   },
 * });
 *
 * const actor = interpret(light).start();
 * actor.subscribe((s) => console.log(s.value, s.context));
 * actor.send({ type: "TIMER" }); // -> "yellow"
 */

/* ------------------------------ types ------------------------------ */

/** An event is any object carrying a discriminating `type` string. */
export interface EventObject {
  type: string;
}

/**
 * An action fired on entry, exit or during a transition. Either a plain
 * function that may mutate the (already-cloned) context, or an
 * {@link assign} action that immutably merges a partial into it.
 */
export type Action<C = any, E extends EventObject = EventObject> =
  | ((context: C, event: E) => void)
  | AssignAction<C, E>;

const ASSIGN: unique symbol = Symbol("lacspace.machine.assign");

/** Produced by {@link assign}; carries an updater that returns a `Partial<C>`. */
export interface AssignAction<C = any, E extends EventObject = EventObject> {
  readonly [ASSIGN]: (context: C, event: E) => Partial<C>;
}

/**
 * A transition: a bare target state name, or an object with an optional
 * `target` (omit for an internal, state-preserving transition), an optional
 * `guard` and optional `actions`.
 */
export type Transition<C = any, E extends EventObject = EventObject> =
  | string
  | {
      target?: string;
      guard?: (context: C, event: E) => boolean;
      actions?: Action<C, E> | Action<C, E>[];
    };

/** Map of event type → one or more candidate transitions (first passing guard wins). */
export type TransitionMap<C = any, E extends EventObject = EventObject> = Record<
  string,
  Transition<C, E> | Transition<C, E>[]
>;

/** A single declared state. */
export interface StateNode<C = any, E extends EventObject = EventObject> {
  /** Event-keyed transitions available in this state. */
  on?: TransitionMap<C, E>;
  /** Run when this state is entered. */
  entry?: Action<C, E> | Action<C, E>[];
  /** Run when this state is left. */
  exit?: Action<C, E> | Action<C, E>[];
  /** Mark a terminal state — reaching it sets `done: true`. */
  final?: boolean;
}

/** The machine definition passed to {@link createMachine}. */
export interface MachineConfig<C = any, E extends EventObject = EventObject> {
  id?: string;
  /** Name of the starting state. */
  initial: string;
  /** Initial context (defaults to `{}`). */
  context?: C;
  /** The state graph. */
  states: Record<string, StateNode<C, E>>;
  /** Machine-level transitions, available from every state. */
  on?: TransitionMap<C, E>;
}

/** An immutable snapshot of the machine at a point in time. */
export interface State<C> {
  /** The current state name. */
  value: string;
  /** The current context. */
  context: C;
  /** `false` when the last event matched no transition. */
  changed: boolean;
  /** `true` when `value` is a `final` state. */
  done: boolean;
}

/** A compiled machine: a pure `transition` and a computed `initialState`. */
export interface Machine<C, E extends EventObject> {
  readonly id: string;
  readonly config: MachineConfig<C, E>;
  /** The starting snapshot, with the initial state's entry actions applied. */
  readonly initialState: State<C>;
  /**
   * Compute the next snapshot for `event` from `state`. Pure: never mutates
   * `state` or the context object it holds.
   */
  transition(state: State<C>, event: E): State<C>;
}

/* ------------------------------ assign ------------------------------ */

/**
 * Create an action that immutably merges the updater's returned partial into
 * the context, producing a brand-new context object.
 *
 * @example
 * assign<Ctx, Ev>((ctx, ev) => ({ count: ctx.count + 1 }));
 */
export function assign<C = any, E extends EventObject = EventObject>(
  updater: (context: C, event: E) => Partial<C>,
): AssignAction<C, E> {
  return { [ASSIGN]: updater };
}

function isAssign<C, E extends EventObject>(
  action: Action<C, E>,
): action is AssignAction<C, E> {
  return typeof action === "object" && action !== null && ASSIGN in action;
}

/* ------------------------------ internals ------------------------------ */

function shallowClone<C>(context: C): C {
  if (context && typeof context === "object") {
    return (Array.isArray(context) ? [...context] : { ...context }) as C;
  }
  return context;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

interface NormalizedTransition<C, E extends EventObject> {
  target?: string;
  guard?: (context: C, event: E) => boolean;
  actions?: Action<C, E> | Action<C, E>[];
}

function normalize<C, E extends EventObject>(
  t: Transition<C, E>,
): NormalizedTransition<C, E> {
  return typeof t === "string" ? { target: t } : t;
}

/** Run a list of actions against `context`, returning the (possibly new) context. */
function runActions<C, E extends EventObject>(
  actions: Action<C, E> | Action<C, E>[] | undefined,
  context: C,
  event: E,
): C {
  let ctx = context;
  for (const action of toArray(actions)) {
    if (isAssign<C, E>(action)) {
      const partial = action[ASSIGN](ctx, event);
      ctx = (ctx && typeof ctx === "object" ? { ...ctx, ...partial } : partial) as C;
    } else {
      action(ctx, event);
    }
  }
  return ctx;
}

/** First candidate whose guard passes (guardless always passes), or undefined. */
function pick<C, E extends EventObject>(
  entry: Transition<C, E> | Transition<C, E>[] | undefined,
  context: C,
  event: E,
): NormalizedTransition<C, E> | undefined {
  if (entry === undefined) return undefined;
  for (const raw of toArray(entry)) {
    const t = normalize(raw);
    if (!t.guard || t.guard(context, event)) return t;
  }
  return undefined;
}

/* ------------------------------ createMachine ------------------------------ */

/**
 * Compile a {@link MachineConfig} into a {@link Machine}.
 *
 * @example
 * const m = createMachine<{}, { type: "GO" }>({
 *   initial: "idle",
 *   states: { idle: { on: { GO: "running" } }, running: { final: true } },
 * });
 * m.transition(m.initialState, { type: "GO" }).done; // true
 */
export function createMachine<C = any, E extends EventObject = EventObject>(
  config: MachineConfig<C, E>,
): Machine<C, E> {
  const id = config.id ?? "machine";

  function buildInitialState(): State<C> {
    const value = config.initial;
    const node = config.states[value];
    let ctx = shallowClone((config.context ?? ({} as C)) as C);
    ctx = runActions(node?.entry, ctx, { type: "@@lacspace/init" } as unknown as E);
    return { value, context: ctx, changed: false, done: !!node?.final };
  }

  function transition(state: State<C>, event: E): State<C> {
    const currentNode = config.states[state.value];

    // Resolve the winning transition: state-level first, then machine-level.
    const matched =
      pick<C, E>(currentNode?.on?.[event.type], state.context, event) ??
      pick<C, E>(config.on?.[event.type], state.context, event);

    // No transition matched → unchanged snapshot, same context object.
    if (!matched) {
      return { value: state.value, context: state.context, changed: false, done: state.done };
    }

    // Clone up front so plain mutating actions never touch the caller's context.
    let ctx = shallowClone(state.context);

    // Internal (targetless) transition: run actions, keep the state value.
    if (matched.target === undefined) {
      ctx = runActions(matched.actions, ctx, event);
      return { value: state.value, context: ctx, changed: true, done: state.done };
    }

    // External transition: exit → transition → entry.
    const target = matched.target;
    const targetNode = config.states[target];
    ctx = runActions(currentNode?.exit, ctx, event);
    ctx = runActions(matched.actions, ctx, event);
    ctx = runActions(targetNode?.entry, ctx, event);

    return { value: target, context: ctx, changed: true, done: !!targetNode?.final };
  }

  return {
    id,
    config,
    get initialState() {
      return buildInitialState();
    },
    transition,
  };
}

/* ------------------------------ interpret / actor ------------------------------ */

/** A live, stateful instance of a {@link Machine}. */
export interface Actor<C, E extends EventObject> {
  /** Begin running. Idempotent; returns the actor for chaining. */
  start(): Actor<C, E>;
  /** Stop running and drop all subscribers. `send` becomes a no-op again. */
  stop(): void;
  /** Dispatch an event. A no-op until {@link start} has been called. */
  send(event: E): void;
  /** The current snapshot. */
  getSnapshot(): State<C>;
  /** The current state name. */
  readonly state: string;
  /** The current context. */
  readonly context: C;
  /** Would `event` cause a transition from the current state? */
  can(event: E): boolean;
  /** Is the current state `value`? */
  matches(value: string): boolean;
  /**
   * Subscribe to snapshots. The listener fires immediately with the current
   * snapshot, then on every change. Returns an unsubscribe function.
   */
  subscribe(listener: (state: State<C>) => void): () => void;
}

/**
 * Create a live {@link Actor} for a machine.
 *
 * @example
 * const actor = interpret(machine).start();
 * const off = actor.subscribe((s) => render(s.value));
 * actor.send({ type: "TIMER" });
 * off();
 */
export function interpret<C, E extends EventObject>(
  machine: Machine<C, E>,
): Actor<C, E> {
  let current = machine.initialState;
  let started = false;
  const listeners = new Set<(state: State<C>) => void>();

  function emit(): void {
    for (const listener of listeners) listener(current);
  }

  const actor: Actor<C, E> = {
    start() {
      if (!started) {
        started = true;
        emit();
      }
      return actor;
    },
    stop() {
      started = false;
      listeners.clear();
    },
    send(event) {
      if (!started) return;
      const next = machine.transition(current, event);
      if (next.changed) {
        current = next;
        emit();
      }
    },
    getSnapshot() {
      return current;
    },
    get state() {
      return current.value;
    },
    get context() {
      return current.context;
    },
    can(event) {
      return machine.transition(current, event).changed;
    },
    matches(value) {
      return current.value === value;
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(current);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return actor;
}

/** Alias for {@link interpret}. */
export const createActor = interpret;
