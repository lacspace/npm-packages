/**
 * @lacspace/audit-log
 *
 * Structured audit-trail toolkit — record who did what, when, with before/after
 * diffs, actor attribution and field-level redaction, plus an optional
 * **tamper-evident hash chain** so a trail can prove it has not been altered.
 *
 * Zero runtime dependencies. Isomorphic (Node 20+, edge, modern browsers). The
 * hash-chain API uses Web Crypto (`crypto.subtle`) and is async; everything
 * else is synchronous and runs anywhere.
 */

/** A single, immutable audit-trail entry. */
export interface AuditEvent {
  /** Unique id for this event. */
  id: string;
  /** ISO-8601 timestamp of when the event occurred. */
  at: string;
  /** Who performed the action. */
  actor: {
    id: string;
    type?: string;
    ip?: string;
    /** Client user-agent string, when known. */
    userAgent?: string;
  };
  /** What happened, e.g. "updated", "deleted", "login". */
  action: string;
  /** The thing acted upon, e.g. { type: "order", id: "42" }. */
  target?: {
    type: string;
    id: string;
  };
  /** Field-level before/after changes. */
  changes?: AuditChange[];
  /** Arbitrary contextual metadata. */
  meta?: Record<string, unknown>;
}

/** A single field-level change. */
export interface AuditChange {
  field: string;
  from: unknown;
  to: unknown;
}

/** Placeholder written over redacted values. */
export const REDACTED = "[REDACTED]";

/**
 * Generate a random, url-safe id. Uses `globalThis.crypto.getRandomValues`
 * when available and falls back to `Math.random` otherwise.
 */
