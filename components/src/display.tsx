import { Children, forwardRef, useCallback, useEffect, useRef, useState } from "react";
import type {
  ChangeEvent,
  ClipboardEvent as ReactClipboardEvent,
  HTMLAttributes,
  InputHTMLAttributes,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  ReactNode,
} from "react";
import { classes, clamp, useControllable, useStableId, type Size, type Tone } from "./util.js";
import { Skeleton } from "./feedback.js";

/* ==========================================================================
   Pure logic
   --------------------------------------------------------------------------
   Everything a data-display component *decides* lives here as a plain
   function: no React, no DOM, no closure over props. That is what makes this
   family testable in a package with no DOM environment, and it means an app
   can reuse the same rules (initials on a server-rendered email, a delta in a
   PDF export) without mounting a component.
   ========================================================================== */

/** How many colour buckets the avatar palette ships with. */
export const AVATAR_COLOR_COUNT = 8;

/**
 * The initials to show when there is no avatar image.
 *
 * One word gives you two letters (`Madonna` → `MA`), several words give the
 * first and the last (`Ada Byron Lovelace` → `AL`) — the middle name is noise
 * in a 32px circle. Splitting is done over code points, not UTF-16 units, so
 * an accented or emoji first character survives intact instead of rendering
 * half a surrogate pair.
 */
export function initials(name: string, max = 2): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const cap = Number.isFinite(max) && max >= 1 ? Math.floor(max) : 2;

  if (words.length === 1) {
    const only = words[0] ?? "";
    return Array.from(only).slice(0, cap).join("").toUpperCase();
  }

  const first = Array.from(words[0] ?? "")[0] ?? "";
  const last = Array.from(words[words.length - 1] ?? "")[0] ?? "";
  return (cap === 1 ? first : `${first}${last}`).toUpperCase();
}

/**
 * A stable colour bucket for a string.
 *
 * FNV-1a over the code units, so the same name always lands on the same colour
 * — on the server, on the client, and on the next deploy. `Math.random()` here
 * would make every hydration a mismatch.
 */
export function colorIndexFor(seed: string, buckets: number = AVATAR_COLOR_COUNT): number {
  if (!Number.isFinite(buckets) || buckets < 1) return 0;
  const count = Math.floor(buckets);
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % count;
}

/** What `splitAvatarOverflow` hands back. */
export interface AvatarOverflow<T> {
  /** The items that get a face. */
  visible: T[];
  /** The ones folded into the counter. */
  hidden: T[];
  /** `hidden.length`, i.e. the number in the `+N` chip. 0 means no chip. */
  overflow: number;
}

/**
 * Split a list of group members into the faces you draw and the number you
 * count. `max` is the number of *avatars*, not the number of slots, so a group
 * of 6 with `max = 3` shows three faces and a `+3` chip.
 */
export function splitAvatarOverflow<T>(items: readonly T[], max: number): AvatarOverflow<T> {
  const list = items.slice();
  if (!Number.isFinite(max) || max < 1) {
    return { visible: [], hidden: list, overflow: list.length };
  }
  const limit = Math.floor(max);
  if (list.length <= limit) return { visible: list, hidden: [], overflow: 0 };
  return { visible: list.slice(0, limit), hidden: list.slice(limit), overflow: list.length - limit };
}

/** Which way a KPI moved. `flat` covers 0 and anything non-finite. */
export type DeltaDirection = "up" | "down" | "flat";

export interface DeltaInfo {
  direction: DeltaDirection;
  /** Display string, already signed — `+12.5%`, `-3%`, `0%`. */
  text: string;
  /** The sanitised number behind the text. */
  value: number;
}

export interface FormatDeltaOptions {
  /** `percent` appends `%`. `absolute` leaves the number bare. Default `percent`. */
  unit?: "percent" | "absolute";
  /** Maximum decimal places. Trailing zeros are trimmed, so `3.00` prints as `3`. */
  precision?: number;
  /** Prefix `+` on a rise. Turn it off inside a sentence. Default `true`. */
  signed?: boolean;
}

/**
 * Turn a raw change into direction + display text.
 *
 * Direction is separate from tone on purpose: a rise in churn is a fall in
 * fortune, and only the caller knows which. See `deltaTone`.
 */
export function formatDelta(value: number, options: FormatDeltaOptions = {}): DeltaInfo {
  const { unit = "percent", precision = 1, signed = true } = options;
  const suffix = unit === "percent" ? "%" : "";

  if (!Number.isFinite(value)) return { direction: "flat", text: `0${suffix}`, value: 0 };

  const places = Number.isFinite(precision) && precision >= 0 ? Math.floor(precision) : 1;
  const magnitude = Math.abs(value)
    .toFixed(places)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");

  const direction: DeltaDirection = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const sign = direction === "up" && signed ? "+" : direction === "down" ? "-" : "";
  return { direction, text: `${sign}${magnitude}${suffix}`, value };
}

/**
 * Map a direction to a colour intent. Pass `invert` for metrics where down is
 * the good news — cost per lead, bounce rate, time to first byte.
 */
export function deltaTone(direction: DeltaDirection, invert = false): "success" | "danger" | "default" {
  if (direction === "flat") return "default";
  const good = invert ? direction === "down" : direction === "up";
  return good ? "success" : "danger";
}

/** Round to the nearest half. `2.3` → `2.5`, `2.24` → `2`. */
export function roundToHalf(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 2) / 2;
}

/**
 * Snap a rating to a legal value: rounded to the step the widget allows and
 * clamped into `0..max`, so a bad API number can never paint six stars out of
 * five.
 */
export function normalizeRating(value: number, max = 5, allowHalf = false): number {
  if (!Number.isFinite(value)) return 0;
  const top = Number.isFinite(max) && max > 0 ? Math.floor(max) : 5;
  const stepped = allowHalf ? roundToHalf(value) : Math.round(value);
  return clamp(stepped, 0, top);
}

/**
 * Split a shortcut string into its caps: `"cmd+k"` → `["cmd", "k"]`.
 *
 * A doubled separator means the plus key itself (`"ctrl++"` → `["ctrl", "+"]`),
 * and a lone `"+"` stays a key rather than vanishing.
 */
export function splitKeys(combo: string): string[] {
  const raw = combo.trim();
  if (!raw) return [];

  const parts = raw.split("+");
  const keys: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const piece = (parts[i] ?? "").trim();
    if (piece) {
      keys.push(piece);
      continue;
    }
    // An empty piece with separators on both sides is the "+" key itself.
    if (i > 0 && i < parts.length - 1) keys.push("+");
  }
  return keys.length > 0 ? keys : [raw];
}

