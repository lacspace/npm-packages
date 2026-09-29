/** Per-window limits for a provider or a specific model. Any field omitted = unlimited. */
export interface Limits {
  /** Requests per minute. */
  rpm?: number;
  /** Requests per day. */
  rpd?: number;
  /** Tokens per minute. */
  tpm?: number;
  /** Tokens per day. */
  tpd?: number;
}

export interface KeySpec {
  /** Unique id for this key (never the secret itself — store a label or hash). */
  id: string;
  provider: string;
  /** The secret. Held in memory only; never persisted by the built-in memory adapter's snapshot of counters. */
  secret: string;
  /** Optional per-key limit overrides (else provider/model defaults apply). */
  limits?: Limits;
  /** Priority — higher is preferred among equally-healthy keys. Default 0. */
  priority?: number;
}

/** Rolling counters + health for one key, per model bucket. */
export interface BucketState {
  /** minute window start (epoch ms) and counts */
  minStart: number;
  minReq: number;
  minTok: number;
  /** day window start (epoch ms) and counts */
  dayStart: number;
  dayReq: number;
  dayTok: number;
}

export interface KeyState {
  id: string;
  provider: string;
  /** epoch ms until which the key is cooling down (0 = healthy). */
  cooldownUntil: number;
  /** true if quarantined (invalid key) — never picked until cleared. */
  invalid: boolean;
  /** per-model buckets, keyed by model id ("" = provider-wide bucket). */
  buckets: Record<string, BucketState>;
  /** round-robin tiebreaker cursor. */
  lastUsed: number;
}

/** A persistence adapter so multiple processes share pool state. All async-friendly. */
export interface KeypoolStore {
  load(): Record<string, KeyState> | null | Promise<Record<string, KeyState> | null>;
  save(states: Record<string, KeyState>): void | Promise<void>;
}

export interface ReportInput {
  ok: boolean;
  /** HTTP status of the response, if any. */
  status?: number;
  /** Tokens actually consumed by the call (input+output). */
  tokens?: number;
  /** Raw response headers (or a subset). `retry-after` and rate-limit remaining headers are read when present. */
  headers?: Record<string, string | number | null | undefined> | { get(name: string): string | null };
  /** Model used (defaults to the model passed to pick). */
  model?: string;
}
