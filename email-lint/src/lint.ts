import { analyzeHtml, collapse } from "./html";
import type { HtmlAnalysis } from "./html";
import { messageFor } from "./messages";
import type { Detail } from "./messages";
import { spamPhrases } from "./phrases";
import { RULES, RULE_IDS } from "./rules";
import type { Grade, Issue, LintInput, LintOptions, LintResult, LintStats, RuleId, Severity } from "./types";

const KB = 1024;
const MB = 1024 * 1024;
/** Warn above this many bytes of HTML. */
const CLIP_WARN = 90 * KB;
/** Gmail clips above roughly this many bytes of HTML. */
const CLIP_ERROR = 102 * KB;

const PENALTY: Record<Severity, number> = { error: 20, warn: 8, info: 2 };
const ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

const RISKY_EXT = ["exe", "js", "scr", "bat", "vbs", "jar", "iso", "docm", "xlsm"];

const SHORTENERS = ["bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "is.gd", "cutt.ly", "rebrand.ly"];

/** Two-label public suffixes common enough to matter for "same site" checks. Not the full PSL. */
const SECOND_LEVEL = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "ltd.uk", "plc.uk", "com.np", "org.np", "edu.np",
  "gov.np", "net.np", "co.in", "net.in", "org.in", "gov.in", "ac.in", "com.au", "net.au", "org.au",
  "edu.au", "gov.au", "co.nz", "org.nz", "co.jp", "ne.jp", "or.jp", "ac.jp", "com.br", "com.cn",
  "com.sg", "com.my", "com.hk", "com.tw", "co.za", "com.mx", "com.ar", "co.kr", "com.tr", "com.pk",
  "com.bd", "com.ph", "co.id", "co.th", "com.vn", "com.sa", "com.eg", "com.ng", "co.ke",
]);

const FILE_EXT = new Set([
  "pdf", "jpg", "jpeg", "png", "gif", "webp", "svg", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "zip", "html", "htm", "txt", "csv", "mp3", "mp4", "mov", "json", "xml", "js", "css", "php", "aspx",
]);

function utf8Bytes(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

function header(headers: LintInput["headers"], name: string): string | undefined {
  if (!headers) return undefined;
  const want = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() !== want) continue;
    const v = headers[k];
    if (v === undefined || v === null) continue;
    return Array.isArray(v) ? v.join(", ") : String(v);
  }
  return undefined;
}

function hostOf(url: string): string | undefined {
  const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/?#@]*@)?(\[[^\]]*\]|[^/?#:]*)/i.exec(url.trim());
  return m ? (m[1] as string).toLowerCase().replace(/\.$/, "") : undefined;
}

function isIp(host: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || /^\[[0-9a-f:.]+\]$/i.test(host) || /^0x[0-9a-f]+$/i.test(host) || /^\d{8,10}$/.test(host);
}

function registrable(host: string): string {
  const h = host.toLowerCase().replace(/^www\d*\./, "");
  if (isIp(h)) return h;
  const parts = h.split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const last2 = parts.slice(-2).join(".");
  if (SECOND_LEVEL.has(last2)) return parts.slice(-3).join(".");
  return last2;
}

function isShortener(host: string): string | undefined {
  return SHORTENERS.find((s) => host === s || host.endsWith("." + s));
}

/** A domain or URL shown in link text, as a host name, or undefined. */
function domainInText(text: string): string | undefined {
  const url = /\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"']+/i.exec(text);
  if (url) return hostOf(url[0]);
  const re = /(?:^|[^\p{L}\p{N}@.\-])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,24}))(?=$|[^\p{L}\p{N}\-@]|\.(?:$|\s))/giu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const tld = (m[2] as string).toLowerCase();
    if (FILE_EXT.has(tld)) continue;
    return (m[1] as string).toLowerCase();
  }
  return undefined;
}

