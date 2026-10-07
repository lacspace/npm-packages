/**
 * A small, tolerant HTML tokenizer and walker. It never throws: anything it
 * cannot make sense of is treated as text. It does not build a full DOM and
 * does not implement the HTML5 tree-construction algorithm, only enough of it
 * to answer the questions the lint rules ask.
 */

export type Token =
  | { type: "start"; name: string; attrs: Record<string, string>; selfClosing: boolean }
  | { type: "end"; name: string }
  | { type: "text"; text: string }
  | { type: "raw"; name: string; text: string };

const RAW_TEXT = new Set(["script", "style", "textarea", "title", "xmp"]);

export const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
  "param", "source", "track", "wbr", "keygen", "basefont", "bgsound", "frame",
]);

/** Elements whose end tag may be omitted; never reported as unclosed. */
const OPTIONAL_END = new Set([
  "html", "head", "body", "p", "li", "td", "th", "tr", "thead", "tbody", "tfoot",
  "option", "optgroup", "dt", "dd", "colgroup", "caption", "rt", "rp",
]);

const INLINE = new Set([
  "a", "span", "b", "i", "u", "em", "strong", "font", "small", "big", "sub", "sup",
  "s", "strike", "abbr", "code", "mark", "label", "q", "cite", "del", "ins", "kbd", "var",
]);

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", zwnj: "‌",
  zwj: "‍", shy: "­", copy: "©", reg: "®", trade: "™",
  hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘",
  rdquo: "”", ldquo: "“", bull: "•", middot: "·", euro: "€",
  pound: "£", yen: "¥", cent: "¢", times: "×", laquo: "«",
  raquo: "»", thinsp: " ", ensp: " ", emsp: " ",
};

export function decodeEntities(s: string): string {
  if (s.indexOf("&") < 0) return s;
  return s.replace(/&(#[xX][0-9a-fA-F]{1,8}|#[0-9]{1,9}|[a-zA-Z][a-zA-Z0-9]{1,31});?/g, (m, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const n = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return "�";
      return String.fromCodePoint(n);
    }
    const v = NAMED[body.toLowerCase()];
    return v !== undefined && m.endsWith(";") ? v : m;
  });
}

function isNameStart(c: string | undefined): boolean {
  return c !== undefined && /[A-Za-z]/.test(c);
}

export function tokenize(html: string): Token[] {
  const out: Token[] = [];
  const n = html.length;
  let i = 0;
  let textStart = 0;
  const flushText = (end: number) => {
    if (end > textStart) out.push({ type: "text", text: decodeEntities(html.slice(textStart, end)) });
  };
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    i = lt;
    const next = html[i + 1];
    if (html.startsWith("<!--", i)) {
      flushText(i);
      const end = html.indexOf("-->", i + 4);
      i = end < 0 ? n : end + 3;
      textStart = i;
      continue;
    }
    if (next === "!" || next === "?") {
      flushText(i);
      const end = html.indexOf(">", i + 2);
      i = end < 0 ? n : end + 1;
      textStart = i;
      continue;
    }
    if (next === "/" && isNameStart(html[i + 2])) {
      flushText(i);
      let j = i + 2;
      while (j < n && !/[\s/>]/.test(html[j] as string)) j++;
      const name = html.slice(i + 2, j).toLowerCase();
      const end = html.indexOf(">", j);
      i = end < 0 ? n : end + 1;
      textStart = i;
      out.push({ type: "end", name });
      continue;
    }
    if (!isNameStart(next)) {
      i++; // a literal "<" in text
      continue;
    }
    flushText(i);
    let j = i + 1;
    while (j < n && !/[\s/>]/.test(html[j] as string)) j++;
    const name = html.slice(i + 1, j).toLowerCase();
    const attrs: Record<string, string> = {};
    let selfClosing = false;
    for (;;) {
      while (j < n && /\s/.test(html[j] as string)) j++;
      if (j >= n) break;
      const c = html[j] as string;
      if (c === ">") { j++; break; }
      if (c === "/") {
        if (html[j + 1] === ">") { selfClosing = true; j += 2; break; }
        j++;
        continue;
      }
      const ns = j;
      while (j < n && !/[\s=>/]/.test(html[j] as string)) j++;
      if (j === ns) { j++; continue; } // stray "=" etc.
      const an = html.slice(ns, j).toLowerCase();
      while (j < n && /\s/.test(html[j] as string)) j++;
      let value = "";
      if (html[j] === "=") {
        j++;
        while (j < n && /\s/.test(html[j] as string)) j++;
        const q = html[j];
        if (q === '"' || q === "'") {
          const close = html.indexOf(q, j + 1);
          const e = close < 0 ? n : close;
          value = html.slice(j + 1, e);
          j = close < 0 ? n : close + 1;
        } else {
          const vs = j;
          while (j < n && !/[\s>]/.test(html[j] as string)) j++;
          value = html.slice(vs, j);
        }
      }
      if (!(an in attrs)) attrs[an] = decodeEntities(value);
    }
    i = j;
    textStart = i;
    out.push({ type: "start", name, attrs, selfClosing });
    if (RAW_TEXT.has(name) && !selfClosing) {
      const re = new RegExp(`</${name}[\\s/>]`, "ig");
      re.lastIndex = i;
      const m = re.exec(html);
      const endAt = m ? m.index : n;
      const raw = html.slice(i, endAt);
      out.push({ type: "raw", name, text: name === "textarea" || name === "title" ? decodeEntities(raw) : raw });
      if (m) {
        const gt = html.indexOf(">", endAt);
        i = gt < 0 ? n : gt + 1;
        out.push({ type: "end", name });
      } else {
        i = n;
      }
      textStart = i;
    }
  }
  flushText(n);
  return out;
}

