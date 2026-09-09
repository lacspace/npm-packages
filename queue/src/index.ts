/**
 * @lacspace/queue
 *
 * A tiny in-memory async task queue with a concurrency limit for Node and the
 * browser — run up to N async tasks at once, prioritise them, pause/resume,
 * abort individual tasks and await either a single result or the whole drain.
 * Zero dependencies, isomorphic, and a fraction of the size of p-queue/p-limit.
 *
 * A rejected task never stalls the queue: the queue keeps draining, the
 * per-task promise still rejects, and an optional `onError` hook is notified.
 *
 * @example
 * import { createQueue } from "@lacspace/queue";
 *
 * const queue = createQueue({ concurrency: 2 });
 *
 * const a = queue.add(() => fetch("/a").then((r) => r.json()));
 * const b = queue.add(() => fetch("/b").then((r) => r.json()), { priority: 10 });
 *
 * console.log(await a, await b); // individual results
 * await queue.onIdle();          // everything has drained
 */

/* ------------------------------ errors ------------------------------ */

/**
 * Thrown when a task is rejected because its {@link AddOptions.signal} aborted
 * before the task started running. `name` is `"AbortError"` and `code` is
 * `"aborted"` — matching the convention used by the platform `AbortSignal`.
 */
export class AbortError extends Error {
  /** Stable, machine-readable discriminator. Always `"aborted"`. */
  readonly code = "aborted";
  constructor(message = "The task was aborted") {
    super(message);
    this.name = "AbortError";
  }
}

/**
 * Thrown into the `add()` promise of every still-queued task when
 * {@link Queue.clear} is called. `name` is `"QueueClearedError"` and `code` is
 * `"queue_cleared"`.
 */
export class QueueClearedError extends Error {
  /** Stable, machine-readable discriminator. Always `"queue_cleared"`. */
  readonly code = "queue_cleared";
  constructor(message = "The queue was cleared") {
    super(message);
    this.name = "QueueClearedError";
  }
}

/* ------------------------------ options ------------------------------ */

export interface QueueOptions {
  /** Maximum number of tasks allowed to run at once. Default `Infinity`. */
  concurrency?: number;
  /**
   * Start draining as soon as tasks are added. When `false` the queue begins
   * paused and only runs once {@link Queue.start} is called. Default `true`.
   */
  autoStart?: boolean;
  /**
   * Called with the reason whenever a task rejects. The per-task `add()`
   * promise still rejects independently — this hook is purely for observation
   * (logging, metrics). Throwing inside it is swallowed so it can never break
   * the queue.
   */
  onError?: (error: unknown) => void;
}

export interface AddOptions {
  /** Higher priority tasks run before lower ones while queued. Default `0`. */
  priority?: number;
  /**
   * Abort the task before it starts. If the signal is already aborted (or
   * aborts while the task is still waiting), the task is never run and its
   * `add()` promise rejects with an {@link AbortError}. Once a task has
   * started it can no longer be aborted this way.
   */
  signal?: AbortSignal;
}

/* ------------------------------ queue ------------------------------ */

export interface Queue {
  /**
   * Enqueue a task. The returned promise resolves with the task's value (a
   * plain value or a resolved promise) or rejects with whatever it threw.
   * Respects the concurrency limit and priority ordering.
   */
  add<T>(task: () => Promise<T> | T, opts?: AddOptions): Promise<T>;
  /** Number of tasks waiting to start (not yet running). */
  readonly size: number;
  /** Number of tasks currently running. */
  readonly pending: number;
  /** Whether the queue is paused (queued tasks will not start). */
  readonly isPaused: boolean;
  /** Pause the queue. Running tasks finish; queued tasks stay put. */
  pause(): void;
  /** Resume a paused queue and start draining again. */
  start(): void;
  /**
   * Drop every queued (not-yet-started) task; each pending `add()` promise
   * rejects with a {@link QueueClearedError}. Running tasks are unaffected.
   */
  clear(): void;
  /** Resolves once the queue is fully drained (`size === 0 && pending === 0`). Resolves immediately if already idle. */
  onIdle(): Promise<void>;
  /** Resolves once there are no waiting tasks (`size === 0`); some may still be running. Resolves immediately if already empty. */
  onEmpty(): Promise<void>;
}

