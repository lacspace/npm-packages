# @lacspace/events

A fully **type-safe event emitter** / tiny pub-sub for Node and the browser. Declare an events map once and every `on`/`emit`/`waitFor` is checked at compile time — no string typos, no `any` payloads. Zero dependencies, isomorphic, tree-shakeable.

Think mitt / nanoevents / eventemitter3, but strongly typed and with a few ergonomics: error-isolated dispatch, `once`, `waitFor`, wildcard listeners, and an unsubscribe handle from every subscription.

```bash
npm i @lacspace/events
```

## Quick start

```ts
import { createEmitter } from "@lacspace/events";

type Events = {
  login: { userId: string };
  logout: void;
  message: string;
};

const bus = createEmitter<Events>();

const off = bus.on("login", ({ userId }) => console.log("hi", userId));
bus.emit("login", { userId: "u1" }); // ✓ typed
// bus.emit("login", { user: "u1" }); // ✗ compile error — wrong payload shape
// bus.emit("logn", ...);             // ✗ compile error — unknown event

off(); // unsubscribe
```

The event name and payload type flow automatically: `on("login", h)` infers `h`'s argument as `{ userId: string }`, and `emit("login", p)` requires `p` to match exactly.

## Error isolation

A handler that throws never stops the others — every listener for an event runs. Route thrown errors to an optional `onError`:

```ts
const bus = createEmitter<Events>({
  onError: (err, event) => console.error(`listener for ${String(event)} threw`, err),
});
```

Without `onError`, listener errors are swallowed so one bad handler can never break `emit`.

## Safe to mutate during emit

Subscribing or unsubscribing from inside a handler is fine. `emit` iterates over a snapshot taken before dispatch, so a listener added mid-emit won't fire for the in-flight event, and a removed one won't be called after removal.

## once & waitFor

```ts
bus.once("login", (u) => console.log("first login", u)); // fires exactly once

const { userId } = await bus.waitFor("login"); // promise resolves on next login
```

## Wildcard listeners

```ts
const off = bus.onAny((event, payload) => log(String(event), payload));
// …
off();
```

## API

| Export | What |
|---|---|
| `createEmitter<E>(options?)` | Build an `Emitter<E>`. `options.onError?(error, event)` catches listener throws. |
| `emitter.on(event, handler)` | Subscribe. Returns an `Unsubscribe` function. |
| `emitter.once(event, handler)` | Subscribe for one dispatch, then auto-remove. Returns `Unsubscribe`. |
| `emitter.off(event, handler?)` | Remove one handler, or all handlers for `event` if omitted. |
| `emitter.emit(event, payload)` | Dispatch to every listener (error-isolated, snapshot-safe). |
| `emitter.listenerCount(event?)` | Count for one event, or the grand total if omitted. |
| `emitter.removeAllListeners(event?)` | Clear one event, or everything (incl. wildcard). |
| `emitter.waitFor(event)` | `Promise` that resolves with the next payload. |
| `emitter.onAny(handler)` / `offAny(handler)` | Wildcard listener over every event. `onAny` returns `Unsubscribe`. |

Types: `EventMap`, `Emitter<E>`, `EmitterOptions<E>`, `Handler<T>`, `WildcardHandler<E>`, `Unsubscribe`.

Use `void` (or `undefined`) as an event's payload type for events that carry no data.

## Why

- **Type-safe** — the events map is the single source of truth; typos and wrong payloads are compile errors.
- **Zero dependencies** — nothing to audit, tiny install, tree-shakeable.
- **Isomorphic** — identical API in Node, the browser, edge runtimes and workers.
- **Robust dispatch** — errors are isolated per listener; mutating listeners during `emit` is safe.

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE). Part of the [@lacspace](https://developer.lacspace.com) developer platform.
