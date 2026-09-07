/**
 * The error thrown on a failed assertion. Runner-agnostic: it is a plain
 * `Error` subclass (no `node:assert` dependency), so it surfaces cleanly in
 * vitest, jest, node:test, the browser, or a bare `try/catch`.
 */
export class AssertionError extends Error {
  override readonly name = "AssertionError";
  /** jest-compatible payload for tooling that reads `error.matcherResult`. */
  readonly matcherResult?: {
    pass: boolean;
    actual?: unknown;
    expected?: unknown;
    message: string;
  };

  constructor(
    message: string,
    result?: { pass: boolean; actual?: unknown; expected?: unknown },
  ) {
    super(message);
    Object.setPrototypeOf(this, AssertionError.prototype);
    if (result) {
      this.matcherResult = { ...result, message };
    }
  }
}
