/**
 * Detail pages: read a notice's own page for its full title, its date and its
 * files, and use that to complete list items whose title was cut ("…") or that
 * had no date. Opt-in, sequential and capped, so polling stays polite.
 */
import { type ElNode, descendants, innerText, parseHTML } from "./html.js";
import { queryAll, queryOne } from "./select.js";
import { nepalDay, parseDate } from "./dates.js";
import { inChrome } from "./generic.js";
import { CTEVT_PREFIX } from "./adapters.js";
import { absUrl, attachmentType, completeTitle, isFileUrl, isTruncated, tag, titleLang, cleanTitle, type Attachment, type Notice } from "./notice.js";
import { getText, sleep, type HttpOptions } from "./http.js";

export interface NoticeDetail {
  /** The page's main heading (else og:title / <title> without the site suffix). */
  title?: string;
  /** Every title-like text on the page, best first: headings, og:title, <title>. */
  titles: string[];
  /** ISO YYYY-MM-DD (AD). */
  date?: string;
  dateBs?: string;
  dateRaw?: string;
  /** File links in the notice body. */
  attachments: Attachment[];
}

const HEADING_SEL = [
  ".detail__page-inner-content .news__title", // GIWMS (dotm, tsc, see, …)
  ".news__title",
  ".intro h3", // CTEVT
  ".detail-title", ".notice-title", ".page-title", ".entry-title",
  "article h1", "main h1", "h1",
  "article h2", "main h2",
].join(", ");

const DATE_SEL = [
  ".detail-4 .meta__group .date", // GIWMS detail
  ".detail__page-inner .post__meta .date",
  ".news__published-date .date",
  ".update-date", // CTEVT: "published on 2026-09-07"
  ".date-section", // NEB
  ".published-date", ".publish-date", ".post-date", ".entry-date",
  "time",
].join(", ");

const BODY_SEL = [".detail-4", ".detail__page-inner", ".intro", "article", "main"].join(", ");

const metaContent = (doc: ElNode, prop: string) =>
  (queryOne(doc, `meta[property="${prop}"]`) ?? queryOne(doc, `meta[name="${prop}"]`))?.attrs.content?.trim() || undefined;

const siteless = (s: string) => {
  const i = s.indexOf(" | ");
  return i > 0 ? s.slice(0, i).trim() : s.trim();
};

/** Read a notice's detail page: full title candidates, date and file links. */
export function parseDetail(html: string, baseUrl: string): NoticeDetail {
  const doc = parseHTML(html);
  const titles: string[] = [];
  const push = (s: string | undefined) => {
    const t = (s ?? "").replace(/\s+/g, " ").trim();
    if (t.length >= 3 && !titles.includes(t)) titles.push(t);
  };
  for (const h of queryAll(doc, HEADING_SEL)) if (!inChrome(h)) push(innerText(h));
  push(metaContent(doc, "og:title"));
  const titleEl = descendants(doc).find((e) => e.tag === "title");
  push(titleEl ? innerText(titleEl) : undefined);

  const out: NoticeDetail = { titles, attachments: [] };
  const best = titles[0];
  if (best) {
    let t = cleanTitle(siteless(best));
    const m = CTEVT_PREFIX.exec(t);
    if (m && /ctevt\.org\.np$/i.test(hostOf(baseUrl)) && t.length > m[0].length) t = t.slice(m[0].length);
    if (t) out.title = t;
  }

  for (const el of queryAll(doc, DATE_SEL)) {
    if (inChrome(el)) continue;
    const dt = el.attrs.datetime?.trim();
    const pd = dt && /T\d/.test(dt) ? nepalDay(dt) : parseDate(dt || innerText(el));
    if (pd) {
      out.date = pd.ad;
      if (pd.bs) out.dateBs = pd.bs;
      out.dateRaw = pd.raw.trim();
      break;
    }
  }
  if (!out.date) {
    const ts = metaContent(doc, "article:published_time");
    const pd = ts ? nepalDay(ts) : null;
    if (pd) { out.date = pd.ad; if (pd.bs) out.dateBs = pd.bs; out.dateRaw = ts; }
  }

  const scope = queryOne(doc, BODY_SEL) ?? doc;
  const seen = new Set<string>();
  for (const a of descendants(scope)) {
    if (a.tag !== "a" || inChrome(a)) continue;
    const u = absUrl(a.attrs.href, baseUrl);
    if (!u || !isFileUrl(u) || seen.has(u)) continue;
    seen.add(u);
    const att: Attachment = { url: u, type: attachmentType(u) };
    const label = innerText(a);
    if (label) att.label = label;
    out.attachments.push(att);
  }
  return out;
}

