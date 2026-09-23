import { forwardRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { classes, type Tone } from "./util.js";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Lift on hover and take a pointer cursor — for cards that are links. */
  interactive?: boolean;
}

/** A bordered surface. Compose it with the Card* parts below, or just fill it. */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { interactive = false, className, ...rest },
  ref,
) {
  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-card", className)}
      data-interactive={interactive || undefined}
    />
  );
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...rest }, ref) {
    return <div {...rest} ref={ref} className={classes("lac-card-header", className)} />;
  },
);

export const CardBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardBody({ className, ...rest }, ref) {
    return <div {...rest} ref={ref} className={classes("lac-card-body", className)} />;
  },
);

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...rest }, ref) {
    return <div {...rest} ref={ref} className={classes("lac-card-footer", className)} />;
  },
);

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...rest }, ref) {
    return <h3 {...rest} ref={ref} className={classes("lac-card-title", className)} />;
  },
);

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function CardDescription({ className, ...rest }, ref) {
    return <p {...rest} ref={ref} className={classes("lac-card-desc", className)} />;
  },
);

// `title` is widened to ReactNode here, so it must be omitted from the DOM
// attributes it would otherwise clash with (where it is the tooltip string).
export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Intent. Default `info`. */
  tone?: Exclude<Tone, "default" | "accent">;
  /** Bold first line. */
  title?: ReactNode;
  /** Leading icon or emoji. */
  icon?: ReactNode;
  /** Rendered at the end — a dismiss button, usually. */
  action?: ReactNode;
}

/**
 * A message block. Anything with the `danger` tone is given `role="alert"` so
 * assistive tech announces it immediately; quieter tones stay polite.
 */
export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { tone = "info", title, icon, action, className, children, ...rest },
  ref,
) {
  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-alert", className)}
      data-tone={tone}
      role={tone === "danger" ? "alert" : "status"}
    >
      {icon && <span aria-hidden>{icon}</span>}
      <div style={{ minWidth: 0, flex: 1 }}>
        {title && <p className="lac-alert-title">{title}</p>}
        {children && <div className="lac-alert-body">{children}</div>}
      </div>
      {action}
    </div>
  );
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  variant?: "soft" | "outline";
  /** Show a leading status dot. */
  dot?: boolean;
}

/** A small status pill for table cells, list rows and headers. */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { tone = "default", variant = "soft", dot = false, className, children, ...rest },
  ref,
) {
  return (
    <span
      {...rest}
      ref={ref}
      className={classes("lac-badge", className)}
      data-tone={tone}
      data-variant={variant}
    >
      {dot && <span className="lac-badge-dot" aria-hidden />}
      {children}
    </span>
  );
});
