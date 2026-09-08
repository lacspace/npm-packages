import { test, expect, vi } from "vitest";
import { createBeaconTransport, createMemoryTransport } from "./transport";
import type { LiteEvent } from "./client";

const ev = (name: string): LiteEvent => ({ type: "track", name, aid: "a", ts: 1 });

test("uses the injected sendBeacon when it accepts the payload", () => {
  const sendBeacon = vi.fn((_url: string, _data: string) => true);
  const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(null));
  const t = createBeaconTransport("/collect", { sendBeacon, fetchImpl });

  t([ev("x")]);

  expect(sendBeacon).toHaveBeenCalledTimes(1);
  expect(sendBeacon.mock.calls[0]![0]).toBe("/collect");
  expect(JSON.parse(sendBeacon.mock.calls[0]![1] as string)).toHaveLength(1);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test("falls back to fetch when the beacon refuses (returns false)", async () => {
  const sendBeacon = vi.fn((_url: string, _data: string) => false);
  const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(null));
  const t = createBeaconTransport("/collect", { sendBeacon, fetchImpl });

  await t([ev("x")]);

  expect(sendBeacon).toHaveBeenCalledTimes(1);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const init = fetchImpl.mock.calls[0]![1]!;
  expect(init.method).toBe("POST");
  expect(init.keepalive).toBe(true);
});

test("falls back to fetch when no beacon is available", async () => {
  const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(null));
  const t = createBeaconTransport("/collect", { sendBeacon: undefined, fetchImpl });

  await t([ev("x")]);

  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("a rejected fetch is swallowed, never thrown", async () => {
  const fetchImpl = vi.fn(async () => {
    throw new Error("offline");
  });
  const t = createBeaconTransport("/collect", { fetchImpl });
  await expect(Promise.resolve(t([ev("x")]))).resolves.toBeUndefined();
});

test("does nothing for an empty batch", () => {
  const sendBeacon = vi.fn(() => true);
  const t = createBeaconTransport("/collect", { sendBeacon });
  t([]);
  expect(sendBeacon).not.toHaveBeenCalled();
});

test("memory transport records events and batches", () => {
  const m = createMemoryTransport();
  m.transport([ev("a"), ev("b")]);
  m.transport([ev("c")]);
  expect(m.batches).toHaveLength(2);
  expect(m.events.map((e) => e.name)).toEqual(["a", "b", "c"]);
});
