/**
 * Navigation family — Tabs, Accordion, Breadcrumbs, Pagination, Stepper,
 * DropdownMenu, NavList and Toolbar.
 *
 * Everything that can be decided without a DOM lives in the pure helpers at the
 * top of this file: page windowing, breadcrumb collapsing, roving-tabindex
 * arithmetic, menu typeahead and stepper state. The components are thin layers
 * over those, which is why this family is testable without a DOM environment
 * and safe to render on a server.
 */
import { createContext, forwardRef, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  FocusEvent as ReactFocusEvent,
  HTMLAttributes,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  Ref,
} from "react";
import { classes, useControllable, useStableId, type Size } from "./util.js";
import { Select } from "./input.js";

/* ==========================================================================
   Pure logic — no React, no DOM. Exported so you can reuse (and test) it.
   ========================================================================== */

/** The gap marker used by `paginationRange` and `collapseBreadcrumbs`. */
export const ELLIPSIS = "…" as const;

/** A slot in a rendered pagination control: a page number, or a gap. */
export type PaginationSlot = number | typeof ELLIPSIS;

function integer(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}

/** Inclusive integer range. Returns `[]` when the range is inverted. */
function range(start: number, end: number): number[] {
  if (end < start) return [];
  const out: number[] = [];
  for (let i = start; i <= end; i += 1) out.push(i);
  return out;
}

/**
 * The page numbers a pager should show, with `…` where pages are hidden.
 *
 * `siblings` is how many pages sit either side of the current one, `boundaries`
 * how many are pinned at each end. The width of the result is stable while you
 * page through the middle, which is the whole point — a pager whose buttons
 * move under the cursor is a pager people misclick.
 *
 * @example paginationRange(5, 10) // [1, "…", 4, 5, 6, "…", 10]
 */
export function paginationRange(
  page: number,
  totalPages: number,
  siblings = 1,
  boundaries = 1,
): PaginationSlot[] {
  const total = Math.max(0, integer(totalPages, 0));
  if (total === 0) return [];

  const sibs = Math.max(0, integer(siblings, 1));
  const bounds = Math.max(0, integer(boundaries, 1));
  const current = Math.min(Math.max(integer(page, 1), 1), total);

  // boundaries + ellipsis on each side, plus the current page and its siblings.
  const slots = bounds * 2 + sibs * 2 + 3;
  if (slots >= total) return range(1, total);

  const startPages = range(1, Math.min(bounds, total));
  const endPages = range(Math.max(total - bounds + 1, bounds + 1), total);
  const lastGroupStart = endPages.length > 0 ? (endPages[0] as number) : total + 1;

  const windowStart = Math.max(
    Math.min(current - sibs, total - bounds - sibs * 2 - 1),
    bounds + 2,
  );
  const windowEnd = Math.min(
    Math.max(current + sibs, bounds + sibs * 2 + 2),
    endPages.length > 0 ? lastGroupStart - 2 : total - 1,
  );

  const head: PaginationSlot[] =
    windowStart > bounds + 2 ? [ELLIPSIS] : bounds + 1 < total - bounds ? [bounds + 1] : [];
  const tail: PaginationSlot[] =
    windowEnd < total - bounds - 1 ? [ELLIPSIS] : total - bounds > bounds ? [total - bounds] : [];

  return [...startPages, ...head, ...range(windowStart, windowEnd), ...tail, ...endPages];
}

/** One rendered breadcrumb position: a real item, or the collapsed middle. */
export type BreadcrumbSlot<T> =
  | { readonly kind: "item"; readonly item: T; readonly index: number }
  | { readonly kind: "ellipsis"; readonly hidden: readonly T[]; readonly from: number; readonly to: number };

/**
 * Collapse the middle of a trail that is too long to fit.
 *
 * The hidden items come back on the ellipsis slot rather than being thrown
 * away, so the UI can reveal them instead of dead-ending the user.
 *
 * @param maxItems Longest trail shown whole. `0` (the default) never collapses.
 */
export function collapseBreadcrumbs<T>(
  items: readonly T[],
  maxItems = 0,
  itemsBefore = 1,
  itemsAfter = 1,
): Array<BreadcrumbSlot<T>> {
  const all = items.map((item, index): BreadcrumbSlot<T> => ({ kind: "item", item, index }));
  const max = Math.max(0, integer(maxItems, 0));
  if (max === 0 || items.length <= max) return all;

  const before = Math.max(0, integer(itemsBefore, 1));
  const after = Math.max(0, integer(itemsAfter, 1));
  // Nothing would be hidden (or everything would) — show the trail whole.
  if (before + after >= items.length) return all;

  const hidden = items.slice(before, items.length - after);
  if (hidden.length === 0) return all;

  return [
    ...all.slice(0, before),
    { kind: "ellipsis", hidden, from: before, to: items.length - after - 1 },
    ...all.slice(items.length - after),
  ];
}

/** Index of the first item that is not disabled, or `-1` when there is none. */
export function firstEnabledIndex(disabled: readonly boolean[]): number {
  for (let i = 0; i < disabled.length; i += 1) if (!disabled[i]) return i;
  return -1;
}

/** Index of the last item that is not disabled, or `-1` when there is none. */
export function lastEnabledIndex(disabled: readonly boolean[]): number {
  for (let i = disabled.length - 1; i >= 0; i -= 1) if (!disabled[i]) return i;
  return -1;
}

/**
 * Where a roving tabindex should move to.
 *
 * Walks `step` (±1) from `from`, skipping disabled entries and wrapping when
 * `loop` is on. Returns `from` when there is nowhere else to go, so a caller
 * can always focus the result; `-1` only when every entry is disabled.
 */
export function rovingIndex(
  from: number,
  step: number,
  disabled: readonly boolean[],
  loop = true,
): number {
  const n = disabled.length;
  if (n === 0) return -1;
  const dir = step < 0 ? -1 : 1;

  let i = from;
  for (let moved = 0; moved < n; moved += 1) {
    let next = i + dir;
    if (next < 0 || next >= n) {
      if (!loop) break;
      next = next < 0 ? n - 1 : 0;
    }
    i = next;
    if (!disabled[i]) return i;
  }
  return from >= 0 && from < n && !disabled[from] ? from : -1;
}

