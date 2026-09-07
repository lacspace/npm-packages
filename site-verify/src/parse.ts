/**
 * Parse existing verification `<meta>` tags out of an HTML `<head>` back into a
 * provider→token record — the inverse of {@link allVerifications}.
 *
 * Zero dependencies · isomorphic · fully typed.
 */
import { VERIFICATION_PROVIDERS, type VerificationRecord } from "./index";

let nameToId: Record<string, string> | undefined;
function idFor(name: string): string | undefined {
  if (!nameToId) {
    nameToId = Object.fromEntries(
      Object.entries(VERIFICATION_PROVIDERS).map(([id, metaName]) => [metaName, id]),
    );
  }
  return nameToId[name];
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function attr(tag: string, key: string): string | undefined {
  const re = new RegExp(`\\b${key}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = tag.match(re);
  if (!m) return undefined;
  const raw = m[2] ?? m[3] ?? m[4] ?? "";
  return unescapeHtml(raw);
}

/**
 * Parse verification `<meta>` tags from an HTML string into a loose record.
 * Known meta `name`s resolve back to their provider id (so the result round-trips
 * with {@link allVerifications}); other verification-looking tags are kept under
 * their raw meta `name`. Non-verification meta tags are ignored.
 *
 * @example parseVerificationMeta('<meta name="google-site-verification" content="abc">')
 * // { google: "abc" }
 */
export function parseVerificationMeta(html: string): VerificationRecord {
  const out: VerificationRecord = {};
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const name = attr(tag, "name") ?? attr(tag, "property");
    const content = attr(tag, "content");
    if (!name || content == null) continue;
    const id = idFor(name);
    if (id) {
      out[id] = content;
    } else if (/verif|verify|msvalidate|validate|domain_verify/i.test(name)) {
      out[name] = content;
    }
  }
  return out;
}