/** The characters that end a tag when typed or pasted. */
export const TAG_SEPARATORS: readonly string[] = [",", "\n", "\t", ";"];

/**
 * Split pasted text into candidate tags. Trims each piece and drops the empties
 * a trailing comma leaves behind. Duplicates are kept — rejecting them is
 * `mergeTags`'s job, because only it knows what is already in the field.
 */
export function splitTagInput(raw: string, separators: readonly string[] = TAG_SEPARATORS): string[] {
  const stops = new Set<string>();
  for (const sep of separators) for (const ch of sep) stops.add(ch);

  const out: string[] = [];
  let buffer = "";
  const flush = (): void => {
    const tag = buffer.trim();
    if (tag) out.push(tag);
    buffer = "";
  };
  for (const ch of raw) {
    if (stops.has(ch)) flush();
    else buffer += ch;
  }
  flush();
  return out;
}

export interface MergeTagsResult {
  /** The new full list. */
  tags: string[];
  /** Only the ones that were actually taken. */
  added: string[];
  /** Duplicates and anything past `max`, so the UI can explain itself. */
  rejected: string[];
}

export interface MergeTagsOptions {
  /** Hard cap on the list length. */
  max?: number;
  /** Treat `React` and `react` as different tags. Default `false`. */
  caseSensitive?: boolean;
}

/**
 * Add tags to a list, rejecting duplicates and anything over `max`.
 *
 * Comparison folds case by default: a user who types `react` after `React` meant
 * the same tag, and two spellings of one tag is a filter bug waiting to happen.
 */
export function mergeTags(
  existing: readonly string[],
  incoming: readonly string[],
  options: MergeTagsOptions = {},
): MergeTagsResult {
  const { max, caseSensitive = false } = options;
  const key = (tag: string): string => (caseSensitive ? tag : tag.toLowerCase());
  const limit = Number.isFinite(max) && (max as number) >= 0 ? Math.floor(max as number) : Infinity;

  const tags = existing.slice();
  const seen = new Set(tags.map(key));
  const added: string[] = [];
  const rejected: string[] = [];

  for (const candidate of incoming) {
    const tag = candidate.trim();
    if (!tag) continue;
    if (seen.has(key(tag)) || tags.length >= limit) {
      rejected.push(tag);
      continue;
    }
    seen.add(key(tag));
    tags.push(tag);
    added.push(tag);
  }

  return { tags, added, rejected };
}

export interface NormalizedMetric {
  /** Position in the input list, so a caller can zip the result back. */
  index: number;
  /** The sanitised value — negatives and NaN become 0. */
  value: number;
  /** Bar width, 0-1, relative to the largest value. */
  ratio: number;
  /** Portion of the total, 0-1 — what a percentage label should show. */
  share: number;
}

/**
 * Normalise a breakdown ("top referrers") twice over: `ratio` against the
 * biggest row, which is what makes the bars readable, and `share` against the
 * total, which is what the number next to them means. Confusing the two is why
 * so many dashboards show bars that add up to more than 100%.
 */
export function normalizeMetrics(values: readonly number[], explicitMax?: number): NormalizedMetric[] {
  const safe = values.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const largest = safe.reduce((a, b) => (b > a ? b : a), 0);
  const ceiling =
    explicitMax !== undefined && Number.isFinite(explicitMax) && explicitMax > 0 ? explicitMax : largest;
  const total = safe.reduce((a, b) => a + b, 0);

  return safe.map((value, index) => ({
    index,
    value,
    ratio: ceiling > 0 ? clamp(value / ceiling, 0, 1) : 0,
    share: total > 0 ? clamp(value / total, 0, 1) : 0,
  }));
}

/** One node of a `Tree`. */
export interface TreeNode {
  /** Unique within the tree — it is the selection and expansion key. */
  id: string;
  label: ReactNode;
  /** Leading glyph. Purely decorative, it is rendered `aria-hidden`. */
  icon?: ReactNode;
  children?: TreeNode[];
  disabled?: boolean;
}

/** A visible row of a tree, in the order the Down arrow walks them. */
export interface FlatTreeNode {
  id: string;
  /** 0 for a root. */
  depth: number;
  parentId?: string;
  hasChildren: boolean;
  expanded: boolean;
  /** Position in the visible list — the roving-tabindex index. */
  index: number;
  /** 1-based `aria-posinset`. */
  posInSet: number;
  /** `aria-setsize` for this level. */
  setSize: number;
  disabled: boolean;
}

/**
 * Flatten the visible rows of a tree into keyboard order.
 *
 * The children of a collapsed node are skipped, which is the whole point: Down
 * from a collapsed folder must land on the next sibling, not on something
 * nobody can see. Also carries `posInSet`/`setSize` so the markup can be
 * announced properly.
 */
export function flattenTree(
  nodes: readonly TreeNode[],
  expanded: ReadonlySet<string> | readonly string[],
): FlatTreeNode[] {
  const open: ReadonlySet<string> = Array.isArray(expanded)
    ? new Set(expanded as readonly string[])
    : (expanded as ReadonlySet<string>);

  const out: FlatTreeNode[] = [];
  const walk = (list: readonly TreeNode[], depth: number, parentId?: string): void => {
    list.forEach((node, i) => {
      const children = node.children ?? [];
      const hasChildren = children.length > 0;
      const isOpen = hasChildren && open.has(node.id);
      out.push({
        id: node.id,
        depth,
        ...(parentId === undefined ? null : { parentId }),
        hasChildren,
        expanded: isOpen,
        index: out.length,
        posInSet: i + 1,
        setSize: list.length,
        disabled: node.disabled ?? false,
      });
      if (isOpen) walk(children, depth + 1, node.id);
    });
  };
  walk(nodes, 0);
  return out;
}

/* ==========================================================================
   Avatar
   ========================================================================== */

/** Avatar diameters. Wider than the shared `Size` because faces need an xs. */
export type AvatarSize = "xs" | Size | "xl";

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  /** The person. Drives the initials, the colour and the default alt text. */
  name?: string;
  /** Photo URL. Falls back to initials if it 404s or never loads. */
  src?: string;
  /** Override the alt text. Defaults to `name`. */
  alt?: string;
  /** Diameter. Default `md`. */
  size?: AvatarSize;
  shape?: "circle" | "square";
  /** Presence dot in the corner. */
  status?: "online" | "offline" | "busy" | "away";
  /** What the dot means, for screen readers. Defaults to the status word. */
  statusLabel?: string;
  /** Pin the colour bucket instead of deriving it from `name`. */
  colorIndex?: number;
  /** Shown when there is no `src` and no `name` — a generic person glyph, say. */
  icon?: ReactNode;
}