/**
 * Grow (or restart) a typeahead buffer.
 *
 * Keys typed inside `timeoutMs` of each other extend the search string; a pause
 * starts a new one. Anything that is not a single character leaves the buffer
 * alone, so Shift or ArrowDown never poisons the search.
 */
export function typeaheadBuffer(previous: string, key: string, elapsedMs: number, timeoutMs = 500): string {
  if (key.length !== 1) return previous;
  if (!Number.isFinite(elapsedMs) || elapsedMs > timeoutMs) return key;
  return previous + key;
}

/**
 * The item a typed query should jump to.
 *
 * Search starts *after* `from` and wraps, so typing the same letter repeatedly
 * cycles through the items beginning with it — the behaviour every native menu
 * has and every hand-rolled one forgets.
 *
 * @returns index of the match, or `-1`.
 */
export function typeaheadMatch(
  labels: readonly string[],
  query: string,
  from = -1,
  disabled?: readonly boolean[],
): number {
  const needle = query.trim().toLowerCase();
  if (needle === "") return -1;
  const n = labels.length;

  const scan = (q: string, start: number): number => {
    for (let offset = 1; offset <= n; offset += 1) {
      const i = (((start + offset) % n) + n) % n;
      if (disabled?.[i]) continue;
      const label = labels[i];
      if (label !== undefined && label.trim().toLowerCase().startsWith(q)) return i;
    }
    return -1;
  };

  const hit = scan(needle, from);
  if (hit !== -1) return hit;

  // "aaa" means "the next item starting with a", not an item literally named aaa.
  const repeated = needle.split("").every((c) => c === needle[0]);
  if (repeated && needle.length > 1) return scan(needle.slice(0, 1), from);
  return -1;
}

/** How a single step in a `Stepper` is drawn. */
export type StepState = "done" | "current" | "upcoming" | "error";

/** Options for `deriveStepStates`. */
export interface StepStateOptions {
  /** Indexes that failed. An error outranks every other state. */
  errors?: readonly number[];
  /** The whole flow finished — every non-failed step reads as done. */
  complete?: boolean;
}

/**
 * Turn "there are N steps and we are on step i" into per-step states.
 *
 * Kept separate from the component so a progress summary elsewhere on the page
 * ("2 of 5 done") can derive exactly the same answer.
 */
export function deriveStepStates(count: number, current: number, options: StepStateOptions = {}): StepState[] {
  const n = Math.max(0, integer(count, 0));
  const active = integer(current, 0);
  const errors = new Set(options.errors ?? []);
  const out: StepState[] = [];
  for (let i = 0; i < n; i += 1) {
    if (errors.has(i)) out.push("error");
    else if (options.complete === true || i < active) out.push("done");
    else if (i === active) out.push("current");
    else out.push("upcoming");
  }
  return out;
}

/**
 * The next set of open accordion values after clicking one.
 *
 * @param multiple Several panels may stay open at once.
 * @param collapsible Clicking the open panel closes it. Turn it off when the
 *   accordion must always show something.
 */
export function toggleAccordionValue(
  open: readonly string[],
  value: string,
  multiple: boolean,
  collapsible = true,
): string[] {
  const isOpen = open.includes(value);
  if (isOpen) {
    if (!collapsible) return [...open];
    return open.filter((v) => v !== value);
  }
  return multiple ? [...open, value] : [value];
}

/* ==========================================================================
   DOM helpers — only ever called from event handlers and effects.
   ========================================================================== */

function queryAll(root: HTMLElement, selector: string): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(selector));
}

function disabledFlags(elements: readonly HTMLElement[]): boolean[] {
  return elements.map(
    (el) =>
      el.hasAttribute("disabled") ||
      el.getAttribute("aria-disabled") === "true" ||
      el.getAttribute("data-disabled") === "true",
  );
}

function indexOfTarget(elements: readonly HTMLElement[], target: EventTarget | null): number {
  if (target === null) return -1;
  for (let i = 0; i < elements.length; i += 1) {
    const el = elements[i];
    if (el !== undefined && (el === target || el.contains(target as Node))) return i;
  }
  return -1;
}

/** Ids have to survive a round trip through an attribute selector. */
function idPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

const EMPTY_STRINGS: string[] = [];

/* ==========================================================================
   Tabs
   ========================================================================== */

/** Tab strip looks: underline, pill group, or joined folder tabs. */
export type TabsVariant = "line" | "pill" | "enclosed";

interface TabsContextValue {
  value: string;
  select: (next: string) => void;
  focusValue: string | null;
  setFocusValue: (next: string | null) => void;
  activation: "automatic" | "manual";
  orientation: "horizontal" | "vertical";
  variant: TabsVariant;
  size: Size;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(part: string): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (ctx === null) throw new Error(`<${part}> must be rendered inside <Tabs>`);
  return ctx;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** Selected tab value (controlled). */
  value?: string;
  /** Starting tab when uncontrolled. */
  defaultValue?: string;
  /** Fires on every selection, controlled or not. */
  onChange?: (value: string) => void;
  /**
   * `automatic` selects a tab as soon as it is focused with the arrow keys —
   * right for cheap panels. Use `manual` when a panel costs a fetch, so people
   * can arrow past it without triggering work.
   */
  activation?: "automatic" | "manual";
  /** Vertical strips put the arrow keys on Up/Down instead of Left/Right. */
  orientation?: "horizontal" | "vertical";
  variant?: TabsVariant;
  size?: Size;
}

/**
 * A tab set: `Tabs` holds the state, `TabList` the strip, `Tab` a trigger and
 * `TabPanel` the content. Panels may live anywhere below `Tabs`, so a tab strip
 * in a card header can drive a panel further down the page.
 */
