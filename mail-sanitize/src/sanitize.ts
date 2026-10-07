import { decodeEntities, escapeAttr, escapeText } from "./entities";
import { tokenize, type Attr } from "./tokenizer";
import {
  MAX_URL_LENGTH,
  isRemote,
  isTrackerUrl,
  normalizeUrl,
  safeDataImage,
  sanitizeHref,
  schemeOf,
} from "./url";
import {
  collectKeyframes,
  readDeclarations,
  sanitizeDeclarations,
  sanitizeStylesheet,
  type CssContext,
} from "./css";

/** Attribute that carries the original URL of a blocked remote image. */
export const DATA_SRC_ATTR = "data-lac-src";
/** Attribute that carries the original URL of a blocked `background=` image. */
export const DATA_BACKGROUND_ATTR = "data-lac-background";
/** Default placeholder: a 1×1 transparent GIF. */
export const PLACEHOLDER_GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export interface SanitizeOptions {
  /** Replace remote images and CSS url()s with placeholders. Default true. */
  blockRemoteContent?: boolean;
  /** Content-ID → URL the app serves (keys without `<>` or `cid:`). */
  cidMap?: Record<string, string>;
  /** Selector every `<style>` rule is scoped under. Default ".mail-body". */
  scope?: string;
  /** `target` for external links. Default "_blank"; "" omits it. */
  linkTarget?: string;
  /** Keep base64 raster data: images (png/jpeg/gif/webp/bmp, never SVG). Default true. */
  allowDataImages?: boolean;
  /** Largest data: URI kept, in characters. Default 2 MB. */
  maxDataUriBytes?: number;
  /** Image used in place of blocked/missing images. Default a 1×1 transparent GIF. */
  placeholderSrc?: string;
  /** When remote content is allowed, rewrite remote URLs (e.g. through an image proxy). */
  proxyUrl?: (url: string) => string;
  /** Prefix for message ids, names, classes and keyframes (DOM-clobbering / app-CSS guard). Default "m-". */
  prefix?: string;
  /** Extra tracker hosts (matched with subdomains). */
  trackerHosts?: string[];
  /** Deepest element nesting kept; deeper start tags are flattened. Default 100. */
  maxDepth?: number;
  /** Input characters processed; the rest is ignored. Default unlimited. */
  maxLength?: number;
}

export interface SanitizeResult {
  html: string;
  /** Remote resources replaced by placeholders (images, backgrounds, CSS url()s). */
  blockedCount: number;
  /** The message references remote (http/https) resources other than trackers. */
  hasRemoteContent: boolean;
  /** Unique remote resource URLs (original form), excluding trackers. */
  remoteUrls: string[];
  /** Unique tracking-pixel URLs that were removed. */
  trackers: string[];
  /** Count of removed elements by tag name ("#comment" for comments). */
  removedTags: Record<string, number>;
  /** Kept links, in order. */
  links: { href: string; text: string }[];
}

export const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  "a", "abbr", "acronym", "address", "article", "aside", "b", "bdi", "bdo", "big", "blockquote", "br",
  "caption", "center", "cite", "code", "col", "colgroup", "dd", "del", "details", "dfn", "div", "dl",
  "dt", "em", "figcaption", "figure", "font", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header",
  "hr", "i", "img", "ins", "kbd", "li", "main", "mark", "nav", "ol", "p", "picture", "pre", "q", "s",
  "samp", "section", "small", "span", "strike", "strong", "sub", "summary", "sup", "table", "tbody",
  "td", "tfoot", "th", "thead", "time", "tr", "tt", "u", "ul", "var", "wbr",
]);

const VOID = new Set(["br", "hr", "img", "col", "wbr"]);

/** Removed together with everything inside them. */
const DROP_WITH_CONTENT = new Set([
  "svg", "math", "object", "applet", "video", "audio", "select", "datalist", "frameset", "map",
  "canvas", "template", "xml", "option", "optgroup",
]);
/** Raw-text elements whose content is discarded. */
const RAW_DROP = new Set(["script", "title", "textarea", "iframe", "noscript", "noembed", "noframes", "xmp", "plaintext"]);
/** Structural wrappers removed silently. */
const STRUCTURAL = new Set(["html", "head", "body"]);

