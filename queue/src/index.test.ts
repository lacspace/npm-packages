import { test, expect } from "vitest";
import { createQueue, AbortError, QueueClearedError } from "./index";

/* ------------------------------ helpers ------------------------------ */

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Drain the microtask + macrotask queues so scheduled work settles deterministically. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

/* ------------------------------ basics ------------------------------ */

test("add() resolves with the task's value", async () => {
  const q = createQueue();
  await expect(q.add(() => 42)).resolves.toBe(42);
  await expect(q.add(async () => "hi")).resolves.toBe("hi");
});

test("add() rejects when the task throws (sync)", async () => {
  const q = createQueue();
  await expect(q.add(() => {
    throw new Error("boom");
  })).rejects.toThrow("boom");
});

test("add() rejects when the task rejects (async)", async () => {
  const q = createQueue();
  await expect(q.add(async () => {
    throw new Error("async-boom");
  })).rejects.toThrow("async-boom");
});

test("runs many tasks and resolves them all", async () => {
  const q = createQueue({ concurrency: 3 });
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) => q.add(async () => i * 2)),
  );
  expect(results).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
});

/* ------------------------------ concurrency ------------------------------ */

test("caps parallelism at the concurrency limit", async () => {
  const q = createQueue({ concurrency: 2 });
  let running = 0;
  let max = 0;
  const gates = [deferred(), deferred(), deferred(), deferred(), deferred()];

  const results = gates.map((g, i) =>
    q.add(async () => {
      running++;
      max = Math.max(max, running);
      await g.promise;
      running--;
      return i;
    }),
  );

  await flush();
  expect(q.pending).toBe(2);
  expect(q.size).toBe(3);

  // Release one at a time; the limit must never be exceeded.
  for (const g of gates) {
    g.resolve();
    await flush();
  }

  expect(await Promise.all(results)).toEqual([0, 1, 2, 3, 4]);
  expect(max).toBe(2);
});

test("default concurrency is unbounded (Infinity)", async () => {
  const q = createQueue();
  let running = 0;
  let max = 0;
  const gates = Array.from({ length: 6 }, () => deferred());

  const results = gates.map((g) =>
    q.add(async () => {
      running++;
      max = Math.max(max, running);
      await g.promise;
      running--;
    }),
  );

  await flush();
  expect(q.pending).toBe(6);
  expect(q.size).toBe(0);
  gates.forEach((g) => g.resolve());
  await Promise.all(results);
  expect(max).toBe(6);
});

test("size and pending reflect queued vs running", async () => {
  const q = createQueue({ concurrency: 1 });
  const gate = deferred();
  const first = q.add(async () => {
    await gate.promise;
  });
  q.add(() => 1);
  q.add(() => 2);

  await flush();
  expect(q.pending).toBe(1);
  expect(q.size).toBe(2);

  gate.resolve();
  await first;
  await q.onIdle();
  expect(q.pending).toBe(0);
  expect(q.size).toBe(0);
});

/* ------------------------------ priority ------------------------------ */

test("higher priority runs first among queued tasks", async () => {
  const q = createQueue({ concurrency: 1 });
  const order: number[] = [];
  const gate = deferred();

  // Occupy the single slot so the rest queue up.
  q.add(async () => {
    await gate.promise;
    order.push(0);
  });
  q.add(() => void order.push(1), { priority: 1 });
  q.add(() => void order.push(2), { priority: 5 });
  q.add(() => void order.push(3), { priority: 1 });

  gate.resolve();
  await q.onIdle();
  // p5 first, then the two p1 tasks in FIFO insertion order.
  expect(order).toEqual([0, 2, 1, 3]);
});

test("equal priority preserves FIFO order", async () => {
  const q = createQueue({ concurrency: 1 });
  const order: number[] = [];
  const gate = deferred();
  q.add(async () => {
    await gate.promise;
  });
  for (let i = 0; i < 5; i++) q.add(() => void order.push(i));
  gate.resolve();
  await q.onIdle();
  expect(order).toEqual([0, 1, 2, 3, 4]);
});

/* ------------------------------ pause / start ------------------------------ */

test("pause() stops queued tasks from starting; start() resumes", async () => {
  const q = createQueue({ concurrency: 1 });
  const g1 = deferred();
  const first = q.add(async () => {
    await g1.promise;
  });

  await flush();
  expect(q.pending).toBe(1);

  q.add(() => "second"); // queued behind the running task
  q.pause();
  expect(q.isPaused).toBe(true);

  g1.resolve();
  await first;
  await flush();
  // Paused: the second task must not have started.
  expect(q.pending).toBe(0);
  expect(q.size).toBe(1);

  q.start();
  expect(q.isPaused).toBe(false);
  await q.onIdle();
  expect(q.size).toBe(0);
});

test("autoStart:false begins paused until start()", async () => {
  const q = createQueue({ autoStart: false, concurrency: 2 });
  expect(q.isPaused).toBe(true);
  const p = q.add(() => 1);
  q.add(() => 2);

  await flush();
  expect(q.pending).toBe(0);
  expect(q.size).toBe(2);

  q.start();
  await expect(p).resolves.toBe(1);
  await q.onIdle();
  expect(q.size).toBe(0);
});

/* ------------------------------ clear ------------------------------ */