export const Tabs = forwardRef<HTMLDivElement, TabsProps>(function Tabs(
  {
    value,
    defaultValue = "",
    onChange,
    activation = "automatic",
    orientation = "horizontal",
    variant = "line",
    size = "md",
    id,
    className,
    children,
    ...rest
  },
  ref,
) {
  const [current, setCurrent] = useControllable(value, defaultValue, onChange);
  const [focusValue, setFocusValue] = useState<string | null>(null);
  const baseId = useStableId(id, "tabs");

  const ctx = useMemo<TabsContextValue>(
    () => ({
      value: current,
      select: setCurrent,
      focusValue,
      setFocusValue,
      activation,
      orientation,
      variant,
      size,
      baseId,
    }),
    [current, setCurrent, focusValue, activation, orientation, variant, size, baseId],
  );

  return (
    <TabsContext.Provider value={ctx}>
      <div
        {...rest}
        ref={ref}
        id={baseId}
        className={classes("lac-nav-tabs", className)}
        data-orientation={orientation}
        data-variant={variant}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
});

export interface TabListProps extends HTMLAttributes<HTMLDivElement> {
  /** Names the strip for screen readers — "Invoice sections", not "Tabs". */
  label?: string;
  /** Arrow keys wrap from the last tab to the first. Default `true`. */
  loop?: boolean;
}

/** The strip itself: `role="tablist"` plus the arrow-key handling. */
export const TabList = forwardRef<HTMLDivElement, TabListProps>(function TabList(
  { label, loop = true, className, onKeyDown, onBlur, children, ...rest },
  ref,
) {
  const { orientation, activation, select, setFocusValue, variant, size } = useTabsContext("TabList");

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
    const prevKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
    const tabs = queryAll(event.currentTarget, '[role="tab"]');
    if (tabs.length === 0) return;

    const flags = disabledFlags(tabs);
    const from = indexOfTarget(tabs, event.target);
    let next = -1;
    if (event.key === nextKey) next = rovingIndex(from, 1, flags, loop);
    else if (event.key === prevKey) next = rovingIndex(from, -1, flags, loop);
    else if (event.key === "Home") next = firstEnabledIndex(flags);
    else if (event.key === "End") next = lastEnabledIndex(flags);
    else return;

    const el = tabs[next];
    if (el === undefined) return;
    event.preventDefault();
    el.focus();
    const tabValue = el.getAttribute("data-value");
    if (tabValue === null) return;
    setFocusValue(tabValue);
    if (activation === "automatic") select(tabValue);
  };

  const handleBlur = (event: ReactFocusEvent<HTMLDivElement>): void => {
    onBlur?.(event);
    // Focus left the strip entirely — hand the tab stop back to the selected tab.
    if (!event.currentTarget.contains(event.relatedTarget)) setFocusValue(null);
  };

  return (
    <div
      {...rest}
      ref={ref}
      role="tablist"
      aria-label={label}
      aria-orientation={orientation === "vertical" ? "vertical" : "horizontal"}
      className={classes("lac-nav-tablist", className)}
      data-variant={variant}
      data-size={size}
      data-orientation={orientation}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      {children}
    </div>
  );
});

export interface TabProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Ties this trigger to its `TabPanel`. */
  value: string;
  /** Leading icon. Decorative — the label carries the meaning. */
  icon?: ReactNode;
  /** Trailing count or status pill. */
  badge?: ReactNode;
}

/** One tab trigger. Exactly one tab in a strip is in the tab order at a time. */
export const Tab = forwardRef<HTMLButtonElement, TabProps>(function Tab(
  { value, icon, badge, className, disabled, onClick, children, ...rest },
  ref,
) {
  const ctx = useTabsContext("Tab");
  const selected = ctx.value === value;
  const stop = ctx.focusValue ?? ctx.value;

  return (
    <button
      {...rest}
      ref={ref}
      type="button"
      role="tab"
      id={`${ctx.baseId}-tab-${idPart(value)}`}
      aria-controls={`${ctx.baseId}-panel-${idPart(value)}`}
      aria-selected={selected}
      data-value={value}
      data-state={selected ? "active" : "inactive"}
      data-variant={ctx.variant}
      disabled={disabled}
      tabIndex={stop === value ? 0 : -1}
      className={classes("lac-nav-tab", className)}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        ctx.setFocusValue(value);
        ctx.select(value);
      }}
    >
      {icon !== undefined && (
        <span className="lac-nav-tab-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {children}
      {badge !== undefined && <span className="lac-nav-tab-badge">{badge}</span>}
    </button>
  );
});

export interface TabPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** The `Tab` value this panel belongs to. */
  value: string;
  /**
   * Keep the panel mounted while hidden. Costs nothing on small panels and
   * saves re-mounting a form (and losing what was typed in it) on big ones.
   */
  keepMounted?: boolean;
}

/** The content for one tab. */
export const TabPanel = forwardRef<HTMLDivElement, TabPanelProps>(function TabPanel(
  { value, keepMounted = false, className, children, ...rest },
  ref,
) {
  const ctx = useTabsContext("TabPanel");
  const selected = ctx.value === value;
  if (!selected && !keepMounted) return null;

  return (
    <div
      {...rest}
      ref={ref}
      role="tabpanel"
      id={`${ctx.baseId}-panel-${idPart(value)}`}
      aria-labelledby={`${ctx.baseId}-tab-${idPart(value)}`}
      hidden={!selected}
      tabIndex={selected ? 0 : undefined}
      className={classes("lac-nav-tabpanel", className)}
      data-state={selected ? "active" : "inactive"}
    >
      {children}
    </div>
  );
});

/* ==========================================================================
   Accordion
   ========================================================================== */

/** Accordion looks: hairlines between items, or separated cards. */
export type AccordionVariant = "divided" | "contained";

interface AccordionContextValue {
  open: string[];
  toggle: (value: string) => void;
  headingLevel: 2 | 3 | 4 | 5 | 6;
  baseId: string;
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

const HEADING_TAGS = { 2: "h2", 3: "h3", 4: "h4", 5: "h5", 6: "h6" } as const;

export interface AccordionProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
  /** Open item values (controlled). */
  value?: string[];
  /** Items open on first render when uncontrolled. */
  defaultValue?: string[];
  onChange?: (value: string[]) => void;
  /** Allow several panels open at once. Default `false`. */
  multiple?: boolean;
  /** Clicking the open item closes it. Turn off to always keep one open. */
  collapsible?: boolean;
  variant?: AccordionVariant;
  /**
   * Heading level wrapped around each trigger. Pick the one that follows the
   * heading above the accordion — a screen-reader outline with an `h3` under an
   * `h1` reads as a skipped level.
   */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
}

