/**
 * Typography: Text, Heading, Prose, Blockquote, Highlight and Truncate.
 *
 * The type scale lives in CSS variables, so an app restyles every word in the
 * library by redefining `--lac-text-*`. Nothing here measures text or touches
 * the DOM, so all of it renders on the server.
 */
import { forwardRef } from "react";
import type { BlockquoteHTMLAttributes, ElementType, HTMLAttributes, ReactNode } from "react";
import { classes } from "./util.js";

/* ==========================================================================
   Pure helpers
   ========================================================================== */

/**
 * Shorten a string from the middle, keeping both ends.
 *
 * The right tool for ids, hashes and file paths, where the start says *what*
 * and the end says *which* — chopping the tail off `…/src/components/index.ts`
 * throws away the only part that identifies it.
 *
 * The result is never longer than `max`, and never longer than the input: a
 * string that already fits is returned untouched rather than padded.
 */
export function truncateMiddle(text: string, max = 32, ellipsis = "…"): string {
  if (typeof text !== "string" || text === "") return "";
  if (!Number.isFinite(max)) return text;
  if (max <= 0) return "";
  if (text.length <= max) return text;
  // No room for both ends plus the marker — fall back to a plain head cut,
  // still respecting `max`.
  if (max <= ellipsis.length) return text.slice(0, max);

  const keep = max - ellipsis.length;
  const head = Math.ceil(keep / 2);
  const tail = keep - head;
  if (tail <= 0) return text.slice(0, head) + ellipsis;
  return text.slice(0, head) + ellipsis + text.slice(text.length - tail);
}

/** One run of text, flagged as matching the query or not. */
export interface HighlightPart {
  text: string;
  match: boolean;
}

/**
 * Split text into matching and non-matching runs for {@link Highlight}.
 *
 * Case-insensitive by default and implemented with `indexOf` rather than a
 * `RegExp`, which means a query full of `.`, `*`, `(` or `\` is matched
 * literally instead of blowing up or matching the wrong thing — search boxes
 * receive exactly that sort of input.
 *
 * Matches never overlap: the scan resumes after each hit, so a query of `"aa"`
 * in `"aaaa"` yields two matches, not three.
 *
 * Concatenating every returned `text` always reproduces the input exactly, so
 * rendering the parts can never corrupt what the user sees.
 */
