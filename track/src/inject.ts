/**
 * HTML injection: open pixel + link rewriting. Only the href value of
 * rewritten links and the inserted <img> change; every other byte of the
 * input is preserved.
 */

import { isHttpUrl } from "./token";

export interface LinkCandidate {
  /** Start/end offsets of the href value inside the HTML (without quotes). */
  start: number;
  end: number;
  /** Decoded destination URL. */
  url: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    const lower = e.toLowerCase();
    if (lower in ENTITIES) return ENTITIES[lower] as string;
    if (lower.startsWith("#x")) {
      const n = parseInt(lower.slice(2), 16);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    if (lower.startsWith("#")) {
      const n = parseInt(lower.slice(1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return m;
  });
}

export function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function ranges(html: string, re: RegExp): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const m of html.matchAll(re)) out.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  return out;
}

function inside(pos: number, rs: Array<[number, number]>): boolean {
  for (const [a, b] of rs) if (pos >= a && pos < b) return true;
  return false;
}

function normUrl(u: string): string {
  return u.trim().replace(/\/+$/, "").toLowerCase();
}

/** Find <a href> values that should be rewritten for click tracking. */
export function findTrackableLinks(html: string, baseUrl: string, unsubscribeUrls: string[] = []): LinkCandidate[] {
  const out: LinkCandidate[] = [];
  // Comments, <script>, <style> and conditional comments are never touched.
  const skip = ranges(html, /<!--[\s\S]*?(?:-->|$)|<script\b[\s\S]*?(?:<\/script\s*>|$)|<style\b[\s\S]*?(?:<\/style\s*>|$)/gi);
  const unsub = new Set(unsubscribeUrls.filter((u) => typeof u === "string").map(normUrl));
  const base = normUrl(baseUrl);
  const tagRe = /<a\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;

  for (const m of html.matchAll(tagRe)) {
    const tagStart = m.index ?? 0;
    if (inside(tagStart, skip)) continue;
    const tag = m[0];
    if (/\sdata-no-track\b/i.test(tag)) continue;

    const hrefRe = /(\shref\s*=\s*)("([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
    const h = hrefRe.exec(tag);
    if (!h) continue;
    const rawVal = h[3] ?? h[4] ?? h[5] ?? "";
    const quoted = h[3] !== undefined || h[4] !== undefined;
    const valOffset = (h.index ?? 0) + (h[1] as string).length + (quoted ? 1 : 0);
    const start = tagStart + valOffset;
    const end = start + rawVal.length;

    const url = decodeEntities(rawVal).trim();
    if (!isHttpUrl(url)) continue; // mailto:, tel:, #anchor, relative, javascript: …
    if (/\{\{|\}\}|%7B%7B|\{%|\*\|/i.test(url)) continue; // template placeholders ({{x}}, {% x %}, *|X|*)
    if (/unsubscribe|opt-?out/i.test(url)) continue;
    if (unsub.has(normUrl(url))) continue;
    if (base && normUrl(url).startsWith(base + "/c/")) continue; // already tracked

    // Look at the link text up to the closing </a>.
    const after = html.slice(tagStart + tag.length);
    const close = after.search(/<\/a\s*>/i);
    const inner = close >= 0 ? after.slice(0, close) : "";
    const text = decodeEntities(inner.replace(/<[^>]*>/g, " "));
    if (/unsubscribe|opt[\s-]?out/i.test(text)) continue;

    out.push({ start, end, url });
  }
  return out;
}

/** Insert `snippet` just before the last </body>, or at the end if there is none. */
export function insertBeforeBodyEnd(html: string, snippet: string): string {
  const re = /<\/body\s*>/gi;
  let last = -1;
  for (const m of html.matchAll(re)) last = m.index ?? -1;
  if (last < 0) return html + snippet;
  return html.slice(0, last) + snippet + html.slice(last);
}

export function pixelTag(src: string): string {
  return `<img src="${escapeAttr(src)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`;
}
