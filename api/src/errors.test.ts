import { test, expect } from "vitest";
import { LacspaceApiError } from "./index";
import {
  getStatus,
  getErrorBody,
  isStatus,
  isClientError,
  isServerError,
  isNotFound,
  isUnauthorized,
  isRateLimited,
  retryAfterMs,
} from "./errors";

function apiErr(status: number, body: unknown = {}, headers?: Record<string, string>): LacspaceApiError {
  const response = headers ? (new Response(null, { headers }) as Response) : undefined;
  return new LacspaceApiError(`failed ${status}`, status, "X", body, response);
}

test("getStatus / getErrorBody narrow API errors and ignore others", () => {
  expect(getStatus(apiErr(404))).toBe(404);
  expect(getStatus(new Error("nope"))).toBeUndefined();
  expect(getErrorBody<{ code: string }>(apiErr(400, { code: "BAD" }))?.code).toBe("BAD");
});

test("status classifiers", () => {
  expect(isClientError(apiErr(422))).toBe(true);
  expect(isClientError(apiErr(500))).toBe(false);
  expect(isServerError(apiErr(503))).toBe(true);
  expect(isNotFound(apiErr(404))).toBe(true);
  expect(isUnauthorized(apiErr(401))).toBe(true);
  expect(isRateLimited(apiErr(429))).toBe(true);
  expect(isStatus(apiErr(418), 400, 418)).toBe(true);
  expect(isStatus(new Error("x"), 400)).toBe(false);
});

test("retryAfterMs parses delta-seconds", () => {
  expect(retryAfterMs(apiErr(429, {}, { "retry-after": "2" }))).toBe(2000);
  expect(retryAfterMs(apiErr(429, {}))).toBeUndefined();
  expect(retryAfterMs(new Error("x"))).toBeUndefined();
});

test("retryAfterMs parses HTTP-date with injectable now", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  const when = "Thu, 01 Jan 2026 00:00:05 GMT";
  expect(retryAfterMs(apiErr(503, {}, { "retry-after": when }), now)).toBe(5000);
});

test("duck-typing survives a plain object shaped like an API error", () => {
  const fake = { name: "LacspaceApiError", status: 409, statusText: "Conflict", body: null };
  expect(getStatus(fake)).toBe(409);
  expect(isStatus(fake, 409)).toBe(true);
});
