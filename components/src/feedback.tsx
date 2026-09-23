import { forwardRef } from "react";
import type { HTMLAttributes } from "react";
import { classes, clamp, percent, type Tone } from "./util.js";

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  /** Any CSS length. Defaults to the current font size, so it sits on the text baseline. */
  size?: number | string;
  /** Announced to screen readers while it spins. Pass `null` for a purely decorative spinner. */
  label?: string | null;
}

/** A one-element loading spinner that inherits the current text colour. */
export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { size = "1em", label = "Loading", className, style, ...rest },
  ref,
) {
  const dimension = typeof size === "number" ? `${size}px` : size;
  return (
    <span
      {...rest}
      ref={ref}
      className={classes("lac-spinner", className)}
      style={{ width: dimension, height: dimension, ...style }}
      role={label ? "status" : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
    />
  );
});

export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  /** CSS width. Default `100%`. */
  width?: number | string;
  /** CSS height. Default `1em`. */
  height?: number | string;
  /** Round it fully — for avatar placeholders. */
  circle?: boolean;
  /** Render this many stacked bars, the last one shortened like a paragraph. */
  lines?: number;
}

/**
 * A shimmering placeholder. With `lines` it renders a paragraph shape, the
 * final line shortened, which reads as text far better than equal-width bars.
 */
export const Skeleton = forwardRef<HTMLSpanElement, SkeletonProps>(function Skeleton(
  { width = "100%", height = "1em", circle = false, lines, className, style, ...rest },
  ref,
) {
  const toCss = (v: number | string): string => (typeof v === "number" ? `${v}px` : v);

  if (lines && lines > 1) {
    return (
      <span
        {...rest}
        ref={ref}
        className={classes("", className)}
        style={{ display: "flex", flexDirection: "column", gap: "var(--lac-space-2)", ...style }}
        aria-hidden
      >
        {Array.from({ length: lines }, (_, i) => (
          <span
            key={i}
            className="lac lac-skeleton"
            style={{ width: i === lines - 1 ? "62%" : "100%", height: toCss(height) }}
          />
        ))}
      </span>
    );
  }

  return (
    <span
      {...rest}
      ref={ref}
      className={classes("lac-skeleton", className)}
      style={{
        width: toCss(width),
        height: toCss(height),
        borderRadius: circle ? "50%" : undefined,
        ...style,
      }}
      aria-hidden
    />
  );
});

export interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Current value. Omit for an indeterminate bar. */
  value?: number;
  /** Lower bound. Default 0. */
  min?: number;
  /** Upper bound. Default 100. */
  max?: number;
  /** Bar colour intent. */
  tone?: Exclude<Tone, "default" | "accent" | "info">| "accent";
  /** Bar thickness in pixels. */
  thickness?: number;
  /** Accessible name, e.g. "Upload progress". */
  label?: string;
}

/**
 * A linear progress bar. With no `value` it animates indefinitely, which is the
 * honest way to show work of unknown length.
 */
export const Progress = forwardRef<HTMLDivElement, ProgressProps>(function Progress(
  { value, min = 0, max = 100, tone = "accent", thickness, label, className, style, ...rest },
  ref,
) {
  const indeterminate = value === undefined;
  const pct = indeterminate ? 0 : percent(value, min, max);

  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-progress", className)}
      data-tone={tone}
      data-indeterminate={indeterminate || undefined}
      style={{ height: thickness ? `${thickness}px` : undefined, ...style }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={indeterminate ? undefined : min}
      aria-valuemax={indeterminate ? undefined : max}
      aria-valuenow={indeterminate ? undefined : clamp(value, min, max)}
    >
      <div className="lac-progress-bar" style={{ width: `${pct}%` }} />
    </div>
  );
});

export interface ProgressRingProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Current value, 0-100 by default. */
  value: number;
  min?: number;
  max?: number;
  /** Outer diameter in pixels. Default 44. */
  size?: number;
  /** Stroke width in pixels. Default 4. */
  thickness?: number;
  /** Show the rounded percentage in the middle. */
  showValue?: boolean;
  label?: string;
}

/** A circular progress ring — the compact form for dashboards and cards. */
export const ProgressRing = forwardRef<HTMLDivElement, ProgressRingProps>(function ProgressRing(
  { value, min = 0, max = 100, size = 44, thickness = 4, showValue = false, label, className, style, ...rest },
  ref,
) {
  const pct = percent(value, min, max);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      {...rest}
      ref={ref}
      className={classes("", className)}
      style={{ position: "relative", display: "inline-grid", placeItems: "center", ...style }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={clamp(value, min, max)}
    >
      <svg className="lac-ring" width={size} height={size} aria-hidden>
        <circle
          className="lac-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
        />
        <circle
          className="lac-ring-bar"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
        />
      </svg>
      {showValue && (
        <span
          style={{
            position: "absolute",
            fontSize: Math.max(10, size * 0.26),
            fontWeight: 620,
            color: "var(--lac-fg)",
          }}
        >
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
});
