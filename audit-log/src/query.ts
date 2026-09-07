/**
 * Query, filter and export helpers for audit trails.
 *
 * These are pure, synchronous and isomorphic — no crypto, no IO. They operate
 * on plain {@link AuditEvent} arrays (as produced by {@link auditEvent} /
 * {@link createAuditor}) and, for the export helpers, on any JSON-serialisable
 * records including {@link SealedEntry} arrays.
 */

import type { AuditEvent } from "./index";

/** A value, or a list of allowed values, matched with OR semantics. */
export type OneOrMany<T> = T | readonly T[];

/** An instant accepted by the time-range filters. */
export type TimeInput = string | number | Date;

/**
 * A filter over an audit trail. Every supplied field must match (AND); a field
 * given a list matches when the event matches ANY value in it (OR). Omitted
 * fields are ignored, so an empty query matches everything.
 */
export interface AuditQuery {
  /** Match `actor.id`. */
  actor?: OneOrMany<string>;
  /** Match `actor.type`. */
  actorType?: OneOrMany<string>;
  /** Match `action`. */
  action?: OneOrMany<string>;
  /** Match `target.type`. */
  targetType?: OneOrMany<string>;
  /** Match `target.id`. */
  targetId?: OneOrMany<string>;
  /** Keep events at or after this instant (inclusive), compared on `at`. */
  from?: TimeInput;
  /** Keep events at or before this instant (inclusive), compared on `at`. */
  to?: TimeInput;
  /** Extra arbitrary predicate, ANDed with the rest. */
  where?: (event: AuditEvent) => boolean;
}

function toMs(t: TimeInput): number {
  if (t instanceof Date) return t.getTime();
  if (typeof t === "number") return t;
  return Date.parse(t);
}

function matchesOneOrMany(value: string | undefined, expected: OneOrMany<string> | undefined): boolean {
  if (expected === undefined) return true;
  if (value === undefined) return false;
  if (Array.isArray(expected)) return expected.includes(value);
  return value === (expected as string);
}

/** Test a single event against a {@link AuditQuery}. */
export function matchesQuery(event: AuditEvent, query: AuditQuery): boolean {
  if (!matchesOneOrMany(event.actor.id, query.actor)) return false;
  if (!matchesOneOrMany(event.actor.type, query.actorType)) return false;
  if (!matchesOneOrMany(event.action, query.action)) return false;
  if (!matchesOneOrMany(event.target?.type, query.targetType)) return false;
  if (!matchesOneOrMany(event.target?.id, query.targetId)) return false;

  if (query.from !== undefined || query.to !== undefined) {
    const at = Date.parse(event.at);
    if (Number.isNaN(at)) return false;
    if (query.from !== undefined && at < toMs(query.from)) return false;
    if (query.to !== undefined && at > toMs(query.to)) return false;
  }

  if (query.where && !query.where(event)) return false;
  return true;
}

/**
 * Return a NEW array of the events matching `query`, preserving order. The
 * input array is not mutated.
 */
export function filterEvents(events: readonly AuditEvent[], query: AuditQuery = {}): AuditEvent[] {
  return events.filter((e) => matchesQuery(e, query));
}

/**
 * Serialise records to newline-delimited JSON (one compact JSON object per
 * line, no trailing newline). Works for any JSON-serialisable records —
 * {@link AuditEvent}s or {@link SealedEntry}s alike.
 */
export function toNDJSON<T>(records: readonly T[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n");
}

/**
 * Parse newline-delimited JSON back into records. Blank lines (including a
 * trailing newline) are skipped, so `parseNDJSON(toNDJSON(x))` round-trips.
 */
export function parseNDJSON<T = AuditEvent>(text: string): T[] {
  const out: T[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.length === 0) continue;
    out.push(JSON.parse(line) as T);
  }
  return out;
}

/**
 * Serialise records to a JSON array string. Pass `pretty` (spaces of
 * indentation, default `0` = compact) for a human-readable file.
 */
export function toJSON<T>(records: readonly T[], pretty = 0): string {
  return JSON.stringify(records, null, pretty);
}
