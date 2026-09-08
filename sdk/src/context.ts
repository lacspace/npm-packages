/**
 * @lacspace/sdk — request correlation / tracing helpers.
 *
 * Generate correlation and idempotency ids and turn them into request headers
 * so a single logical operation can be traced across auth, analytics and
 * e-commerce calls. The random source and clock are injectable, so ids are
 * fully deterministic in tests and nothing here touches globals implicitly.
 * Zero dependencies, isomorphic.
 */

/** A `Math.random`-compatible source, injectable for deterministic tests. */
export type RandomSource = () => number;

function hex8(rng: RandomSource): string {
  // 32 bits of the source, hex-encoded and zero-padded.
  return Math.floor(rng() * 0x100000000)
    .toString(16)
    .padStart(8, "0");
}

/** Generate a correlation / trace id like `lac-1a2b3c4d5e6f7a8b`. */
export function createCorrelationId(rng: RandomSource = Math.random): string {
  return `lac-${hex8(rng)}${hex8(rng)}`;
}

/** Generate an idempotency key (safe to send as `Idempotency-Key`). */
export function createIdempotencyKey(rng: RandomSource = Math.random): string {
  return `idem-${hex8(rng)}${hex8(rng)}${hex8(rng)}${hex8(rng)}`;
}

/** Options for {@link correlationHeaders}. */
export interface CorrelationOptions {
  /** Header name carrying the id. Default `"X-Correlation-Id"`. */
  header?: string;
  /** Use a fixed id instead of generating one. */
  id?: string;
  /** Random source used when generating. Default `Math.random`. */
  rng?: RandomSource;
}

/** Build a `{ [header]: id }` object, generating an id when none is given. */
export function correlationHeaders(opts: CorrelationOptions = {}): Record<string, string> {
  const id = opts.id ?? createCorrelationId(opts.rng);
  return { [opts.header ?? "X-Correlation-Id"]: id };
}

/** A lightweight, immutable context for one logical operation. */
export interface SdkRequestContext {
  correlationId: string;
  /** Epoch ms the context was created. */
  startedAt: number;
}

/** Options for {@link createRequestContext}. */
export interface RequestContextOptions {
  /** Use a fixed correlation id instead of generating one. */
  id?: string;
  /** Random source used when generating the id. Default `Math.random`. */
  rng?: RandomSource;
  /** Clock, injectable for tests. Default `Date.now`. */
  now?: () => number;
}

/** Create a request context with a correlation id and a start timestamp. */
export function createRequestContext(opts: RequestContextOptions = {}): SdkRequestContext {
  return {
    correlationId: opts.id ?? createCorrelationId(opts.rng),
    startedAt: (opts.now ?? Date.now)(),
  };
}

/** Milliseconds elapsed since a context was created (uses an injectable clock). */
export function contextElapsedMs(ctx: SdkRequestContext, now: () => number = Date.now): number {
  return now() - ctx.startedAt;
}
