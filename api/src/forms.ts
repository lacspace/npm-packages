/**
 * `application/x-www-form-urlencoded` bodies. The client passes a
 * `URLSearchParams` body straight through to `fetch` (the platform sets the
 * right `Content-Type`), so `formBody(...)` is all you need to POST a form.
 * Pure function.
 */
import type { QueryParams } from "./index";

/**
 * Build a `URLSearchParams` form body from an object (or entry tuples).
 * `undefined` / `null` values are dropped; array values repeat the key.
 *
 * @example api.post("/login", formBody({ email, password }))
 */
export function formBody(
  data: QueryParams | Array<[string, string | number | boolean]>,
): URLSearchParams {
  const sp = new URLSearchParams();
  const entries = Array.isArray(data) ? data : Object.entries(data);
  for (const [k, v] of entries) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) for (const item of v) sp.append(k, String(item));
    else sp.append(k, String(v));
  }
  return sp;
}
