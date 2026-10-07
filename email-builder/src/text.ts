import { mapOutsideVars } from "./escape";
import { bool, listItems, prop, socialLabel, str, tableRows } from "./props";
import { htmlToText, sanitizeRichText } from "./sanitize";
import type { Block, Brand } from "./types";

const upper = (s: string) => mapOutsideVars(s, (t) => t.toUpperCase());
const rich = (v: unknown) => htmlToText(sanitizeRichText(v));

export type SocialLink = { kind: string; url: string; label: string };

/** Social links for a social block: `props.links` (array of {kind,url,label?}) or brand.socials. */
export function socialLinks(b: Block | null, brand: Brand): SocialLink[] {
  const raw = b && Array.isArray(b.props?.links) ? (b.props.links as unknown[]) : brand.socials ?? [];
  const out: SocialLink[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const url = typeof o.url === "string" ? o.url : "";
    const kind = typeof o.kind === "string" ? o.kind : "";
    if (!url) continue;
    out.push({ kind, url, label: typeof o.label === "string" && o.label ? o.label : socialLabel(kind) });
  }
  return out;
}

/** Plain-text rendering of one block (columns include their children). */
export function blockToText(b: Block, brand: Brand): string {
  switch (b.type) {
    case "header":
      return brand.name;
    case "text": {
      const t = rich(prop(b, "content"));
      const v = str(b, "variant");
      return v === "h1" || v === "h2" || v === "h3" ? upper(t) : t;
    }
    case "image": {
      if (bool(b, "decorative")) return "";
      const alt = str(b, "alt").trim();
      const href = str(b, "href");
      if (!alt) return "";
      return href ? `${alt} (${href})` : alt;
    }
    case "button":
      return `${str(b, "text")}: ${str(b, "url")}`;
    case "divider":
      return "----------";
    case "spacer":
      return "";
    case "columns":
      return (b.children ?? [])
        .map((c) =>
          [blockToText(c, brand), ...(c.type === "columns" ? [] : (c.children ?? []).map((g) => blockToText(g, brand)))]
            .filter(Boolean)
            .join("\n\n"),
        )
        .filter(Boolean)
        .join("\n\n");
    case "social":
      return socialLinks(b, brand)
        .map((l) => `${l.label}: ${l.url}`)
        .join("\n");
    case "footer": {
      const lines: string[] = [];
      if (bool(b, "showSocials")) for (const l of socialLinks(null, brand)) lines.push(`${l.label}: ${l.url}`);
      const note = str(b, "note");
      if (note) lines.push(note);
      lines.push(brand.address ? `${brand.name} · ${brand.address}` : brand.name);
      lines.push(`${str(b, "unsubscribeText")}: ${str(b, "unsubscribeUrl")}`);
      return lines.join("\n");
    }
    case "html":
      return htmlToText(String(prop(b, "html") ?? "").replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ""));
    case "quote": {
      const body = rich(prop(b, "content"))
        .split("\n")
        .map((l) => `> ${l}`.trimEnd())
        .join("\n");
      const cite = str(b, "cite");
      return cite ? `${body}\n— ${cite}` : body;
    }
    case "list":
      return listItems(prop(b, "items"))
        .map((i) => `- ${rich(i)}`)
        .join("\n");
    case "table":
      return tableRows(prop(b, "rows"))
        .map((r) => r.map((c) => rich(c)).join(" | "))
        .join("\n");
    default:
      return "";
  }
}

/** Plain-text alternative for a document. {{vars}} are kept. */
export function docToText(blocks: Block[], brand: Brand): string {
  const body = blocks
    .map((b) => blockToText(b, brand))
    .filter((t) => t.trim() !== "")
    .join("\n\n");
  return body.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