/**
 * A face, or the next best thing.
 *
 * The image failing is the normal case, not the edge case: profile CDNs expire,
 * Gravatar 404s, users delete photos. So the initials are always rendered
 * underneath and the `<img>` simply stops covering them on error — no layout
 * shift, no broken-image icon, nothing to configure.
 */
export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  {
    name = "",
    src,
    alt,
    size = "md",
    shape = "circle",
    status,
    statusLabel,
    colorIndex,
    icon,
    className,
    children,
    ...rest
  },
  ref,
) {
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(src) && !broken;
  const bucket = colorIndex ?? colorIndexFor(name, AVATAR_COLOR_COUNT);
  const text = initials(name);

  return (
    <span
      {...rest}
      ref={ref}
      className={classes("lac-avatar", className)}
      data-size={size}
      data-shape={shape}
      data-color={((bucket % AVATAR_COLOR_COUNT) + AVATAR_COLOR_COUNT) % AVATAR_COLOR_COUNT}
      data-status={status}
      title={rest.title ?? (name || undefined)}
    >
      <span className="lac-avatar-fallback" aria-hidden={showImage || undefined}>
        {children ?? (text || icon || null)}
      </span>
      {showImage && (
        <img
          className="lac-avatar-img"
          src={src}
          alt={alt ?? name}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
        />
      )}
      {status && (
        <>
          <span className="lac-avatar-status" data-status={status} aria-hidden />
          <span className="lac-vh">{statusLabel ?? status}</span>
        </>
      )}
    </span>
  );
});

export interface AvatarGroupProps extends HTMLAttributes<HTMLDivElement> {
  /** How many faces to draw before folding the rest into `+N`. Default 4. */
  max?: number;
  /** Size applied to the overflow chip; pass the same one to your avatars. */
  size?: AvatarSize;
  /**
   * Count of people the group represents when it is bigger than the children
   * you rendered — a list page that only fetched the first five avatars can
   * still say `+42`.
   */
  total?: number;
  /** Reverse the overlap so the first avatar sits on top. Default `true`. */
  stackFirstOnTop?: boolean;
}

/**
 * Overlapping avatars with a `+N` counter. The counter is a real element with
 * a readable label, not a pseudo-element, so it survives copy-paste and
 * screen readers.
 */
export const AvatarGroup = forwardRef<HTMLDivElement, AvatarGroupProps>(function AvatarGroup(
  { max = 4, size = "md", total, stackFirstOnTop = true, className, children, ...rest },
  ref,
) {
  const items = Children.toArray(children);
  const { visible, overflow } = splitAvatarOverflow(items, max);
  const extra = total !== undefined ? Math.max(0, total - visible.length) : overflow;

  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-avatar-group", className)}
      data-size={size}
      data-first-on-top={stackFirstOnTop || undefined}
    >
      {visible}
      {extra > 0 && (
        <span className="lac lac-avatar lac-avatar-more" data-size={size} data-shape="circle">
          <span className="lac-avatar-fallback">{`+${extra}`}</span>
          <span className="lac-vh">{`${extra} more`}</span>
        </span>
      )}
    </div>
  );
});

/* ==========================================================================
   Stat
   ========================================================================== */

export interface StatProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** What is being measured. */
  label: ReactNode;
  /** The headline number, already formatted the way your locale wants it. */
  value: ReactNode;
  /** Change since the comparison period. Drives arrow, sign and colour. */
  delta?: number;
  /** Render this instead of the formatted delta, keeping the arrow and colour. */
  deltaLabel?: ReactNode;
  /** `percent` (default) appends `%`; `absolute` leaves the number bare. */
  deltaUnit?: "percent" | "absolute";
  /** Decimal places on the delta. Default 1, trailing zeros trimmed. */
  deltaPrecision?: number;
  /** For metrics where down is good — cost, churn, latency. */
  invertDelta?: boolean;
  /** Caption under the delta: "vs last 30 days". */
  comparison?: ReactNode;
  /** A chart — `<Sparkline />`, an SVG, anything. Rendered to the right. */
  sparkline?: ReactNode;
  /** Leading glyph next to the label. */
  icon?: ReactNode;
  /** Swap the whole block for shimmering placeholders of the same height. */
  loading?: boolean;
}

/**
 * A KPI block: label, number, movement.
 *
 * `invertDelta` exists because the arrow and the colour are different
 * questions. Churn going up is an increase *and* bad news; without a way to say
 * so, every dashboard ends up with a green upward arrow on its worst metric.
 */
export const Stat = forwardRef<HTMLDivElement, StatProps>(function Stat(
  {
    label,
    value,
    delta,
    deltaLabel,
    deltaUnit = "percent",
    deltaPrecision = 1,
    invertDelta = false,
    comparison,
    sparkline,
    icon,
    loading = false,
    className,
    children,
    ...rest
  },
  ref,
) {
  const info =
    delta === undefined
      ? undefined
      : formatDelta(delta, { unit: deltaUnit, precision: deltaPrecision });
  const tone = info ? deltaTone(info.direction, invertDelta) : "default";
  const arrow = info?.direction === "up" ? "▲" : info?.direction === "down" ? "▼" : "•";

  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-stat", className)}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
    >
      <div className="lac-stat-head">
        {icon && (
          <span className="lac-stat-icon" aria-hidden>
            {icon}
          </span>
        )}
        <span className="lac-stat-label">{label}</span>
      </div>

      {loading ? (
        <Skeleton width="55%" height="var(--lac-text-xl)" />
      ) : (
        <div className="lac-stat-value">{value}</div>
      )}

      <div className="lac-stat-foot">
        {loading ? (
          <Skeleton width="38%" height="var(--lac-text-sm)" />
        ) : (
          <>
            {info && (
              <span className="lac-stat-delta" data-tone={tone} data-direction={info.direction}>
                <span aria-hidden>{arrow}</span>
                {deltaLabel ?? info.text}
              </span>
            )}
            {comparison && <span className="lac-stat-compare">{comparison}</span>}
          </>
        )}
      </div>

      {sparkline && !loading && <div className="lac-stat-spark">{sparkline}</div>}
      {children}
    </div>
  );
});

/* ==========================================================================
   Timeline
   ========================================================================== */

export interface TimelineProps extends HTMLAttributes<HTMLOListElement> {
  /** Put the time in its own column instead of above the title. */
  layout?: "stacked" | "two-column";
}