/**
 * A stack of disclosure panels.
 *
 * Panels animate open with a `grid-template-rows: 0fr → 1fr` transition, so the
 * height is the browser's business — no measuring, no `ResizeObserver`, and
 * content that grows while open does not need re-measuring.
 */
export const Accordion = forwardRef<HTMLDivElement, AccordionProps>(function Accordion(
  {
    value,
    defaultValue = EMPTY_STRINGS,
    onChange,
    multiple = false,
    collapsible = true,
    variant = "divided",
    headingLevel = 3,
    id,
    className,
    onKeyDown,
    children,
    ...rest
  },
  ref,
) {
  const [open, setOpen] = useControllable<string[]>(value, defaultValue, onChange);
  const baseId = useStableId(id, "acc");

  const toggle = useCallback(
    (item: string) => {
      setOpen(toggleAccordionValue(open, item, multiple, collapsible));
    },
    [open, setOpen, multiple, collapsible],
  );

  const ctx = useMemo<AccordionContextValue>(
    () => ({ open, toggle, headingLevel, baseId }),
    [open, toggle, headingLevel, baseId],
  );

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const triggers = queryAll(event.currentTarget, "[data-lac-acc-trigger]");
    if (triggers.length === 0) return;
    const flags = disabledFlags(triggers);
    const from = indexOfTarget(triggers, event.target);
    if (from === -1) return;

    let next = -1;
    if (event.key === "ArrowDown") next = rovingIndex(from, 1, flags);
    else if (event.key === "ArrowUp") next = rovingIndex(from, -1, flags);
    else if (event.key === "Home") next = firstEnabledIndex(flags);
    else if (event.key === "End") next = lastEnabledIndex(flags);
    else return;

    const el = triggers[next];
    if (el === undefined) return;
    event.preventDefault();
    el.focus();
  };

  return (
    <AccordionContext.Provider value={ctx}>
      <div
        {...rest}
        ref={ref}
        id={baseId}
        className={classes("lac-nav-acc", className)}
        data-variant={variant}
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    </AccordionContext.Provider>
  );
});

export interface AccordionItemProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Identity of this panel inside its accordion. */
  value: string;
  /** The trigger's visible content. */
  title: ReactNode;
  /** Secondary line under the title. */
  description?: ReactNode;
  /** Leading icon in the trigger. */
  icon?: ReactNode;
  /** Content pinned to the right of the trigger, before the chevron. */
  meta?: ReactNode;
  disabled?: boolean;
}

/** One header + panel pair. */
export const AccordionItem = forwardRef<HTMLDivElement, AccordionItemProps>(function AccordionItem(
  { value, title, description, icon, meta, disabled = false, className, children, ...rest },
  ref,
) {
  const ctx = useContext(AccordionContext);
  if (ctx === null) throw new Error("<AccordionItem> must be rendered inside <Accordion>");

  const open = ctx.open.includes(value);
  const triggerId = `${ctx.baseId}-trigger-${idPart(value)}`;
  const panelId = `${ctx.baseId}-panel-${idPart(value)}`;
  const Heading = HEADING_TAGS[ctx.headingLevel];

  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-nav-acc-item", className)}
      data-open={open || undefined}
      data-disabled={disabled || undefined}
    >
      <Heading className="lac-nav-acc-heading">
        <button
          type="button"
          id={triggerId}
          aria-expanded={open}
          aria-controls={panelId}
          disabled={disabled}
          data-lac-acc-trigger=""
          data-value={value}
          className="lac lac-nav-acc-trigger"
          onClick={() => ctx.toggle(value)}
        >
          {icon !== undefined && (
            <span className="lac-nav-acc-icon" aria-hidden="true">
              {icon}
            </span>
          )}
          <span className="lac-nav-acc-text">
            <span className="lac-nav-acc-title">{title}</span>
            {description !== undefined && <span className="lac-nav-acc-desc">{description}</span>}
          </span>
          {meta !== undefined && <span className="lac-nav-acc-meta">{meta}</span>}
          <span className="lac-nav-acc-chevron" aria-hidden="true" />
        </button>
      </Heading>
      <div
        id={panelId}
        role="region"
        aria-labelledby={triggerId}
        className="lac-nav-acc-panel"
        data-open={open || undefined}
      >
        <div className="lac-nav-acc-panel-inner">
          <div className="lac-nav-acc-body">{children}</div>
        </div>
      </div>
    </div>
  );
});

/* ==========================================================================
   Breadcrumbs
   ========================================================================== */

export interface BreadcrumbItem {
  /** What the crumb reads as. */
  label: ReactNode;
  /** Where it goes. Omit on the current page — the last crumb is never a link. */
  href?: string;
  icon?: ReactNode;
  /** Used when the crumb drives a router instead of a plain navigation. */
  onClick?: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
  /** Plain-text form, for `title` on a truncated crumb. */
  text?: string;
}

export interface BreadcrumbsProps extends Omit<HTMLAttributes<HTMLElement>, "onChange"> {
  items: BreadcrumbItem[];
  /** Longest trail shown whole. Beyond it the middle collapses. `0` disables. */
  maxItems?: number;
  /** Crumbs kept at the start when collapsed. */
  itemsBeforeCollapse?: number;
  /** Crumbs kept at the end when collapsed. */
  itemsAfterCollapse?: number;
  /** What sits between crumbs. A slash by default. */
  separator?: ReactNode;
  /** Show the whole trail (controlled). */
  expanded?: boolean;
  defaultExpanded?: boolean;
  onChange?: (expanded: boolean) => void;
  /** Name for the landmark. Default "Breadcrumb". */
  label?: string;
  /** Accessible name of the reveal button. */
  expandLabel?: string;
  size?: Size;
}

/**
 * The trail back up the hierarchy.
 *
 * When there are more crumbs than `maxItems` the middle collapses behind a `…`
 * button that expands in place — the hidden crumbs stay reachable, which is the
 * difference between a collapsed trail and a broken one.
 */