test("clear() rejects queued tasks with QueueClearedError", async () => {
  const q = createQueue({ concurrency: 1 });
  const gate = deferred();
  const running = q.add(async () => {
    await gate.promise;
    return "done";
  });
  const queued1 = q.add(() => "a");
  const queued2 = q.add(() => "b");

  await flush();
  expect(q.size).toBe(2);

  q.clear();
  expect(q.size).toBe(0);
  await expect(queued1).rejects.toBeInstanceOf(QueueClearedError);
  await expect(queued2).rejects.toThrow("queue was cleared");

  // The already-running task is unaffected.
  gate.resolve();
  await expect(running).resolves.toBe("done");
});

/* ------------------------------ resilience ------------------------------ */

test("a rejected task does not stall the queue", async () => {
  const q = createQueue({ concurrency: 1 });
  const order: string[] = [];

  const bad = q.add(async () => {
    order.push("bad");
    throw new Error("nope");
  });
  const good = q.add(async () => {
    order.push("good");
    return "ok";
  });

  await expect(bad).rejects.toThrow("nope");
  await expect(good).resolves.toBe("ok");
  expect(order).toEqual(["bad", "good"]);
  await q.onIdle();
  expect(q.pending).toBe(0);
});

test("onError is called for rejections while add() still rejects", async () => {
  const seen: unknown[] = [];
  const q = createQueue({ onError: (e) => seen.push(e) });
  const err = new Error("observed");
  await expect(q.add(() => Promise.reject(err))).rejects.toBe(err);
  expect(seen).toEqual([err]);
});

test("onError is not called for successful tasks", async () => {
  let calls = 0;
  const q = createQueue({ onError: () => calls++ });
  await q.add(() => 1);
  expect(calls).toBe(0);
});

test("a throwing onError never breaks the queue", async () => {
  const q = createQueue({
    onError: () => {
      throw new Error("onError blew up");
    },
  });
  await expect(q.add(() => Promise.reject(new Error("x")))).rejects.toThrow("x");
  // Queue still works afterwards.
  await expect(q.add(() => "still-fine")).resolves.toBe("still-fine");
});

/* ------------------------------ onIdle / onEmpty ------------------------------ */

test("onIdle resolves immediately when already idle", async () => {
  const q = createQueue();
  await expect(q.onIdle()).resolves.toBeUndefined();
});

test("onEmpty resolves immediately when already empty", async () => {
  const q = createQueue();
  await expect(q.onEmpty()).resolves.toBeUndefined();
});

test("onIdle waits for both queued and running to drain", async () => {
  const q = createQueue({ concurrency: 1 });
  const g1 = deferred();
  const g2 = deferred();
  q.add(async () => {
    await g1.promise;
  });
  q.add(async () => {
    await g2.promise;
  });

  let idle = false;
  const idlePromise = q.onIdle().then(() => {
    idle = true;
  });

  await flush();
  expect(idle).toBe(false);
  g1.resolve();
  await flush();
  expect(idle).toBe(false); // second task still running
  g2.resolve();
  await idlePromise;
  expect(idle).toBe(true);
});

test("onEmpty resolves when the queue drains even if tasks are still running", async () => {
  const q = createQueue({ concurrency: 1 });
  const g1 = deferred();
  const g2 = deferred();
  q.add(async () => {
    await g1.promise;
  }); // starts running -> size 0 immediately
  const queued = q.add(async () => {
    await g2.promise; // stays running once started
    return 2;
  }); // waits -> size 1

  let empty = false;
  const emptyPromise = q.onEmpty().then(() => {
    empty = true;
  });

  await flush();
  expect(empty).toBe(false); // one task still waiting
  expect(q.size).toBe(1);

  g1.resolve(); // first finishes -> queued starts -> size 0, still running
  await emptyPromise;
  expect(empty).toBe(true);
  expect(q.size).toBe(0);
  expect(q.pending).toBe(1); // second task is running, queue is empty

  g2.resolve();
  await expect(queued).resolves.toBe(2);
  await q.onIdle();
});

/* ------------------------------ abort ------------------------------ */

test("add() rejects with AbortError when the signal is already aborted", async () => {
  const q = createQueue();
  const controller = new AbortController();
  controller.abort();
  const p = q.add(() => 1, { signal: controller.signal });
  await expect(p).rejects.toBeInstanceOf(AbortError);
  await expect(p).rejects.toHaveProperty("code", "aborted");
  expect(q.size).toBe(0);
  expect(q.pending).toBe(0);
});

test("aborting a still-queued task rejects it and never runs it", async () => {
  const q = createQueue({ concurrency: 1 });
  const gate = deferred();
  q.add(async () => {
    await gate.promise;
  }); // occupies the slot

  const controller = new AbortController();
  let ran = false;
  const aborted = q.add(
    () => {
      ran = true;
    },
    { signal: controller.signal },
  );

  await flush();
  expect(q.size).toBe(1);
  controller.abort();
  await expect(aborted).rejects.toBeInstanceOf(AbortError);
  expect(q.size).toBe(0);

  gate.resolve();
  await q.onIdle();
  expect(ran).toBe(false);
});

test("a task that already started is not aborted by a later signal", async () => {
  const q = createQueue({ concurrency: 1 });
  const gate = deferred();
  const controller = new AbortController();
  const p = q.add(
    async () => {
      await gate.promise;
      return "completed";
    },
    { signal: controller.signal },
  );

  await flush();
  expect(q.pending).toBe(1);
  controller.abort(); // too late — already running
  gate.resolve();
  await expect(p).resolves.toBe("completed");
});

test("AbortError and QueueClearedError carry their name and code", () => {
  const a = new AbortError();
  expect(a.name).toBe("AbortError");
  expect(a.code).toBe("aborted");
  const c = new QueueClearedError();
  expect(c.name).toBe("QueueClearedError");
  expect(c.code).toBe("queue_cleared");
});
