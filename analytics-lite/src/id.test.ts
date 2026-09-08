import { test, expect } from "vitest";
import { randomId } from "./id";

test("randomId returns a non-empty string", () => {
  const id = randomId();
  expect(typeof id).toBe("string");
  expect(id.length).toBeGreaterThan(0);
});

test("randomId produces distinct ids", () => {
  const ids = new Set(Array.from({ length: 200 }, () => randomId()));
  expect(ids.size).toBe(200);
});
