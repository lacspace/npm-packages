import type { InlineSnapshotOptions, InlineSnapshotResult } from "./types";
import { serialize } from "./serialize";
import { mismatchMessage } from "./diff";

/**
 * Error thrown by {@link toMatchInlineSnapshot} when a snapshot does not match
 * and `throwOnMismatch` is not disabled. Carries the structured result on `.result`.
 */
export class SnapshotMismatchError extends Error {
  readonly result: InlineSnapshotResult;
  constructor(result: InlineSnapshotResult) {
    super(result.message);
    this.name = "SnapshotMismatchError";
    this.result = result;
  }
}

/**
 * Compare `serialize(value)` against an inline `expected` string.
 *
 * Behaviour (explicit and documented):
 * - When `expected` is **omitted** (`undefined`), nothing can fail: the call
 *   returns `{ pass: true, expected: null, ... }` and `message` contains the
 *   produced snapshot so you can paste it into your test as the `expected` arg.
 * - When `expected` is **provided**, the comparison ignores only the leading and
 *   trailing whitespace of both sides (so you may indent template literals
 *   freely); internal content must match exactly.
 * - On mismatch it **throws** a {@link SnapshotMismatchError} by default. Pass
 *   `{ throwOnMismatch: false }` to instead return `{ pass: false, ... }`.
 */
export function toMatchInlineSnapshot(
  value: unknown,
  expected?: string,
  options: InlineSnapshotOptions = {},
): InlineSnapshotResult {
  const { throwOnMismatch = true, ...serializeOptions } = options;
  const actual = serialize(value, serializeOptions);

  if (expected === undefined) {
    return {
      pass: true,
      actual,
      expected: null,
      message:
        "No inline snapshot provided. Paste the following as the expected argument:\n\n" + actual,
    };
  }

  const pass = actual.trim() === expected.trim();
  if (pass) {
    return { pass: true, actual, expected, message: "Snapshot matched." };
  }

  const message = mismatchMessage("Inline snapshot mismatch.", expected.trim(), actual.trim());
  const result: InlineSnapshotResult = { pass: false, actual, expected, message };
  if (throwOnMismatch) throw new SnapshotMismatchError(result);
  return result;
}