export const Breadcrumbs = forwardRef<HTMLElement, BreadcrumbsProps>(function Breadcrumbs(
  {
    items = [],
    maxItems = 0,
    itemsBeforeCollapse = 1,
    itemsAfterCollapse = 1,
    separator = "/",
    expanded,
    defaultExpanded = false,
    onChange,
    label = "Breadcrumb",
    expandLabel = "Show hidden breadcrumbs",
    size = "md",
    className,
    ...rest
  },
  ref,
) {
  const [open, setOpen] = useControllable(expanded, defaultExpanded, onChange);
  const slots = open
    ? collapseBreadcrumbs(items, 0)
    : collapseBreadcrumbs(items, maxItems, itemsBeforeCollapse, itemsAfterCollapse);
  const last = items.length - 1;

  return (
    <nav
      {...rest}
      ref={ref}
      aria-label={label}
      className={classes("lac-nav-crumbs", className)}
      data-size={size}
    >
      <ol className="lac-nav-crumbs-list">
        {slots.map((slot, position) => {
          const key = slot.kind === "item" ? `i${slot.index}` : `gap${slot.from}`;
          return (
            <li className="lac-nav-crumbs-item" key={key}>
              {position > 0 && (
                <span className="lac-nav-crumbs-sep" aria-hidden="true">
                  {separator}
                </span>
              )}
              {slot.kind === "ellipsis" ? (
                <button
                  type="button"
                  className="lac lac-nav-crumbs-more"
                  aria-label={expandLabel}
                  aria-expanded={false}
                  onClick={() => setOpen(true)}
                >
                  {ELLIPSIS}
                </button>
              ) : slot.index === last || slot.item.href === undefined ? (
                <span
                  className="lac-nav-crumbs-current"
                  aria-current={slot.index === last ? "page" : undefined}
                  title={slot.item.text}
                >
                  {slot.item.icon !== undefined && (
                    <span className="lac-nav-crumbs-icon" aria-hidden="true">
                      {slot.item.icon}
                    </span>
                  )}
                  {slot.item.label}
                </span>
              ) : (
                <a
                  className="lac lac-nav-crumbs-link"
                  href={slot.item.href}
                  onClick={slot.item.onClick}
                  title={slot.item.text}
                >
                  {slot.item.icon !== undefined && (
                    <span className="lac-nav-crumbs-icon" aria-hidden="true">
                      {slot.item.icon}
                    </span>
                  )}
                  {slot.item.label}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
});

/* ==========================================================================
   Pagination
   ========================================================================== */

/** Overridable strings, so the control can speak the app's language. */
export interface PaginationLabels {
  root?: string;
  previous?: string;
  next?: string;
  first?: string;
  last?: string;
  /** Called for each page button's accessible name. */
  page?: (page: number) => string;
  pageSize?: string;
}

const DEFAULT_PAGINATION_LABELS: Required<PaginationLabels> = {
  root: "Pagination",
  previous: "Previous page",
  next: "Next page",
  first: "First page",
  last: "Last page",
  page: (page: number) => `Page ${page}`,
  pageSize: "Rows per page",
};

export interface PaginationProps extends Omit<HTMLAttributes<HTMLElement>, "onChange"> {
  /** How many pages exist. Pages are 1-based. */
  totalPages: number;
  /** Current page (controlled). */
  page?: number;
  defaultPage?: number;
  onChange?: (page: number) => void;
  /** Pages either side of the current one. Default `1`. */
  siblings?: number;
  /** Pages pinned at each end. Default `1`. */
  boundaries?: number;
  /** Show the prev/next arrows. Default `true`. */
  showPrevNext?: boolean;
  /** Show jump-to-first/last arrows. Default `false`. */
  showFirstLast?: boolean;
  /** Render a rows-per-page select. Needs `pageSizeOptions`. */
  pageSize?: number;
  defaultPageSize?: number;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  labels?: PaginationLabels;
  size?: Size;
  disabled?: boolean;
}

/**
 * A pager.
 *
 * The visible window comes from `paginationRange`, so the control keeps the
 * same width whichever page you are on and the buttons do not shuffle under
 * the pointer as you click through.
 */
export const Pagination = forwardRef<HTMLElement, PaginationProps>(function Pagination(
  {
    totalPages,
    page,
    defaultPage = 1,
    onChange,
    siblings = 1,
    boundaries = 1,
    showPrevNext = true,
    showFirstLast = false,
    pageSize,
    defaultPageSize,
    onPageSizeChange,
    pageSizeOptions,
    labels,
    size = "md",
    disabled = false,
    className,
    ...rest
  },
  ref,
) {
  const [current, setPage] = useControllable(page, defaultPage, onChange);
  const [rows, setRows] = useControllable(pageSize, defaultPageSize ?? (pageSizeOptions?.[0] ?? 10), onPageSizeChange);
  const text = { ...DEFAULT_PAGINATION_LABELS, ...labels };
  const total = Math.max(0, Math.trunc(totalPages));
  const slots = paginationRange(current, total, siblings, boundaries);
  const atStart = current <= 1;
  const atEnd = current >= total;

  const go = (next: number): void => {
    if (disabled) return;
    const clamped = Math.min(Math.max(next, 1), Math.max(total, 1));
    if (clamped !== current) setPage(clamped);
  };

  const arrow = (key: string, label: string, target: number, off: boolean, glyph: string): JSX.Element => (
    <li className="lac-nav-page-item" key={key}>
      <button
        type="button"
        className="lac lac-nav-page-btn"
        data-kind="arrow"
        aria-label={label}
        disabled={disabled || off}
        onClick={() => go(target)}
      >
        <span aria-hidden="true">{glyph}</span>
      </button>
    </li>
  );

  return (
    <nav
      {...rest}
      ref={ref}
      aria-label={text.root}
      className={classes("lac-nav-pagination", className)}
      data-size={size}
      data-disabled={disabled || undefined}
    >
      <ul className="lac-nav-page-list">
        {showFirstLast && arrow("first", text.first, 1, atStart, "«")}
        {showPrevNext && arrow("prev", text.previous, current - 1, atStart, "‹")}
        {slots.map((slot, i) =>
          slot === ELLIPSIS ? (
            <li className="lac-nav-page-item" key={`gap-${i}`} aria-hidden="true">
              <span className="lac-nav-page-gap">{ELLIPSIS}</span>
            </li>
          ) : (
            <li className="lac-nav-page-item" key={slot}>
              <button
                type="button"
                className="lac lac-nav-page-btn"
                aria-label={text.page(slot)}
                aria-current={slot === current ? "page" : undefined}
                data-state={slot === current ? "active" : undefined}
                disabled={disabled}
                onClick={() => go(slot)}
              >
                {slot}
              </button>
            </li>
          ),
        )}
        {showPrevNext && arrow("next", text.next, current + 1, atEnd, "›")}
        {showFirstLast && arrow("last", text.last, total, atEnd, "»")}
      </ul>

      {pageSizeOptions !== undefined && pageSizeOptions.length > 0 && (
        <label className="lac-nav-page-size">
          <span className="lac-nav-page-size-label">{text.pageSize}</span>
          <Select
            size={size}
            value={String(rows)}
            disabled={disabled}
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              if (Number.isFinite(next)) setRows(next);
            }}
            options={pageSizeOptions.map((n) => ({ value: String(n), label: String(n) }))}
          />
        </label>
      )}
    </nav>
  );
});

/* ==========================================================================
   Stepper
   ========================================================================== */

export interface StepItem {
  label: ReactNode;
  description?: ReactNode;
  /** Replaces the step number. */
  icon?: ReactNode;
  /** Mark the step failed — it draws as an error whatever its position. */
  error?: boolean;
  /** Not reachable by clicking, even when the stepper is clickable. */
  disabled?: boolean;
}

export interface StepperProps extends Omit<HTMLAttributes<HTMLElement>, "onChange"> {
  steps: StepItem[];
  /** Index of the step in progress (controlled). 0-based. */
  active?: number;
  defaultActive?: number;
  onChange?: (active: number) => void;
  orientation?: "horizontal" | "vertical";
  /** Let people jump back to an earlier step by clicking it. */
  clickable?: boolean;
  /** The flow finished — every step without an error reads as done. */
  complete?: boolean;
  size?: Size;
  /** Names the list for screen readers. */
  label?: string;
}

/**
 * Progress through a multi-step flow.
 *
 * States come from `deriveStepStates`, so the same "which steps are done"
 * answer can be reused for a summary line or a save button's disabled state.
 */
export const Stepper = forwardRef<HTMLElement, StepperProps>(function Stepper(
  {
    steps = [],
    active,
    defaultActive = 0,
    onChange,
    orientation = "horizontal",
    clickable = false,
    complete = false,
    size = "md",
    label,
    className,
    ...rest
  },
  ref,
) {
  const [current, setCurrent] = useControllable(active, defaultActive, onChange);
  const errors = steps.flatMap((step, i) => (step.error === true ? [i] : []));
  const states = deriveStepStates(steps.length, current, { errors, complete });

  return (
    <ol
      {...rest}
      ref={ref as Ref<HTMLOListElement>}
      aria-label={label}
      className={classes("lac-nav-stepper", className)}
      data-orientation={orientation}
      data-size={size}
    >
      {steps.map((step, i) => {
        const state = states[i] ?? "upcoming";
        const isCurrent = state === "current";
        const interactive = clickable && step.disabled !== true;
        const marker =
          step.icon !== undefined ? (
            step.icon
          ) : state === "done" ? (
            <span aria-hidden="true">{"✓"}</span>
          ) : state === "error" ? (
            <span aria-hidden="true">{"!"}</span>
          ) : (
            i + 1
          );

        const body = (
          <>
            <span className="lac-nav-step-marker" data-state={state}>
              {marker}
            </span>
            <span className="lac-nav-step-text">
              <span className="lac-nav-step-label">{step.label}</span>
              {step.description !== undefined && (
                <span className="lac-nav-step-desc">{step.description}</span>
              )}
            </span>
          </>
        );

        return (
          <li
            className="lac-nav-step"
            key={i}
            data-state={state}
            aria-current={isCurrent ? "step" : undefined}
          >
            {interactive ? (
              <button
                type="button"
                className="lac lac-nav-step-btn"
                onClick={() => setCurrent(i)}
                disabled={step.disabled}
              >
                {body}
              </button>
            ) : (
              <span className="lac-nav-step-btn" data-static="true">
                {body}
              </span>
            )}
            <span className="lac-nav-step-line" aria-hidden="true" />
          </li>
        );
      })}
    </ol>
  );
});

/* ==========================================================================
   DropdownMenu
   ========================================================================== */

/** An action in a `DropdownMenu`. */
export interface DropdownMenuAction {
  kind?: "item";
  /** React key and `id`. Falls back to the position. */
  id?: string;
  label: ReactNode;
  /** Plain text for typeahead, when `label` is not a string. */
  text?: string;
  icon?: ReactNode;
  /** Right-aligned hint, e.g. `⌘K`. Decorative — bind the key yourself. */
  shortcut?: string;
  /** Destructive tone. */
  danger?: boolean;
  disabled?: boolean;
  /** Renders the item as a link instead of a button. */
  href?: string;
  onSelect?: () => void;
}

/** A rule between groups of actions. */
export interface DropdownMenuSeparator {
  kind: "separator";
  id?: string;
}

/** A non-interactive group heading. */
export interface DropdownMenuLabel {
  kind: "label";
  id?: string;
  label: ReactNode;
}

export type DropdownMenuItem = DropdownMenuAction | DropdownMenuSeparator | DropdownMenuLabel;

export interface DropdownMenuProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  items: DropdownMenuItem[];
  /** Trigger content. Ignored when `renderTrigger` is given. */
  trigger?: ReactNode;
  /** Accessible name when the trigger is icon-only. */
  triggerLabel?: string;
  /** Open state (controlled). */
  open?: boolean;
  defaultOpen?: boolean;
  onChange?: (open: boolean) => void;
  /** Which edge the menu lines up with. Default `start`. */
  align?: "start" | "end";
  /** Menu above the trigger instead of below. */
  placement?: "bottom" | "top";
  size?: Size;
  disabled?: boolean;
  /** Names the menu itself for screen readers. Defaults to `triggerLabel`. */
  menuLabel?: string;
}

function actionText(item: DropdownMenuAction): string {
  if (item.text !== undefined) return item.text;
  return typeof item.label === "string" ? item.label : "";
}

/**
 * A button that opens a menu of actions.
 *
 * Full menu keyboard support: Up/Down move, Home/End jump, Escape closes and
 * returns focus to the trigger, Tab closes and moves on, and typing letters
 * jumps to a matching item (repeating one letter cycles through the items that
 * start with it).
 */
export const DropdownMenu = forwardRef<HTMLDivElement, DropdownMenuProps>(function DropdownMenu(
  {
    items,
    trigger,
    triggerLabel,
    open,
    defaultOpen = false,
    onChange,
    align = "start",
    placement = "bottom",
    size = "md",
    disabled = false,
    menuLabel,
    id,
    className,
    ...rest
  },
  ref,
) {
  const [isOpen, setOpen] = useControllable(open, defaultOpen, onChange);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const wantsLast = useRef(false);
  const search = useRef({ text: "", at: 0 });
  const baseId = useStableId(id, "menu");
  const menuId = `${baseId}-menu`;

  const close = useCallback(
    (refocus: boolean) => {
      setOpen(false);
      if (refocus) triggerRef.current?.focus();
    },
    [setOpen],
  );

  // Put focus on the first (or last) item as the menu appears.
  useEffect(() => {
    if (!isOpen) {
      wantsLast.current = false;
      return;
    }
    const menu = menuRef.current;
    if (menu === null) return;
    const entries = queryAll(menu, '[role="menuitem"]');
    const flags = disabledFlags(entries);
    const index = wantsLast.current ? lastEnabledIndex(flags) : firstEnabledIndex(flags);
    entries[index]?.focus();
    wantsLast.current = false;
    search.current = { text: "", at: 0 };
  }, [isOpen]);

  // Click anywhere else and the menu goes away, like every native menu.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerDown = (event: MouseEvent): void => {
      const root = rootRef.current;
      if (root !== null && event.target instanceof Node && root.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [isOpen, setOpen]);

  const setRefs = (node: HTMLDivElement | null): void => {
    rootRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref !== null && ref !== undefined) (ref as { current: HTMLDivElement | null }).current = node;
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      wantsLast.current = event.key === "ArrowUp";
      setOpen(true);
    }
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const menu = event.currentTarget;
    const entries = queryAll(menu, '[role="menuitem"]');
    const flags = disabledFlags(entries);
    const from = indexOfTarget(entries, event.target);

    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }

    let next = -1;
    if (event.key === "ArrowDown") next = rovingIndex(from, 1, flags);
    else if (event.key === "ArrowUp") next = rovingIndex(from, -1, flags);
    else if (event.key === "Home") next = firstEnabledIndex(flags);
    else if (event.key === "End") next = lastEnabledIndex(flags);
    else if (
      event.key.length === 1 &&
      event.key !== " " &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      const now = Date.now();
      const buffer = typeaheadBuffer(search.current.text, event.key, now - search.current.at);
      search.current = { text: buffer, at: now };
      const labels = entries.map((el) => el.getAttribute("data-text") ?? el.textContent ?? "");
      next = typeaheadMatch(labels, buffer, from, flags);
    } else return;

    const el = entries[next];
    if (el === undefined) return;
    event.preventDefault();
    el.focus();
  };

  return (
    <div
      {...rest}
      ref={setRefs}
      id={baseId}
      className={classes("lac-nav-menu", className)}
      data-open={isOpen || undefined}
      data-placement={placement}
      data-align={align}
    >
      <button
        ref={triggerRef}
        type="button"
        className="lac lac-nav-menu-trigger"
        data-size={size}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={triggerLabel}
        disabled={disabled}
        onClick={() => setOpen(!isOpen)}
        onKeyDown={onTriggerKeyDown}
      >
        {trigger}
        <span className="lac-nav-menu-caret" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={menuLabel ?? triggerLabel}
          className="lac lac-nav-menu-list"
          data-size={size}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item, i) => {
            if (item.kind === "separator") {
              return <div className="lac-nav-menu-sep" role="separator" key={item.id ?? `sep-${i}`} />;
            }
            if (item.kind === "label") {
              return (
                <div className="lac-nav-menu-label" role="presentation" key={item.id ?? `label-${i}`}>
                  {item.label}
                </div>
              );
            }

            const key = item.id ?? `item-${i}`;
            const content = (
              <>
                {item.icon !== undefined && (
                  <span className="lac-nav-menu-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                )}
                <span className="lac-nav-menu-text">{item.label}</span>
                {item.shortcut !== undefined && (
                  <span className="lac-nav-menu-shortcut" aria-hidden="true">
                    {item.shortcut}
                  </span>
                )}
              </>
            );
            const shared = {
              role: "menuitem" as const,
              tabIndex: -1,
              className: "lac-nav-menu-item",
              "data-text": actionText(item),
              "data-danger": item.danger === true ? ("true" as const) : undefined,
              "data-disabled": item.disabled === true ? ("true" as const) : undefined,
            };

            if (item.href !== undefined && item.disabled !== true) {
              return (
                <a
                  {...shared}
                  key={key}
                  href={item.href}
                  onClick={() => {
                    item.onSelect?.();
                    close(false);
                  }}
                >
                  {content}
                </a>
              );
            }

            return (
              <button
                {...shared}
                key={key}
                type="button"
                disabled={item.disabled}
                aria-disabled={item.disabled === true ? true : undefined}
                onClick={() => {
                  if (item.disabled === true) return;
                  item.onSelect?.();
                  close(true);
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

/* ==========================================================================
   NavList
   ========================================================================== */

export interface NavListProps extends HTMLAttributes<HTMLElement> {
  /** Names the landmark — "Settings", "Docs". Two navs on a page need names. */
  label?: string;
  size?: Size;
}

/** A sidebar navigation list. Compose it from `NavSection` and `NavItem`. */
export const NavList = forwardRef<HTMLElement, NavListProps>(function NavList(
  { label, size = "md", className, children, ...rest },
  ref,
) {
  return (
    <nav {...rest} ref={ref} aria-label={label} className={classes("lac-nav-list", className)} data-size={size}>
      <ul className="lac-nav-list-group">{children}</ul>
    </nav>
  );
});

export interface NavSectionProps extends Omit<HTMLAttributes<HTMLLIElement>, "title"> {
  /** The section heading. */
  title?: ReactNode;
}

/** A titled group of `NavItem`s. */
export const NavSection = forwardRef<HTMLLIElement, NavSectionProps>(function NavSection(
  { title, className, children, id, ...rest },
  ref,
) {
  const headingId = useStableId(id, "navsec");
  return (
    <li {...rest} ref={ref} className={classes("lac-nav-list-section", className)}>
      {title !== undefined && (
        <span className="lac-nav-list-title" id={headingId}>
          {title}
        </span>
      )}
      <ul className="lac-nav-list-group" aria-labelledby={title !== undefined ? headingId : undefined}>
        {children}
      </ul>
    </li>
  );
});

export interface NavItemProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "type"> {
  icon?: ReactNode;
  /** Count or status pinned to the right. */
  badge?: ReactNode;
  /** The page you are on. Sets `aria-current="page"`. */
  active?: boolean;
  disabled?: boolean;
}

/**
 * One row in a `NavList`. Renders an `<a>` when it has an `href` and a
 * `<button>` when it does not, so it is always a real interactive element —
 * a link with no destination is not keyboard reachable.
 */
export const NavItem = forwardRef<HTMLElement, NavItemProps>(function NavItem(
  { icon, badge, active = false, disabled = false, href, className, children, ...rest },
  ref,
) {
  const inner = (
    <>
      {icon !== undefined && (
        <span className="lac-nav-list-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="lac-nav-list-label">{children}</span>
      {badge !== undefined && <span className="lac-nav-list-badge">{badge}</span>}
    </>
  );

  const shared = {
    className: classes("lac-nav-list-item", className),
    "data-active": active || undefined,
    "data-disabled": disabled || undefined,
    "aria-current": active ? ("page" as const) : undefined,
  };

  return (
    <li className="lac-nav-list-row">
      {href !== undefined && !disabled ? (
        <a {...rest} {...shared} ref={ref as Ref<HTMLAnchorElement>} href={href}>
          {inner}
        </a>
      ) : (
        <button
          {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
          {...shared}
          ref={ref as Ref<HTMLButtonElement>}
          type="button"
          disabled={disabled}
        >
          {inner}
        </button>
      )}
    </li>
  );
});

/* ==========================================================================
   Toolbar
   ========================================================================== */

const TOOLBAR_ITEMS =
  'button:not([data-lac-skip]), a[href], input, select, textarea, [role="button"], [role="checkbox"], [role="radio"]';

export interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  /** Names the toolbar. Required — "Toolbar" alone tells a user nothing. */
  label: string;
  orientation?: "horizontal" | "vertical";
  /** Arrow keys wrap around the ends. Default `true`. */
  loop?: boolean;
}

/**
 * A row of controls that behaves as one tab stop.
 *
 * Tab moves past the whole toolbar; the arrow keys move inside it. That is the
 * ARIA toolbar pattern, and it is what keeps a 12-button formatting bar from
 * costing a keyboard user 12 presses to skip.
 */
export const Toolbar = forwardRef<HTMLDivElement, ToolbarProps>(function Toolbar(
  { label, orientation = "horizontal", loop = true, className, onKeyDown, children, ...rest },
  ref,
) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLElement | null>(null);

  const setRefs = (node: HTMLDivElement | null): void => {
    rootRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref !== null && ref !== undefined) (ref as { current: HTMLDivElement | null }).current = node;
  };

  // Exactly one item stays tabbable. Re-run on every render so items added or
  // removed later (a toolbar whose buttons depend on a selection) stay correct.
  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const entries = queryAll(root, TOOLBAR_ITEMS);
    const flags = disabledFlags(entries);
    const active = activeRef.current;
    const stop =
      active !== null && entries.includes(active) && !flags[entries.indexOf(active)]
        ? entries.indexOf(active)
        : firstEnabledIndex(flags);
    entries.forEach((el, i) => {
      el.tabIndex = i === stop ? 0 : -1;
    });
  });

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
    const prevKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
    const entries = queryAll(event.currentTarget, TOOLBAR_ITEMS);
    if (entries.length === 0) return;
    const flags = disabledFlags(entries);
    const from = indexOfTarget(entries, event.target);

    let next = -1;
    if (event.key === nextKey) next = rovingIndex(from, 1, flags, loop);
    else if (event.key === prevKey) next = rovingIndex(from, -1, flags, loop);
    else if (event.key === "Home") next = firstEnabledIndex(flags);
    else if (event.key === "End") next = lastEnabledIndex(flags);
    else return;

    const el = entries[next];
    if (el === undefined) return;
    event.preventDefault();
    entries.forEach((item, i) => {
      item.tabIndex = i === next ? 0 : -1;
    });
    activeRef.current = el;
    el.focus();
  };

  return (
    <div
      {...rest}
      ref={setRefs}
      role="toolbar"
      aria-label={label}
      aria-orientation={orientation}
      className={classes("lac-nav-toolbar", className)}
      data-orientation={orientation}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
});

export interface ToolbarGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** Names the group, e.g. "Text alignment". */
  label?: string;
}

/** Related controls inside a `Toolbar`, spaced apart from their neighbours. */
export const ToolbarGroup = forwardRef<HTMLDivElement, ToolbarGroupProps>(function ToolbarGroup(
  { label, className, ...rest },
  ref,
) {
  return <div {...rest} ref={ref} role="group" aria-label={label} className={classes("lac-nav-toolbar-group", className)} />;
});

export interface ToolbarSeparatorProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
}

/** A rule between toolbar groups. */
export const ToolbarSeparator = forwardRef<HTMLDivElement, ToolbarSeparatorProps>(
  function ToolbarSeparator({ orientation = "vertical", className, ...rest }, ref) {
    return (
      <div
        {...rest}
        ref={ref}
        role="separator"
        aria-orientation={orientation}
        className={classes("lac-nav-toolbar-sep", className)}
        data-orientation={orientation}
      />
    );
  },
);