function short(s: string, max = 80): string {
  const t = collapse(s);
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

function list(items: string[], max = 3): string {
  const uniq = [...new Set(items)];
  const shown = uniq.slice(0, max).map((s) => `"${short(s, 60)}"`).join(", ");
  return uniq.length > max ? `${shown} and ${uniq.length - max} more` : shown;
}

const UNSUB_RE = /unsubscribe|unsub\b|opt[\s-]?out|manage\s+(?:your\s+)?(?:email\s+)?(?:preferences|subscriptions?)|email\s+preferences|सदस्यता\s*(?:रद्द|हटाउ)|अनसब्स्क्राइब/iu;

const ADDRESS_RE = [
  /\b\d[\w\-/]*,?\s+(?:[\p{L}'.\-]+\s+){0,4}(?:street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|lane|ln\.?|drive|dr\.?|way|court|ct\.?|place|pl\.?|highway|hwy\.?|marg|path|chowk|tole|suite|floor)(?=$|[^\p{L}])/iu,
  /\bp\.?\s*o\.?\s*box\s*\d+/i,
  /\b(?:street|road|avenue|boulevard|lane|marg|chowk|tole|suite|floor)\b[^\n]{0,80}?\b\d{4,6}\b/iu,
];

function hasPostalAddress(text: string): boolean {
  return ADDRESS_RE.some((r) => r.test(text));
}

interface Raw {
  id: RuleId;
  severity?: Severity;
  detail?: Detail;
}

function words(text: string): string[] {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
}

export function lintEmail(input: LintInput, opts: LintOptions = {}): LintResult {
  const inp: LintInput = input ?? {};
  const bulk = !!(inp.bulk || opts.requireUnsubscribe);
  const raws: Raw[] = [];
  const add = (id: RuleId, detail: Detail = {}, severity?: Severity) => raws.push({ id, detail, severity });

  const html = typeof inp.html === "string" && inp.html.trim() ? inp.html : undefined;
  const text = typeof inp.text === "string" ? inp.text : undefined;
  const a: HtmlAnalysis | undefined = html !== undefined ? analyzeHtml(html) : undefined;

  const bodyText = a ? a.visibleText : collapse(text ?? "");
  const bodyWords = words(bodyText);
  const sizeBytes = html !== undefined ? utf8Bytes(html) : 0;

  // ----- size -----
  if (sizeBytes > CLIP_WARN) {
    const kb = Math.round((sizeBytes / KB) * 10) / 10;
    if (sizeBytes > CLIP_ERROR) add("html.too_large", { n: kb, variant: "clip" }, "error");
    else add("html.too_large", { n: kb }, "warn");
  }
  const atts = Array.isArray(inp.attachments) ? inp.attachments : [];
  const totalAtt = atts.reduce((s, x) => s + (Number.isFinite(x?.size) ? Math.max(0, x.size) : 0), 0);
  if (totalAtt > 10 * MB) {
    const mb = Math.round((totalAtt / MB) * 10) / 10;
    add("attachment.large", { n: mb, variant: totalAtt > 25 * MB ? "over" : undefined }, totalAtt > 25 * MB ? "error" : "warn");
  }
  const risky = atts
    .map((x) => String(x?.filename ?? ""))
    .filter((f) => {
      const m = /\.([a-z0-9]+)\s*$/i.exec(f);
      return !!m && RISKY_EXT.includes((m[1] as string).toLowerCase());
    });
  if (risky.length) add("attachment.risky_type", { count: risky.length, sample: risky.slice(0, 3).join(", ") });

  // ----- content -----
  if (html !== undefined && !(text ?? "").trim()) add("text.missing_plain");

  let imageCount = 0;
  let linkCount = 0;
  if (a) {
    const imgs = a.images.filter((i) => !i.tracking);
    imageCount = imgs.length;
    if (imageCount > 0) {
      if (bodyWords.length < 15) add("images.only", { count: imageCount });
      else if (bodyWords.length / imageCount < 40) add("images.high_ratio", { count: imageCount, n: Math.round(bodyWords.length / imageCount) });
    }
    const noAlt = imgs.filter((i) => !("alt" in i.attrs));
    if (noAlt.length) add("images.missing_alt", { count: noAlt.length, sample: noAlt[0]?.attrs["src"] });
    const noDim = imgs.filter((i) => {
      const st = (i.attrs["style"] ?? "").toLowerCase();
      return !(("width" in i.attrs || /(^|;|\s)width\s*:/.test(st)) && ("height" in i.attrs || /(^|;|\s)height\s*:/.test(st)));
    });
    if (noDim.length) add("images.no_dimensions", { count: noDim.length, sample: noDim[0]?.attrs["src"] });

    const b64 = a.images.filter((i) => /^\s*data:/i.test(i.attrs["src"] ?? "")).length +
      a.css.reduce((s, c) => s + (c.match(/url\(\s*['"]?\s*data:/gi)?.length ?? 0), 0);
    if (b64) add("images.base64", { count: b64 });

    // links
    const mismatch: string[] = [];
    const shortened: string[] = [];
    const ip: string[] = [];
    let insecure = 0;
    let js = 0;
    let empty = 0;
    for (const l of a.links) {
      const href = (l.href ?? "").trim();
      if (!href || href === "#") {
        if (l.href !== undefined || l.text) empty++;
        continue;
      }
      linkCount++;
      if (/^javascript:/i.test(href.replace(/[\s\u0000-\u001f]/g, ""))) { js++; continue; }
      if (/^(mailto|tel|sms):/i.test(href)) continue;
      const host = hostOf(href);
      if (!host) continue;
      if (/^http:/i.test(href)) insecure++;
      if (isIp(host)) ip.push(href);
      const sh = isShortener(host);
      if (sh) shortened.push(sh);
      const shown = domainInText(l.text);
      if (shown && !isIp(host) && registrable(shown) !== registrable(host)) mismatch.push(`${short(l.text, 40)} → ${host}`);
      else if (shown && isIp(host) && shown !== host) mismatch.push(`${short(l.text, 40)} → ${host}`);
    }
    if (mismatch.length) add("links.text_mismatch", { count: mismatch.length, sample: mismatch[0] });
    if (shortened.length) add("links.shortener", { count: shortened.length, sample: [...new Set(shortened)].join(", ") });
    if (ip.length) add("links.ip_address", { count: ip.length, sample: short(ip[0] as string, 60) });
    if (insecure) add("links.http_insecure", { count: insecure });
    if (js) add("links.javascript", { count: js });
    if (empty) add("links.empty", { count: empty });
  } else if (text) {
    const urls = text.match(/\bhttps?:\/\/[^\s<>"')\]]+/gi) ?? [];
    linkCount = urls.length;
    const shortened = urls.map(hostOf).filter((h): h is string => !!h).map(isShortener).filter((s): s is string => !!s);
    if (shortened.length) add("links.shortener", { count: shortened.length, sample: [...new Set(shortened)].join(", ") });
    const ip = urls.filter((u) => { const h = hostOf(u); return !!h && isIp(h); });
    if (ip.length) add("links.ip_address", { count: ip.length, sample: short(ip[0] as string, 60) });
    const insecure = urls.filter((u) => /^http:/i.test(u)).length;
    if (insecure) add("links.http_insecure", { count: insecure });
  }
  if (linkCount > 50) add("links.too_many", { count: linkCount });

  // ----- subject -----
  if (inp.subject !== undefined) {
    const subject = String(inp.subject ?? "");
    const s = subject.trim();
    if (!s) add("subject.missing");
    else {
      const len = [...s].length;
      if (len > 78) add("subject.too_long", { n: len });
      const upper = (s.match(/\p{Lu}/gu) ?? []).length;
      const lower = (s.match(/\p{Ll}/gu) ?? []).length;
      if (upper >= 6 && upper / (upper + lower) >= 0.7) add("subject.all_caps");
      const punct = /!{2,}|\?{2,}|[!?]{3,}|\${2,}/.exec(s);
      const bangs = (s.match(/!/g) ?? []).length;
      if (punct || bangs >= 3) add("subject.excess_punctuation", { sample: punct ? punct[0] : "!".repeat(bangs) });
      const sp = spamPhrases(s);
      if (sp.length) add("subject.spammy", { count: sp.length, sample: list(sp) });
      if (bulk && /^\s*(?:re|fwd?|fw)\s*(?:\[\d+\])?\s*:/i.test(s)) add("subject.fake_reply");
      const emoji = (s.match(/\p{Extended_Pictographic}/gu) ?? []).length;
      if (emoji >= 3) add("subject.emoji_heavy", { count: emoji });
    }
  }

  // ----- body -----
  const phraseText = [inp.preheader ?? "", bodyText].join(" \n ");
  const phrases = spamPhrases(phraseText);
  if (phrases.length) add("body.spammy_phrases", { count: phrases.length, sample: list(phrases) }, phrases.length >= 5 ? "error" : "warn");

  const cased = bodyWords.map((w) => w.replace(/[^\p{L}]/gu, "")).filter((w) => w.length >= 2 && /\p{Lu}|\p{Ll}/u.test(w));
  const caps = cased.filter((w) => w === w.toUpperCase() && w !== w.toLowerCase());
  if (cased.length >= 8 && caps.length / cased.length >= 0.25) add("body.all_caps_ratio", { n: Math.round((caps.length / cased.length) * 100), count: caps.length });

  const bangs = (bodyText.match(/!/g) ?? []).length;
  const run = /!{2,}/.test(bodyText);
  if (run || bangs > 5) add("body.excess_exclamation", { count: bangs, variant: run ? "run" : undefined });

  let preheaderFound = !!(inp.preheader ?? "").trim();
  if (a) {
    const groups = [...a.hiddenGroups];
    if (a.hiddenPreheader !== undefined && a.hiddenPreheader.length < 150) {
      preheaderFound = true;
      const k = groups.indexOf(a.hiddenPreheader);
      if (k >= 0) groups.splice(k, 1);
    }
    if (groups.length) add("body.hidden_text", { count: groups.length, sample: list(groups, 2) });

    // ----- css / clients -----
    const scripts = (a.tagCounts["script"] ?? 0) + a.eventHandlers;
    if (scripts) add("css.script", { count: scripts });
    if (a.stylesheetLinks) add("css.external_stylesheet", { count: a.stylesheetLinks });
    const css = a.css.join("\n");
    const imports = css.match(/@import\b/gi)?.length ?? 0;
    if (imports) add("css.import", { count: imports });
    const layout = css.match(/\bposition\s*:\s*(?:absolute|fixed)\b|\bdisplay\s*:\s*(?:inline-)?(?:flex|grid)\b/gi) ?? [];
    if (layout.length) add("css.layout_unsupported", { count: layout.length, sample: [...new Set(layout.map((x) => x.toLowerCase().replace(/\s+/g, "")))].slice(0, 3).join(", ") });
    const bgImg = css.match(/\bbackground(?:-image)?\s*:[^;{}]*url\(/gi)?.length ?? 0;
    if (bgImg) add("css.background_image", { count: bgImg });
    const forms = ["form", "input", "select", "textarea"].reduce((s, t) => s + (a.tagCounts[t] ?? 0), 0);
    if (forms) add("html.form", { count: forms });
    const embeds = ["iframe", "video", "embed", "object"].filter((t) => a.tagCounts[t]);
    if (embeds.length) add("html.embed", { count: embeds.reduce((s, t) => s + (a.tagCounts[t] ?? 0), 0), sample: embeds.map((t) => `<${t}>`).join(", ") });
    if (a.tagCounts["svg"]) add("svg.inline", { count: a.tagCounts["svg"] });

    const bad = a.unclosed.length + a.stray.length;
    if (bad) {
      const sample = [...a.unclosed.map((t) => `<${t}>`), ...a.stray.map((t) => `</${t}>`)];
      add("html.malformed", { count: bad, sample: [...new Set(sample)].slice(0, 4).join(", ") }, bad > 3 ? "warn" : "info");
    }
  }

  // ----- compliance -----
  if (bulk) {
    const lu = header(inp.headers, "List-Unsubscribe");
    const lup = header(inp.headers, "List-Unsubscribe-Post");
    const visibleUnsub = a
      ? a.links.some((l) => (l.href ?? "").trim() && (UNSUB_RE.test(l.text) || UNSUB_RE.test(l.href ?? "")))
      : UNSUB_RE.test(text ?? "");
    const hasHeader = !!lu && /<[^>]+>|https?:|mailto:/i.test(lu);
    if (!hasHeader && !visibleUnsub) add("bulk.no_unsubscribe");
    else if (!hasHeader) add("bulk.no_one_click", { variant: "no-header" });
    else {
      const httpsUrl = /<\s*https:\/\//i.test(lu as string) || /(^|[\s,])https:\/\//i.test(lu as string);
      const oneClick = !!lup && /list-unsubscribe\s*=\s*one-click/i.test(lup);
      if (!httpsUrl || !oneClick) add("bulk.no_one_click");
    }
    const addrText = [bodyText, text ?? ""].join("\n");
    if (!hasPostalAddress(addrText)) add("bulk.no_postal_address");
    if (html !== undefined && !preheaderFound) add("preheader.missing");
  }

  // ----- other -----
  if (inp.from) {
    const addr = /<([^>]*)>/.exec(inp.from)?.[1] ?? inp.from;
    const local = addr.split("@")[0] ?? "";
    if (/^(?:no[-_.]?reply|do[-_.]?not[-_.]?reply|noreply)(?:[-_.+].*)?$/i.test(local.trim())) add("from.noreply");
  }

  // ----- overrides, messages, score -----
  const overrides = opts.rules ?? {};
  const issues: Issue[] = [];
  const seen = new Set<string>();
  for (const r of raws) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const meta = RULES[r.id];
    if (meta.bulkOnly && !bulk) continue;
    const o = overrides[r.id];
    if (o === "off") continue;
    const severity: Severity = o === "error" || o === "warn" || o === "info" ? o : r.severity ?? meta.severity;
    const d = r.detail ?? {};
    const { message, fix } = messageFor(r.id, d, opts.locale);
    const issue: Issue = { id: r.id, severity, message };
    if (fix) issue.fix = fix;
    if (meta.clients) issue.clients = [...meta.clients];
    if (d.count !== undefined) issue.count = d.count;
    if (d.sample) issue.sample = short(d.sample, 120);
    issues.push(issue);
  }
  const rank = (id: string) => RULE_IDS.indexOf(id as RuleId);
  issues.sort((x, y) => ORDER[x.severity] - ORDER[y.severity] || rank(x.id) - rank(y.id));

  const score = Math.max(0, Math.min(100, 100 - issues.reduce((s, i) => s + PENALTY[i.severity], 0)));
  const grade: Grade = score >= 80 ? "good" : score >= 55 ? "fair" : "poor";

  const stats: LintStats = {
    sizeBytes,
    imageCount,
    linkCount,
    textToImageRatio: Math.round((bodyWords.length / Math.max(imageCount, 1)) * 100) / 100,
    textChars: bodyText.length,
    wordCount: bodyWords.length,
  };
  return { score, grade, issues, stats };
}

/** Alias of {@link lintEmail}. */
export const lint = lintEmail;