function randomId(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  const g = globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } };
  if (g.crypto && typeof g.crypto.getRandomValues === "function") {
    g.crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < bytes; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  let hex = "";
  for (let i = 0; i < buf.length; i++) {
    hex += (buf[i] as number).toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Build a complete {@link AuditEvent}, filling in a random `id` and current
 * `at` timestamp when not supplied.
 */
export function auditEvent(
  input: Omit<AuditEvent, "id" | "at"> & { id?: string; at?: string },
): AuditEvent {
  const { id, at, ...rest } = input;
  return {
    id: id ?? randomId(),
    at: at ?? new Date().toISOString(),
    ...rest,
  };
}

/**
 * Shallow diff two objects. Returns one entry per changed key, including keys
 * that were added (missing in `before`) or removed (missing in `after`).
 * Removed keys report `to: undefined`; added keys report `from: undefined`.
 */
export function diff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): AuditChange[] {
  const changes: AuditChange[] = [];
  const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
  for (const field of keys) {
    const hadBefore = Object.prototype.hasOwnProperty.call(before, field);
    const hasAfter = Object.prototype.hasOwnProperty.call(after, field);
    const from = hadBefore ? before[field] : undefined;
    const to = hasAfter ? after[field] : undefined;
    if (!Object.is(from, to)) {
      changes.push({ field, from, to });
    }
  }
  return changes;
}

/**
 * Return a copy of `event` with any `changes[].from` / `changes[].to` values
 * and `meta` fields whose key matches one of `keys` replaced with `[REDACTED]`.
 * The original event is not mutated.
 */
export function redactEvent(event: AuditEvent, keys: string[]): AuditEvent {
  const set = new Set(keys);
  const next: AuditEvent = {
    ...event,
    actor: { ...event.actor },
    ...(event.target ? { target: { ...event.target } } : {}),
  };

  if (event.changes) {
    next.changes = event.changes.map((c) =>
      set.has(c.field) ? { ...c, from: REDACTED, to: REDACTED } : { ...c },
    );
  }

  if (event.meta) {
    const meta: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(event.meta)) {
      const val = set.has(k) ? REDACTED : v;
      // Use defineProperty so dangerous keys ("__proto__", "constructor") land
      // as plain own properties instead of mutating the object's prototype.
      Object.defineProperty(meta, k, {
        value: val,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    next.meta = meta;
  }

  return next;
}

function stringifyValue(v: unknown): string {
  if (v === undefined) return "∅";
  if (v === null) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/**
 * Render an event as a human-readable one-liner, e.g.
 * `"alice updated order#42 (status: pending→paid)"`.
 */
export function formatEvent(event: AuditEvent): string {
  let line = `${event.actor.id} ${event.action}`;
  if (event.target) {
    line += ` ${event.target.type}#${event.target.id}`;
  }
  if (event.changes && event.changes.length > 0) {
    const parts = event.changes.map(
      (c) => `${c.field}: ${stringifyValue(c.from)}→${stringifyValue(c.to)}`,
    );
    line += ` (${parts.join(", ")})`;
  }
  return line;
}

/** Options for {@link createAuditor}. */
export interface AuditorOptions {
  /** Called with every built (and redacted) event. */
  sink?: (event: AuditEvent) => void;
  /** Field keys to redact on every recorded event. */
  redact?: string[];
  /**
   * Injectable clock. Returns the `at` for each event when the caller does not
   * supply one — a `Date` or an ISO string. Defaults to `new Date()`. Handy for
   * deterministic tests and for stamping events from a trusted server clock.
   */
  now?: () => Date | string;
  /**
   * Injectable id generator. Returns the `id` for each event when the caller
   * does not supply one. Defaults to the built-in random id.
   */
  id?: () => string;
}

/** An auditor that builds, redacts and dispatches events to a sink. */
export interface Auditor {
  record(
    input: Omit<AuditEvent, "id" | "at"> & { id?: string; at?: string },
  ): AuditEvent;
}

/**
 * Create an auditor bound to a `sink` and default `redact` keys. Each call to
 * `record` builds a complete event, applies redaction, forwards it to the sink
 * and returns it.
 */
export function createAuditor(opts: AuditorOptions = {}): Auditor {
  const redactKeys = opts.redact ?? [];
  return {
    record(input) {
      const filled = { ...input };
      if (filled.at === undefined && opts.now) {
        const at = opts.now();
        filled.at = at instanceof Date ? at.toISOString() : at;
      }
      if (filled.id === undefined && opts.id) {
        filled.id = opts.id();
      }
      let event = auditEvent(filled);
      if (redactKeys.length > 0) {
        event = redactEvent(event, redactKeys);
      }
      opts.sink?.(event);
      return event;
    },
  };
}

/* ------------------------------------------------------------------ *
 * Tamper-evident hash chain
 *
 * Each event is sealed into an entry whose `hash` is
 *   SHA-256( seq : prevHash : canonicalJSON(event) )
 * and whose `prevHash` links to the entry before it. Any change to a past
 * event, any reorder, insertion or deletion breaks the chain, which
 * {@link verifyChain} detects and points at.
 * ------------------------------------------------------------------ */

/** Thrown when the hash chain cannot operate (e.g. Web Crypto unavailable). */
export class AuditError extends Error {
  /** Machine-readable code, e.g. `"NO_CRYPTO"`. */
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "AuditError";
    if (code !== undefined) this.code = code;
  }
}

/** The `prevHash` of the first entry — a chain's anchor. */
export const GENESIS_HASH = "0".repeat(64);

/** An event sealed into the hash chain. Treat every field as read-only. */
export interface SealedEntry {
  /** 0-based position in the chain. */
  seq: number;
  /** The audit event this entry seals. */
  event: AuditEvent;
  /** Hash of the previous entry, or {@link GENESIS_HASH} for the first. */
  prevHash: string;
  /** `SHA-256(seq : prevHash : canonicalJSON(event))`, lowercase hex. */
  hash: string;
}

/** The result of {@link verifyChain}. */
export interface ChainVerification {
  /** True when every entry hashes and links correctly. */
  valid: boolean;
  /** Number of entries checked. */
  length: number;
  /** Index of the first bad entry, when `valid` is false. */
  brokenAt?: number;
  /** Human-readable reason the chain is invalid. */
  reason?: string;
}

/**
 * Deterministic JSON: object keys sorted recursively (own enumerable keys
 * only), `undefined` and non-finite numbers normalised, so the same logical
 * event always produces the same string to hash regardless of key order.
 */
function canonical(v: unknown): string {
  if (v === null || v === undefined) return "null";
  const t = typeof v;
  if (t === "number") return Number.isFinite(v as number) ? JSON.stringify(v) : "null";
  if (t === "boolean" || t === "string") return JSON.stringify(v);
  if (t !== "object") return "null"; // functions, symbols, bigint
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") + "}";
}

/** SHA-256 of a UTF-8 string as lowercase hex, via Web Crypto. */
async function sha256Hex(input: string): Promise<string> {
  const g = globalThis as { crypto?: { subtle?: SubtleCrypto } };
  if (!g.crypto || !g.crypto.subtle || typeof g.crypto.subtle.digest !== "function") {
    throw new AuditError(
      "Web Crypto (crypto.subtle) is unavailable — the hash-chain API needs Node 20+, a modern browser or an edge runtime",
      "NO_CRYPTO",
    );
  }
  const bytes = new TextEncoder().encode(input);
  const digest = await g.crypto.subtle.digest("SHA-256", bytes);
  const arr = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < arr.length; i++) hex += (arr[i] as number).toString(16).padStart(2, "0");
  return hex;
}

/** The exact preimage hashed for an entry — shared by seal and verify. */
function preimage(seq: number, prevHash: string, event: AuditEvent): string {
  return `${seq}:${prevHash}:${canonical(event)}`;
}

/**
 * Seal one event into a {@link SealedEntry}, linking it after `prev` (omit
 * `prev` for the first entry in a chain). Pure apart from hashing; does not
 * mutate `prev`.
 */
export async function sealEvent(event: AuditEvent, prev?: SealedEntry): Promise<SealedEntry> {
  const seq = prev ? prev.seq + 1 : 0;
  const prevHash = prev ? prev.hash : GENESIS_HASH;
  const hash = await sha256Hex(preimage(seq, prevHash, event));
  return { seq, event, prevHash, hash };
}

/**
 * Return a NEW chain with `event` sealed and appended. The input chain is not
 * mutated, so you can keep the previous array as an immutable snapshot.
 */
export async function appendToChain(
  chain: readonly SealedEntry[],
  event: AuditEvent,
): Promise<SealedEntry[]> {
  const prev = chain.length > 0 ? chain[chain.length - 1] : undefined;
  const sealed = await sealEvent(event, prev);
  return [...chain, sealed];
}

/** Build a sealed chain from a list of events (empty by default). */
export async function createChain(events: readonly AuditEvent[] = []): Promise<SealedEntry[]> {
  let chain: SealedEntry[] = [];
  for (const event of events) chain = await appendToChain(chain, event);
  return chain;
}

/**
 * Verify a sealed chain end to end. Recomputes every hash and checks every
 * link, so it catches a mutated event, a swapped/edited hash, a reordered,
 * inserted or deleted entry — returning the index and reason of the first
 * fault.
 */
export async function verifyChain(chain: readonly SealedEntry[]): Promise<ChainVerification> {
  let prevHash = GENESIS_HASH;
  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i] as SealedEntry;
    if (entry.seq !== i) {
      return { valid: false, length: chain.length, brokenAt: i, reason: `seq mismatch: expected ${i}, got ${entry.seq}` };
    }
    if (entry.prevHash !== prevHash) {
      return { valid: false, length: chain.length, brokenAt: i, reason: "prevHash does not match the previous entry (reordered, inserted or deleted)" };
    }
    const expected = await sha256Hex(preimage(entry.seq, entry.prevHash, entry.event));
    if (entry.hash !== expected) {
      return { valid: false, length: chain.length, brokenAt: i, reason: "hash mismatch — this entry was tampered with" };
    }
    prevHash = entry.hash;
  }
  return { valid: true, length: chain.length };
}

