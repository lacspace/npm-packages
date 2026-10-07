import { decodeEntities, escapeAttr, escapeText } from "./entities";
import { RAW_TEXT, tokenize } from "./tokenizer";
import { isDroppedWithContent } from "./sanitize";
import { sanitizeHref } from "./url";

export interface HtmlToTextOptions {
  /** Truncate the result to this many characters (an ellipsis is appended). */
  maxLength?: number;
  /** "inline" (default) appends " (url)" after link text that differs from the URL. */
  linkStyle?: "inline" | "none";
}

const BLOCK_1 = new Set([
  "div", "tr", "li", "dt", "dd", "section", "article", "header", "footer", "nav", "aside", "main",
  "figure", "figcaption", "address", "center", "caption", "form", "fieldset", "details", "summary",
]);
const BLOCK_2 = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "table", "ul", "ol", "dl"]);

function bareUrl(u: string): string {
  return u.replace(/^(?:mailto:|tel:|https?:\/\/)/i, "").replace(/^www\./i, "").replace(/\/$/, "").toLowerCase();
}

function truncate(s: string, max: number | undefined): string {
  if (max === undefined || s.length <= max) return s;
  if (max <= 1) return s.slice(0, Math.max(0, max));
  return s.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Plain text from email HTML, for previews, snippets, search indexes and
 * text/plain fallbacks. Head, style, script and other hidden content is
 * dropped; blocks become newlines; list items get "- "; links become
 * "text (url)" when the text differs from the URL; entities are decoded and
 * whitespace collapsed.
 */
export function htmlToText(html: string, opts: HtmlToTextOptions = {}): string {
  const inline = opts.linkStyle !== "none";
  const parts: string[] = [];
  let skip: { tag: string; depth: number } | null = null;
  let headDepth = 0;
  let pre = 0;
  const linkStack: { href: string | null; start: number }[] = [];
  // Pending line breaks: block boundaries take the max, <br> adds.
  let pending = 0;
  const brk = (n: number) => {
    pending = Math.max(pending, n);
  };
  const emit = (t: string) => {
    if (!t) return;
    if (!pre && !t.trim()) {
      if (!pending) parts.push(" ");
      return;
    }
    if (pending) {
      if (parts.length) parts.push("\n".repeat(pending));
      pending = 0;
    }
    parts.push(t);
  };

  tokenize(typeof html === "string" ? html : String(html ?? ""), {
    text(raw) {
      if (skip || headDepth) return;
      const t = decodeEntities(raw).replace(/ /g, " ");
      emit(pre ? t : t.replace(/\s+/g, " "));
    },
    comment() {},
    rawText() {},
    start(tag, attrs, selfClosing) {
      if (skip) {
        if (tag === skip.tag && !selfClosing) skip.depth++;
        return;
      }
      if (tag === "head") {
        headDepth = 1;
        return;
      }
      if (tag === "body") {
        headDepth = 0;
        return;
      }
      if (headDepth) return;
      if (isDroppedWithContent(tag)) {
        if (!selfClosing && !RAW_TEXT.has(tag) && tag !== "plaintext") {
          skip = { tag, depth: 1 };
        }
        return;
      }
      if (tag === "br") {
        if (parts.length) pending++;
      } else if (tag === "hr") brk(2);
      else if (tag === "li") {
        brk(1);
        emit("- ");
      } else if (tag === "td" || tag === "th") emit(" ");
      else if (BLOCK_2.has(tag)) brk(2);
      else if (BLOCK_1.has(tag)) brk(1);
      if (tag === "pre") pre++;
      if (tag === "a") {
        const raw = attrs.find((a) => a.name === "href");
        const h = raw ? sanitizeHref(decodeEntities(raw.value, true)) : null;
        linkStack.push({ href: h && h.kind === "url" ? h.url : null, start: parts.length });
      }
    },
    end(tag) {
      if (skip) {
        if (tag === skip.tag && --skip.depth === 0) skip = null;
        return;
      }
      if (tag === "head") {
        headDepth = 0;
        return;
      }
      if (headDepth) return;
      if (tag === "pre" && pre > 0) pre--;
      if (tag === "a") {
        const l = linkStack.pop();
        if (l && l.href && inline) {
          const text = parts.slice(l.start).join("").replace(/\s+/g, " ").trim();
          if (text && bareUrl(text) !== bareUrl(l.href)) emit(" (" + l.href.replace(/^mailto:/i, "") + ")");
        }
      } else if (BLOCK_2.has(tag)) brk(2);
      else if (BLOCK_1.has(tag)) brk(1);
      else if (tag === "br" && parts.length) pending++;
    },
  });

  const text = parts
    .join("")
    .split("\n")
    .map((l) => l.replace(/[ \t\f\v\r]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return truncate(text, opts.maxLength);
}

export interface TextToHtmlOptions {
  /** Turn URLs, www. hosts, mailto: and email addresses into links. Default true. */
  linkify?: boolean;
  /** `target` for links. Default "_blank"; "" omits it. */
  linkTarget?: string;
}

const URL_START = /https?:\/\/|www\.|mailto:/i;
const EMAIL_RE = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}$/;
const LEAD_PUNCT = /^[(<\[{"'«“‘]+/;
const MAX_WORD = 2048;

function trimTrail(url: string): [string, string] {
  let end = url.length;
  for (;;) {
    if (end === 0) break;
    const c = url[end - 1]!;
    if (".,;:!?'\"»”’>".includes(c)) {
      end--;
      continue;
    }
    const pair: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
    if (pair[c]) {
      const body = url.slice(0, end);
      const opens = body.split(pair[c]!).length - 1;
      const closes = body.split(c).length - 1;
      if (closes > opens) {
        end--;
        continue;
      }
    }
    break;
  }
  return [url.slice(0, end), url.slice(end)];
}

function linkHtml(href: string, text: string, target: string): string {
  return (
    '<a href="' + escapeAttr(href) + '" rel="noopener noreferrer nofollow"' +
    (target ? ' target="' + escapeAttr(target) + '"' : "") + ">" + escapeText(text) + "</a>"
  );
}

function linkifyWord(word: string, target: string): string {
  if (word.length > MAX_WORD) return escapeText(word);
  const m = URL_START.exec(word);
  if (m) {
    const before = word.slice(0, m.index);
    const [url, after] = trimTrail(word.slice(m.index));
    const lower = url.toLowerCase();
    let href = url;
    if (lower.startsWith("www.")) href = "https://" + url;
    const ok =
      (lower.startsWith("mailto:") && url.length > 7) ||
      (/^https?:\/\/[^/?#\s]+/i.test(href) && !/^https?:\/\/$/i.test(href)) ;
    if (ok && url.length > 4 && sanitizeHref(href)) return escapeText(before) + linkHtml(href, url, target) + escapeText(after);
    return escapeText(word);
  }
  if (word.indexOf("@") !== -1) {
    const lead = LEAD_PUNCT.exec(word)?.[0] ?? "";
    const [core, tail] = trimTrail(word.slice(lead.length));
    if (EMAIL_RE.test(core)) return escapeText(lead) + linkHtml("mailto:" + core, core, target) + escapeText(tail);
  }
  return escapeText(word);
}

function lineHtml(line: string, linkify: boolean, target: string): string {
  let out = "";
  // Split into whitespace and non-whitespace runs (linear).
  const re = /(\s+)|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m[1]) out += m[1].replace(/ {2}/g, " &nbsp;").replace(/\t/g, " &nbsp; &nbsp;");
    else out += linkify ? linkifyWord(m[2]!, target) : escapeText(m[2]!);
  }
  return out;
}

/**
 * Plain-text email body → safe HTML: escaped, newlines as `<br>`, URLs/emails
 * linkified with `rel` and `target`, and ">"-quoted lines grouped into
 * (nested) `<blockquote>` elements.
 */
export function textToHtml(text: string, opts: TextToHtmlOptions = {}): string {
  const linkify = opts.linkify !== false;
  const target = opts.linkTarget ?? "_blank";
  const lines = (typeof text === "string" ? text : String(text ?? "")).replace(/\r\n?/g, "\n").split("\n");
  let out = "";
  let level = 0;
  let first = true;
  for (const raw of lines) {
    let i = 0;
    let q = 0;
    while (i < raw.length && raw[i] === ">") {
      q++;
      i++;
      if (raw[i] === " ") i++;
    }
    const body = q ? raw.slice(i) : raw;
    if (q !== level) {
      while (level < q) {
        out += "<blockquote>";
        level++;
      }
      while (level > q) {
        out += "</blockquote>";
        level--;
      }
      first = true;
    }
    if (!first) out += "<br>";
    out += lineHtml(body, linkify, target);
    first = false;
  }
  while (level > 0) {
    out += "</blockquote>";
    level--;
  }
  return out;
}

/**
 * A one-line preview of an HTML or plain-text body, cut at a word boundary
 * near `n` characters.
 */
export function snippet(input: string, n = 140): string {
  const s = typeof input === "string" ? input : String(input ?? "");
  const text = /<\/?[a-zA-Z!]/.test(s) ? htmlToText(s, { linkStyle: "none" }) : decodeEntities(s);
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= n) return flat;
  const cut = flat.slice(0, n);
  const sp = cut.lastIndexOf(" ");
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + "…";
}