/** Parse an inline `style` attribute into lower-cased property → value. */
export function parseStyle(style: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!style) return out;
  for (const decl of style.split(";")) {
    const k = decl.indexOf(":");
    if (k < 0) continue;
    const prop = decl.slice(0, k).trim().toLowerCase();
    const val = decl.slice(k + 1).replace(/!important/i, "").trim().toLowerCase();
    if (prop) out[prop] = val;
  }
  return out;
}

const COLOR_NAMES: Record<string, string> = {
  white: "#ffffff", black: "#000000", red: "#ff0000", blue: "#0000ff", green: "#008000",
  yellow: "#ffff00", gray: "#808080", grey: "#808080", silver: "#c0c0c0", navy: "#000080",
  orange: "#ffa500", purple: "#800080", lime: "#00ff00", aqua: "#00ffff", fuchsia: "#ff00ff",
  maroon: "#800000", olive: "#808000", teal: "#008080",
};

/** Normalise a CSS colour to `#rrggbb`, or undefined when it is not a plain opaque colour. */
export function normColor(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const s = v.trim().toLowerCase();
  if (COLOR_NAMES[s]) return COLOR_NAMES[s];
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) {
    const h = m[1] as string;
    return "#" + h.split("").map((c) => c + c).join("");
  }
  m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) return s;
  m = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s);
  if (m) {
    if (m[4] !== undefined && parseFloat(m[4]) < 1) return undefined;
    const hex = [m[1], m[2], m[3]].map((x) => Math.min(255, parseInt(x as string, 10)).toString(16).padStart(2, "0"));
    return "#" + hex.join("");
  }
  return undefined;
}

function bgFromStyle(st: Record<string, string>, attrs: Record<string, string>): string | undefined {
  const bc = normColor(st["background-color"]);
  if (bc) return bc;
  const b = st["background"];
  if (b) {
    const first = normColor(b.split(/\s+(?![^(]*\))/)[0]);
    if (first) return first;
  }
  return normColor(attrs["bgcolor"]);
}

function isZeroSize(v: string | undefined): boolean {
  return v !== undefined && /^0(?:\.0+)?(?:px|pt|em|rem|%)?$/.test(v.trim());
}

export interface LinkInfo {
  href: string | undefined;
  text: string;
  attrs: Record<string, string>;
}

export interface ImageInfo {
  attrs: Record<string, string>;
  tracking: boolean;
}

export interface HtmlAnalysis {
  visibleText: string;
  /** Text of each separately hidden element, whitespace collapsed. */
  hiddenGroups: string[];
  /** The first non-empty hidden text, if it comes before any visible text and is hidden by style rather than colour (a typical preheader). */
  hiddenPreheader: string | undefined;
  links: LinkInfo[];
  images: ImageInfo[];
  /** All CSS: `<style>` blocks and `style` attributes. */
  css: string[];
  tagCounts: Record<string, number>;
  eventHandlers: number;
  stylesheetLinks: number;
  unclosed: string[];
  stray: string[];
}

interface Frame {
  name: string;
  hidden: boolean;
  group: number;
  /** Group of text sized to zero by an ancestor and not reset since; -1 if none. */
  zeroGroup: number;
  color: string | undefined;
  bg: string | undefined;
  invisible: boolean;
  link: number;
}

function num(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const m = /^\s*(\d+(?:\.\d+)?)/.exec(v);
  return m ? parseFloat(m[1] as string) : undefined;
}

export function collapse(s: string): string {
  return s.replace(/[​-‍⁠﻿­͏]/g, "").replace(/\s+/g, " ").trim();
}