/** A stateful, append-only sealed log. */
export interface SealedLog {
  /** Seal `event`, append it and return the new entry. */
  append(event: AuditEvent): Promise<SealedEntry>;
  /** A snapshot copy of every sealed entry so far. */
  entries(): SealedEntry[];
  /** The hash of the last entry, or {@link GENESIS_HASH} when empty. */
  head(): string;
  /** Verify the whole chain. */
  verify(): Promise<ChainVerification>;
}

/**
 * Create a stateful {@link SealedLog} that keeps a growing hash chain in memory
 * (optionally continuing from an existing chain). Persist `entries()` however
 * you like; re-load them into `createSealedLog(saved)` to keep appending.
 */
export function createSealedLog(initial: readonly SealedEntry[] = []): SealedLog {
  let chain: SealedEntry[] = [...initial];
  return {
    async append(event) {
      chain = await appendToChain(chain, event);
      return chain[chain.length - 1] as SealedEntry;
    },
    entries() {
      return [...chain];
    },
    head() {
      return chain.length > 0 ? (chain[chain.length - 1] as SealedEntry).hash : GENESIS_HASH;
    },
    verify() {
      return verifyChain(chain);
    },
  };
}

/* ------------------------------------------------------------------ *
 * Query / filter, export and retention
 * ------------------------------------------------------------------ */

export {
  filterEvents,
  matchesQuery,
  toNDJSON,
  parseNDJSON,
  toJSON,
} from "./query";
export type { AuditQuery, OneOrMany, TimeInput } from "./query";

export { pruneChain, verifyChainSegment } from "./retention";
export type { ChainCheckpoint, PrunedChain, PruneOptions } from "./retention";