/**
 * A vertical list of events. It is an `<ol>` because the order carries meaning
 * — an activity feed read out of sequence is a different story.
 */
export const Timeline = forwardRef<HTMLOListElement, TimelineProps>(function Timeline(
  { layout = "stacked", className, ...rest },
  ref,
) {
  return (
    <ol {...rest} ref={ref} className={classes("lac-timeline", className)} data-layout={layout} />
  );
});

export interface TimelineItemProps extends Omit<HTMLAttributes<HTMLLIElement>, "title"> {
  /** Headline for the event. */
  title?: ReactNode;
  /** When it happened, already formatted for the reader. */
  time?: ReactNode;
  /** Machine-readable timestamp for the `<time>` element — an ISO string. */
  dateTime?: string;
  /** Replaces the dot. Rendered `aria-hidden`; keep the meaning in the text. */
  icon?: ReactNode;
  /** Colours the marker. */
  tone?: Tone;
  /** Draw a hollow marker — the convention for "not done yet". */
  pending?: boolean;
  /** Hide the connector below this item. Set automatically for the last one by CSS. */
  last?: boolean;
}

/**
 * One event. The connector line is drawn by CSS from the marker down, so items
 * of any height stay joined without measuring anything.
 */
export const TimelineItem = forwardRef<HTMLLIElement, TimelineItemProps>(function TimelineItem(
  { title, time, dateTime, icon, tone = "default", pending = false, last = false, className, children, ...rest },
  ref,
) {
  return (
    <li
      {...rest}
      ref={ref}
      className={classes("lac-timeline-item", className)}
      data-tone={tone}
      data-pending={pending || undefined}
      data-last={last || undefined}
    >
      <span className="lac-timeline-marker" aria-hidden>
        {icon}
      </span>
      <div className="lac-timeline-body">
        {time !== undefined && (
          <time className="lac-timeline-time" dateTime={dateTime}>
            {time}
          </time>
        )}
        {title !== undefined && <p className="lac-timeline-title">{title}</p>}
        {children !== undefined && <div className="lac-timeline-content">{children}</div>}
      </div>
    </li>
  );
});

/* ==========================================================================
   DescriptionList
   ========================================================================== */

export interface DescriptionItem {
  /** React key when the list is re-ordered. Falls back to the index. */
  key?: string;
  label: ReactNode;
  value: ReactNode;
}

export interface DescriptionListProps extends HTMLAttributes<HTMLDListElement> {
  /** The pairs. Or pass `<dt>`/`<dd>` children yourself and skip this. */
  items?: readonly DescriptionItem[];
  /** `horizontal` puts label and value side by side; `stacked` puts it above. */
  layout?: "horizontal" | "stacked";
  /** Hairline between rows — earns its keep past about five rows. */
  divided?: boolean;
  /** Width of the label column in a horizontal list. Any CSS length. */
  labelWidth?: number | string;
}

/**
 * Label/value pairs as a real `<dl>`.
 *
 * Each pair is wrapped in a `<div>` — valid inside a `<dl>` since HTML5 and the
 * only way to lay out rows that keeps the label and value associated for
 * assistive tech.
 */
export const DescriptionList = forwardRef<HTMLDListElement, DescriptionListProps>(
  function DescriptionList(
    { items, layout = "horizontal", divided = false, labelWidth, className, style, children, ...rest },
    ref,
  ) {
    const width = typeof labelWidth === "number" ? `${labelWidth}px` : labelWidth;
    return (
      <dl
        {...rest}
        ref={ref}
        className={classes("lac-dl", className)}
        data-layout={layout}
        data-divided={divided || undefined}
        style={{ ...(width ? { ["--lac-dl-label-w" as string]: width } : null), ...style }}
      >
        {items?.map((item, i) => (
          <div className="lac-dl-row" key={item.key ?? i}>
            <dt className="lac-dl-label">{item.label}</dt>
            <dd className="lac-dl-value">{item.value}</dd>
          </div>
        ))}
        {children}
      </dl>
    );
  },
);

/* ==========================================================================
   EmptyState
   ========================================================================== */

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Illustration or glyph. Decorative — the title carries the meaning. */
  icon?: ReactNode;
  /** What is missing. */
  title: ReactNode;
  /** Why it is missing and what to do about it. */
  description?: ReactNode;
  /** The way out: a button, a link, a pair of them. */
  action?: ReactNode;
  /** `sm` for an empty table cell, `lg` for a whole page. Default `md`. */
  size?: Size;
  /** Draw the dashed border that marks a drop zone or an empty panel. */
  bordered?: boolean;
}

/**
 * The "nothing here yet" panel. `action` is a slot rather than a `buttonText`
 * prop so you can put two buttons, a link, or a file input in it without this
 * component growing a prop for each.
 */
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { icon, title, description, action, size = "md", bordered = false, className, children, ...rest },
  ref,
) {
  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-empty", className)}
      data-size={size}
      data-bordered={bordered || undefined}
    >
      {icon && (
        <div className="lac-empty-icon" aria-hidden>
          {icon}
        </div>
      )}
      <p className="lac-empty-title">{title}</p>
      {description && <p className="lac-empty-desc">{description}</p>}
      {children}
      {action && <div className="lac-empty-action">{action}</div>}
    </div>
  );
});

/* ==========================================================================
   Tag + TagInput
   ========================================================================== */

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  size?: Exclude<Size, "lg"> | "lg";
  variant?: "soft" | "outline" | "solid";
  /** Show the × and call this. Omit it and the chip is not removable. */
  onRemove?: () => void;
  /** Accessible name for the × button. Default `Remove <text>`. */
  removeLabel?: string;
  /** Grey it out and block removal. */
  disabled?: boolean;
  /** Leading glyph — a colour swatch or a favicon. */
  icon?: ReactNode;
}

/**
 * A chip. The remove control is a real `<button>` with its own label, so it is
 * reachable by keyboard and announced as "Remove design, button" rather than
 * as an anonymous ×.
 */
export const Tag = forwardRef<HTMLSpanElement, TagProps>(function Tag(
  { tone = "default", size = "md", variant = "soft", onRemove, removeLabel, disabled = false, icon, className, children, ...rest },
  ref,
) {
  const text = typeof children === "string" ? children : "";
  return (
    <span
      {...rest}
      ref={ref}
      className={classes("lac-tag", className)}
      data-tone={tone}
      data-size={size}
      data-variant={variant}
      data-disabled={disabled || undefined}
    >
      {icon && (
        <span className="lac-tag-icon" aria-hidden>
          {icon}
        </span>
      )}
      <span className="lac-tag-text">{children}</span>
      {onRemove && (
        <button
          type="button"
          className="lac lac-tag-remove"
          aria-label={removeLabel ?? (text ? `Remove ${text}` : "Remove")}
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          <span aria-hidden>×</span>
        </button>
      )}
    </span>
  );
});

