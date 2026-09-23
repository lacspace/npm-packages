/**
 * Layout primitives: Stack, Grid, Container, Section, Spacer, Center,
 * AspectRatio, ScrollArea, Sticky and Panel.
 *
 * Everything here is server-render safe. Responsive behaviour is expressed as
 * CSS custom properties that the stylesheet reads inside media queries — there
 * is no `matchMedia`, no resize listener and no "mounted" flag, so the markup
 * the server sends is byte-for-byte the markup the client hydrates.
 */
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  HTMLAttributes,
  MutableRefObject,
  ReactNode,
  UIEvent,
} from "react";
import { classes, clamp, useControllable, useStableId } from "./util.js";
import { Heading, Text } from "./typography.js";

/* ==========================================================================
   Pure helpers — the whole point of keeping these out of the components is
   that they can be unit tested without a DOM (see layout.test.tsx).
   ========================================================================== */

/** Breakpoints the stylesheet knows about: 640 / 768 / 1024 / 1280px. */
export type Breakpoint = "sm" | "md" | "lg" | "xl";

/**
 * A value that may change at a breakpoint.
 *
 * Pass a bare value for "always this", or an object keyed by breakpoint where
 * `base` applies below `sm` and each breakpoint applies from its width *up*.
 * Unspecified breakpoints inherit the next smallest one, which is why you can
 * write `{ base: "column", md: "row" }` and never think about `lg`.
 */
export type Responsive<T> = T | ResponsiveMap<T>;

/** The object form of {@link Responsive}. */
export interface ResponsiveMap<T> {
  /** Below the `sm` breakpoint — i.e. the mobile-first default. */
  base?: T;
  sm?: T;
  md?: T;
  lg?: T;
  xl?: T;
}

/** A space-scale step (`1`-`6`), `0`, a pixel number, or any CSS length. */
export type SpaceValue = number | string;

/**
 * Normalise either form of a responsive prop into the object form.
 *
 * Kept separate from {@link responsiveVars} so the "is this a breakpoint map or
 * a plain value" decision has exactly one home and one set of tests.
 */
export function resolveResponsive<T>(value: Responsive<T> | undefined): ResponsiveMap<T> {
  if (value === undefined) return {};
  if (typeof value === "object" && value !== null) {
    const map = value as ResponsiveMap<T>;
    const out: ResponsiveMap<T> = {};
    if (map.base !== undefined) out.base = map.base;
    if (map.sm !== undefined) out.sm = map.sm;
    if (map.md !== undefined) out.md = map.md;
    if (map.lg !== undefined) out.lg = map.lg;
    if (map.xl !== undefined) out.xl = map.xl;
    return out;
  }
  return { base: value };
}

/**
 * Turn a responsive prop into the custom properties the stylesheet reads.
 *
 * `base` lands on `prefix`, each breakpoint on `prefix-sm` … `prefix-xl`. The
 * stylesheet declares the inheritance chain (`--x-md: var(--x-sm)`), so a
 * breakpoint you did not set simply keeps the previous one's value.
 */
export function responsiveVars<T>(
  prefix: string,
  value: Responsive<T> | undefined,
  toCss: (value: T) => string | undefined,
): Record<string, string> {
  const map = resolveResponsive(value);
  const out: Record<string, string> = {};
  const steps: Array<[string, T | undefined]> = [
    [prefix, map.base],
    [`${prefix}-sm`, map.sm],
    [`${prefix}-md`, map.md],
    [`${prefix}-lg`, map.lg],
    [`${prefix}-xl`, map.xl],
  ];
  for (const step of steps) {
    const raw = step[1];
    if (raw === undefined) continue;
    const css = toCss(raw);
    if (css !== undefined && css !== "") out[step[0]] = css;
  }
  return out;
}

/**
 * Resolve a length: a number is pixels, a string is passed straight through so
 * `"8rem"`, `"min(40ch, 100%)"` and `"var(--my-size)"` all work.
 */
export function lengthToken(value: SpaceValue | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    return value === 0 ? "0" : `${value}px`;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Resolve a gap/space value against the design system's space scale.
 *
 * `1`-`6` are the scale steps and become `var(--lac-space-N)` so an app that
 * redefines the scale restyles every gap in the library at once. `0` is zero.
 * Any other number is pixels, and any string is passed through untouched —
 * that escape hatch is what stops the scale from becoming a cage.
 */
export function spaceToken(value: SpaceValue | undefined): string | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6) {
    return `var(--lac-space-${value})`;
  }
  return lengthToken(value);
}

