/**
 * Pure link builders. Turn a repo URL into a compare link, and "linkify" free
 * text — replacing `#123` issue references and bare commit SHAs with markdown
 * links — given URL templates. No network, no git: everything here is string
 * work, so it is fully unit-testable.
 */
import type { UrlTemplates } from "./repo.js";
import { parseRepository, urlTemplates } from "./repo.js";

/**
 * Build a `from...to` compare link for a repository, straight from a repo URL
 * string (as found in package.json or passed on the CLI). Returns "" when the
 * repo can't be parsed to a known host.
 */
export function buildCompareLink(
  repoUrl: string | null | undefined,
  from: string,
  to: string,
): string {
  const urls = urlTemplates(parseRepository(repoUrl));
  return urls.compare(from, to);
}

// `#123` not preceded by a word char / backtick / an existing markdown bracket
// (so it isn't part of an anchor or an already-linked `[#123]`), number captured.
const ISSUE_RE = /(^|[^\w`\]\[])#(\d+)\b/g;
// A bare lowercase hex sha, 7-40 chars, on a word boundary and NOT already the
// text of a markdown link.
const SHA_RE = /\b([0-9a-f]{7,40})\b/g;

/**
 * Linkify `#123` issue/PR references in `text` using `urls.issue`. Already
 * bracketed references (`[#123](…)`) are left untouched. Returns the text
 * unchanged when the templates have no base URL.
 */
export function linkifyIssues(text: string, urls: UrlTemplates): string {
  if (!urls.baseUrl) return text;
  return text.replace(ISSUE_RE, (_m, pre: string, num: string) => {
    return `${pre}[#${num}](${urls.issue(num)})`;
  });
}

/**
 * Linkify bare commit SHAs in `text` using `urls.commit`, shortening the
 * display text to 7 chars. Skips anything already inside a markdown link.
 * Returns the text unchanged when the templates have no base URL.
 */
export function linkifyShas(text: string, urls: UrlTemplates): string {
  if (!urls.baseUrl) return text;
  return text.replace(SHA_RE, (m, sha: string, offset: number, whole: string) => {
    // Don't touch a sha that's already inside a (…) link target or […] label.
    const before = whole.slice(Math.max(0, offset - 1), offset);
    const after = whole.slice(offset + sha.length, offset + sha.length + 1);
    if (before === "(" || before === "/" || after === ")") return m;
    // Require it to look like a hash, not a plain decimal-ish word.
    if (!/[a-f]/.test(sha)) return m;
    const short = sha.slice(0, 7);
    return `[${short}](${urls.commit(sha)})`;
  });
}

/**
 * Linkify both issue references and commit SHAs in `text`. Convenience wrapper
 * over {@link linkifyIssues} + {@link linkifyShas}.
 */
export function linkifyRefs(text: string, urls: UrlTemplates): string {
  return linkifyShas(linkifyIssues(text, urls), urls);
}
