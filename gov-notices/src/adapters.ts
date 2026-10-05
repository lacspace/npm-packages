/**
 * Site adapters. Each reads one site's notice-list markup (or JSON feed) into
 * raw notices; {@link ./notice.ts finalize} does the rest.
 */
import { type ElNode, childElements, innerText } from "./html.js";
import { queryAll, queryOne } from "./select.js";
import { fuller, isFileUrl, type AttachmentType, type RawNotice } from "./notice.js";
import { genericParse } from "./generic.js";

export interface Adapter {
  id: string;
  /** Hostnames this adapter handles (a leading "www." is ignored when matching). */
  hosts: string[];
  /** Read the parsed HTML document. */
  parse(doc: ElNode, baseUrl: string): RawNotice[];
  /** Read a JSON body (sites whose list is an API). */
  parseJson?(data: unknown, baseUrl: string): RawNotice[];
}

const attr = (el: ElNode | undefined, name: string) => (el?.attrs[name] ?? "").trim();
const text = (el: ElNode | undefined) => (el ? innerText(el) : "");
/** The `.category__title` heading of the section an element sits in. */
const sectionTitle = (el: ElNode): string | undefined => {
  let hops = 0;
  for (let p: ElNode | undefined = el; p?.parent && hops < 6; p = p.parent, hops++) {
    const sibs = childElements(p.parent);
    for (let i = sibs.indexOf(p) - 1; i >= 0; i--) {
      const s = sibs[i]!;
      const h = s.attrs.class?.includes("category__title") ? s : queryOne(s, ".category__title");
      if (h) return text(h) || undefined;
    }
  }
  return undefined;
};
const inRelated = (el: ElNode) => {
  for (let p: ElNode | undefined = el; p; p = p.parent) if (/related/.test(p.attrs.class ?? "")) return true;
  return false;
};