/**
 * Build a `grid-template-columns` value.
 *
 * A number gives that many equal tracks — `minmax(0, 1fr)` rather than `1fr`
 * so a long word or a wide table inside a cell cannot blow the grid out.
 * A string is passed through (`"2fr 1fr"`). With neither, `minColWidth` gives
 * a responsive `auto-fit` grid that needs no breakpoints at all; the inner
 * `min(…, 100%)` keeps it from overflowing a viewport narrower than one track.
 */
export function gridTemplate(
  columns?: number | string,
  minColWidth?: SpaceValue,
): string {
  if (typeof columns === "string") {
    const trimmed = columns.trim();
    if (trimmed !== "") return trimmed;
  }
  if (typeof columns === "number" && Number.isFinite(columns)) {
    const count = Math.max(1, Math.floor(columns));
    return `repeat(${count}, minmax(0, 1fr))`;
  }
  const min = lengthToken(minColWidth);
  if (min !== undefined) return `repeat(auto-fit, minmax(min(${min}, 100%), 1fr))`;
  return "repeat(1, minmax(0, 1fr))";
}

/** Build a `grid-column`/`grid-row` span value. `"full"` spans every track. */
export function spanValue(span: number | "full" | undefined): string | undefined {
  if (span === undefined) return undefined;
  if (span === "full") return "1 / -1";
  if (!Number.isFinite(span)) return undefined;
  return `span ${Math.max(1, Math.floor(span))}`;
}

/**
 * The padding-top percentage that reproduces an aspect ratio.
 *
 * Accepts `"16/9"`, `"16:9"`, `"1.5"` or a number (width ÷ height). The
 * padding-top box is used rather than the `aspect-ratio` property because it
 * behaves identically in every browser this library supports, and because it
 * cannot be defeated by an intrinsically-sized child.
 */
export function ratioToPercent(ratio: number | string | undefined, fallback = 56.25): number {
  let width: number | undefined;
  let height = 1;

  if (typeof ratio === "number") {
    width = ratio;
  } else if (typeof ratio === "string") {
    const parts = ratio.trim().split(/[/:]/);
    if (parts.length === 2) {
      const left = Number(parts[0]);
      const right = Number(parts[1]);
      if (Number.isFinite(left) && Number.isFinite(right) && right !== 0) {
        width = left;
        height = right;
      }
    } else if (parts.length === 1) {
      const only = Number(parts[0]);
      if (Number.isFinite(only)) width = only;
    }
  }

  if (width === undefined || !Number.isFinite(width) || width <= 0 || height <= 0) return fallback;
  const percentage = (height / width) * 100;
  if (!Number.isFinite(percentage) || percentage <= 0) return fallback;
  // Four decimals is enough for 21/9 and keeps the inline style tidy.
  return Math.round(clamp(percentage, 0.01, 10000) * 10000) / 10000;
}

/** What a scroll container's edges look like right now. */
export interface ScrollEdgeState {
  /** There is more content than viewport along the measured axis. */
  scrollable: boolean;
  /** Scrolled to the very start (top or left). */
  atStart: boolean;
  /** Scrolled to the very end (bottom or right). */
  atEnd: boolean;
}

/**
 * Decide which edge shadows a scroll container should show.
 *
 * Pure arithmetic on three numbers so it can be tested without a DOM — the
 * component only feeds it `scrollTop`, `clientHeight` and `scrollHeight`.
 * `tolerance` absorbs the sub-pixel rounding that fractional zoom and retina
 * layouts produce, which is what makes a naive `scrollTop === 0` check flicker.
 */
export function scrollEdges(
  offset: number,
  viewport: number,
  content: number,
  tolerance = 1,
): ScrollEdgeState {
  const max = content - viewport;
  if (!Number.isFinite(max) || max <= tolerance) {
    return { scrollable: false, atStart: true, atEnd: true };
  }
  const position = clamp(offset, 0, max);
  return {
    scrollable: true,
    atStart: position <= tolerance,
    atEnd: position >= max - tolerance,
  };
}

