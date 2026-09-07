/**
 * Batch verification — one provider→token map → every artefact at once:
 * the meta-tag array, a combined HTML string, and the Next.js
 * `metadata.verification`-shaped object.
 *
 * Zero dependencies · isomorphic · fully typed.
 */
import {
  allVerifications,
  nextVerification,
  type MetaTag,
  type NextVerification,
  type VerificationRecord,
} from "./index";

/** Everything you need from a single provider→token map. */
export interface VerificationBundle {
  /** `<meta>` tag descriptors. */
  meta: MetaTag[];
  /** The same tags rendered as an HTML string. */
  html: string;
  /** The Next.js `metadata.verification`-shaped object. */
  next: NextVerification;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Emit every verification artefact for a loose provider→token record at once.
 *
 * @example verificationBatch({ google: "abc", bing: "xyz", yandex: "y1" })
 * // {
 * //   meta: [{ name: "google-site-verification", content: "abc" }, …],
 * //   html: '<meta name="google-site-verification" content="abc" />\n…',
 * //   next: { google: "abc", yandex: "y1", other: { "msvalidate.01": "xyz" } },
 * // }
 */
export function verificationBatch(record: VerificationRecord): VerificationBundle {
  const meta = allVerifications(record);
  const html = meta
    .map((t) => `<meta name="${esc(t.name)}" content="${esc(t.content)}" />`)
    .join("\n");
  const next = nextVerification(record);
  return { meta, html, next };
}
