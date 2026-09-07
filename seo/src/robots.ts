/**
 * Robots meta directives — a typed builder for the fine-grained crawler
 * directives that go beyond plain `index`/`follow` (noarchive, nosnippet,
 * max-snippet, max-image-preview, max-video-preview, unavailable_after …).
 *
 * {@link robotsContent} renders the `<meta name="robots">` content string;
 * {@link robots} renders a Next.js `Metadata.robots`-shaped object (with a
 * `googleBot` block for the numeric limits). Zero-dependency & isomorphic.
 */

export interface RobotsDirectives {
  /** Allow indexing (`index`) or block it (`noindex`). Omit to leave unset. */
  index?: boolean;
  /** Follow links (`follow`) or not (`nofollow`). Omit to leave unset. */
  follow?: boolean;
  /** Don't show a cached copy of the page in results. */
  noarchive?: boolean;
  /** Don't show a text snippet or video preview in results. */
  nosnippet?: boolean;
  /** Don't index images on the page. */
  noimageindex?: boolean;
  /** Don't offer translation of this page in results. */
  notranslate?: boolean;
  /** Max characters of a text snippet (`-1` = no limit, `0` = none). */
  maxSnippet?: number;
  /** Max size of an image preview in results. */
  maxImagePreview?: "none" | "standard" | "large";
  /** Max seconds of a video preview (`-1` = no limit, `0` = static image). */
  maxVideoPreview?: number;
  /** Date/time after which the page may be dropped from results (ISO or RFC-822). */
  unavailableAfter?: string;
}

const flag = (v: boolean | undefined, on: string, off: string): string | undefined =>
  v === undefined ? undefined : v ? on : off;

/**
 * Build a `<meta name="robots">` content string from typed directives.
 * @example robotsContent({ index: false, follow: true, maxImagePreview: "large" })
 * // → "noindex, follow, max-image-preview:large"
 */
export function robotsContent(d: RobotsDirectives): string {
  const tokens: (string | undefined)[] = [
    flag(d.index, "index", "noindex"),
    flag(d.follow, "follow", "nofollow"),
    d.noarchive ? "noarchive" : undefined,
    d.nosnippet ? "nosnippet" : undefined,
    d.noimageindex ? "noimageindex" : undefined,
    d.notranslate ? "notranslate" : undefined,
    d.maxSnippet !== undefined ? `max-snippet:${d.maxSnippet}` : undefined,
    d.maxImagePreview ? `max-image-preview:${d.maxImagePreview}` : undefined,
    d.maxVideoPreview !== undefined ? `max-video-preview:${d.maxVideoPreview}` : undefined,
    d.unavailableAfter ? `unavailable_after: ${d.unavailableAfter}` : undefined,
  ];
  return tokens.filter(Boolean).join(", ");
}

export interface RobotsMetaGoogleBot {
  index?: boolean;
  follow?: boolean;
  noimageindex?: boolean;
  "max-snippet"?: number;
  "max-image-preview"?: "none" | "standard" | "large";
  "max-video-preview"?: number;
}

export interface RobotsMeta {
  index: boolean;
  follow: boolean;
  noarchive?: boolean;
  nosnippet?: boolean;
  notranslate?: boolean;
  googleBot?: RobotsMetaGoogleBot;
}

/**
 * Build a Next.js `Metadata.robots`-shaped object from typed directives.
 * `index`/`follow` default to `true`; the numeric/preview limits land under
 * `googleBot`. Assign it to `metadata.robots`.
 * @example robots({ index: true, follow: true, maxSnippet: -1, maxImagePreview: "large" })
 */
export function robots(d: RobotsDirectives): RobotsMeta {
  const gb: RobotsMetaGoogleBot = {};
  if (d.noimageindex !== undefined) gb.noimageindex = d.noimageindex;
  if (d.maxSnippet !== undefined) gb["max-snippet"] = d.maxSnippet;
  if (d.maxImagePreview !== undefined) gb["max-image-preview"] = d.maxImagePreview;
  if (d.maxVideoPreview !== undefined) gb["max-video-preview"] = d.maxVideoPreview;

  const out: RobotsMeta = { index: d.index ?? true, follow: d.follow ?? true };
  if (d.noarchive) out.noarchive = true;
  if (d.nosnippet) out.nosnippet = true;
  if (d.notranslate) out.notranslate = true;
  if (Object.keys(gb).length) out.googleBot = gb;
  return out;
}