export interface TagInputProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue" | "children"> {
  /** Controlled list. */
  value?: string[];
  /** Starting list when uncontrolled. */
  defaultValue?: string[];
  /** Fires on every add and remove with the whole new list. */
  onChange?: (tags: string[]) => void;
  /** Told about duplicates and over-limit pastes, for a toast or a shake. */
  onReject?: (rejected: string[]) => void;
  /** Hard cap. The field goes read-only once it is reached. */
  max?: number;
  /** Treat `React` and `react` as different tags. Default `false`. */
  caseSensitive?: boolean;
  /** Characters that end a tag as you type. Default comma, semicolon, tab, newline. */
  separators?: readonly string[];
  /** Reject a tag before it is added — length limits, a regex, a lookup. */
  validate?: (tag: string) => boolean;
  placeholder?: string;
  disabled?: boolean;
  /** Accessible name for the whole field. */
  label?: string;
  tone?: Tone;
  size?: Size;
  /** Passed straight to the inner `<input>` — `name`, `autoComplete`, `id`. */
  inputProps?: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onKeyDown" | "onPaste">;
}

/**
 * Type a tag, press Enter. Paste a spreadsheet column, get one tag per line.
 *
 * Backspace on an empty field removes the last tag, the behaviour every user
 * already expects from email clients. Pasting is split on the same separators
 * as typing, deduplicated against what is already there, and anything rejected
 * is reported through `onReject` rather than silently dropped.
 */
export const TagInput = forwardRef<HTMLDivElement, TagInputProps>(function TagInput(
  {
    value,
    defaultValue = [],
    onChange,
    onReject,
    max,
    caseSensitive = false,
    separators = TAG_SEPARATORS,
    validate,
    placeholder,
    disabled = false,
    label,
    tone = "default",
    size = "md",
    inputProps,
    className,
    ...rest
  },
  ref,
) {
  const [tags, setTags] = useControllable<string[]>(value, defaultValue, onChange);
  const [draft, setDraft] = useState("");
  const id = useStableId(inputProps?.id, "taginput");
  const full = max !== undefined && tags.length >= max;

  const commit = useCallback(
    (candidates: string[]): void => {
      const allowed = validate ? candidates.filter((t) => validate(t)) : candidates;
      const blocked = validate ? candidates.filter((t) => !validate(t)) : [];
      const mergeOptions: MergeTagsOptions = { caseSensitive, ...(max === undefined ? null : { max }) };
      const result = mergeTags(tags, allowed, mergeOptions);
      if (result.added.length > 0) setTags(result.tags);
      const rejected = [...blocked, ...result.rejected];
      if (rejected.length > 0) onReject?.(rejected);
    },
    [caseSensitive, max, onReject, setTags, tags, validate],
  );

  const removeAt = useCallback(
    (index: number): void => {
      setTags(tags.filter((_, i) => i !== index));
    },
    [setTags, tags],
  );

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (draft.trim()) {
        commit(splitTagInput(draft, separators));
        setDraft("");
      }
      return;
    }
    if (event.key === "Backspace" && draft === "" && tags.length > 0) {
      event.preventDefault();
      removeAt(tags.length - 1);
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const next = event.target.value;
    // Typing a separator ends the tag, same as Enter.
    if (next.length > 0 && separators.some((sep) => next.endsWith(sep))) {
      const pieces = splitTagInput(next, separators);
      if (pieces.length > 0) commit(pieces);
      setDraft("");
      return;
    }
    setDraft(next);
  };

  const handlePaste = (event: ReactClipboardEvent<HTMLInputElement>): void => {
    const text = event.clipboardData.getData("text");
    if (!text) return;
    const pieces = splitTagInput(text, separators);
    // A paste with no separator is just typing — let the browser handle it.
    if (pieces.length <= 1 && !separators.some((sep) => text.includes(sep))) return;
    event.preventDefault();
    commit(pieces);
    setDraft("");
  };

  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-taginput", className)}
      data-tone={tone}
      data-size={size}
      data-disabled={disabled || undefined}
      role="group"
      aria-label={label}
    >
      {tags.map((tag, i) => (
        <Tag
          key={`${tag}-${i}`}
          size={size === "lg" ? "md" : "sm"}
          tone={tone}
          disabled={disabled}
          onRemove={disabled ? undefined : () => removeAt(i)}
        >
          {tag}
        </Tag>
      ))}
      <input
        {...inputProps}
        id={id}
        className="lac lac-taginput-field"
        type="text"
        value={draft}
        placeholder={tags.length === 0 ? placeholder : inputProps?.placeholder}
        disabled={disabled || full}
        aria-label={label ? `${label} — add a tag` : "Add a tag"}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={(event) => {
          if (draft.trim()) {
            commit(splitTagInput(draft, separators));
            setDraft("");
          }
          inputProps?.onBlur?.(event);
        }}
      />
    </div>
  );
});

/* ==========================================================================
   Rating
   ========================================================================== */

export interface RatingProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue" | "children"> {
  /** Controlled value. Snapped to a legal value before it is drawn. */
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  /** Number of icons. Default 5. */
  max?: number;
  /** Allow halves — needed for an average like 4.3 out of 5. */
  allowHalf?: boolean;
  /** Display only: no focus, no pointer, no keyboard. */
  readOnly?: boolean;
  disabled?: boolean;
  /** Clicking the current value clears it back to 0. */
  allowClear?: boolean;
  size?: Size;
  /** The glyph. A star by default; pass a heart, a flame, an SVG. */
  icon?: ReactNode;
  /** Accessible name, e.g. "Overall rating". */
  label?: string;
  /** Build the `aria-valuetext`. Default `4.5 out of 5`. */
  formatValueText?: (value: number, max: number) => string;
}

const STAR = "★";

/**
 * Stars — readable at a glance, editable when you need it.
 *
 * Halves are drawn by overlaying a clipped copy of the same glyph rather than
 * by swapping in a half-star character, so a custom `icon` gets halves for
 * free. Interactive ratings are a `slider`: it is the role that actually
 * describes "one value along a range", and it gives arrow keys, Home and End
 * the behaviour a screen-reader user is told to expect.
 */
