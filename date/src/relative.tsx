import { forwardRef, useEffect, useState } from "react";
import type { TimeHTMLAttributes } from "react";
import {
  formatDate,
  formatRelative,
  isValidDate,
  relativeParts,
  relativeRefreshMs,
  utcStamp,
} from "./engine.js";
import { classes } from "./util.js";

export interface RelativeTimeProps extends Omit<TimeHTMLAttributes<HTMLTimeElement>, "dateTime"> {
  /** The instant to describe. A number or string is passed to `new Date`. */
  value: Date | string | number;
  /** BCP-47 tag. Uses `Intl.RelativeTimeFormat`, falling back to English. */
  locale?: string;
  /** Pin "now" — the label then renders identically on the server and never ticks. */
  now?: Date;
  /** Override the refresh cadence, in milliseconds. */
  updateInterval?: number;
  /**
   * Past this many days, show a plain date instead of "7 weeks ago" — which
   * nobody can turn back into a date in their head.
   */
  cutoffDays?: number;
  /** The pattern used once `cutoffDays` is passed. */
  absoluteFormat?: string;
}

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * "3 minutes ago", kept up to date.
 *
 * Hydration-safe by construction. "Now" is something only the browser knows,
 * so the server (and the very first client render, which must match it byte
 * for byte) emits the absolute UTC timestamp; the relative label appears on
 * mount. The `datetime` attribute always carries the full ISO instant, so
 * crawlers and assistive tech get the real time whatever the text says.
 *
 * The timer paces itself: a stamp measured in seconds refreshes every second,
 * one measured in days refreshes hourly. A page with a hundred of these is not
 * a hundred renders a second.
 *
 * ```tsx
 * <RelativeTime value={post.createdAt} cutoffDays={30} />
 * ```
 */
export const RelativeTime = forwardRef<HTMLTimeElement, RelativeTimeProps>(function RelativeTime(
  {
    value,
    locale,
    now: nowProp,
    updateInterval,
    cutoffDays,
    absoluteFormat = "d MMM yyyy",
    className,
    ...rest
  },
  ref,
) {
  const date = toDate(value);
  const valid = isValidDate(date);
  const timestamp = valid ? date.getTime() : 0;
  const [now, setNow] = useState<Date | null>(nowProp ?? null);

  useEffect(() => {
    if (nowProp) {
      setNow(nowProp);
      return;
    }
    if (!valid) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = (): void => {
      const current = new Date();
      setNow(current);
      const delay = updateInterval ?? relativeRefreshMs(relativeParts(new Date(timestamp), current));
      timer = setTimeout(tick, Math.max(250, delay));
    };
    tick();
    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [timestamp, valid, updateInterval, nowProp]);

  if (!valid) return null;

  const parts = now ? relativeParts(date, now) : null;
  const beyondCutoff =
    parts !== null &&
    cutoffDays !== undefined &&
    Math.abs(date.getTime() - (now as Date).getTime()) > cutoffDays * 86_400_000;

  const label = !now
    ? utcStamp(date)
    : beyondCutoff
      ? formatDate(date, absoluteFormat, locale)
      : formatRelative(date, now, locale);

  return (
    <time
      {...rest}
      ref={ref}
      className={classes("lac-relative", className)}
      dateTime={date.toISOString()}
      title={rest.title ?? utcStamp(date)}
    >
      {label}
    </time>
  );
});
