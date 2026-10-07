/** Small, forgiving HTML helpers: entities, text conversion, JSON-LD, links, quoted-reply removal. */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  rarr: "→",
  euro: "€",
  pound: "£",
  yen: "¥",
  rupee: "₹",
  copy: "©",
  reg: "®",
  hellip: "…",
  middot: "·",
  bull: "•",
  times: "×",
  zwnj: "",
  zwj: "",
  shy: "",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    const lower = e.toLowerCase();
    if (lower.startsWith("#x") || lower.startsWith("#")) {
      const n = lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
      if (n === 160) return " ";
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[lower] ?? ENTITIES[e] ?? m;
  });
}

/** Remove quoted reply sections from HTML (Gmail, Apple Mail, Outlook, Yahoo, Thunderbird). */
export function stripQuotedHtml(html: string): string {
  let h = html.replace(/<!--[\s\S]*?-->/g, "");
  h = h.replace(/<blockquote\b[^>]*(?:type\s*=\s*["']?cite|class\s*=\s*["'][^"']*gmail_quote)[^>]*>[\s\S]*?<\/blockquote\s*>/gi, "");
  const cut = h.search(
    /<(?:div|p|span)\b[^>]*(?:class\s*=\s*["'][^"']*\b(?:gmail_quote|gmail_attr|yahoo_quoted|moz-cite-prefix|protonmail_quote)\b|id\s*=\s*["'](?:divRplyFwdMsg|appendonsend)["'])/i,
  );
  if (cut >= 0) h = h.slice(0, cut);
  return h;
}

/** Plain text from HTML with line breaks at block boundaries. Table cells on one row stay on one line. */
export function htmlToText(html: string): string {
  let h = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|head|title|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|section|article|header|footer|blockquote|ul|ol|dt|dd|center)\s*>/gi, "\n")
    .replace(/<(p|div|tr|li|h[1-6]|table|section|article|header|footer|blockquote|ul|ol|hr|center)\b[^>]*>/gi, "\n")
    .replace(/<\/(td|th)\s*>/gi, "  ")
    .replace(/<[^>]*>/g, "");
  h = decodeEntities(h);
  return h
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t ​]+/g, " ").trim())
    .filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== ""))
    .join("\n")
    .trim();
}

/** Remove quoted reply text: lines starting with ">" and everything after "On … wrote:" or an Original Message marker. */
export function stripQuotedText(text: string, subject = ""): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  const isReply = /^\s*(re|aw|sv|antw)\s*:/i.test(subject);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const t = line.trim();
    if (/^On\b.{0,300}\bwrote:\s*$/i.test(t)) break;
    if (/^On\b/i.test(t) && i + 1 < lines.length && /^.{0,200}\bwrote:\s*$/i.test((lines[i + 1] as string).trim()) && t.length < 200) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(t)) break;
    if (/^Le\b.{0,300}\ba écrit\s*:\s*$/i.test(t) || /^Am\b.{0,300}\bschrieb\b.{0,100}:\s*$/i.test(t)) break;
    if (isReply && /^From:\s/i.test(t) && lines.slice(i + 1, i + 4).some((l) => /^(Sent|Date):\s/i.test(l.trim()))) break;
    if (/^>/.test(t)) continue;
    out.push(line);
  }
  return out.join("\n");
}

/** Raw JSON values from <script type="application/ld+json"> blocks. Invalid JSON is skipped. */
export function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;
  for (const m of html.matchAll(re)) {
    let body = (m[1] ?? "").trim().replace(/^<!\[CDATA\[|\]\]>$/g, "").replace(/^<!--|-->$/g, "").trim();
    if (!body) continue;
    try {
      out.push(JSON.parse(body));
    } catch {
      // Some senders HTML-escape the JSON; try once more after decoding entities.
      try {
        body = decodeEntities(body);
        out.push(JSON.parse(body));
      } catch {
        /* skip invalid block */
      }
    }
  }
  return out;
}