export const Rating = forwardRef<HTMLDivElement, RatingProps>(function Rating(
  {
    value,
    defaultValue = 0,
    onChange,
    max = 5,
    allowHalf = false,
    readOnly = false,
    disabled = false,
    allowClear = false,
    size = "md",
    icon,
    label,
    formatValueText,
    className,
    ...rest
  },
  ref,
) {
  const [raw, setRaw] = useControllable<number>(value, defaultValue, onChange);
  const count = Number.isFinite(max) && max > 0 ? Math.floor(max) : 5;
  const current = normalizeRating(raw, count, allowHalf);
  const interactive = !readOnly && !disabled;
  const step = allowHalf ? 0.5 : 1;
  const valueText = formatValueText
    ? formatValueText(current, count)
    : `${current} out of ${count}`;

  const set = (next: number): void => {
    const snapped = normalizeRating(next, count, allowHalf);
    if (snapped !== current) setRaw(snapped);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (!interactive) return;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        set(current + step);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        set(current - step);
        break;
      case "Home":
        event.preventDefault();
        set(0);
        break;
      case "End":
        event.preventDefault();
        set(count);
        break;
      default:
        break;
    }
  };

  const valueFromPointer = (event: ReactMouseEvent<HTMLElement>, index: number): number => {
    if (!allowHalf) return index + 1;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return index + 1;
    return event.clientX - rect.left < rect.width / 2 ? index + 0.5 : index + 1;
  };

  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-rating", className)}
      data-size={size}
      data-readonly={readOnly || undefined}
      data-disabled={disabled || undefined}
      role={interactive ? "slider" : "img"}
      tabIndex={interactive ? 0 : undefined}
      aria-label={label ?? (interactive ? "Rating" : valueText)}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? count : undefined}
      aria-valuenow={interactive ? current : undefined}
      aria-valuetext={interactive ? valueText : undefined}
      aria-orientation={interactive ? "horizontal" : undefined}
      aria-disabled={disabled || undefined}
      onKeyDown={handleKeyDown}
    >
      {Array.from({ length: count }, (_, i) => {
        const filled = clamp(current - i, 0, 1);
        return (
          <span
            key={i}
            className="lac-rating-item"
            data-fill={filled === 1 ? "full" : filled === 0 ? "empty" : "half"}
            onClick={
              interactive
                ? (event) => {
                    const next = valueFromPointer(event, i);
                    set(allowClear && next === current ? 0 : next);
                  }
                : undefined
            }
          >
            <span className="lac-rating-glyph" aria-hidden>
              {icon ?? STAR}
            </span>
            <span
              className="lac-rating-glyph lac-rating-on"
              style={{ width: `${filled * 100}%` }}
              aria-hidden
            >
              {icon ?? STAR}
            </span>
          </span>
        );
      })}
      {!interactive && <span className="lac-vh">{valueText}</span>}
    </div>
  );
});

/* ==========================================================================
   Kbd
   ========================================================================== */

export interface KbdProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  /** A combo like `cmd+k`, or a single key. Also accepted as children. */
  keys?: string;
  /** Same thing, when you would rather write `<Kbd>cmd+k</Kbd>`. */
  children?: string;
  /** What to draw between caps. Default `+`. Pass `""` for a tight group. */
  separator?: ReactNode;
  size?: Exclude<Size, "lg">;
}

/**
 * Keyboard caps. `cmd+k` becomes two caps and a separator, because a single cap
 * reading "cmd+k" is a lie about which keys the user presses — and because
 * only one of those parts should be styled as a key.
 */
export const Kbd = forwardRef<HTMLElement, KbdProps>(function Kbd(
  { keys, children, separator = "+", size = "md", className, ...rest },
  ref,
) {
  const parts = splitKeys(keys ?? children ?? "");

  if (parts.length <= 1) {
    return (
      <kbd {...rest} ref={ref} className={classes("lac-kbd", className)} data-size={size}>
        {parts[0] ?? ""}
      </kbd>
    );
  }

  return (
    <kbd {...rest} ref={ref} className={classes("lac-kbd-group", className)} data-size={size}>
      {parts.map((part, i) => (
        <span key={`${part}-${i}`} style={{ display: "contents" }}>
          {i > 0 && separator !== "" && (
            <span className="lac-kbd-sep" aria-hidden>
              {separator}
            </span>
          )}
          <kbd className="lac lac-kbd" data-size={size}>
            {part}
          </kbd>
        </span>
      ))}
    </kbd>
  );
});

/* ==========================================================================
   Code + Snippet
   ========================================================================== */

export interface CodeProps extends HTMLAttributes<HTMLElement> {
  size?: Exclude<Size, "lg">;
  tone?: Tone;
}

/** Inline code, for a flag or a path inside a sentence. */
export const Code = forwardRef<HTMLElement, CodeProps>(function Code(
  { size = "md", tone = "default", className, ...rest },
  ref,
) {
  return (
    <code {...rest} ref={ref} className={classes("lac-code", className)} data-size={size} data-tone={tone} />
  );
});

/**
 * Put text on the clipboard, in an event handler only.
 *
 * Tries the async Clipboard API, then the `execCommand` fallback for HTTP
 * origins and older browsers, and reports failure instead of throwing — an
 * install command that cannot be copied should offer itself for selection, not
 * blow up the page.
 */
function writeClipboard(text: string): Promise<boolean> {
  const nav = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { clipboard?: Clipboard });
  const clip = nav?.clipboard;
  if (clip && typeof clip.writeText === "function") {
    return clip.writeText(text).then(
      () => true,
      () => legacyCopy(text),
    );
  }
  return Promise.resolve(legacyCopy(text));
}

function legacyCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = typeof document.execCommand === "function" ? document.execCommand("copy") : false;
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export interface SnippetProps extends Omit<HTMLAttributes<HTMLDivElement>, "onCopy" | "children"> {
  /** The exact text that goes on the clipboard. */
  code: string;
  /** Rendered instead of `code` — syntax-highlighted nodes, say. */
  display?: ReactNode;
  /** Shell prompt drawn in front of the line and never copied. */
  prompt?: string;
  /** Keep line breaks and allow scrolling. Default `false` (one line). */
  multiline?: boolean;
  /** Label for the copy button. Default `Copy`. */
  copyLabel?: string;
  /** Confirmation shown for a moment after a copy. Default `Copied`. */
  copiedLabel?: string;
  /** Milliseconds the confirmation stays up. Default 1600. */
  feedbackMs?: number;
  /** Told whether the copy actually worked — useful for a fallback toast. */
  onCopy?: (code: string, ok: boolean) => void;
  /** Hide the button, e.g. in a read-only doc. */
  hideCopy?: boolean;
}

