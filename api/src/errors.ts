/**
 * Typed error helpers — ergonomic, allocation-free predicates for narrowing an
 * unknown `catch` value into an API error and branching on its status. These use
 * structural (duck-typed) detection rather than `instanceof`, so they stay
 * correct across the ESM/CJS boundary and when errors cross realms/bundles.
 * Pure functions — no network.
 */

/** The subset of a {@link LacspaceApiError} these helpers read. */
export interface ApiErrorShape {
  name: string;
  status: number;
  statusText: string;
  body: unknown;
  response?: Response;
}

function asApiError(e: unknown): ApiErrorShape | undefined {
  if (
    typeof e === "object" &&
    e !== null &&
    (e as { name?: unknown }).name === "LacspaceApiError" &&
    typeof (e as { status?: unknown }).status === "number"
  ) {
    return e as ApiErrorShape;
  }
  return undefined;
}

/** The HTTP status of an API error, or `undefined` for anything else. */
export function getStatus(e: unknown): number | undefined {
  return asApiError(e)?.status;
}

/** The parsed error body of an API error, typed as `T`. */
export function getErrorBody<T = unknown>(e: unknown): T | undefined {
  return asApiError(e)?.body as T | undefined;
}

/** True when the error is an API error whose status is one of `codes`. */
export function isStatus(e: unknown, ...codes: number[]): boolean {
  const s = getStatus(e);
  return s !== undefined && codes.includes(s);
}

/** True for a 4xx API error. */
export function isClientError(e: unknown): boolean {
  const s = getStatus(e);
  return s !== undefined && s >= 400 && s < 500;
}

/** True for a 5xx API error. */
export function isServerError(e: unknown): boolean {
  const s = getStatus(e);
  return s !== undefined && s >= 500 && s < 600;
}

/** True for HTTP 401. */
export function isUnauthorized(e: unknown): boolean {
  return isStatus(e, 401);
}
/** True for HTTP 403. */
export function isForbidden(e: unknown): boolean {
  return isStatus(e, 403);
}
/** True for HTTP 404. */
export function isNotFound(e: unknown): boolean {
  return isStatus(e, 404);
}
/** True for HTTP 409. */
export function isConflict(e: unknown): boolean {
  return isStatus(e, 409);
}
/** True for HTTP 429. */
export function isRateLimited(e: unknown): boolean {
  return isStatus(e, 429);
}

/**
 * The `Retry-After` delay of an API error, in **milliseconds**, or `undefined`
 * when the header is absent/unparseable. Supports both the delta-seconds and
 * the HTTP-date forms; `now` is injectable for deterministic tests.
 */
export function retryAfterMs(e: unknown, now: number = Date.now()): number | undefined {
  const err = asApiError(e);
  const ra = err?.response?.headers?.get?.("retry-after");
  if (!ra) return undefined;
  const secs = Number(ra);
  if (!Number.isNaN(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(ra);
  if (!Number.isNaN(when)) return Math.max(0, when - now);
  return undefined;
}