/** Merge generated custom properties with the caller's `style`, theirs last. */
function withVars(vars: Record<string, string>, style?: CSSProperties): CSSProperties | undefined {
  const hasVars = Object.keys(vars).length > 0;
  if (!hasVars) return style;
  return { ...vars, ...style } as CSSProperties;
}

type Align = "start" | "center" | "end" | "stretch" | "baseline";
type Justify = "start" | "center" | "end" | "between" | "around" | "evenly";

function alignValue(value: Align | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value === "start") return "flex-start";
  if (value === "end") return "flex-end";
  return value;
}

function justifyValue(value: Justify | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value === "start") return "flex-start";
  if (value === "end") return "flex-end";
  if (value === "between") return "space-between";
  if (value === "around") return "space-around";
  if (value === "evenly") return "space-evenly";
  return value;
}

/* ==========================================================================
   Stack
   ========================================================================== */

/** Flex directions a Stack understands. */
export type StackDirection = "row" | "column" | "row-reverse" | "column-reverse";

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Flow direction. Pass a breakpoint map to change it responsively —
   * `{ base: "column", md: "row" }` is the classic "stacked on phones" layout
   * and costs no JavaScript at all.
   */
  direction?: Responsive<StackDirection>;
  /** Gap between children, from the space scale. Also takes a breakpoint map. */
  gap?: Responsive<SpaceValue>;
  /** Cross-axis alignment. */
  align?: Align;
  /** Main-axis distribution. */
  justify?: Justify;
  /** Allow children to wrap onto more lines. */
  wrap?: boolean;
  /** Lay out inline (`inline-flex`) so the stack sits in a line of text. */
  inline?: boolean;
  /**
   * Divider drawn between children. A hairline by default when `true`; pass a
   * node to supply your own. Dividers are decorative and marked `aria-hidden`.
   */
  divider?: boolean | ReactNode;
}

/**
 * One-dimensional layout: put things in a row or a column with a consistent
 * gap. This is the component you will reach for most, which is why the gap
 * comes from the shared scale rather than from an ad-hoc margin.
 */
export const Stack = forwardRef<HTMLDivElement, StackProps>(function Stack(
  {
    direction = "column",
    gap = 0,
    align,
    justify,
    wrap = false,
    inline = false,
    divider,
    className,
    style,
    children,
    ...rest
  },
  ref,
) {
  const vars: Record<string, string> = {
    ...responsiveVars("--lac-stack-dir", direction, (value) => value),
    ...responsiveVars("--lac-stack-gap", gap, spaceToken),
  };
  const align_ = alignValue(align);
  const justify_ = justifyValue(justify);
  if (align_ !== undefined) vars["--lac-stack-align"] = align_;
  if (justify_ !== undefined) vars["--lac-stack-justify"] = justify_;

  const items = divider ? withDividers(children, divider) : children;

  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-stack", className)}
      data-wrap={wrap || undefined}
      data-inline={inline || undefined}
      style={withVars(vars, style)}
    >
      {items}
    </div>
  );
});

function withDividers(children: ReactNode, divider: boolean | ReactNode): ReactNode {
  const list = toChildArray(children);
  if (list.length < 2) return children;
  const out: ReactNode[] = [];
  for (let i = 0; i < list.length; i += 1) {
    if (i > 0) {
      out.push(
        divider === true ? (
          <span key={`lac-div-${i}`} className="lac lac-stack-divider" aria-hidden />
        ) : (
          <span key={`lac-div-${i}`} aria-hidden>
            {divider}
          </span>
        ),
      );
    }
    out.push(list[i]);
  }
  return out;
}

/** Flatten children into an array without pulling in react's `Children` API. */
function toChildArray(children: ReactNode): ReactNode[] {
  if (Array.isArray(children)) return children.filter((child) => child !== null && child !== undefined && child !== false);
  if (children === null || children === undefined || children === false) return [];
  return [children];
}

/** A Stack that flows horizontally. Everything else is identical. */
export const HStack = forwardRef<HTMLDivElement, StackProps>(function HStack(props, ref) {
  return <Stack align="center" gap={2} {...props} ref={ref} direction={props.direction ?? "row"} />;
});

/** A Stack that flows vertically. Everything else is identical. */
export const VStack = forwardRef<HTMLDivElement, StackProps>(function VStack(props, ref) {
  return <Stack gap={2} {...props} ref={ref} direction={props.direction ?? "column"} />;
});