const COMMON_ATTRS = new Set([
  "title", "dir", "lang", "class", "style", "id", "align", "valign", "width", "height", "bgcolor",
  "background", "color", "border",
]);
const TAG_ATTRS: Record<string, string[]> = {
  a: ["href", "name"],
  img: ["src", "alt", "hspace", "vspace"],
  font: ["face", "size"],
  table: ["cellpadding", "cellspacing", "summary", "frame", "rules"],
  td: ["colspan", "rowspan", "nowrap", "scope", "abbr"],
  th: ["colspan", "rowspan", "nowrap", "scope", "abbr"],
  ol: ["start", "type", "reversed"],
  ul: ["type"],
  li: ["value", "type"],
  col: ["span"],
  colgroup: ["span"],
  hr: ["size", "noshade"],
  time: ["datetime"],
  del: ["datetime"],
  ins: ["datetime"],
  details: ["open"],
};

const LENGTH_RE = /^\d{1,5}(?:\.\d{1,3})?(?:%|px)?$/i;
const INT_RE = /^[+-]?\d{1,4}$/;
const COLOR_RE = /^#?[a-zA-Z0-9]{1,20}$/;
const WORD_RE = /^[a-zA-Z-]{1,20}$/;

/** A start tag of `tag` implicitly closes the nearest open `target` element (and everything above it), unless a boundary comes first. */
const IMPLIED: Record<string, { target: Set<string>; boundary: Set<string> }> = {};
{
  const tableB = new Set(["table", "td", "th", "caption"]);
  const blockClosesP = [
    "address", "article", "aside", "blockquote", "center", "details", "div", "dl", "figcaption",
    "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "main", "nav", "ol", "p",
    "pre", "section", "summary", "table", "ul",
  ];
  for (const t of blockClosesP) IMPLIED[t] = { target: new Set(["p"]), boundary: tableB };
  IMPLIED.li = { target: new Set(["li"]), boundary: new Set(["ul", "ol", "table", "td", "th"]) };
  IMPLIED.dt = { target: new Set(["dt", "dd"]), boundary: new Set(["dl", "table", "td", "th"]) };
  IMPLIED.dd = IMPLIED.dt;
  IMPLIED.tr = { target: new Set(["tr"]), boundary: new Set(["table", "thead", "tbody", "tfoot"]) };
  IMPLIED.td = { target: new Set(["td", "th"]), boundary: new Set(["tr", "table"]) };
  IMPLIED.th = IMPLIED.td;
  const sect = { target: new Set(["thead", "tbody", "tfoot"]), boundary: new Set(["table"]) };
  IMPLIED.thead = sect;
  IMPLIED.tbody = sect;
  IMPLIED.tfoot = sect;
  IMPLIED.a = { target: new Set(["a"]), boundary: new Set(["table", "td", "th"]) };
}

interface Open {
  tag: string;
  link?: { href: string; text: string };
}

function px(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(px)?\s*$/i.exec(v);
  return m ? parseFloat(m[1]!) : undefined;
}

/**
 * Sanitize email HTML for rendering inside a webmail. Allowlist-based: unknown
 * tags are unwrapped, dangerous ones dropped with their content, attributes
 * and URLs filtered, CSS scoped, remote images blocked and trackers removed.
 */
