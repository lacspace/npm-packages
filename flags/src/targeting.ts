/**
 * Reusable targeting segments — a named bundle of attribute conditions (plus an
 * optional escape-hatch predicate) you can evaluate against a {@link Context}
 * independently of any flag. Handy for "is this user in the beta cohort?" checks
 * and for sharing one audience definition across several flags.
 *
 * The `match` conditions use the exact same operator grammar as flag `rules`
 * (`eq` / `in` / `gte` / `contains` / `regex` / `startsWith` / `endsWith` /
 * `predicate` …), so anything you can target in a rule you can target here.
 */

import type { Condition, Context } from "./index";
import { matchCondition } from "./index";

export interface Segment {
  /** Attribute conditions — ALL must match (same grammar as a rule's `when`). */
  match?: Condition;
  /** Arbitrary predicate over the whole context (runs after `match`). */
  predicate?: (ctx: Context) => boolean;
}

/**
 * Does `ctx` fall into `segment`? Both parts (when present) must pass. An empty
 * segment (`{}`) matches everyone. The predicate runs only if `match` passed.
 */
export function matchesSegment(ctx: Context, segment: Segment): boolean {
  if (segment.match && !matchCondition(ctx.attributes ?? {}, segment.match)) return false;
  if (segment.predicate && !segment.predicate(ctx)) return false;
  return true;
}
