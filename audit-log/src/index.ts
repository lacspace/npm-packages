/**
 * @lacspace/audit-log
 *
 * Structured audit-trail toolkit — record who did what, when, with before/after
 * diffs, actor attribution and field-level redaction.
 *
 * Zero runtime dependencies. Isomorphic (Node, edge, browser).
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
      meta[k] = set.has(k) ? REDACTED : v;
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
      let event = auditEvent(input);
      if (redactKeys.length > 0) {
        event = redactEvent(event, redactKeys);
      }
      opts.sink?.(event);
      return event;
    },
  };
}