export function splitHighlight(text: string, query: string, caseSensitive = false): HighlightPart[] {
  if (typeof text !== "string" || text === "") return [];
  const needleRaw = typeof query === "string" ? query.trim() : "";
  if (needleRaw === "") return [{ text, match: false }];

  let haystack = text;
  let needle = needleRaw;
  if (!caseSensitive) {
    const loweredHay = text.toLowerCase();
    const loweredNeedle = needleRaw.toLowerCase();
    // Some code points change length when lower-cased (Turkish dotted I, for
    // one). Index maths against a different-length string would slice the
    // original in the wrong places, so in that rare case stay case-sensitive.
    if (loweredHay.length === text.length && loweredNeedle.length === needleRaw.length) {
      haystack = loweredHay;
      needle = loweredNeedle;
    }
  }

  const parts: HighlightPart[] = [];
  let cursor = 0;
  while (cursor <= haystack.length - needle.length) {
    const at = haystack.indexOf(needle, cursor);
    if (at === -1) break;
    if (at > cursor) parts.push({ text: text.slice(cursor, at), match: false });
    parts.push({ text: text.slice(at, at + needle.length), match: true });
    cursor = at + needle.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  if (parts.length === 0) parts.push({ text, match: false });
  return parts;
}

/* ==========================================================================
   Text
   ========================================================================== */

/** Steps of the shared type scale. */
export type TextSize = "xs" | "sm" | "md" | "lg" | "xl";

/** Text colours, all drawn from the theme rather than from raw values. */
export type TextTone =
  | "default"
  | "muted"
  | "faint"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "inherit";

/** Named weights, so a design tweak is one variable and not a find-replace. */
export type TextWeight = "regular" | "medium" | "semibold" | "bold";

export interface TextProps extends HTMLAttributes<HTMLElement> {
  /**
   * Element to render. `span` by default — pass `"p"`, `"label"`, `"div"` or
   * your own component when the semantics matter, which they usually do.
   */
  as?: ElementType;
  size?: TextSize;
  tone?: TextTone;
  weight?: TextWeight;
  align?: "start" | "center" | "end" | "justify";
  /** Clip to one line with an ellipsis. Ignored when `lines` is set. */
  truncate?: boolean;
  /** Clamp to this many lines with an ellipsis on the last one. */
  lines?: number;
  /** Tabular monospace — use it for ids, amounts and anything in a column. */
  mono?: boolean;
  italic?: boolean;
  /** Line-through, for a removed or superseded value. */
  strike?: boolean;
  /** Uppercase with letter-spacing, for small eyebrow labels. */
  caps?: boolean;
}

/**
 * Body text with the library's scale, tones and weights.
 *
 * Truncation sets `title` to nothing on purpose: only the caller knows whether
 * the full string is worth a tooltip, and a wrong one is worse than none. Use
 * {@link Truncate} when you want the full value preserved for hover and for
 * assistive tech.
 */
export const Text = forwardRef<HTMLElement, TextProps>(function Text(
  {
    as = "span",
    size = "md",
    tone = "default",
    weight = "regular",
    align,
    truncate = false,
    lines,
    mono = false,
    italic = false,
    strike = false,
    caps = false,
    className,
    style,
    ...rest
  },
  ref,
) {
  const Tag: ElementType = as;
  const clamped = typeof lines === "number" && Number.isFinite(lines) && lines >= 1;
  const merged =
    clamped
      ? ({ "--lac-text-lines": String(Math.floor(lines as number)), ...style } as typeof style)
      : style;

  return (
    <Tag
      {...rest}
      ref={ref}
      className={classes("lac-text", className)}
      data-size={size}
      data-tone={tone}
      data-weight={weight}
      data-align={align}
      data-truncate={(!clamped && truncate) || undefined}
      data-clamp={clamped || undefined}
      data-mono={mono || undefined}
      data-italic={italic || undefined}
      data-strike={strike || undefined}
      data-caps={caps || undefined}
      style={merged}
    />
  );
});

/* ==========================================================================
   Heading
   ========================================================================== */

/** Heading levels, used both for the tag and for the visual scale. */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  /**
   * Semantic level — this is the tag that is rendered. Pick it from the
   * document outline, never from how big you want the text to be.
   */
  level?: HeadingLevel;
  /**
   * Visual size. Defaults to `level`. Set it when the outline and the design
   * disagree: a page section that must be an `<h3>` for screen readers can
   * still look like an `<h2>` with `level={3} size={2}`.
   */
  size?: HeadingLevel | "display";
  tone?: TextTone;
  weight?: TextWeight;
  align?: "start" | "center" | "end";
  /** Clamp to this many lines. */
  lines?: number;
  /** Balance the line lengths, so a two-line title does not leave one word. */
  balance?: boolean;
}

/**
 * A heading whose tag and whose size are two separate decisions.
 *
 * Coupling them is how documents end up with an `<h4>` before an `<h2>` — the
 * single most common accessibility defect in a marketing page.
 */
export const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(function Heading(
  { level = 2, size, tone = "default", weight = "bold", align, lines, balance = true, className, style, ...rest },
  ref,
) {
  const Tag: ElementType = `h${level}`;
  const clamped = typeof lines === "number" && Number.isFinite(lines) && lines >= 1;
  const merged =
    clamped
      ? ({ "--lac-text-lines": String(Math.floor(lines as number)), ...style } as typeof style)
      : style;

  return (
    <Tag
      {...rest}
      ref={ref}
      className={classes("lac-heading", className)}
      data-size={String(size ?? level)}
      data-tone={tone}
      data-weight={weight}
      data-align={align}
      data-clamp={clamped || undefined}
      data-balance={balance || undefined}
      style={merged}
    />
  );
});

/* ==========================================================================
   Prose
   ========================================================================== */

export interface ProseProps extends HTMLAttributes<HTMLDivElement> {
  /** Type size of the body copy. Default `md`. */
  size?: "sm" | "md" | "lg";
  /**
   * Constrain the line length to a comfortable reading measure. On by default
   * — long lines are the fastest way to make good writing unreadable.
   */
  measure?: boolean;
}

/**
 * Styles raw markup you did not author: rendered Markdown, a CMS field, an
 * email body.
 *
 * Headings, paragraphs, lists, links, `code`, `pre`, tables, blockquotes,
 * images and rules all get the library's tokens without a single class name
 * being added to the HTML — which is the only option when the HTML arrives as
 * a string. Pass it through `dangerouslySetInnerHTML` (after sanitising it) or
 * render your Markdown component inside.
 */
