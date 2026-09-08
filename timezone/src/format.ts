/**
 * Zoned formatting helpers — turn an instant into a human string *as observed
 * in a given IANA zone*, and read a zone's abbreviation. Built on the same
 * platform `Intl.DateTimeFormat` the rest of the package uses, so no tz data is
 * bundled and output is always as current as the host runtime.
 */

import type { Instant } from "./index";

function toDateLike(instant?: Instant): Date {
  if (instant == null) return new Date();
  if (instant instanceof Date) return instant;
  return new Date(instant);
}

/** Options for {@link formatInZone}: any `Intl.DateTimeFormatOptions` plus a `locale`. */
export interface FormatInZoneOptions extends Intl.DateTimeFormatOptions {
  /** BCP-47 locale(s). Defaults to `"en-US"` for stable, deterministic output. */
  locale?: string | string[];
}

/** Default component set used when no formatting fields are supplied. */
const DEFAULT_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
};

/**
 * Format `instant` as a string, as observed in `zone`.
 *
 * Pass any `Intl.DateTimeFormatOptions` (e.g. `{ dateStyle: "full" }` or
 * `{ hour: "2-digit", minute: "2-digit" }`) plus an optional `locale`. When no
 * formatting fields are given, a sensible default (`Jan 15, 2024, 17:45:00`
 * style, `h23`) is used. The `zone` argument always wins over any `timeZone`
 * you place in `options`.
 *
 * @throws {RangeError} if `zone` is not a valid IANA time zone.
 */
export function formatInZone(instant: Instant, zone: string, options?: FormatInZoneOptions): string {
  const date = toDateLike(instant);
  const { locale, ...rest } = options ?? {};
  const hasFields = Object.keys(rest).length > 0;
  const opts: Intl.DateTimeFormatOptions = {
    ...(hasFields ? rest : DEFAULT_FORMAT),
    timeZone: zone, // zone always wins over any timeZone in the caller's options
  };
  return new Intl.DateTimeFormat(locale ?? "en-US", opts).format(date);
}

/**
 * The zone's abbreviation / display name at `instant` (defaults to now).
 *
 * `style: "short"` (the default) yields the compact form Intl exposes — `"EST"`,
 * `"EDT"`, `"UTC"`, or a numeric fallback like `"GMT+5:45"` for zones ICU has no
 * abbreviation for. `style: "long"` yields the descriptive name, e.g.
 * `"Eastern Standard Time"`. DST-aware: the value reflects the offset in force at
 * `instant`.
 *
 * @throws {RangeError} if `zone` is not a valid IANA time zone.
 */
export function getAbbreviation(
  zone: string,
  instant?: Instant,
  style: "short" | "long" = "short",
): string {
  const date = toDateLike(instant);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    timeZoneName: style,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const tz = parts.find((p) => p.type === "timeZoneName");
  return tz ? tz.value : "";
}