export function analyzeHtml(html: string): HtmlAnalysis {
  const tokens = tokenize(html);
  const res: HtmlAnalysis = {
    visibleText: "",
    hiddenGroups: [],
    hiddenPreheader: undefined,
    links: [],
    images: [],
    css: [],
    tagCounts: {},
    eventHandlers: 0,
    stylesheetLinks: 0,
    unclosed: [],
    stray: [],
  };
  const visible: string[] = [];
  const hidden: string[][] = [];
  const hiddenEarly: boolean[] = [];
  const linkText: string[][] = [];
  let sawVisible = false;
  const root: Frame = { name: "#root", hidden: false, group: -1, zeroGroup: -1, color: undefined, bg: undefined, invisible: false, link: -1 };
  const stack: Frame[] = [root];
  const top = () => stack[stack.length - 1] as Frame;

  const popTo = (idx: number) => {
    while (stack.length - 1 > idx) {
      const f = stack.pop() as Frame;
      if (!OPTIONAL_END.has(f.name)) res.unclosed.push(f.name);
    }
  };

  for (const t of tokens) {
    if (t.type === "start") {
      const { name, attrs } = t;
      res.tagCounts[name] = (res.tagCounts[name] ?? 0) + 1;
      for (const a of Object.keys(attrs)) if (/^on[a-z]+$/.test(a)) res.eventHandlers++;
      if (attrs["style"]) res.css.push(attrs["style"]);
      if (!INLINE.has(name)) visible.push(" ");
      // implicit closes for the common optional-end cases
      const tn = top().name;
      if ((name === "p" || name === "li" || name === "dt" || name === "dd" || name === "option") && tn === name) stack.pop();
      else if ((name === "td" || name === "th") && (tn === "td" || tn === "th")) stack.pop();
      else if (name === "tr" && (tn === "td" || tn === "th")) {
        stack.pop();
        if (top().name === "tr") stack.pop();
      } else if (name === "tr" && tn === "tr") stack.pop();

      if (name === "img") {
        const st = parseStyle(attrs["style"]);
        const w = num(attrs["width"]) ?? num(st["width"]);
        const h = num(attrs["height"]) ?? num(st["height"]);
        res.images.push({ attrs, tracking: w !== undefined && h !== undefined && w <= 2 && h <= 2 });
      }
      if (name === "link" && /(^|\s)stylesheet(\s|$)/i.test(attrs["rel"] ?? "")) res.stylesheetLinks++;

      const parent = top();
      const st = parseStyle(attrs["style"]);
      const color = normColor(st["color"]) ?? (name === "font" ? normColor(attrs["color"]) : undefined) ?? parent.color;
      const bg = bgFromStyle(st, attrs) ?? parent.bg;
      const selfHidden =
        st["display"] === "none" ||
        st["visibility"] === "hidden" ||
        (st["opacity"] !== undefined && parseFloat(st["opacity"]) === 0) ||
        "hidden" in attrs;
      const sameColor = color !== undefined && bg !== undefined && color === bg;
      let isHidden = parent.hidden;
      let group = parent.group;
      if (!parent.hidden && (selfHidden || sameColor)) {
        isHidden = true;
        group = hidden.length;
        hidden.push([]);
        // only style-hidden text (not same-colour text) can be a preheader
        hiddenEarly.push(!sawVisible && selfHidden);
      }
      // font-size:0 is inherited but a descendant's own font-size undoes it (the
      // inline-block column trick: wrapper font-size:0, each column resets it).
      let zeroGroup = parent.zeroGroup;
      if (!isHidden) {
        if (isZeroSize(st["font-size"])) {
          if (zeroGroup < 0) {
            zeroGroup = hidden.length;
            hidden.push([]);
            hiddenEarly.push(!sawVisible);
          }
        } else if (st["font-size"] !== undefined) zeroGroup = -1;
      }
      const invisible = parent.invisible || name === "head" || name === "template";
      let link = -1;
      if (name === "a") {
        link = res.links.length;
        res.links.push({ href: attrs["href"], text: "", attrs });
        linkText.push([]);
      }
      if (VOID.has(name) || t.selfClosing) continue;
      stack.push({ name, hidden: isHidden, group, zeroGroup, color, bg, invisible, link });
    } else if (t.type === "end") {
      const name = t.name;
      if (!INLINE.has(name)) visible.push(" ");
      if (VOID.has(name)) continue;
      let idx = -1;
      for (let k = stack.length - 1; k > 0; k--) {
        if ((stack[k] as Frame).name === name) { idx = k; break; }
      }
      if (idx < 0) {
        if (!OPTIONAL_END.has(name)) res.stray.push(name);
        continue;
      }
      popTo(idx);
      stack.pop();
    } else if (t.type === "raw") {
      if (t.name === "style") res.css.push(t.text);
    } else {
      const f = top();
      if (f.invisible) continue;
      if (f.hidden || f.zeroGroup >= 0) {
        (hidden[f.hidden ? f.group : f.zeroGroup] as string[]).push(t.text);
        continue;
      }
      visible.push(t.text);
      if (t.text.trim()) sawVisible = true;
      for (const fr of stack) if (fr.link >= 0) (linkText[fr.link] as string[]).push(t.text);
    }
  }
  popTo(0);
  res.visibleText = collapse(visible.join(""));
  const groups = hidden.map((g) => collapse(g.join(" ")));
  res.hiddenGroups = groups.filter((g) => g.length > 0);
  const firstIdx = groups.findIndex((g) => g.length > 0);
  if (firstIdx >= 0 && hiddenEarly[firstIdx]) res.hiddenPreheader = groups[firstIdx];
  res.links.forEach((l, k) => { l.text = collapse((linkText[k] as string[]).join("")); });
  return res;
}