/**
 * A code block with a copy button.
 *
 * The clipboard call happens in the click handler and nowhere else — browsers
 * only grant clipboard access from a user gesture, and a render-time call would
 * break server rendering outright. `prompt` is rendered but never copied, so
 * `$ npm i` puts `npm i` on the clipboard.
 */
export const Snippet = forwardRef<HTMLDivElement, SnippetProps>(function Snippet(
  {
    code,
    display,
    prompt,
    multiline = false,
    copyLabel = "Copy",
    copiedLabel = "Copied",
    feedbackMs = 1600,
    onCopy,
    hideCopy = false,
    className,
    ...rest
  },
  ref,
) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
    },
    [],
  );

  const handleCopy = (): void => {
    void writeClipboard(code).then((ok) => {
      setState(ok ? "copied" : "failed");
      onCopy?.(code, ok);
      if (timer.current !== undefined) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("idle"), feedbackMs);
    });
  };

  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-snippet", className)}
      data-multiline={multiline || undefined}
      data-state={state}
    >
      <pre className="lac-snippet-pre">
        {prompt && (
          <span className="lac-snippet-prompt" aria-hidden>
            {prompt}
          </span>
        )}
        <code className="lac-snippet-code">{display ?? code}</code>
      </pre>
      {!hideCopy && (
        <button
          type="button"
          className="lac lac-snippet-copy"
          onClick={handleCopy}
          aria-label={state === "copied" ? copiedLabel : copyLabel}
        >
          {state === "copied" ? copiedLabel : state === "failed" ? "Press ⌘C" : copyLabel}
        </button>
      )}
      <span className="lac-vh" role="status" aria-live="polite">
        {state === "copied" ? copiedLabel : state === "failed" ? "Copy failed" : ""}
      </span>
    </div>
  );
});

/* ==========================================================================
   Divider
   ========================================================================== */

export interface DividerProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: "horizontal" | "vertical";
  /** Text sitting in the line — "or", "Today", a section name. */
  label?: ReactNode;
  /** Where the label sits. Default `center`. */
  align?: "start" | "center" | "end";
  variant?: "solid" | "dashed";
  /** Margin around the rule. `none` when the parent already spaces things. */
  spacing?: Size | "none";
}

/**
 * A rule. With a `label` it stays a `separator` for assistive tech and gains
 * two line segments around the text, which is the only way to centre a word in
 * a rule without hardcoding the background colour behind it.
 */
export const Divider = forwardRef<HTMLDivElement, DividerProps>(function Divider(
  { orientation = "horizontal", label, align = "center", variant = "solid", spacing = "md", className, ...rest },
  ref,
) {
  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-divider", className)}
      role="separator"
      aria-orientation={orientation}
      data-orientation={orientation}
      data-align={align}
      data-variant={variant}
      data-spacing={spacing}
      data-labelled={label !== undefined || undefined}
    >
      {label !== undefined && orientation === "horizontal" && (
        <span className="lac-divider-label">{label}</span>
      )}
    </div>
  );
});

/* ==========================================================================
   Tree
   ========================================================================== */

export interface TreeProps extends Omit<HTMLAttributes<HTMLUListElement>, "onSelect" | "defaultValue"> {
  /** The nodes. Children make a branch; no children makes a leaf. */
  nodes: readonly TreeNode[];
  /** Accessible name for the tree. Required — `role="tree"` needs one. */
  label: string;
  /** Controlled expansion. */
  expandedIds?: string[];
  defaultExpandedIds?: string[];
  onExpandedChange?: (ids: string[]) => void;
  /** Controlled selection. */
  selectedId?: string | null;
  defaultSelectedId?: string | null;
  onSelect?: (id: string, node: TreeNode) => void;
  /** Replace the ▸ caret. Rotated by CSS when the branch opens. */
  caret?: ReactNode;
  /** Indent per level. Any CSS length. Default `var(--lac-space-4)`. */
  indent?: number | string;
}

interface TreeBranchProps {
  nodes: readonly TreeNode[];
  depth: number;
  flat: FlatTreeNode[];
  expandedSet: ReadonlySet<string>;
  activeId: string | undefined;
  selectedId: string | null | undefined;
  caret: ReactNode;
  onToggle: (id: string) => void;
  onActivate: (node: TreeNode) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLLIElement>, node: TreeNode) => void;
}

function TreeBranch({
  nodes,
  depth,
  flat,
  expandedSet,
  activeId,
  selectedId,
  caret,
  onToggle,
  onActivate,
  onKeyDown,
}: TreeBranchProps): JSX.Element {
  return (
    <>
      {nodes.map((node, i) => {
        const children = node.children ?? [];
        const hasChildren = children.length > 0;
        const expanded = hasChildren && expandedSet.has(node.id);
        return (
          <li
            key={node.id}
            className="lac lac-tree-item"
            role="treeitem"
            aria-expanded={hasChildren ? expanded : undefined}
            aria-selected={selectedId === node.id}
            aria-level={depth + 1}
            aria-posinset={i + 1}
            aria-setsize={nodes.length}
            aria-disabled={node.disabled || undefined}
            tabIndex={node.id === activeId ? 0 : -1}
            data-depth={depth}
            data-branch={hasChildren || undefined}
            data-disabled={node.disabled || undefined}
            onKeyDown={(event) => onKeyDown(event, node)}
          >
            <span
              className="lac-tree-row"
              style={{ paddingLeft: `calc(var(--lac-tree-indent) * ${depth})` }}
              onClick={(event) => {
                event.stopPropagation();
                if (node.disabled) return;
                if (hasChildren) onToggle(node.id);
                onActivate(node);
              }}
            >
              <span className="lac-tree-caret" data-open={expanded || undefined} aria-hidden>
                {hasChildren ? caret : null}
              </span>
              {node.icon && (
                <span className="lac-tree-icon" aria-hidden>
                  {node.icon}
                </span>
              )}
              <span className="lac-tree-label">{node.label}</span>
            </span>
            {hasChildren && expanded && (
              <ul className="lac lac-tree-group" role="group">
                <TreeBranch
                  nodes={children}
                  depth={depth + 1}
                  flat={flat}
                  expandedSet={expandedSet}
                  activeId={activeId}
                  selectedId={selectedId}
                  caret={caret}
                  onToggle={onToggle}
                  onActivate={onActivate}
                  onKeyDown={onKeyDown}
                />
              </ul>
            )}
          </li>
        );
      })}
    </>
  );
}

