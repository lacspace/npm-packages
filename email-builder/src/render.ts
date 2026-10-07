import { contrastRatio, isColor, toHex } from "./color";
import { escapeAttr, escapeHtml, isSafeUrl } from "./escape";
import { align, bool, listItems, num, prop, ratios, str, tableRows } from "./props";
import { sanitizeRichText } from "./sanitize";
import { defaultBrand } from "./schema";
import { blockToText, docToText, socialLinks } from "./text";
import type { Block, Brand, EmailDoc, RenderOptions, RenderResult } from "./types";

export const DEFAULT_FONT = "Arial, Helvetica, sans-serif";
export const DEFAULT_WIDTH = 600;
/** Gmail clips messages above ~102KB; warn earlier. */
export const SIZE_WARN_BYTES = 90 * 1024;
const PAD_X = 24;
const TBL = `role="presentation" cellpadding="0" cellspacing="0" border="0"`;

type Colors = Brand["colors"];
type Ctx = {
  brand: Brand;
  c: Colors;
  font: string;
  radius: number;
  warnings: string[];
};

const css = (s: string) => s.replace(/["<>;{}\\]/g, "");

function fontStack(brand: Brand): string {
  if (!brand.font || !brand.font.family) return DEFAULT_FONT;
  const fam = css(brand.font.family).replace(/'/g, "").trim();
  const fb = css(brand.font.fallback || DEFAULT_FONT).trim();
  if (!fam) return DEFAULT_FONT;
  return `${/\s/.test(fam) ? `'${fam}'` : fam}, ${fb || DEFAULT_FONT}`;
}

function resolveColors(brand: Brand, warnings: string[]): Colors {
  const out = { ...defaultBrand.colors };
  const src = (brand && brand.colors) || ({} as Partial<Colors>);
  for (const k of Object.keys(out) as Array<keyof Colors>) {
    const v = src[k];
    if (isColor(v)) out[k] = v.trim();
    else warnings.push(`Brand colour "${k}" is missing or invalid (${String(v)}); using ${out[k]}.`);
  }
  return out;
}

function colorProp(b: Block, key: string, fallback: string, ctx: Ctx): string {
  const v = str(b, key).trim();
  if (!v) return fallback;
  if (isColor(v)) return v;
  ctx.warnings.push(`Block "${b.id}": ${key} "${v}" is not a valid colour; using ${fallback}.`);
  return fallback;
}

function safeUrl(url: string, b: Block, key: string, ctx: Ctx): string | null {
  if (!url) return null;
  if (isSafeUrl(url)) return url.trim();
  ctx.warnings.push(`Block "${b.id}": ${key} "${url}" is not an http(s)/mailto/tel/{{var}} URL and was dropped.`);
  return null;
}

function textStyle(ctx: Ctx, color: string, size: number, lineHeight: number, extra = ""): string {
  return `font-family:${ctx.font};font-size:${size}px;line-height:${lineHeight}px;color:${color};${extra}`;
}

function checkContrast(fg: string, bg: string, min: number, what: string, ctx: Ctx): void {
  const r = contrastRatio(fg, bg);
  if (r !== null && r < min) {
    ctx.warnings.push(`Low contrast: ${what} ${fg} on ${bg} is ${r.toFixed(2)}:1 (needs ${min}:1).`);
  }
}

/* ------------------------------------------------------------------ blocks */

function renderHeader(b: Block, w: number, ctx: Ctx): string {
  const a = align(b, "left");
  const bg = colorProp(b, "background", "", ctx);
  const fg = colorProp(b, "textColor", ctx.c.text, ctx);
  const bgStyle = bg ? `background-color:${bg};` : "";
  let inner: string;
  const logo = ctx.brand.logoUrl ? safeUrl(ctx.brand.logoUrl, b, "brand.logoUrl", ctx) : null;
  if (logo) {
    const lw = Math.max(1, Math.min(Math.round(num(b, "logoWidth", 140)), w));
    // The logo carries no dark-mode class and no filter, so dark mode never inverts it.
    inner = `<img src="${escapeAttr(logo)}" width="${lw}" alt="${escapeAttr(ctx.brand.name)}" style="display:block;max-width:100%;height:auto;border:0">`;
  } else {
    if (bg) checkContrast(fg, bg, 4.5, `header text in block "${b.id}"`, ctx);
    inner = `<span class="lac-text" style="${escapeAttr(textStyle(ctx, fg, 22, 28, "font-weight:bold;"))}">${escapeHtml(ctx.brand.name)}</span>`;
  }
  return `<table ${TBL} width="100%"><tr><td align="${a}"${bgStyle ? ` style="${escapeAttr(bgStyle)}"` : ""}>${inner}</td></tr></table>`;
}

const VARIANTS: Record<string, { size: number; lh: number; bold: boolean; muted?: boolean }> = {
  body: { size: 16, lh: 24, bold: false },
  h1: { size: 28, lh: 36, bold: true },
  h2: { size: 22, lh: 30, bold: true },
  h3: { size: 18, lh: 26, bold: true },
  small: { size: 13, lh: 20, bold: false, muted: true },
};

function renderText(b: Block, ctx: Ctx): string {
  const v = VARIANTS[str(b, "variant")] ?? VARIANTS.body!;
  const base = v.muted ? ctx.c.muted : ctx.c.text;
  const color = colorProp(b, "color", base, ctx);
  if (color !== base) checkContrast(color, ctx.c.surface, 4.5, `text in block "${b.id}"`, ctx);
  const size = Math.max(8, Math.min(72, num(b, "fontSize", v.size)));
  const lh = Math.round(size * (v.lh / v.size));
  const html = sanitizeRichText(prop(b, "content"), { linkColor: ctx.c.primary });
  const cls = v.muted ? "lac-muted" : "lac-text";
  const tag = v.bold ? "h" + str(b, "variant").slice(1) : "";
  const style = textStyle(ctx, color, size, lh, `text-align:${align(b)};${v.bold ? "font-weight:bold;" : ""}`);
  if (tag) return `<${tag} class="${cls}" style="${escapeAttr(style + "margin:0;")}">${html}</${tag}>`;
  return `<div class="${cls}" style="${escapeAttr(style)}">${html}</div>`;
}

function renderImage(b: Block, w: number, ctx: Ctx): string {
  const src = safeUrl(str(b, "src"), b, "src", ctx);
  if (!src) {
    if (!str(b, "src")) ctx.warnings.push(`Block "${b.id}": image has no src and was skipped.`);
    return "";
  }
  const decorative = bool(b, "decorative");
  const alt = decorative ? "" : str(b, "alt");
  if (!decorative && !alt.trim()) ctx.warnings.push(`Block "${b.id}": image has no alt text (set alt or decorative: true).`);
  const width = Math.max(1, Math.min(Math.round(num(b, "width", w)), w));
  let img = `<img src="${escapeAttr(src)}" width="${width}" alt="${escapeAttr(alt)}" style="display:block;max-width:100%;height:auto;border:0">`;
  const href = safeUrl(str(b, "href"), b, "href", ctx);
  if (href) img = `<a href="${escapeAttr(href)}" target="_blank" style="text-decoration:none;">${img}</a>`;
  return `<table ${TBL} width="100%"><tr><td align="${align(b, "center")}">${img}</td></tr></table>`;
}

function renderButton(b: Block, w: number, ctx: Ctx): string {
  const text = str(b, "text");
  const url = safeUrl(str(b, "url"), b, "url", ctx) ?? "#";
  const bg = colorProp(b, "color", ctx.c.primary, ctx);
  const fg = colorProp(b, "textColor", "#ffffff", ctx);
  checkContrast(fg, bg, 3, `button text in block "${b.id}"`, ctx);
  const full = bool(b, "fullWidth");
  const a = align(b, "center");
  const height = 44;
  const radius = Math.max(0, Math.min(ctx.radius, height / 2));
  const bw = full ? w : Math.max(120, Math.min(w, Math.round(Array.from(text).length * 9 + 48)));
  const arc = Math.min(50, Math.round((radius / height) * 100));
  const fill = toHex(bg) ?? "#000000";
  const label = escapeHtml(text);
  const href = escapeAttr(url);
  const vml =
    `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:${height}px;v-text-anchor:middle;width:${bw}px;" arcsize="${arc}%" stroke="f" fillcolor="${fill}">` +
    `<w:anchorlock/><center style="${escapeAttr(`color:${toHex(fg) ?? "#ffffff"};font-family:${ctx.font};font-size:16px;font-weight:bold;`)}">${label}</center></v:roundrect><![endif]-->`;
  const aStyle =
    `display:${full ? "block" : "inline-block"};background-color:${bg};color:${fg};font-family:${ctx.font};font-size:16px;font-weight:bold;line-height:${height}px;` +
    `text-align:center;text-decoration:none;border-radius:${radius}px;padding:0 24px;${full ? "" : `min-width:${Math.max(0, bw - 48)}px;`}-webkit-text-size-adjust:none;mso-hide:all;`;
  const link = `<!--[if !mso]><!--><a href="${href}" target="_blank" style="${escapeAttr(aStyle)}">${label}</a><!--<![endif]-->`;
  return `<table ${TBL} width="100%"><tr><td align="${a}">${vml}${link}</td></tr></table>`;
}

function renderDivider(b: Block, ctx: Ctx): string {
  const color = colorProp(b, "color", ctx.c.muted, ctx);
  const t = Math.max(1, Math.min(20, Math.round(num(b, "thickness", 1))));
  return `<table ${TBL} width="100%"><tr><td style="${escapeAttr(`border-top:${t}px solid ${color};font-size:0;line-height:0;height:0;`)}">&nbsp;</td></tr></table>`;
}

function renderSpacer(b: Block): string {
  const h = Math.max(0, Math.min(400, Math.round(num(b, "height", 24))));
  return `<table ${TBL} width="100%"><tr><td height="${h}" style="height:${h}px;font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
}

function renderColumns(b: Block, w: number, ctx: Ctx): string {
  let kids = b.children ?? [];
  if (kids.length === 0) {
    ctx.warnings.push(`Block "${b.id}": columns block has no columns.`);
    return "";
  }
  if (kids.length > 4) {
    ctx.warnings.push(`Block "${b.id}": columns block has ${kids.length} columns; only the first 4 are rendered.`);
    kids = kids.slice(0, 4);
  }
  const n = kids.length;
  const r = ratios(prop(b, "ratios"), n) ?? kids.map(() => 1);
  const sum = r.reduce((x, y) => x + y, 0);
  const gap = Math.max(0, Math.min(64, Math.round(num(b, "gap", 16))));
  const stack = bool(b, "stackOnMobile");
  const widths = r.map((x) => Math.floor((w * x) / sum));
  let html = `<table ${TBL} width="100%"><tr><td valign="top" style="font-size:0;line-height:0;">`;
  html += `<!--[if mso]><table ${TBL} width="${w}"><tr><![endif]-->`;
  kids.forEach((kid, i) => {
    const cw = widths[i]!;
    const pl = i > 0 ? Math.ceil(gap / 2) : 0;
    const pr = i < n - 1 ? Math.floor(gap / 2) : 0;
    const inner = Math.max(1, cw - pl - pr);
    const pct = ((r[i]! / sum) * 100).toFixed(4).replace(/\.?0+$/, "");
    const divStyle = stack
      ? `display:inline-block;vertical-align:top;width:100%;max-width:${cw}px;`
      : `display:inline-block;vertical-align:top;width:${pct}%;max-width:${cw}px;`;
    const content = kid.type === "columns" ? [kid] : [kid, ...(kid.children ?? [])];
    html += `<!--[if mso]><td width="${cw}" valign="top"><![endif]-->`;
    html += `<div class="${stack ? "lac-stack" : "lac-col"}" style="${divStyle}">`;
    html += `<table ${TBL} width="100%"><tr><td class="lac-colpad" valign="top" style="padding:0 ${pr}px 0 ${pl}px;font-size:16px;line-height:24px;">`;
    html += renderStack(content, inner, 0, ctx);
    html += `</td></tr></table></div>`;
    html += `<!--[if mso]></td><![endif]-->`;
  });
  html += `<!--[if mso]></tr></table><![endif]-->`;
  html += `</td></tr></table>`;
  return html;
}

function renderSocialLinks(links: ReturnType<typeof socialLinks>, b: Block, ctx: Ctx, color: string, iconBase: string | null): string {
  const parts: string[] = [];
  for (const l of links) {
    const url = safeUrl(l.url, b, `social link (${l.kind})`, ctx);
    if (!url) continue;
    const icon = iconBase
      ? `<img src="${escapeAttr(`${iconBase.replace(/\/+$/, "")}/${encodeURIComponent(l.kind.toLowerCase())}.png`)}" width="24" height="24" alt="" style="display:inline-block;vertical-align:middle;border:0;height:auto;max-width:100%;">&nbsp;`
      : "";
    parts.push(
      `<a href="${escapeAttr(url)}" target="_blank" style="${escapeAttr(`color:${color};text-decoration:underline;`)}">${icon}${escapeHtml(l.label)}</a>`,
    );
  }
  return parts.join(" &nbsp;&middot;&nbsp; ");
}

function renderSocial(b: Block, ctx: Ctx): string {
  const links = socialLinks(b, ctx.brand);
  if (!links.length) {
    ctx.warnings.push(`Block "${b.id}": social block has no links (set props.links or brand.socials).`);
    return "";
  }
  const base = str(b, "iconBaseUrl") ? safeUrl(str(b, "iconBaseUrl"), b, "iconBaseUrl", ctx) : null;
  const body = renderSocialLinks(links, b, ctx, ctx.c.primary, base);
  return `<table ${TBL} width="100%"><tr><td align="${align(b, "center")}" class="lac-text" style="${escapeAttr(textStyle(ctx, ctx.c.text, 14, 22))}">${body}</td></tr></table>`;
}

function renderFooter(b: Block, ctx: Ctx): string {
  const lines: string[] = [];
  if (bool(b, "showSocials")) {
    const links = socialLinks(null, ctx.brand);
    if (links.length) lines.push(renderSocialLinks(links, b, ctx, ctx.c.muted, null));
  }
  const note = str(b, "note");
  if (note) lines.push(escapeHtml(note));
  const addr = ctx.brand.address ? escapeHtml(ctx.brand.address).replace(/\r?\n/g, "<br>") : "";
  lines.push(escapeHtml(ctx.brand.name) + (addr ? ` &middot; ${addr}` : ""));
  const unsub = safeUrl(str(b, "unsubscribeUrl"), b, "unsubscribeUrl", ctx) ?? "{{unsubscribeUrl}}";
  lines.push(
    `<a href="${escapeAttr(unsub)}" target="_blank" class="lac-muted" style="${escapeAttr(`color:${ctx.c.muted};text-decoration:underline;`)}">${escapeHtml(str(b, "unsubscribeText") || "Unsubscribe")}</a>`,
  );
  return `<table ${TBL} width="100%"><tr><td align="${align(b, "center")}" class="lac-muted" style="${escapeAttr(textStyle(ctx, ctx.c.muted, 12, 18))}">${lines.join("<br>")}</td></tr></table>`;
}

function renderQuote(b: Block, ctx: Ctx): string {
  const bar = colorProp(b, "borderColor", ctx.c.primary, ctx);
  const html = sanitizeRichText(prop(b, "content"), { linkColor: ctx.c.primary });
  const cite = str(b, "cite");
  const citeHtml = cite
    ? `<div class="lac-muted" style="${escapeAttr(textStyle(ctx, ctx.c.muted, 14, 20, "font-style:normal;padding-top:8px;"))}">&mdash; ${escapeHtml(cite)}</div>`
    : "";
  return `<table ${TBL} width="100%"><tr><td class="lac-text" style="${escapeAttr(`border-left:4px solid ${bar};padding:4px 0 4px 16px;` + textStyle(ctx, ctx.c.text, 17, 26, "font-style:italic;"))}">${html}${citeHtml}</td></tr></table>`;
}

function renderList(b: Block, ctx: Ctx): string {
  const items = listItems(prop(b, "items"));
  const ordered = bool(b, "ordered");
  const st = escapeAttr(textStyle(ctx, ctx.c.text, 16, 24, "padding:0 0 6px 0;"));
  const rows = items
    .map(
      (it, i) =>
        `<tr><td width="24" valign="top" class="lac-text" style="${st}">${ordered ? `${i + 1}.` : "&bull;"}</td>` +
        `<td valign="top" class="lac-text" style="${st}">${sanitizeRichText(it, { linkColor: ctx.c.primary })}</td></tr>`,
    )
    .join("");
  return `<table ${TBL} width="100%">${rows}</table>`;
}

function renderTable(b: Block, ctx: Ctx): string {
  const rows = tableRows(prop(b, "rows"));
  const header = bool(b, "headerRow");
  const striped = bool(b, "striped");
  const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const line = ctx.c.background;
  const out = rows
    .map((r, ri) => {
      const isHead = header && ri === 0;
      const stripe = striped && !isHead && (ri - (header ? 1 : 0)) % 2 === 1 ? `background-color:${ctx.c.background};` : "";
      const cells: string[] = [];
      for (let ci = 0; ci < cols; ci++) {
        const tag = isHead ? "th" : "td";
        const st = textStyle(
          ctx,
          ctx.c.text,
          14,
          20,
          `padding:8px;text-align:left;border-bottom:${isHead ? 2 : 1}px solid ${line};${isHead ? "font-weight:bold;" : ""}${stripe}`,
        );
        cells.push(`<${tag} class="lac-text" style="${escapeAttr(st)}">${sanitizeRichText(r[ci] ?? "", { linkColor: ctx.c.primary })}</${tag}>`);
      }
      return `<tr>${cells.join("")}</tr>`;
    })
    .join("");
  return `<table ${TBL} width="100%" style="border-collapse:collapse;">${out}</table>`;
}

function renderBlock(b: Block, w: number, ctx: Ctx): string {
  switch (b.type) {
    case "header":
      return renderHeader(b, w, ctx);
    case "text":
      return renderText(b, ctx);
    case "image":
      return renderImage(b, w, ctx);
    case "button":
      return renderButton(b, w, ctx);
    case "divider":
      return renderDivider(b, ctx);
    case "spacer":
      return renderSpacer(b);
    case "columns":
      return renderColumns(b, w, ctx);
    case "social":
      return renderSocial(b, ctx);
    case "footer":
      return renderFooter(b, ctx);
    case "html":
      ctx.warnings.push(`Block "${b.id}": raw HTML block is passed through unchecked; test it in real clients.`);
      return String(prop(b, "html") ?? "");
    case "quote":
      return renderQuote(b, ctx);
    case "list":
      return renderList(b, ctx);
    case "table":
      return renderTable(b, ctx);
    default:
      ctx.warnings.push(`Block "${(b as Block).id}": unknown type "${String((b as Block).type)}" was skipped.`);
      return "";
  }
}

function blockPadding(b: Block, padX: number, first: boolean): string {
  if (b.type === "spacer") return "0";
  if (b.type === "header") return `${padX ? 24 : 0}px ${padX}px 12px ${padX}px`;
  if (b.type === "footer") return `16px ${padX}px ${padX ? 24 : 0}px ${padX}px`;
  return padX ? `${first ? 16 : 8}px ${padX}px 8px ${padX}px` : `0 0 12px 0`;
}

/** Render a vertical stack of blocks as table rows. */
function renderStack(blocks: Block[], w: number, padX: number, ctx: Ctx): string {
  const rows = blocks
    .map((b, i) => {
      const html = renderBlock(b, w, ctx);
      if (!html) return "";
      return `<tr><td valign="top" style="padding:${blockPadding(b, padX, i === 0)};">${html}</td></tr>`;
    })
    .join("");
  return `<table ${TBL} width="100%">${rows}</table>`;
}

/* ------------------------------------------------------------------ shell */

function styleBlock(dark: boolean): string {
  const scheme = dark ? "light dark" : "light";
  let s =
    `:root{color-scheme:${scheme};supported-color-schemes:${scheme};}` +
    `body{margin:0!important;padding:0!important;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}` +
    `table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}` +
    `img{-ms-interpolation-mode:bicubic;}` +
    `a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}` +
    `@media only screen and (max-width:600px){` +
    `.lac-container{width:100%!important;max-width:100%!important;}` +
    `.lac-stack{display:block!important;width:100%!important;max-width:100%!important;}` +
    `.lac-stack .lac-colpad{padding-left:0!important;padding-right:0!important;padding-bottom:12px!important;}` +
    `}`;
  if (dark) {
    const d = { bg: "#0f1115", surface: "#1a1d23", text: "#e6e7ea", muted: "#a3a8b3" };
    const rules =
      `.lac-bg{background-color:${d.bg}!important;}` +
      `.lac-surface{background-color:${d.surface}!important;}` +
      `.lac-text{color:${d.text}!important;}` +
      `.lac-muted{color:${d.muted}!important;}`;
    s +=
      `@media (prefers-color-scheme:dark){${rules}}` +
      `[data-ogsb] .lac-bg{background-color:${d.bg}!important;}` +
      `[data-ogsb] .lac-surface{background-color:${d.surface}!important;}` +
      `[data-ogsc] .lac-text{color:${d.text}!important;}` +
      `[data-ogsc] .lac-muted{color:${d.muted}!important;}`;
  }
  return `<style type="text/css">${s}</style>`;
}

function preheaderHtml(text: string): string {
  if (!text) return "";
  const hidden = "display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:transparent;visibility:hidden;";
  return (
    `<span class="lac-preheader" style="${hidden}">${escapeHtml(text)}</span>` +
    `<span style="${hidden}">${"&zwnj;&nbsp;".repeat(60)}</span>`
  );
}

function countImages(blocks: Block[]): number {
  let n = 0;
  for (const b of blocks) {
    if (b.type === "image") n++;
    if (b.children) n += countImages(b.children);
  }
  return n;
}

function countTextChars(blocks: Block[], brand: Brand): number {
  let n = 0;
  for (const b of blocks) {
    if (b.type === "image" || b.type === "header" || b.type === "footer" || b.type === "spacer" || b.type === "divider") {
      if (b.children) n += countTextChars(b.children, brand);
      continue;
    }
    if (b.type === "columns") {
      for (const k of b.children ?? []) n += countTextChars(k.type === "columns" ? [k] : [k, ...(k.children ?? [])], brand);
      continue;
    }
    n += blockToText(b, brand).replace(/\s+/g, " ").trim().length;
  }
  return n;
}

/**
 * Render a block document to email HTML + a plain-text alternative.
 * Never throws for bad input; problems are reported in `warnings`.
 */
export function render(doc: EmailDoc, opts: RenderOptions = {}): RenderResult {
  const warnings: string[] = [];
  const brandIn: Brand = doc && doc.brand ? doc.brand : defaultBrand;
  const colors = resolveColors(brandIn, warnings);
  const brand: Brand = { ...brandIn, name: brandIn.name || defaultBrand.name, colors };
  const ctx: Ctx = {
    brand,
    c: colors,
    font: fontStack(brand),
    radius: typeof brand.radius === "number" && Number.isFinite(brand.radius) ? Math.max(0, brand.radius) : 6,
    warnings,
  };
  const blocks = Array.isArray(doc?.blocks) ? doc.blocks : [];
  const width = Math.round(Math.max(320, Math.min(1200, typeof doc?.width === "number" && Number.isFinite(doc.width) ? doc.width : DEFAULT_WIDTH)));
  const dark = (opts.darkMode ?? "auto") === "auto";
  const pre = typeof doc?.preheader === "string" ? doc.preheader.trim() : "";

  checkContrast(colors.text, colors.surface, 4.5, "body text", ctx);
  checkContrast(colors.text, colors.background, 4.5, "body text", ctx);

  const body = renderStack(blocks, width - PAD_X * 2, PAD_X, ctx);
  const scheme = dark ? "light dark" : "light";

  const html =
    `<!DOCTYPE html>\n` +
    `<html lang="en" dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">\n` +
    `<head>\n` +
    `<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<meta http-equiv="X-UA-Compatible" content="IE=edge">\n` +
    `<meta name="x-apple-disable-message-reformatting">\n` +
    `<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">\n` +
    `<meta name="color-scheme" content="${scheme}">\n` +
    `<meta name="supported-color-schemes" content="${scheme}">\n` +
    `<title>${escapeHtml(brand.name)}</title>\n` +
    `<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->\n` +
    `${styleBlock(dark)}\n` +
    `</head>\n` +
    `<body class="lac-bg" style="margin:0;padding:0;width:100%;word-spacing:normal;background-color:${colors.background};">\n` +
    preheaderHtml(pre) +
    `<table ${TBL} width="100%" class="lac-bg" style="background-color:${colors.background};"><tr><td align="center" style="padding:24px 0;">\n` +
    `<!--[if mso]><table ${TBL} width="${width}" align="center"><tr><td><![endif]-->\n` +
    `<table ${TBL} width="100%" class="lac-container lac-surface" style="max-width:${width}px;margin:0 auto;background-color:${colors.surface};border-radius:${Math.min(ctx.radius, 16)}px;"><tr><td>\n` +
    body +
    `\n</td></tr></table>\n` +
    `<!--[if mso]></td></tr></table><![endif]-->\n` +
    `</td></tr></table>\n` +
    `</body>\n</html>\n`;

  if (!pre) warnings.push("No preheader: the inbox preview will show the first text in the email. Set doc.preheader.");

  const images = countImages(blocks);
  const chars = countTextChars(blocks, brand);
  if (images > 0 && chars < images * 150) {
    warnings.push(
      `Image-heavy: ${images} image(s) with only ${chars} characters of text (aim for 150+ per image); image-only emails are often filtered or shown blank.`,
    );
  }

  const size = new TextEncoder().encode(html).length;
  if (size > SIZE_WARN_BYTES) {
    warnings.push(`HTML is ${(size / 1024).toFixed(1)}KB; Gmail clips messages over about 102KB. Keep it under 90KB.`);
  }

  return { html, text: docToText(blocks, brand), warnings, size };
}