function hostOf(u: string): string {
  try { return new URL(u).hostname; } catch { return ""; }
}

export interface DetailOptions extends HttpOptions {
  /** Fetch at most this many detail pages per call (default 5). */
  maxDetails?: number;
  /** Ids you already hold (e.g. from the last run): these are never fetched. */
  knownIds?: Iterable<string>;
  /** Pause between detail requests in ms (default 1000). Requests are always sequential. */
  delayMs?: number;
  /** Also fetch details for undated items to fill `date` (default true). */
  dates?: boolean;
}

/** Apply a parsed detail page to a notice in place. Returns what changed. */
export function applyDetail(n: Notice, d: NoticeDetail): { title: boolean; date: boolean } {
  const changed = { title: false, date: false };
  if (n.truncated) {
    const full = completeTitle(n.title, [...d.titles, d.title]);
    if (full) {
      n.title = full;
      n.titleLang = titleLang(full);
      delete n.truncated;
      changed.title = true;
    }
  }
  if (!n.date && d.date) {
    n.date = d.date;
    if (d.dateBs) n.dateBs = d.dateBs;
    if (d.dateRaw) n.dateRaw = d.dateRaw;
    delete n.undated;
    changed.date = true;
  }
  for (const a of d.attachments) if (!n.attachments.some((b) => b.url === a.url)) n.attachments.push(a);
  if (changed.title) {
    const tags = [...new Set([...tag(n), ...(n.tags ?? [])])];
    if (tags.length) n.tags = tags;
  }
  return changed;
}

/** Which notices a detail pass would fetch, in list order (before the `maxDetails` cap). */
export function needsDetail(notices: Notice[], opts: Pick<DetailOptions, "knownIds" | "dates"> = {}): Notice[] {
  const known = new Set(opts.knownIds ?? []);
  const dates = opts.dates ?? true;
  return notices.filter((n) =>
    !!n.url && /^https?:\/\//i.test(n.url) && !isFileUrl(n.url) && !known.has(n.id)
    && ((n.truncated ?? isTruncated(n.title)) || (dates && !n.date)));
}

export interface DetailStats { fetched: number; completed: number; dated: number; failed: number }

/** @internal Shared by {@link completeTitles} and `fetchNotices({ details: true })`. */
export async function runDetails(notices: Notice[], opts: DetailOptions = {}): Promise<DetailStats> {
  const stats: DetailStats = { fetched: 0, completed: 0, dated: 0, failed: 0 };
  const todo = needsDetail(notices, opts).slice(0, Math.max(0, opts.maxDetails ?? 5));
  const delay = Math.max(0, opts.delayMs ?? 1000);
  for (const n of todo) {
    if (stats.fetched + stats.failed > 0 && delay) await sleep(delay);
    try {
      const r = await getText(n.url!, opts);
      if (!r.ok || r.body == null) { stats.failed++; continue; }
      stats.fetched++;
      const ch = applyDetail(n, parseDetail(r.body, r.url || n.url!));
      if (ch.title) stats.completed++;
      if (ch.date) stats.dated++;
    } catch {
      stats.failed++;
    }
  }
  return stats;
}

/**
 * Complete cut titles (and, unless `dates: false`, missing dates) by reading
 * each notice's detail page. Only items whose title ends with "…"/"..." or
 * that have no date, that have an HTML detail URL and whose id is not in
 * `knownIds` are fetched: at most `maxDetails` (default 5), one at a time,
 * `delayMs` (default 1000) apart. Notices are updated in place (ids do not
 * change) and the same array is returned. A title the page cannot complete
 * keeps `truncated: true`.
 */
export async function completeTitles(notices: Notice[], opts: DetailOptions = {}): Promise<Notice[]> {
  await runDetails(notices, opts);
  return notices;
}
