/**
 * @lacspace/mail-sanitize: isomorphic email-HTML sanitizer for webmail.
 * Zero dependencies, no DOM, runs in Node 18+, edge runtimes and browsers.
 */
export {
  sanitizeEmailHtml,
  ALLOWED_TAGS,
  DATA_SRC_ATTR,
  DATA_BACKGROUND_ATTR,
  PLACEHOLDER_GIF,
  type SanitizeOptions,
  type SanitizeResult,
} from "./sanitize";
export { htmlToText, textToHtml, snippet, type HtmlToTextOptions, type TextToHtmlOptions } from "./text";
export { isTrackerUrl, TRACKER_HOSTS, TRACKER_PATHS } from "./url";
export { decodeEntities, escapeText, escapeAttr } from "./entities";