/* ==========================================================================
   Grid
   ========================================================================== */

export interface GridProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Track count, or a template string like `"2fr 1fr"`. Takes a breakpoint map
   * — `{ base: 1, md: 2, lg: 4 }` is the usual card grid.
   */
  columns?: Responsive<number | string>;
  /**
   * Minimum track width for an `auto-fit` grid. Used when `columns` is not
   * given: the grid then reflows on its own container width with no
   * breakpoints, which is what you want for a card wall.
   */
  minColWidth?: SpaceValue;
  /** Gap between cells. Takes a breakpoint map. */
  gap?: Responsive<SpaceValue>;
  /** Row gap override. Falls back to `gap`. */
  rowGap?: Responsive<SpaceValue>;
  /** Column gap override. Falls back to `gap`. */
  columnGap?: Responsive<SpaceValue>;
  /** Block-axis alignment of items in their cells. */
  align?: "start" | "center" | "end" | "stretch";
  /** Inline-axis alignment of items in their cells. */
  justify?: "start" | "center" | "end" | "stretch";
  /** Make rows equal height by giving every row the same track size. */
  equalRows?: boolean;
}

/** Two-dimensional layout. Pair it with {@link GridItem} when cells span. */
export const Grid = forwardRef<HTMLDivElement, GridProps>(function Grid(
  {
    columns,
    minColWidth,
    gap = 4,
    rowGap,
    columnGap,
    align,
    justify,
    equalRows = false,
    className,
    style,
    ...rest
  },
  ref,
) {
  const resolvedColumns: Responsive<number | string> =
    columns === undefined ? (minColWidth === undefined ? 1 : "") : columns;

  const vars: Record<string, string> = {
    ...responsiveVars("--lac-grid-cols", resolvedColumns, (value) =>
      gridTemplate(value === "" ? undefined : value, minColWidth),
    ),
    ...responsiveVars("--lac-grid-gap", gap, spaceToken),
    ...responsiveVars("--lac-grid-row-gap", rowGap, spaceToken),
    ...responsiveVars("--lac-grid-col-gap", columnGap, spaceToken),
  };
  if (align !== undefined) vars["--lac-grid-align"] = align;
  if (justify !== undefined) vars["--lac-grid-justify"] = justify;

  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-grid", className)}
      data-equal-rows={equalRows || undefined}
      style={withVars(vars, style)}
    />
  );
});

export interface GridItemProps extends HTMLAttributes<HTMLDivElement> {
  /** Columns to span, or `"full"` for the whole row. Takes a breakpoint map. */
  span?: Responsive<number | "full">;
  /** Rows to span. */
  rowSpan?: number | "full";
  /** 1-based column to start at, for deliberate placement. */
  colStart?: number;
  /** Order within the grid — handy for reordering on small screens. */
  order?: number;
}

/** A cell that spans more than one track. Plain children need no wrapper. */
export const GridItem = forwardRef<HTMLDivElement, GridItemProps>(function GridItem(
  { span, rowSpan, colStart, order, className, style, ...rest },
  ref,
) {
  const vars: Record<string, string> = {
    ...responsiveVars("--lac-gi-span", span, spanValue),
  };
  const rows = spanValue(rowSpan);
  if (rows !== undefined) vars["--lac-gi-row-span"] = rows;
  if (colStart !== undefined && Number.isFinite(colStart)) {
    vars["--lac-gi-col-start"] = String(Math.max(1, Math.floor(colStart)));
  }
  if (order !== undefined && Number.isFinite(order)) vars["--lac-gi-order"] = String(order);

  return (
    <div {...rest} ref={ref} className={classes("lac-grid-item", className)} style={withVars(vars, style)} />
  );
});

/* ==========================================================================
   Container
   ========================================================================== */

/** Container widths. `prose` is a reading measure, `full` has no max width. */
export type ContainerSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "prose" | "full";

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  /** Max width. Default `lg` (1024px). */
  size?: ContainerSize;
  /**
   * Side gutter. Defaults to a responsive gutter that grows with the viewport,
   * so content never touches the edge of a phone and never looks cramped on a
   * desktop. Pass a value to pin it.
   */
  gutter?: SpaceValue;
  /** Centre horizontally. On by default — turn it off to align left. */
  center?: boolean;
}

