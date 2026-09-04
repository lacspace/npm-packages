import { test, expect } from "vitest";
import { Idempotency, IdempotencyKeyReuseError } from "./index";

test("run executes fn once and caches the result", async () => {
  const idem = new Idempotency();
  let calls = 0;
  const r1 = await idem.run("k1", () => {
    calls++;
    return "value";
  });
  expect(r1.value).toBe("value");
  expect(r1.replayed).toBe(false);
  expect(calls).toBe(1);

  const r2 = await idem.run("k1", () => {
    calls++;
    return "different";
  });
  expect(r2.value).toBe("value"); // cached, not re-run
  expect(r2.replayed).toBe(true);
  expect(calls).toBe(1);
});

test("two concurrent same-key calls single-flight (fn runs once)", async () => {
  const idem = new Idempotency();
  let calls = 0;
  const fn = async (): Promise<number> => {
    calls++;
    await new Promise((r) => setTimeout(r, 20));
    return 99;
  };
  const [a, b] = await Promise.all([idem.run("shared", fn), idem.run("shared", fn)]);
  expect(a.value).toBe(99);
  expect(b.value).toBe(99);
  expect(calls).toBe(1);
  // Exactly one of the concurrent calls is the fresh execution.
  expect([a.replayed, b.replayed].filter((x) => x === false).length).toBe(1);
});

test("concurrent same-key call with mismatched fingerprint throws", async () => {
  const idem = new Idempotency();
  const slow = async (): Promise<string> => {
    await new Promise((r) => setTimeout(r, 30));
    return "ok";
  };
  const first = idem.run("pay-1", slow, { fingerprint: "fp-A" });
  // Give the first call a tick to register itself in-flight.
  await new Promise((r) => setTimeout(r, 5));
  await expect(idem.run("pay-1", slow, { fingerprint: "fp-B" })).rejects.toBeInstanceOf(
    IdempotencyKeyReuseError,
  );
  const done = await first;
  expect(done.value).toBe("ok");
});
