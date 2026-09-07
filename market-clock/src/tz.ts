/**
 * Timezone helpers — shared by MarketClock and the session functions.
 *
 * Two ways to resolve exchange-local time:
 *   1. `offsetMinutes` — a fixed offset ahead of UTC. Exact for exchanges with
 *      no daylight-saving (IST, JST, HKT, SGT).
 *   2. `timeZone` — an IANA zone name (e.g. "America/New_York"). DST-correct via
 *      `Intl.DateTimeFormat`. Takes precedence over `offsetMinutes` when present.
 *
 * Zero dependencies — `Intl` is a Web/Node built-in.
 */

import type { ExchangeSpec } from "./index";

export interface LocalParts {
  y: number;
  m: number;
  d: number;
  day: number;
  minute: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Minutes an IANA zone is ahead of UTC at a given instant (DST-aware). */
function zoneOffsetMinutes(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(
    map.year ?? 0,
    (map.month ?? 1) - 1,
    map.day ?? 1,
    (map.hour ?? 0) % 24,
    map.minute ?? 0,
    map.second ?? 0,
  );
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Exchange-local calendar parts for an instant. */
export function localParts(spec: ExchangeSpec, date: Date): LocalParts {
  if (spec.timeZone) {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: spec.timeZone,
      hourCycle: "h23",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const map: Record<string, string> = {};
    for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
    return {
      y: Number(map.year),
      m: Number(map.month),
      d: Number(map.day),
      day: WEEKDAYS.indexOf(map.weekday ?? ""),
      minute: (Number(map.hour) % 24) * 60 + Number(map.minute),
    };
  }
  const local = new Date(date.getTime() + spec.offsetMinutes * 60000);
  return {
    y: local.getUTCFullYear(),
    m: local.getUTCMonth() + 1,
    d: local.getUTCDate(),
    day: local.getUTCDay(),
    minute: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

/** UTC epoch millis for an exchange-local calendar day + minute-of-day. */
export function utcFromLocal(
  spec: ExchangeSpec,
  y: number,
  m: number,
  d: number,
  minute: number,
): number {
  if (spec.timeZone) {
    const guess = Date.UTC(y, m - 1, d) + minute * 60000;
    const off = zoneOffsetMinutes(spec.timeZone, new Date(guess));
    let utc = guess - off * 60000;
    // Refine once for the wall-clock hour landing across a DST transition.
    const off2 = zoneOffsetMinutes(spec.timeZone, new Date(utc));
    if (off2 !== off) utc = guess - off2 * 60000;
    return utc;
  }
  return Date.UTC(y, m - 1, d) + minute * 60000 - spec.offsetMinutes * 60000;
}