/**
 * Width-limited, gutter-aware page column.
 *
 * The max width includes the gutters (the library is `border-box` throughout),
 * so nesting a Container inside another cannot double up the padding.
 */
export const Container = forwardRef<HTMLDivElement, ContainerProps>(function Container(
  { size = "lg", gutter, center = true, className, style, ...rest },
  ref,
) {
  const vars: Record<string, string> = {};
  const g = spaceToken(gutter);
  if (g !== undefined) vars["--lac-container-gutter"] = g;

  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-container", className)}
      data-size={size}
      data-center={center || undefined}
      style={withVars(vars, style)}
    />
  );
});

/* ==========================================================================
   Section
   ========================================================================== */

export interface SectionProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Section heading. Rendered and wired to `aria-labelledby` for you. */
  title?: ReactNode;
  /** One or two lines under the heading. */
  description?: ReactNode;
  /** Controls pinned to the end of the header row — a button, usually. */
  actions?: ReactNode;
  /** Semantic heading level. Default `2`. */
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Vertical padding. Default `md`. */
  space?: "none" | "sm" | "md" | "lg";
  /** Draw a divider above the section. */
  divided?: boolean;
}

/**
 * A titled band of a page with consistent vertical rhythm.
 *
 * Landmarks are only useful when they are labelled, so the heading is given a
 * stable id and referenced by `aria-labelledby`; a Section without a title
 * stays an unlabelled generic region rather than lying about one.
 */