interface QueueItem {
  task: () => Promise<unknown> | unknown;
  priority: number;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  /** Removes the abort listener; set only when a signal was provided. */
  detachAbort?: () => void;
}

/**
 * Create an in-memory async task queue.
 *
 * @example
 * const queue = createQueue({ concurrency: 3, onError: (e) => log.warn(e) });
 * await queue.add(() => doWork());
 * await queue.onIdle();
 */
export function createQueue(options: QueueOptions = {}): Queue {
  const concurrency = options.concurrency ?? Infinity;
  const onError = options.onError;

  const items: QueueItem[] = [];
  let pending = 0;
  let paused = options.autoStart === false;

  let emptyWaiters: Array<() => void> = [];
  let idleWaiters: Array<() => void> = [];

  function flushEmpty(): void {
    if (items.length === 0 && emptyWaiters.length > 0) {
      const waiters = emptyWaiters;
      emptyWaiters = [];
      for (const w of waiters) w();
    }
  }

  function flushIdle(): void {
    if (items.length === 0 && pending === 0 && idleWaiters.length > 0) {
      const waiters = idleWaiters;
      idleWaiters = [];
      for (const w of waiters) w();
    }
  }

  /** Insert keeping the array in descending priority order, stable (FIFO) for ties. */
  function enqueue(item: QueueItem): void {
    let i = items.length;
    while (i > 0 && items[i - 1]!.priority < item.priority) i--;
    items.splice(i, 0, item);
  }

  async function runItem(item: QueueItem): Promise<void> {
    try {
      const result = await item.task();
      item.resolve(result);
    } catch (error) {
      if (onError) {
        try {
          onError(error);
        } catch {
          /* an onError that throws must never break the queue */
        }
      }
      item.reject(error);
    } finally {
      pending--;
      flushIdle();
      process();
    }
  }

  function process(): void {
    while (!paused && pending < concurrency && items.length > 0) {
      const item = items.shift()!;
      // The task is starting — it can no longer be aborted-before-start.
      item.detachAbort?.();
      pending++;
      // fire-and-forget: runItem re-enters process() when it settles
      void runItem(item);
    }
    flushEmpty();
  }

  function add<T>(task: () => Promise<T> | T, opts: AddOptions = {}): Promise<T> {
    const signal = opts.signal;
    const priority = opts.priority ?? 0;

    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new AbortError());
        return;
      }

      const item: QueueItem = {
        task: task as () => Promise<unknown> | unknown,
        priority,
        resolve: resolve as (value: unknown) => void,
        reject,
      };

      if (signal) {
        const onAbort = () => {
          const idx = items.indexOf(item);
          if (idx !== -1) {
            items.splice(idx, 1);
            item.detachAbort?.();
            item.reject(new AbortError());
            flushEmpty();
            flushIdle();
          }
        };
        signal.addEventListener("abort", onAbort, { once: true });
        item.detachAbort = () => signal.removeEventListener("abort", onAbort);
      }

      enqueue(item);
      process();
    });
  }

  return {
    add,
    get size() {
      return items.length;
    },
    get pending() {
      return pending;
    },
    get isPaused() {
      return paused;
    },
    pause() {
      paused = true;
    },
    start() {
      paused = false;
      process();
    },
    clear() {
      const dropped = items.splice(0, items.length);
      for (const item of dropped) {
        item.detachAbort?.();
        item.reject(new QueueClearedError());
      }
      flushEmpty();
      flushIdle();
    },
    onIdle() {
      if (items.length === 0 && pending === 0) return Promise.resolve();
      return new Promise<void>((resolve) => idleWaiters.push(resolve));
    },
    onEmpty() {
      if (items.length === 0) return Promise.resolve();
      return new Promise<void>((resolve) => emptyWaiters.push(resolve));
    },
  };
}
