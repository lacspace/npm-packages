import { test, expect } from "vitest";
import { selectLfuVictim, type VictimMeta } from "./policies";

test("selectLfuVictim returns undefined for empty input", () => {
  expect(selectLfuVictim([])).toBeUndefined();
  expect(selectLfuVictim(new Map())).toBeUndefined();
});

test("selectLfuVictim picks the lowest frequency", () => {
  const entries: Array<[string, VictimMeta]> = [
    ["a", { freq: 5, seq: 0 }],
    ["b", { freq: 2, seq: 1 }],
    ["c", { freq: 9, seq: 2 }],
  ];
  expect(selectLfuVictim(entries)).toBe("b");
});

test("selectLfuVictim breaks ties by oldest seq", () => {
  const entries: Array<[string, VictimMeta]> = [
    ["a", { freq: 3, seq: 7 }],
    ["b", { freq: 3, seq: 2 }], // same freq, older → victim
    ["c", { freq: 3, seq: 5 }],
  ];
  expect(selectLfuVictim(entries)).toBe("b");
});

test("selectLfuVictim accepts a Map (Entry-shaped values)", () => {
  const m = new Map<string, VictimMeta>([
    ["x", { freq: 4, seq: 0 }],
    ["y", { freq: 1, seq: 1 }],
  ]);
  expect(selectLfuVictim(m)).toBe("y");
});