export const Section = forwardRef<HTMLElement, SectionProps>(function Section(
  { title, description, actions, level = 2, space = "md", divided = false, className, children, ...rest },
  ref,
) {
  const id = useStableId(rest.id, "section");
  const headingId = `${id}-title`;

  return (
    <section
      {...rest}
      ref={ref}
      id={id}
      className={classes("lac-section", className)}
      data-space={space}
      data-divided={divided || undefined}
      aria-labelledby={title ? headingId : rest["aria-labelledby"]}
    >
      {(title || description || actions) && (
        <div className="lac lac-section-head">
          <div className="lac-section-headings">
            {title && (
              <Heading id={headingId} level={level} size={level === 1 ? 2 : 4} className="lac-section-title">
                {title}
              </Heading>
            )}
            {description && (
              <Text as="p" tone="muted" size="sm" className="lac-section-desc">
                {description}
              </Text>
            )}
          </div>
          {actions && <div className="lac lac-section-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
});

/* ==========================================================================
   Spacer, Center, AspectRatio, Sticky
   ========================================================================== */

export interface SpacerProps extends HTMLAttributes<HTMLDivElement> {
  /** Fixed size from the space scale. Omit to grow and eat the free space. */
  size?: SpaceValue;
  /** Also render a hairline rule, for separating groups inside a Stack. */
  line?: boolean;
}

/** Empty space. With no `size` it flexes, pushing its siblings apart. */
export const Spacer = forwardRef<HTMLDivElement, SpacerProps>(function Spacer(
  { size, line = false, className, style, ...rest },
  ref,
) {
  const vars: Record<string, string> = {};
  const resolved = spaceToken(size);
  if (resolved !== undefined) vars["--lac-spacer-size"] = resolved;

  return (
    <div
      {...rest}
      ref={ref}
      aria-hidden={line ? undefined : true}
      role={line ? "separator" : undefined}
      className={classes("lac-spacer", className)}
      data-fixed={resolved !== undefined || undefined}
      data-line={line || undefined}
      style={withVars(vars, style)}
    />
  );
});

export interface CenterProps extends HTMLAttributes<HTMLDivElement> {
  /** Minimum height — use `"100vh"` for a hero or an empty state. */
  minHeight?: SpaceValue;
  /** Centre inline, so the box sits in a line of text. */
  inline?: boolean;
  /** Centre horizontally only, leaving vertical alignment to the flow. */
  axis?: "both" | "horizontal" | "vertical";
}

/** Centres its children. The layout job everybody rewrites; here it is once. */
export const Center = forwardRef<HTMLDivElement, CenterProps>(function Center(
  { minHeight, inline = false, axis = "both", className, style, ...rest },
  ref,
) {
  const vars: Record<string, string> = {};
  const min = lengthToken(minHeight);
  if (min !== undefined) vars["--lac-center-min-h"] = min;

  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-center", className)}
      data-axis={axis}
      data-inline={inline || undefined}
      style={withVars(vars, style)}
    />
  );
});

export interface AspectRatioProps extends HTMLAttributes<HTMLDivElement> {
  /** `"16/9"`, `"16:9"`, `4 / 3` or a plain number. Default `"16/9"`. */
  ratio?: number | string;
  /** Round the corners and clip the content to them. */
  rounded?: boolean;
}

/**
 * A box that keeps its shape while its width changes.
 *
 * Content is absolutely positioned inside and clipped, so an image, an iframe
 * or a video that reports its own intrinsic size can never push the box out of
 * ratio or overflow its parent — the single most common bug in hand-rolled
 * ratio boxes.
 */
export const AspectRatio = forwardRef<HTMLDivElement, AspectRatioProps>(function AspectRatio(
  { ratio = "16/9", rounded = false, className, style, children, ...rest },
  ref,
) {
  const vars: Record<string, string> = { "--lac-ar": `${ratioToPercent(ratio)}%` };

  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-ar", className)}
      data-rounded={rounded || undefined}
      style={withVars(vars, style)}
    >
      <div className="lac lac-ar-inner">{children}</div>
    </div>
  );
});

export interface StickyProps extends HTMLAttributes<HTMLDivElement> {
  /** Distance from the top of the scrollport. Default `0`. */
  top?: SpaceValue;
  /** Stick to the bottom instead. Wins over `top` when both are given. */
  bottom?: SpaceValue;
  /** Stacking order, for a header that must sit over the content. */
  zIndex?: number;
  /** Paint a surface background, so scrolled content does not show through. */
  surface?: boolean;
}

/**
 * `position: sticky` with the two things people forget: a real offset token
 * and a background. Sticky only works while every ancestor between here and
 * the scrollport avoids `overflow: hidden` — keep that in mind when it does
 * nothing at all.
 */
export const Sticky = forwardRef<HTMLDivElement, StickyProps>(function Sticky(
  { top, bottom, zIndex, surface = false, className, style, ...rest },
  ref,
) {
  const vars: Record<string, string> = {};
  const offset = lengthToken(bottom !== undefined ? bottom : top) ?? "0";
  vars["--lac-sticky-offset"] = offset;
  if (zIndex !== undefined && Number.isFinite(zIndex)) vars["--lac-sticky-z"] = String(zIndex);

  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-sticky", className)}
      data-side={bottom !== undefined ? "bottom" : "top"}
      data-surface={surface || undefined}
      style={withVars(vars, style)}
    />
  );
});

/* ==========================================================================
   ScrollArea
   ========================================================================== */

export interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  /** Axis that scrolls. Default `vertical`. */
  axis?: "vertical" | "horizontal" | "both";
  /** Max height before it starts to scroll. */
  maxHeight?: SpaceValue;
  /** Max width, for a horizontally scrolling strip. */
  maxWidth?: SpaceValue;
  /** Show inset shadows at whichever edge has more content. Default `true`. */
  shadows?: boolean;
  /** Keep the scrollbar slim and themed rather than the OS default. */
  thin?: boolean;
}

/**
 * A scroll container that tells you there is more to see.
 *
 * The edge shadows are inset box-shadows toggled by `data-*` attributes, so
 * they do not scroll with the content and they cost no extra DOM. The initial
 * render assumes "not scrollable" — that is the state the server can know — and
 * the first effect after mount measures the real thing, so hydration matches.
 *
 * A scroll region is focusable (`tabIndex=0`) so keyboard users can reach the
 * content; it is announced as a `region`, which is what the ARIA pattern for a
 * scrollable area asks for.
 */
