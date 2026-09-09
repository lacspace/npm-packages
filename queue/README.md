# @lacspace/queue

A tiny **in-memory async task queue** with a concurrency limit for Node and the browser — run up to N tasks at once, prioritise them, pause/resume, abort individual tasks and await the drain. Zero dependencies, isomorphic, TypeScript-first.

A dependency-free alternative to `p-queue` / `p-limit`, in a fraction of the size. A rejected task never stalls the queue.

```bash
npm i @lacspace/queue
```

## Quick start

```ts
import { createQueue } from "@lacspace/queue";

const queue = createQueue({ concurrency: 2 }); // at most 2 tasks run at once

const a = queue.add(() => fetch("/a").then((r) => r.json()));
const b = queue.add(() => fetch("/b").then((r) => r.json()));

console.log(await a, await b); // await individual results

// …enqueue a hundred jobs, then wait for the whole batch:
urls.forEach((u) => queue.add(() => download(u)));
await queue.onIdle();          // resolves once everything has drained
```

`add()` returns a promise that resolves with the task's value or rejects with whatever it threw — while the queue keeps draining regardless.

## Priority

Higher priority runs first among the tasks still waiting (equal priorities keep FIFO order):

```ts
queue.add(() => normalJob());
queue.add(() => urgentJob(), { priority: 10 }); // jumps ahead of queued work
```

## Pause, resume & clear

```ts
queue.pause();          // running tasks finish; queued tasks stay put
queue.isPaused;         // true
queue.start();          // resume draining

queue.clear();          // drop all queued tasks — each add() promise rejects
                        // with a QueueClearedError; running tasks are untouched
```

Pass `autoStart: false` to build the queue paused and fill it before the first task runs.

## Abort

Cancel a task before it starts with a standard `AbortSignal`:

```ts
const controller = new AbortController();
const p = queue.add(() => work(), { signal: controller.signal });
controller.abort();     // if the task hasn't started, p rejects with AbortError
```

An already-aborted signal rejects immediately and the task never runs. Once a task has started it can no longer be aborted this way.

## Errors & resilience

A rejected task rejects its own `add()` promise, calls the optional `onError` hook, and the queue carries on:

```ts
const queue = createQueue({
  concurrency: 4,
  onError: (err) => log.warn("task failed", err), // observation only
});

try {
  await queue.add(riskyTask);
} catch (err) {
  // still rejects here, independently of onError
}
```

## Draining

```ts
await queue.onEmpty();  // resolves when nothing is waiting (some may still run)
await queue.onIdle();   // resolves when fully drained: size === 0 && pending === 0
```

Both resolve immediately if the condition already holds.

## API

| Export | What |
|---|---|
| `createQueue(options?)` | Build a `Queue`. |
| `Queue` | `.add(task, opts?)`, `.size`, `.pending`, `.isPaused` (getters), `.pause()`, `.start()`, `.clear()`, `.onIdle()`, `.onEmpty()` |
| `AbortError` | Thrown when a task's signal aborts before it starts. `name: "AbortError"`, `code: "aborted"`. |
| `QueueClearedError` | Thrown into queued tasks by `clear()`. `name: "QueueClearedError"`, `code: "queue_cleared"`. |

**`QueueOptions`**: `concurrency` (default `Infinity`), `autoStart` (default `true`), `onError`.
**`AddOptions`**: `priority` (default `0`, higher runs first), `signal` (`AbortSignal`).

## Why

- **Zero dependencies** — nothing to audit, tiny install.
- **Isomorphic** — identical API in Node, the browser, edge runtimes and workers.
- **Resilient** — a rejected task never stalls the queue; failures are isolated.
- **Fully typed** — `add<T>()` flows the task's return type straight through.

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE). Part of the [@lacspace](https://developer.lacspace.com) developer platform.
