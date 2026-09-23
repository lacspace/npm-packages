import { forwardRef } from "react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { classes, type Size } from "./util.js";
import { Spinner } from "./feedback.js";

/** Visual weight of a button, from loudest to quietest. */
export type ButtonVariant = "solid" | "outline" | "soft" | "ghost" | "link";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight. Default `solid`. */
  variant?: ButtonVariant;
  /** Control size. Default `md`. */
  size?: Size;
  /** Semantic intent — `danger` for destructive actions. */
  tone?: "default" | "danger" | "success";
  /** Stretch to the width of the parent. */
  full?: boolean;
  /** Show a spinner and block clicks. The label stays, so width doesn't jump. */
  loading?: boolean;
  /** Content before the label. */
  startIcon?: ReactNode;
  /** Content after the label. */
  endIcon?: ReactNode;
}

/**
 * The button.
 *
 * `loading` keeps the label in place and swaps the leading icon for a spinner,
 * so the button never changes width mid-click — the layout shift you see on
 * most "Saving..." buttons is a real usability cost on slow connections.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "solid",
    size = "md",
    tone = "default",
    full = false,
    loading = false,
    startIcon,
    endIcon,
    disabled,
    className,
    children,
    type = "button",
    ...rest
  },
  ref,
) {
  const iconOnly = children === undefined || children === null || children === "";
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={classes("lac-btn", className)}
      data-variant={variant}
      data-size={size}
      data-tone={tone}
      data-full={full || undefined}
      data-icon-only={iconOnly || undefined}
      data-loading={loading || undefined}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <Spinner aria-hidden /> : startIcon}
      {children}
      {!loading && endIcon}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, "startIcon" | "endIcon" | "full"> {
  /** What the button does, for screen readers. Required — an icon alone says nothing. */
  label: string;
  /** The icon itself. */
  icon: ReactNode;
}

/**
 * A square button holding a single icon. `label` is mandatory because an icon
 * button with no accessible name is invisible to a screen reader.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, ...rest },
  ref,
) {
  return (
    <Button {...rest} ref={ref} aria-label={label} title={rest.title ?? label}>
      {icon}
    </Button>
  );
});

export interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

/** Joins buttons into one segmented control, squaring the inner corners. */
export const ButtonGroup = forwardRef<HTMLDivElement, ButtonGroupProps>(function ButtonGroup(
  { className, children, ...rest },
  ref,
) {
  return (
    <div {...rest} ref={ref} role="group" className={classes("lac-btn-group", className)}>
      {children}
    </div>
  );
});
