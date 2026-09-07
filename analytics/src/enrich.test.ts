import { test, expect } from "vitest";
import { parseUtm, createSession, applyMiddleware } from "./enrich";

/** A controllable clock for deterministic session tests. */
function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

test("parseUtm reads standard utm_* params from a full URL", () => {
  const c = parseUtm(
    "https://lacspace.com/?utm_source=twitter&utm_medium=social&utm_campaign=launch&utm_term=dev&utm_content=hero",
  );
  expect(c).toEqual({
    source: "twitter",
    medium: "social",
    name: "launch",
    term: "dev",
    content: "hero",
  });
});

test("parseUtm decodes values and keeps non-standard utm params", () => {
  const c = parseUtm("?utm_source=news%20letter&utm_id=abc123");
  expect(c?.source).toBe("news letter");
  expect(c?.id).toBe("abc123");
});

test("parseUtm returns undefined when there are no utm params", () => {
  expect(parseUtm("https://lacspace.com/pricing?ref=home")).toBeUndefined();
  expect(parseUtm("")).toBeUndefined();
});

test("session id stays stable within the timeout window", () => {
  const clk = fakeClock(1000);
  let n = 0;
  const s = createSession({ timeout: 1000, now: clk.now, genId: () => `s${++n}` });
  const first = s.id();
  clk.advance(500);
  expect(s.id()).toBe(first); // activity slides the window
  clk.advance(999);
  expect(s.id()).toBe(first);
});

test("session id renews after the inactivity timeout elapses", () => {
  const clk = fakeClock(0);
  let n = 0;
  const s = createSession({ timeout: 1000, now: clk.now, genId: () => `s${++n}` });
  const first = s.id();
  clk.advance(2000); // > timeout with no activity
  const second = s.id();
  expect(second).not.toBe(first);
  expect(second).toBe("s2");
});

test("session reset forces a new id on next call", () => {
  const clk = fakeClock(0);
  let n = 0;
  const s = createSession({ now: clk.now, genId: () => `s${++n}` });
  const first = s.id();
  s.reset();
  expect(s.id()).not.toBe(first);
});

test("applyMiddleware transforms and can drop events", () => {
  const doubled = applyMiddleware(2, [(x: number) => x * 2, (x: number) => x + 1]);
  expect(doubled).toBe(5);
  const dropped = applyMiddleware(2, [() => null, (x: number) => x + 1]);
  expect(dropped).toBeNull();
});