export const Prose = forwardRef<HTMLDivElement, ProseProps>(function Prose(
  { size = "md", measure = true, className, ...rest },
  ref,
) {
  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-prose", className)}
      data-size={size}
      data-measure={measure || undefined}
    />
  );
});

/* ==========================================================================
   Blockquote, Highlight, Truncate
   ========================================================================== */

export interface BlockquoteProps extends BlockquoteHTMLAttributes<HTMLQuoteElement> {
  /** Who said it. Rendered in a `<footer>`/`<cite>` pair, as HTML intends. */
  attribution?: ReactNode;
  /** Extra line under the attribution — a role, a company, a date. */
  meta?: ReactNode;
  /** Larger, lighter treatment for a pull quote. */
  variant?: "default" | "pull";
  /** Tint the rule and the marks with an intent colour. */
  tone?: "default" | "accent" | "success" | "warning" | "danger" | "info";
}

/** A quotation with its attribution marked up properly. */
export const Blockquote = forwardRef<HTMLQuoteElement, BlockquoteProps>(function Blockquote(
  { attribution, meta, variant = "default", tone = "default", className, children, ...rest },
  ref,
) {
  return (
    <blockquote
      {...rest}
      ref={ref}
      className={classes("lac-quote", className)}
      data-variant={variant}
      data-tone={tone}
    >
      <div className="lac lac-quote-body">{children}</div>
      {(attribution || meta) && (
        <footer className="lac lac-quote-foot">
          {attribution && <cite className="lac-quote-cite">{attribution}</cite>}
          {meta && <span className="lac-quote-meta">{meta}</span>}
        </footer>
      )}
    </blockquote>
  );
});

export interface HighlightProps extends HTMLAttributes<HTMLSpanElement> {
  /** The full text to render. */
  text: string;
  /** The substring to mark. Empty or whitespace-only marks nothing. */
  query: string;
  /** Match case exactly. Off by default, which is what a search box wants. */
  caseSensitive?: boolean;
  /** Colour of the marks. */
  tone?: "accent" | "warning" | "success";
}

/**
 * Marks every occurrence of `query` inside `text` — search results, filter
 * previews, command palettes.
 *
 * Real `<mark>` elements are used rather than styled spans, so the emphasis
 * survives a copy-paste and is announced by assistive tech. The text is taken
 * as a prop rather than as children because the whole string has to be known
 * to be split; that also makes it impossible to inject markup here.
 */
export const Highlight = forwardRef<HTMLSpanElement, HighlightProps>(function Highlight(
  { text, query, caseSensitive = false, tone = "accent", className, ...rest },
  ref,
) {
  const parts = splitHighlight(text, query, caseSensitive);

  return (
    <span {...rest} ref={ref} className={classes("lac-highlight", className)} data-tone={tone}>
      {parts.map((part, index) =>
        part.match ? (
          <mark key={`m${index}`} className="lac-mark">
            {part.text}
          </mark>
        ) : (
          <span key={`t${index}`}>{part.text}</span>
        ),
      )}
    </span>
  );
});

export interface TruncateProps extends HTMLAttributes<HTMLSpanElement> {
  /** The full string. Kept intact for the tooltip and for assistive tech. */
  text: string;
  /** Longest rendered length, including the ellipsis. Default `32`. */
  max?: number;
  /** Marker placed in the gap. Default `…`. */
  ellipsis?: string;
  /** Render in the monospace face. On by default — this is for ids and paths. */
  mono?: boolean;
}

/**
 * Middle-ellipsis truncation for ids, hashes, URLs and file paths.
 *
 * CSS `text-overflow` can only cut the end, which for these values destroys
 * the informative half. The full string stays available as the `title` and as
 * the accessible name, so nothing is actually lost.
 */
export const Truncate = forwardRef<HTMLSpanElement, TruncateProps>(function Truncate(
  { text, max = 32, ellipsis = "…", mono = true, className, title, ...rest },
  ref,
) {
  const short = truncateMiddle(text, max, ellipsis);
  const shortened = short !== text;

  return (
    <span
      {...rest}
      ref={ref}
      className={classes("lac-truncate", className)}
      data-mono={mono || undefined}
      title={title ?? (shortened ? text : undefined)}
      aria-label={shortened ? text : undefined}
    >
      {short}
    </span>
  );
});