export function sanitizeEmailHtml(input: string, opts: SanitizeOptions = {}): SanitizeResult {
  const blockRemote = opts.blockRemoteContent !== false;
  const scope = opts.scope ?? ".mail-body";
  const linkTarget = opts.linkTarget ?? "_blank";
  const allowData = opts.allowDataImages !== false;
  const maxData = opts.maxDataUriBytes ?? 2 * 1024 * 1024;
  const placeholder = opts.placeholderSrc ?? PLACEHOLDER_GIF;
  const prefix = opts.prefix ?? "m-";
  const maxDepth = Math.max(1, opts.maxDepth ?? 100);
  const extraHosts = opts.trackerHosts ?? [];
  const cidMap = opts.cidMap ?? {};

  let html = typeof input === "string" ? input : String(input ?? "");
  if (opts.maxLength !== undefined && html.length > opts.maxLength) html = html.slice(0, Math.max(0, opts.maxLength));

  const out: string[] = [];
  const sheets: string[] = [];
  const stack: Open[] = [];
  const openCount = new Map<string, number>();
  const removedTags: Record<string, number> = {};
  const remoteSet = new Set<string>();
  const trackerSet = new Set<string>();
  const links: { href: string; text: string }[] = [];
  let blockedCount = 0;
  let skip: { tag: string; depth: number } | null = null;
  let bodySeen = false;
  let currentLink: { href: string; text: string } | null = null;

  const removed = (tag: string) => {
    removedTags[tag] = (removedTags[tag] ?? 0) + 1;
  };

  const proxied = (u: string): string | null => {
    if (!opts.proxyUrl) return u;
    try {
      const p = opts.proxyUrl(u);
      if (typeof p !== "string") return null;
      const n = normalizeUrl(p);
      const s = schemeOf(n);
      if (s === "javascript" || s === "vbscript" || s === "data" || s === "file") return null;
      return n;
    } catch {
      return null;
    }
  };

  const fromCid = (u: string): string | null => {
    let id = u.slice(4).trim();
    if (id.startsWith("<") && id.endsWith(">")) id = id.slice(1, -1);
    let decoded = id;
    try {
      decoded = decodeURIComponent(id);
    } catch {
      /* keep raw */
    }
    const hit = cidMap[id] ?? cidMap[decoded] ?? cidMap[id.toLowerCase()] ?? cidMap[decoded.toLowerCase()];
    if (typeof hit !== "string") return null;
    const n = normalizeUrl(hit);
    const s = schemeOf(n);
    if (s === "data") return safeDataImage(n, Number.MAX_SAFE_INTEGER);
    if (s === "" || s === "http" || s === "https" || s === "blob") return n;
    return null;
  };

  type ImgRes = { url: string } | { blocked: string } | { tracker: string } | null;

  /** Resolve an image-ish URL (img src, background=, CSS url()). */
  const resolveImage = (raw: string, checkTracker: boolean): ImgRes => {
    let u = normalizeUrl(raw);
    if (!u || (u.length > MAX_URL_LENGTH && !/^data:/i.test(u))) return null;
    const s = schemeOf(u);
    if (s === "cid") {
      const hit = fromCid(u);
      return hit ? { url: hit } : null;
    }
    if (s === "data") {
      if (!allowData) return null;
      const d = safeDataImage(u, maxData);
      return d ? { url: d } : null;
    }
    if (!isRemote(u)) return null;
    if (u.startsWith("//")) u = "https:" + u;
    if (checkTracker && isTrackerUrl(u, extraHosts)) {
      trackerSet.add(u);
      return { tracker: u };
    }
    remoteSet.add(u);
    if (blockRemote) {
      blockedCount++;
      return { blocked: u };
    }
    const p = proxied(u);
    if (p) return { url: p };
    blockedCount++;
    return { blocked: u };
  };

  const css: CssContext = {
    scope,
    prefix,
    blockRemote,
    keyframes: collectKeyframes(html),
    url(raw) {
      const r = resolveImage(raw, true);
      return r && "url" in r ? r.url : null;
    },
  };

  const prefixTokens = (v: string) =>
    v
      .split(/[\s]+/)
      .filter((t) => t && t.length <= 200)
      .map((t) => prefix + t)
      .join(" ");

  /** Sanitize the attributes of an allowed element. Returns null to drop the element (trackers). */
  const cleanAttrs = (tag: string, attrs: Attr[]): string[][] | null => {
    const extra = TAG_ATTRS[tag];
    const vals = new Map<string, string>();
    for (const a of attrs) {
      if (COMMON_ATTRS.has(a.name) || (extra && extra.includes(a.name))) vals.set(a.name, decodeEntities(a.value, true));
    }
    const res: string[][] = [];

    if (tag === "img") {
      const styleMap = vals.has("style") ? readDeclarations(vals.get("style")!) : new Map<string, string>();
      const src = vals.get("src");
      if (src !== undefined && isRemote(normalizeUrl(src))) {
        const w = px(vals.get("width")) ?? px(styleMap.get("width"));
        const h = px(vals.get("height")) ?? px(styleMap.get("height"));
        const dims = [w, h].filter((d): d is number => d !== undefined);
        const tiny = dims.length > 0 && dims.every((d) => d <= 2);
        const hidden =
          /none/.test(styleMap.get("display") ?? "") ||
          /hidden/.test(styleMap.get("visibility") ?? "") ||
          /^0(?:\.0*)?$/.test(styleMap.get("opacity") ?? "") ||
          /^0(?:px)?$/.test(styleMap.get("max-height") ?? "") ||
          /^0(?:px)?$/.test(styleMap.get("max-width") ?? "");
        let u = normalizeUrl(src);
        if (u.startsWith("//")) u = "https:" + u;
        if (tiny || hidden || isTrackerUrl(u, extraHosts)) {
          trackerSet.add(u);
          return null;
        }
      }
      if (src !== undefined) {
        const r = resolveImage(src, true);
        if (r && "tracker" in r) return null;
        if (r && "url" in r) res.push(["src", r.url]);
        else if (r && "blocked" in r) {
          res.push(["src", placeholder]);
          res.push([DATA_SRC_ATTR, r.blocked]);
        } else res.push(["src", placeholder]);
      }
    }

    for (const [name, v] of vals) {
      switch (name) {
        case "src":
          break;
        case "href": {
          const h = sanitizeHref(v);
          if (!h) break;
          if (h.kind === "anchor") res.push(["href", "#" + prefix + h.id]);
          else {
            res.push(["href", h.url]);
            res.push(["rel", "noopener noreferrer nofollow"]);
            if (h.external && linkTarget) res.push(["target", linkTarget]);
          }
          break;
        }
        case "background": {
          const r = resolveImage(v, true);
          if (r && "url" in r) res.push(["background", r.url]);
          else if (r && "blocked" in r) res.push([DATA_BACKGROUND_ATTR, r.blocked]);
          break;
        }
        case "style": {
          const s = sanitizeDeclarations(v, css);
          if (s) res.push(["style", s]);
          break;
        }
        case "class": {
          const c = prefixTokens(v);
          if (c) res.push(["class", c]);
          break;
        }
        case "id":
        case "name": {
          const id = v.replace(/\s+/g, "");
          if (id && id.length <= 200) res.push([name, prefix + id]);
          break;
        }
        case "width":
        case "height":
          if (LENGTH_RE.test(v.trim())) res.push([name, v.trim()]);
          break;
        case "border":
        case "cellpadding":
        case "cellspacing":
        case "hspace":
        case "vspace":
        case "colspan":
        case "rowspan":
        case "span":
        case "start":
        case "value":
        case "size":
          if (INT_RE.test(v.trim())) res.push([name, v.trim()]);
          break;
        case "bgcolor":
        case "color":
          if (COLOR_RE.test(v.trim())) res.push([name, v.trim()]);
          break;
        case "align":
        case "valign":
        case "dir":
        case "frame":
        case "rules":
        case "scope":
          if (WORD_RE.test(v.trim())) res.push([name, v.trim().toLowerCase()]);
          break;
        case "type":
          if (/^[a-zA-Z0-9]{1,10}$/.test(v.trim())) res.push([name, v.trim()]);
          break;
        case "nowrap":
        case "reversed":
        case "noshade":
        case "open":
          res.push([name, ""]);
          break;
        default:
          // title, alt, lang, summary, abbr, face, datetime: free text, escaped on output.
          if (v.length <= 1000) res.push([name, v]);
      }
    }
    return res;
  };

  const serialize = (tag: string, attrs: string[][]) => {
    let s = "<" + tag;
    for (const [k, v] of attrs) s += " " + k + '="' + escapeAttr(v!) + '"';
    return s + ">";
  };

  const pushOpen = (o: Open) => {
    stack.push(o);
    openCount.set(o.tag, (openCount.get(o.tag) ?? 0) + 1);
  };
  const popOne = () => {
    const o = stack.pop()!;
    openCount.set(o.tag, (openCount.get(o.tag) ?? 1) - 1);
    out.push("</" + o.tag + ">");
    if (o.link) {
      o.link.text = o.link.text.replace(/\s+/g, " ").trim();
      if (currentLink === o.link) currentLink = null;
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k]!.link) {
          currentLink = stack[k]!.link!;
          break;
        }
      }
    }
  };
  /** Close open elements down to and including the nearest `tag`. */
  const closeTo = (tag: string) => {
    if (!(openCount.get(tag) ?? 0)) return;
    while (stack.length) {
      const top = stack[stack.length - 1]!.tag;
      popOne();
      if (top === tag) return;
    }
  };
  const applyImplied = (tag: string) => {
    const rule = IMPLIED[tag];
    if (!rule) return;
    for (let k = stack.length - 1; k >= 0; k--) {
      const t = stack[k]!.tag;
      if (rule.boundary.has(t)) return;
      if (rule.target.has(t)) {
        while (stack.length > k) popOne();
        return;
      }
    }
  };

  const openElement = (tag: string, attrs: Attr[]) => {
    applyImplied(tag);
    const clean = cleanAttrs(tag, attrs);
    if (clean === null) return; // tracking pixel, recorded in `trackers`
    if (VOID.has(tag)) {
      out.push(serialize(tag, clean));
      return;
    }
    if (stack.length >= maxDepth) return; // flattened
    out.push(serialize(tag, clean));
    const o: Open = { tag };
    if (tag === "a") {
      const href = clean.find((a) => a[0] === "href")?.[1];
      if (href && !href.startsWith("#")) {
        o.link = { href, text: "" };
        links.push(o.link);
        currentLink = o.link;
      }
    }
    pushOpen(o);
  };

  tokenize(html, {
    text(raw) {
      if (skip) return;
      const t = decodeEntities(raw);
      if (currentLink) currentLink.text += t;
      out.push(escapeText(t));
    },
    comment() {
      removed("#comment");
    },
    rawText(name, content) {
      if (skip) return;
      if (name === "style") {
        const s = sanitizeStylesheet(content, css);
        if (s) sheets.push(s);
      }
      // Everything else raw (script, title, textarea, iframe, noscript, xmp, plaintext…) is discarded.
    },
    start(tag, attrs, selfClosing) {
      if (skip) {
        if (tag === skip.tag && !selfClosing) skip.depth++;
        return;
      }
      if (ALLOWED_TAGS.has(tag)) {
        openElement(tag, attrs);
        return;
      }
      if (tag === "body" && !bodySeen) {
        bodySeen = true;
        openElement("div", attrs);
        return;
      }
      if (STRUCTURAL.has(tag)) return;
      if (tag === "image") {
        // Browsers treat <image> as <img>.
        openElement("img", attrs);
        return;
      }
      if (tag !== "style") removed(tag);
      if (DROP_WITH_CONTENT.has(tag) && !selfClosing) skip = { tag, depth: 1 };
      // Raw-text elements (script, style, title…) deliver content via rawText().
    },
    end(tag) {
      if (skip) {
        if (tag === skip.tag && --skip.depth === 0) skip = null;
        return;
      }
      if (tag === "br") {
        out.push("<br>");
        return;
      }
      if (tag === "body") return;
      if (ALLOWED_TAGS.has(tag) && !VOID.has(tag)) {
        if (tag === "p" && !(openCount.get("p") ?? 0)) return;
        closeTo(tag);
      }
    },
  });

  while (stack.length) popOne();

  let body = out.join("");
  if (sheets.length) body = "<style>" + sheets.join("\n") + "</style>" + body;

  return {
    html: body,
    blockedCount,
    hasRemoteContent: remoteSet.size > 0,
    remoteUrls: [...remoteSet],
    trackers: [...trackerSet],
    removedTags,
    links,
  };
}

/** Decide whether a raw tag is one the sanitizer drops with its content (for htmlToText). */
export function isDroppedWithContent(tag: string): boolean {
  return DROP_WITH_CONTENT.has(tag) || RAW_DROP.has(tag) || tag === "style";
}