/** Shared Government Integrated Website Management System (tsc, see, dotm, …): category tables. */
export const giwms: Adapter = {
  id: "giwms",
  hosts: ["tsc.gov.np", "see.gov.np", "dotm.gov.np"],
  parse(doc) {
    const out: RawNotice[] = [];
    const heading = text(queryOne(doc, ".category__title")) || undefined;
    for (const tr of queryAll(doc, ".org-table-wrapper table tbody tr, table.table tbody tr")) {
      const tds = childElements(tr, "td");
      if (tds.length < 3) continue;
      const files = queryAll(tr, "a").map((a) => attr(a, "href")).filter((h) => h && isFileUrl(h));
      const view = queryOne(tr, "a.info__link");
      out.push({
        title: fuller(text(tds[1]), attr(view, "data-title"), attr(view, "title")),
        dateText: text(tds[2]),
        url: attr(view, "href") || files[0],
        attachments: files.map((url) => ({ url })),
        category: heading,
      });
    }
    if (out.length) return out;
    // Category grids and homepage blocks: `.grid__card` with a `.card__title`.
    for (const card of queryAll(doc, ".grid__card")) {
      if (inRelated(card)) continue;
      const titleEl = queryOne(card, ".card__title");
      if (!titleEl) continue;
      const link = queryOne(titleEl, "a") ?? queryOne(card, "a.card__group") ?? queryOne(card, "a");
      const files = queryAll(card, "a").map((a) => attr(a, "href")).filter((h) => h && isFileUrl(h));
      // Only content posts and files; skips service tiles and carousel slides.
      if (!/\/content\//.test(attr(link, "href")) && !files.length) continue;
      const dateEl = queryOne(card, ".post__date") ?? queryOne(card, ".post-meta") ?? queryOne(card, ".date");
      out.push({
        title: fuller(text(titleEl), attr(link, "title"), attr(link, "data-title")),
        dateText: text(dateEl) || undefined,
        url: attr(link, "href") || files[0],
        attachments: files.map((url) => ({ url })),
        category: sectionTitle(card) ?? heading,
      });
    }
    return out.length ? out : genericParse(doc);
  },
};

/** National Examinations Board: homepage tabs (notices / results / routines) + highlight cards with PDFs. */
export const neb: Adapter = {
  id: "neb",
  hosts: ["neb.gov.np"],
  parse(doc) {
    const out: RawNotice[] = [];
    const labels = new Map<string, string>();
    for (const a of queryAll(doc, "a.tab-text")) labels.set(attr(a, "href").replace(/^#/, ""), text(a));
    // PDFs shown on the highlight cards, keyed by detail URL.
    const pdfs = new Map<string, string>();
    for (const card of queryAll(doc, ".grid__card")) {
      const d = attr(queryOne(card, ".card__title a"), "href");
      const f = attr(queryOne(card, "a.btn__download"), "href");
      if (d && f) pdfs.set(d, f);
    }
    for (const pane of queryAll(doc, ".tab-pane")) {
      const category = labels.get(attr(pane, "id"));
      if (!category) continue;
      for (const a of queryAll(pane, "a.news-title")) {
        const box = a.parent!;
        const href = attr(a, "href");
        const pdf = pdfs.get(href);
        out.push({
          title: fuller(text(a), attr(a, "title")),
          dateText: text(queryOne(box, ".date-section")),
          url: href,
          attachments: pdf ? [{ url: pdf, label: "डाउनलोड" }] : isFileUrl(href) ? [{ url: href }] : [],
          category,
        });
      }
    }
    if (!out.length) {
      for (const card of queryAll(doc, ".grid__card")) {
        const a = queryOne(card, ".card__title a");
        if (!a) continue;
        const f = attr(queryOne(card, "a.btn__download"), "href");
        out.push({ title: text(a), dateText: text(queryOne(card, ".span")), url: attr(a, "href"), attachments: f ? [{ url: f }] : [] });
      }
    }
    return out.length ? out : genericParse(doc);
  },
};

/** Medical Education Commission: `.listing .blog` cards. */
export const mec: Adapter = {
  id: "mec",
  hosts: ["mec.gov.np"],
  parse(doc) {
    const out: RawNotice[] = [];
    for (const card of queryAll(doc, ".listing .blog")) {
      const box = queryOne(card, ".has-url");
      const tags = queryAll(card, ".tag").map(text).filter(Boolean);
      const files = queryAll(card, "a").map((a) => ({ url: attr(a, "href"), label: attr(a, "title") })).filter((f) => isFileUrl(f.url));
      const detail = attr(box, "data-href") || queryAll(card, "a").map((a) => attr(a, "href")).find((h) => /\/detail\//.test(h));
      out.push({
        title: text(queryOne(card, "h4")) || text(queryOne(card, "h3")),
        dateText: text(queryOne(card, ".date")),
        url: detail || files[0]?.url,
        attachments: files,
        category: tags.length ? tags.join(" / ") : undefined,
      });
    }
    return out.length ? out : genericParse(doc);
  },
};

/** The "2083-5-30 - Admin - " prefix on CTEVT titles (group 1 = the section). */
export const CTEVT_PREFIX = /^\s*[0-9०-९]{4}[-./][0-9०-९]{1,2}[-./][0-9०-९]{1,2}\s*-?\s*(?:([A-Za-z][A-Za-z &]{1,24}?)\s*-\s*)?/;

/** CTEVT: `.list-links li` with the link text and an AD date in `p.des`. */
export const ctevt: Adapter = {
  id: "ctevt",
  hosts: ["ctevt.org.np"],
  parse(doc) {
    const out: RawNotice[] = [];
    for (const li of queryAll(doc, ".list-links li")) {
      const a = queryOne(li, ".notice-link a") ?? queryOne(li, "a");
      if (!a) continue;
      const href = attr(a, "href");
      // Long titles are cut with "..." on the list; use a title/data attribute when the site provides one.
      const t = fuller(text(a), attr(a, "title"), attr(a, "data-title"), attr(a, "aria-label"));
      // Titles carry their own prefix: "2083-5-30 - Admin - …", "2083-05-26- Exam- …".
      const m = CTEVT_PREFIX.exec(t);
      out.push({
        title: m && t.length > m[0].length ? t.slice(m[0].length) : t,
        ...(m?.[1] ? { category: m[1].trim() } : {}),
        dateText: text(queryOne(li, ".des")) || m?.[0] || undefined,
        url: href,
        attachments: isFileUrl(href) ? [{ url: href }] : [],
      });
    }
    return out.length ? out : genericParse(doc);
  },
};

interface PscFile { location?: string; file_type?: string; name?: string; extension?: string }
interface PscBranchItem { id?: number; heading?: string; shown_heading?: string; date_upload?: string; date_upload_bs?: string; files?: (PscFile & { model_type?: string })[] }
interface PscItem { title?: string; title_np?: string; upload_date?: string; upload_date_bs?: string; slug?: string; file_url?: string | null; files?: PscFile[] }

const extType = (ext: string | undefined): AttachmentType | undefined => {
  const e = (ext ?? "").toLowerCase();
  if (e === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(e)) return "image";
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(e)) return "doc";
  return undefined;
};

const PSC_KINDS = {
  written_result: { category: "लिखित नतिजा", tags: ["result"] },
  recommendation: { category: "सिफारिस", tags: ["result", "recommendation"] },
} as const;

/**
 * PSC results lists (`/front/branch-details/all/<type>`): written results and
 * final recommendations. Items link to the site's own detail route
 * `/category/<type>/<id>`, which is stable, with the PDFs as attachments.
 */
function pscBranch(list: PscBranchItem[], baseUrl: string): RawNotice[] {
  const origin = new URL(baseUrl).origin;
  const pageKind: keyof typeof PSC_KINDS = /recommend/i.test(baseUrl) ? "recommendation" : "written_result";
  return list.map((it) => {
    const model = it.files?.[0]?.model_type ?? "";
    const kind: keyof typeof PSC_KINDS = /Recommended/i.test(model) ? "recommendation" : /Resultheading/i.test(model) ? "written_result" : pageKind;
    const files = (it.files ?? []).map((f) => ({ url: (f.location || f.file_type || "").trim(), label: f.name, type: extType(f.extension) })).filter((f) => f.url);
    const title = (it.shown_heading || it.heading || "").replace(/<[^>]+>/g, " ").trim();
    return {
      title,
      date: it.date_upload || undefined,
      dateBs: it.date_upload_bs ? it.date_upload_bs.replace(/\b(\d)\b/g, "0$1") : undefined,
      dateText: it.date_upload_bs || it.date_upload,
      url: it.id != null ? `${origin}/category/${kind}/${it.id}` : files[0]?.url,
      attachments: files,
      category: PSC_KINDS[kind].category,
      tags: [...PSC_KINDS[kind].tags],
    } satisfies RawNotice;
  });
}

/** Public Service Commission: the site is a Vue app; its list comes from `/front/category/<slug>` JSON. */
export const psc: Adapter = {
  id: "psc",
  hosts: ["psc.gov.np"],
  parse(doc) {
    return genericParse(doc);
  },
  parseJson(data, baseUrl) {
    const branch = (data as { data?: { dataList?: { data?: PscBranchItem[] } | PscBranchItem[] } }).data?.dataList;
    if (branch) return pscBranch(Array.isArray(branch) ? branch : branch.data ?? [], baseUrl);
    const d = (data as { data?: { category?: { name?: string; name_np?: string }; children?: { data?: PscItem[] } | PscItem[] } }).data;
    const list = Array.isArray(d?.children) ? d!.children : d?.children?.data ?? [];
    const category = d?.category?.name_np || d?.category?.name;
    return list.map((it) => {
      const files = (it.files ?? []).map((f) => ({ url: (f.location || f.file_type || "").trim(), label: f.name, type: extType(f.extension) })).filter((f) => f.url);
      if (it.file_url && /^(https?:)?\/|\.\w{2,5}$/i.test(it.file_url)) files.unshift({ url: it.file_url, label: undefined, type: undefined });
      const title = (it.title_np || it.title || "").trim();
      return {
        title,
        date: it.upload_date || undefined,
        dateBs: it.upload_date_bs ? it.upload_date_bs.replace(/\b(\d)\b/g, "0$1") : undefined,
        dateText: it.upload_date_bs || it.upload_date,
        url: files[0]?.url,
        attachments: files,
        category,
      } satisfies RawNotice;
    });
  },
};

interface NecMedia { image?: string; fileName?: string; mediaType?: string }
interface NecItem { _id?: string; id?: string; title?: string; createdAt?: string; publishedAt?: string; attachments?: NecMedia[]; coverMediaId?: NecMedia | null; categoryId?: { name?: string } | null }

/** Nepal Engineering Council: a Next.js app; notices come from a tRPC endpoint (`notice.getNoticesPublic`). */
export const nec: Adapter = {
  id: "nec",
  hosts: ["nec.gov.np"],
  parse(doc) {
    return genericParse(doc);
  },
  parseJson(data, baseUrl) {
    const root = Array.isArray(data) ? data[0] : data;
    const payload = (root as { result?: { data?: unknown } })?.result?.data as { json?: unknown } | undefined;
    const body = (payload && typeof payload === "object" && "json" in payload ? payload.json : payload) as { notices?: NecItem[] } | undefined;
    const origin = new URL(baseUrl).origin;
    return (body?.notices ?? []).map((n) => {
      const media = [...(n.attachments ?? []), ...(n.coverMediaId ? [n.coverMediaId] : [])];
      const attachments = media.filter((m) => m.image).map((m) => ({
        url: encodeURI(m.image!.startsWith("http") ? m.image! : origin + m.image!),
        label: m.fileName,
        type: m.mediaType === "PDF" ? ("pdf" as const) : m.mediaType === "IMAGE" ? ("image" as const) : undefined,
      }));
      const id = n._id ?? n.id;
      return {
        title: n.title ?? "",
        timestamp: n.publishedAt || n.createdAt,
        url: id ? `${origin}/notices/${id}` : attachments[0]?.url,
        attachments,
        category: n.categoryId?.name,
      } satisfies RawNotice;
    });
  },
};

/** The fallback: find the most notice-list-like table or list on any page. */
export const generic: Adapter = { id: "generic", hosts: [], parse: (doc) => genericParse(doc) };

export const ADAPTERS: Adapter[] = [psc, neb, giwms, mec, ctevt, nec];

/** The adapter for a hostname, or the generic one. */
export function adapterFor(host: string): Adapter {
  const h = host.toLowerCase().replace(/^www\./, "");
  return ADAPTERS.find((a) => a.hosts.some((x) => h === x || h.endsWith(`.${x}`))) ?? generic;
}
