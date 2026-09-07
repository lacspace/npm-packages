import { describe, it, expect, afterEach } from "vitest";
import { useFakeTimers, restoreAll } from "./index";

afterEach(() => {
  restoreAll();
});

describe("useFakeTimers — setTimeout", () => {
  it("does not fire before its due time", () => {
    const clock = useFakeTimers();
    let fired = false;
    setTimeout(() => {
      fired = true;
    }, 100);
    clock.tick(99);
    expect(fired).toBe(false);
    clock.tick(1);
    expect(fired).toBe(true);
  });

  it("fires timers in due order and passes args", () => {
    const clock = useFakeTimers();
    const order: string[] = [];
    setTimeout((label: string) => order.push(label), 20, "b");
    setTimeout((label: string) => order.push(label), 10, "a");
    clock.tick(20);
    expect(order).toEqual(["a", "b"]);
  });

  it("advanceTimersByTime is an alias of tick", () => {
    const clock = useFakeTimers();
    let n = 0;
    setTimeout(() => n++, 5);
    clock.advanceTimersByTime(5);
    expect(n).toBe(1);
  });

  it("clearTimeout cancels a pending timer", () => {
    const clock = useFakeTimers();
    let fired = false;
    const id = setTimeout(() => {
      fired = true;
    }, 10);
    clearTimeout(id);
    clock.tick(50);
    expect(fired).toBe(false);
  });

  it("nested timers scheduled during tick still fire", () => {
    const clock = useFakeTimers();
    const seen: number[] = [];
    setTimeout(() => {
      seen.push(1);
      setTimeout(() => seen.push(2), 10);
    }, 10);
    clock.tick(20);
    expect(seen).toEqual([1, 2]);
  });
});

describe("useFakeTimers — setInterval", () => {
  it("fires repeatedly across ticks", () => {
    const clock = useFakeTimers();
    let count = 0;
    setInterval(() => count++, 10);
    clock.tick(35);
    expect(count).toBe(3);
    clock.tick(10);
    expect(count).toBe(4);
  });

  it("clearInterval stops the repetition", () => {
    const clock = useFakeTimers();
    let count = 0;
    const id = setInterval(() => count++, 10);
    clock.tick(25);
    expect(count).toBe(2);
    clearInterval(id);
    clock.tick(100);
    expect(count).toBe(2);
  });

  it("runOnlyPendingTimers fires each interval once without looping forever", () => {
    const clock = useFakeTimers();
    let count = 0;
    setInterval(() => count++, 10);
    clock.runOnlyPendingTimers();
    expect(count).toBe(1);
  });
});

describe("useFakeTimers — runAllTimers", () => {
  it("drains all queued one-shot timers", () => {
    const clock = useFakeTimers(0);
    const seen: number[] = [];
    setTimeout(() => seen.push(1), 100);
    setTimeout(() => seen.push(2), 50);
    setTimeout(() => seen.push(3), 200);
    clock.runAllTimers();
    expect(seen).toEqual([2, 1, 3]);
    expect(clock.now()).toBe(200);
  });

  it("throws on a runaway interval instead of hanging", () => {
    const clock = useFakeTimers();
    setInterval(() => {}, 10);
    expect(() => clock.runAllTimers()).toThrow(/maximum timer iterations/);
  });
});

describe("useFakeTimers — Date and system time", () => {
  it("Date.now and new Date() read the fake clock", () => {
    const clock = useFakeTimers(1000);
    expect(Date.now()).toBe(1000);
    expect(new Date().getTime()).toBe(1000);
    clock.tick(500);
    expect(Date.now()).toBe(1500);
    expect(clock.now()).toBe(1500);
  });

  it("setSystemTime jumps the clock (accepts number or Date)", () => {
    const clock = useFakeTimers(0);
    clock.setSystemTime(5000);
    expect(Date.now()).toBe(5000);
    clock.setSystemTime(new Date(8000));
    expect(Date.now()).toBe(8000);
  });

  it("new Date(explicit) still works normally", () => {
    useFakeTimers(0);
    expect(new Date(2000).getTime()).toBe(2000);
    expect(new Date("1970-01-01T00:00:00.000Z").getTime()).toBe(0);
  });
});

describe("useFakeTimers — restore", () => {
  it("restores real globals cleanly", () => {
    const realTimeout = setTimeout;
    const realDate = Date;
    const clock = useFakeTimers();
    expect(setTimeout).not.toBe(realTimeout);
    expect(Date).not.toBe(realDate);
    clock.restore();
    expect(setTimeout).toBe(realTimeout);
    expect(Date).toBe(realDate);
  });

  it("refuses to install twice without a restore in between", () => {
    useFakeTimers();
    expect(() => useFakeTimers()).toThrow(/already installed/);
  });

  it("restoreAll restores an active fake clock", () => {
    const realDate = Date;
    useFakeTimers();
    restoreAll();
    expect(Date).toBe(realDate);
  });

  it("fakes setImmediate when present", () => {
    if (typeof setImmediate !== "function") return; // browser: skip
    const clock = useFakeTimers();
    let fired = false;
    setImmediate(() => {
      fired = true;
    });
    clock.tick(0);
    expect(fired).toBe(true);
  });
});