export interface Anchor {
  href: string;
  text: string;
}

export function anchors(html: string): Anchor[] {
  const out: Anchor[] = [];
  const re = /<a\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/a\s*>/gi;
  for (const m of html.matchAll(re)) {
    const h = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(" " + (m[1] ?? ""));
    if (!h) continue;
    const href = decodeEntities(h[1] ?? h[2] ?? h[3] ?? "").trim();
    out.push({ href, text: decodeEntities((m[2] ?? "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim() });
  }
  return out;
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function attr(attrs: string, name: string): string | null {
  const re = new RegExp(`(?:^|\\s)${name}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+)))?`, "i");
  const m = re.exec(attrs);
  if (!m) return null;
  return decodeEntities(m[1] ?? m[2] ?? m[3] ?? "");
}

type MicroItem = Record<string, unknown>;

interface Frame {
  tag: string;
  item?: MicroItem;
  prop?: string;
  parentItem?: MicroItem;
  textStart: number;
}

function addProp(item: MicroItem, name: string, value: unknown): void {
  for (const n of name.split(/\s+/).filter(Boolean)) {
    const key = n.replace(/^https?:\/\/schema\.org\//i, "");
    const cur = item[key];
    if (cur === undefined) item[key] = value;
    else if (Array.isArray(cur)) cur.push(value);
    else item[key] = [cur, value];
  }
}

/** Basic schema.org microdata (itemscope/itemtype/itemprop) as JSON-LD-shaped objects. */
export function microdataItems(html: string): MicroItem[] {
  const roots: MicroItem[] = [];
  const stack: Frame[] = [];
  let text = "";
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|(<)/g;
  const currentItem = (): MicroItem | undefined => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i]!.item) return stack[i]!.item;
    return undefined;
  };
  for (const m of html.matchAll(re)) {
    if (m[4] !== undefined || m[5] !== undefined) {
      text += decodeEntities(m[4] ?? m[5] ?? "");
      continue;
    }
    const closing = m[1] === "/";
    const tag = (m[2] ?? "").toLowerCase();
    const attrs = m[3] ?? "";
    if (closing) {
      let idx = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i]!.tag === tag) {
          idx = i;
          break;
        }
      }
      if (idx < 0) continue;
      while (stack.length > idx) {
        const f = stack.pop() as Frame;
        if (f.prop && !f.item && f.parentItem) addProp(f.parentItem, f.prop, text.slice(f.textStart).replace(/\s+/g, " ").trim());
      }
      continue;
    }
    if (tag === "script" || tag === "style") continue;
    if (/^(td|th|div|p|br|li|tr)$/.test(tag)) text += " ";
    const scope = attr(attrs, "itemscope") !== null;
    const prop = attr(attrs, "itemprop");
    const parentItem = currentItem();
    const frame: Frame = { tag, textStart: text.length };
    if (scope) {
      const type = (attr(attrs, "itemtype") ?? "").trim().split(/\s+/)[0] ?? "";
      const item: MicroItem = { "@type": type.replace(/^https?:\/\/schema\.org\//i, "").replace(/\/$/, "") };
      frame.item = item;
      if (prop && parentItem) addProp(parentItem, prop, item);
      else roots.push(item);
    } else if (prop && parentItem) {
      const direct =
        attr(attrs, "content") ??
        (tag === "a" || tag === "link" ? attr(attrs, "href") : null) ??
        (tag === "img" ? attr(attrs, "src") : null) ??
        (tag === "time" ? attr(attrs, "datetime") : null);
      if (direct !== null) addProp(parentItem, prop, direct);
      else if (!VOID.has(tag) && !/\/\s*$/.test(attrs)) {
        frame.prop = prop;
        frame.parentItem = parentItem;
      }
    }
    if (!VOID.has(tag) && !/\/\s*$/.test(attrs)) stack.push(frame);
  }
  return roots;
}