export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  { axis = "vertical", maxHeight, maxWidth, shadows = true, thin = true, className, style, onScroll, ...rest },
  ref,
) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const [edge, setEdge] = useState<ScrollEdgeState>({ scrollable: false, atStart: true, atEnd: true });

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      nodeRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [ref],
  );

  const measure = useCallback(() => {
    const node = nodeRef.current;
    if (!node) return;
    const next =
      axis === "horizontal"
        ? scrollEdges(node.scrollLeft, node.clientWidth, node.scrollWidth)
        : scrollEdges(node.scrollTop, node.clientHeight, node.scrollHeight);
    setEdge((prev) =>
      prev.scrollable === next.scrollable && prev.atStart === next.atStart && prev.atEnd === next.atEnd
        ? prev
        : next,
    );
  }, [axis]);

  useEffect(() => {
    measure();
    const node = nodeRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(node);
    for (const child of Array.from(node.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [measure]);

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      measure();
      onScroll?.(event);
    },
    [measure, onScroll],
  );

  const vars: Record<string, string> = {};
  const h = lengthToken(maxHeight);
  const w = lengthToken(maxWidth);
  if (h !== undefined) vars["--lac-scroll-max-h"] = h;
  if (w !== undefined) vars["--lac-scroll-max-w"] = w;

  return (
    <div
      role="region"
      tabIndex={0}
      {...rest}
      ref={setRefs}
      onScroll={handleScroll}
      className={classes("lac-scroll", className)}
      data-axis={axis}
      data-thin={thin || undefined}
      data-shadows={shadows || undefined}
      data-scrollable={edge.scrollable || undefined}
      data-at-start={edge.atStart || undefined}
      data-at-end={edge.atEnd || undefined}
      style={withVars(vars, style)}
    />
  );
});

/* ==========================================================================
   Panel
   ========================================================================== */

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title" | "onChange"> {
  /** Panel heading. */
  title?: ReactNode;
  /** Supporting line under the heading. */
  description?: ReactNode;
  /** Controls at the end of the header row. Not part of the collapse trigger. */
  actions?: ReactNode;
  /** Content pinned below the body. */
  footer?: ReactNode;
  /** Let the header toggle the body open and shut. */
  collapsible?: boolean;
  /** Open state when uncontrolled. Default `true`. */
  defaultOpen?: boolean;
  /** Open state when controlled. Pass it with `onOpenChange`. */
  open?: boolean;
  /** Fires on every toggle, controlled or not. */
  onOpenChange?: (open: boolean) => void;
  /** Visual weight. `plain` drops the border, for nesting inside a Card. */
  variant?: "outlined" | "plain" | "subtle";
  /** Remove the body padding — for a table or a list that draws its own. */
  flush?: boolean;
}

/**
 * A titled region of content, optionally collapsible.
 *
 * When collapsible the whole header row is a real `<button>` carrying
 * `aria-expanded` and `aria-controls`, so it is reachable by Tab and operable
 * with Enter and Space for free. When it is not collapsible no button is
 * rendered at all, rather than a disabled one that still takes a tab stop.
 * The body stays mounted and is hidden with `hidden`, which keeps form state
 * and scroll position across a collapse.
 */
export const Panel = forwardRef<HTMLDivElement, PanelProps>(function Panel(
  {
    title,
    description,
    actions,
    footer,
    collapsible = false,
    defaultOpen = true,
    open,
    onOpenChange,
    variant = "outlined",
    flush = false,
    className,
    children,
    ...rest
  },
  ref,
) {
  const id = useStableId(rest.id, "panel");
  const bodyId = `${id}-body`;
  const titleId = `${id}-title`;
  const [isOpen, setOpen] = useControllable<boolean>(open, defaultOpen, onOpenChange);
  const expanded = collapsible ? isOpen : true;

  const headings = (
    <span className="lac lac-panel-headings">
      {title && (
        <span className="lac lac-panel-title" id={titleId}>
          {title}
        </span>
      )}
      {description && <span className="lac lac-panel-desc">{description}</span>}
    </span>
  );

  return (
    <div
      {...rest}
      ref={ref}
      id={id}
      className={classes("lac-panel", className)}
      data-variant={variant}
      data-open={expanded || undefined}
      data-collapsible={collapsible || undefined}
    >
      {(title || description || actions) && (
        <div className="lac lac-panel-head">
          {collapsible ? (
            <button
              type="button"
              className="lac lac-panel-trigger"
              aria-expanded={expanded}
              aria-controls={bodyId}
              onClick={() => setOpen(!isOpen)}
            >
              <span className="lac-panel-chevron" aria-hidden />
              {headings}
            </button>
          ) : (
            headings
          )}
          {actions && <span className="lac lac-panel-actions">{actions}</span>}
        </div>
      )}
      <div
        id={bodyId}
        className="lac lac-panel-body"
        data-flush={flush || undefined}
        hidden={!expanded}
        aria-labelledby={title ? titleId : undefined}
      >
        {children}
      </div>
      {footer && expanded && <div className="lac lac-panel-footer">{footer}</div>}
    </div>
  );
});