/**
 * A collapsible nested list — a file tree, a category picker, an org chart.
 *
 * Keyboard support is the ARIA tree pattern in full: Up/Down walk the *visible*
 * rows (`flattenTree` decides what that means), Right opens a branch then steps
 * into it, Left closes it then steps out to the parent, Home/End jump to the
 * ends, Enter and Space select. Only one row is tabbable at a time, so Tab
 * moves past the whole tree instead of through every node in it.
 */
export const Tree = forwardRef<HTMLUListElement, TreeProps>(function Tree(
  {
    nodes,
    label,
    expandedIds,
    defaultExpandedIds = [],
    onExpandedChange,
    selectedId,
    defaultSelectedId = null,
    onSelect,
    caret = "▸",
    indent = "var(--lac-space-4)",
    className,
    style,
    ...rest
  },
  ref,
) {
  const [expanded, setExpanded] = useControllable<string[]>(
    expandedIds,
    defaultExpandedIds,
    onExpandedChange,
  );
  const [selected, setSelected] = useControllable<string | null>(
    selectedId,
    defaultSelectedId,
    undefined,
  );
  const [activeId, setActiveId] = useState<string | undefined>(undefined);

  const rootRef = useRef<HTMLUListElement | null>(null);
  const setRefs = useCallback(
    (node: HTMLUListElement | null) => {
      rootRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as MutableRefObject<HTMLUListElement | null>).current = node;
    },
    [ref],
  );

  const expandedSet: ReadonlySet<string> = new Set(expanded);
  const flat = flattenTree(nodes, expandedSet);
  // The roving tabindex must always land somewhere real, even after the active
  // row is collapsed away or removed from the data.
  const active = activeId !== undefined && flat.some((f) => f.id === activeId) ? activeId : flat[0]?.id;

  const focusIndex = (index: number): void => {
    const root = rootRef.current;
    if (!root) return;
    const rows = Array.from(root.querySelectorAll<HTMLElement>('[role="treeitem"]'));
    const target = rows[clamp(index, 0, rows.length - 1)];
    target?.focus();
  };

  const toggle = (id: string): void => {
    setExpanded(expanded.includes(id) ? expanded.filter((x) => x !== id) : [...expanded, id]);
  };

  const activate = (node: TreeNode): void => {
    if (node.disabled) return;
    setActiveId(node.id);
    setSelected(node.id);
    onSelect?.(node.id, node);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLLIElement>, node: TreeNode): void => {
    // The event bubbles up through ancestor treeitems; only the row it started
    // on should act on it.
    if (event.target !== event.currentTarget) return;

    const here = flat.find((f) => f.id === node.id);
    if (!here) return;
    const move = (index: number): void => {
      const next = flat[clamp(index, 0, flat.length - 1)];
      if (!next) return;
      setActiveId(next.id);
      focusIndex(next.index);
    };

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(here.index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(here.index - 1);
        break;
      case "ArrowRight":
        event.preventDefault();
        if (here.hasChildren && !here.expanded) toggle(node.id);
        else if (here.hasChildren && here.expanded) move(here.index + 1);
        break;
      case "ArrowLeft": {
        event.preventDefault();
        if (here.hasChildren && here.expanded) {
          toggle(node.id);
          break;
        }
        if (here.parentId !== undefined) {
          const parent = flat.find((f) => f.id === here.parentId);
          if (parent) move(parent.index);
        }
        break;
      }
      case "Home":
        event.preventDefault();
        move(0);
        break;
      case "End":
        event.preventDefault();
        move(flat.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (here.hasChildren) toggle(node.id);
        activate(node);
        break;
      default:
        break;
    }
  };

  return (
    <ul
      {...rest}
      ref={setRefs}
      className={classes("lac-tree", className)}
      role="tree"
      aria-label={label}
      style={{
        ["--lac-tree-indent" as string]: typeof indent === "number" ? `${indent}px` : indent,
        ...style,
      }}
    >
      <TreeBranch
        nodes={nodes}
        depth={0}
        flat={flat}
        expandedSet={expandedSet}
        activeId={active}
        selectedId={selected}
        caret={caret}
        onToggle={toggle}
        onActivate={activate}
        onKeyDown={handleKeyDown}
      />
    </ul>
  );
});

/* ==========================================================================
   MetricBar
   ========================================================================== */

export interface MetricItem {
  /** React key. Falls back to the index. */
  id?: string;
  label: ReactNode;
  /** The raw number. Negatives and NaN are treated as 0. */
  value: number;
  /** Extra text after the value — "visits", "of budget". */
  hint?: ReactNode;
  /** Per-row colour, overriding the list's `tone`. */
  tone?: Tone;
}

export interface MetricBarProps extends HTMLAttributes<HTMLDivElement> {
  items: readonly MetricItem[];
  /** Fix the 100% point instead of using the largest row — for a shared scale. */
  max?: number;
  /** Format the number. Default `toLocaleString()`. */
  format?: (value: number) => string;
  /** Show each row's share of the total next to its value. */
  showShare?: boolean;
  /** Default colour for every bar. */
  tone?: Tone;
  size?: Size;
}

/**
 * A labelled breakdown — top referrers, storage by bucket, votes per option.
 *
 * Bars are scaled to the *largest* row so the smallest one is still visible,
 * while the optional percentage is the row's share of the *total*. Both numbers
 * are text, so the list is readable when the CSS has not loaded and copyable
 * into a spreadsheet.
 */
export const MetricBar = forwardRef<HTMLDivElement, MetricBarProps>(function MetricBar(
  { items, max, format, showShare = false, tone = "accent", size = "md", className, ...rest },
  ref,
) {
  const stats = normalizeMetrics(
    items.map((item) => item.value),
    max,
  );
  const render = format ?? ((value: number): string => value.toLocaleString());

  return (
    <div {...rest} ref={ref} className={classes("lac-metric", className)} data-size={size} data-tone={tone}>
      <ul className="lac-metric-list">
        {items.map((item, i) => {
          const stat = stats[i];
          const ratio = stat?.ratio ?? 0;
          const share = stat?.share ?? 0;
          return (
            <li className="lac-metric-row" key={item.id ?? i} data-tone={item.tone}>
              <div className="lac-metric-head">
                <span className="lac-metric-label">{item.label}</span>
                <span className="lac-metric-value">
                  {render(stat?.value ?? 0)}
                  {item.hint && <span className="lac-metric-hint">{item.hint}</span>}
                  {showShare && <span className="lac-metric-share">{`${Math.round(share * 100)}%`}</span>}
                </span>
              </div>
              <div className="lac-metric-track" aria-hidden>
                <div className="lac-metric-bar" style={{ width: `${ratio * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
});
