import { chromium, type Browser, type Page } from "playwright-core";
import { composeQuery, mapsSearchUrl, normalizeFields } from "./query.js";
import { enrichContacts, type Contacts } from "./enrich.js";
import { dedupeKey, filterLeads } from "./filter.js";
import { cleanWebsite, normalizePhone, sortLeads } from "./normalize.js";
import { verifyEmails } from "./verify.js";
import { haversineMeters, zoomForRadius } from "./geo.js";
import {
  parsePriceLevel,
  parseBusinessStatus,
  parseClaimed,
  parseOpenNow,
  parseCategoryTags,
} from "./parse.js";
import { computeStats } from "./export.js";
import { DEFAULT_FIELDS, ENRICHED_FIELDS, type Lead, type LeadField, type LeadStats, type SearchOptions } from "./types.js";

/** Run async `fn` over `items` with at most `n` in flight. Honours `signal`. */
async function pool<T>(
  items: T[],
  n: number,
  fn: (item: T, index: number) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length || signal?.aborted) return;
      await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
}

/** Error thrown by the scraper. Carries a machine `code` and optional cause. */
export class LeadsError extends Error {
  code?: string;
  override cause?: unknown;
  constructor(message: string, code?: string, cause?: unknown) {
    super(message);
    this.name = "LeadsError";
    if (code !== undefined) this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

/** Strip a known "Label: value" prefix from an aria-label. */
function stripPrefix(value: string | undefined, prefix: string): string | undefined {
  if (!value) return undefined;
  const v = value.startsWith(prefix) ? value.slice(prefix.length) : value;
  const trimmed = v.trim();
  return trimmed || undefined;
}

/**
 * Parse a "N reviews" / "N,234 reviews" aria-label into a count. Exported for
 * testing the messy number formats Google uses.
 */
export function parseReviewCount(label: string | null | undefined): number | undefined {
  if (!label) return undefined;
  const digits = label.replace(/[^0-9]/g, "");
  if (!digits) return undefined;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse a rating like "4.5" or "4,5" into a number in 0–5. */
export function parseRating(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const m = text.replace(",", ".").match(/\d+(\.\d+)?/);
  if (!m) return undefined;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) && n >= 0 && n <= 5 ? n : undefined;
}

/**
 * Parse latitude/longitude from a Google Maps place URL. Prefers the precise
 * `!3d<lat>!4d<lng>` place marker, falling back to the `@lat,lng` viewport.
 */
export function parseLatLng(url: string): { latitude?: number; longitude?: number } {
  const d = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (d) return { latitude: parseFloat(d[1]!), longitude: parseFloat(d[2]!) };
  const at = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at) return { latitude: parseFloat(at[1]!), longitude: parseFloat(at[2]!) };
  return {};
}

/** A stable identity for a Maps place URL: its feature id (0x…:0x…) or the URL without query/viewport. */
export function placeKey(href: string): string {
  const id = href.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i) ?? href.match(/[?&]cid=(\d+)/);
  if (id) return id[1]!.toLowerCase();
  return href.split("?")[0]!.replace(/\/@[^/]+/, "").toLowerCase();
}

/** Try to launch a browser: system Chrome, then Edge, then a bundled Chromium. */
async function launchBrowser(headless: boolean, proxy?: string): Promise<Browser> {
  let lastErr: unknown;
  // The caller handles Ctrl-C (the CLI finishes the leads in hand and saves); Playwright's own
  // handler would kill the browser and exit the process mid-write.
  const base: Parameters<typeof chromium.launch>[0] = { headless, handleSIGINT: false };
  if (proxy) base.proxy = { server: proxy };
  for (const channel of ["chrome", "msedge"] as const) {
    try {
      return await chromium.launch({ ...base, channel });
    } catch (e) {
      lastErr = e;
    }
  }
  try {
    return await chromium.launch(base);
  } catch (e) {
    lastErr = e;
  }
  throw new LeadsError(
    "Could not launch a browser. Install Google Chrome (or Microsoft Edge), or run `npx playwright install chromium`.",
    "NO_BROWSER",
    lastErr,
  );
}

/** Dismiss Google's cookie-consent screen if it appears. */
async function dismissConsent(page: Page): Promise<void> {
  try {
    const btn = page
      .locator(
        'button[aria-label*="Accept all"], button[aria-label*="Accept the use"], form[action*="consent"] button, button:has-text("Accept all")',
      )
      .first();
    if (await btn.count()) {
      await btn.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
  } catch {
    /* consent screen not present — fine */
  }
}

/** Scroll the results feed until `limit` listings load or the list ends. */
async function loadResults(
  page: Page,
  limit: number,
  delayMs: number,
  onProgress?: (m: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const feed = page.locator('div[role="feed"]');
  await feed.waitFor({ timeout: 15000 }).catch(() => {});
  let prev = 0;
  let stable = 0;
  for (let i = 0; i < 60; i++) {
    if (signal?.aborted) return;
    const count = await page.locator("a.hfpxzc").count();
    onProgress?.(`loaded ${count} listing${count === 1 ? "" : "s"}…`);
    if (count >= limit) return;
    if (await page.locator('span:has-text("reached the end")').count()) return;
    if (count === prev) {
      if (++stable >= 3) return;
    } else {
      stable = 0;
    }
    prev = count;
    await feed.evaluate((el) => el.scrollBy(0, el.scrollHeight)).catch(() => {});
    await page.waitForTimeout(Math.max(400, delayMs));
  }
}

/** Pull the requested detail fields from an open listing panel. */
async function extractDetail(
  page: Page,
  fields: Set<LeadField>,
  fallbackName?: string,
): Promise<Lead> {
  const lead: Lead = {};

  const text = async (sel: string): Promise<string | undefined> => {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      const t = (await loc.innerText({ timeout: 2000 }).catch(() => "")).trim();
      return t || undefined;
    }
    return undefined;
  };
  const aria = async (sel: string): Promise<string | undefined> => {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      return (await loc.getAttribute("aria-label", { timeout: 2000 }).catch(() => null)) ?? undefined;
    }
    return undefined;
  };

  if (fields.has("name")) lead.name = (await text("h1.DUwDvf")) ?? fallbackName;
  else if (fallbackName) lead.name = fallbackName;

  if (fields.has("category")) {
    lead.category = (await text('button[jsaction*="category"]')) ?? undefined;
  }

  if (fields.has("categories")) {
    // The panel can carry several category chips; gather and tidy them.
    const chips = await page
      .locator('button[jsaction*="category"]')
      .allInnerTexts()
      .catch(() => [] as string[]);
    const tags = parseCategoryTags([lead.category, ...chips]);
    if (tags) lead.categories = tags;
  }

  if (fields.has("rating") || fields.has("reviews")) {
    const box = page.locator("div.F7nice").first();
    if (await box.count()) {
      if (fields.has("rating")) {
        // Short timeouts: a missing element must not stall the run for Playwright's default 30 s.
        const rt = await box
          .locator('span[aria-hidden="true"]')
          .first()
          .innerText({ timeout: 1500 })
          .catch(() => "");
        lead.rating = parseRating(rt);
      }
      if (fields.has("reviews")) {
        const rv = await box
          .locator('span[aria-label*="review"]')
          .first()
          .getAttribute("aria-label", { timeout: 1500 })
          .catch(() => null);
        let count = parseReviewCount(rv);
        if (count === undefined) {
          // Fallback: Maps sometimes shows the count only as "(1,810)" text.
          const boxText = await box.innerText({ timeout: 1500 }).catch(() => "");
          const m = boxText.match(/\(([\d.,\s]+)\)/);
          if (m) count = parseReviewCount(m[1]);
        }
        lead.reviews = count;
      }
    }
  }

  if (fields.has("address")) {
    lead.address = stripPrefix(await aria('button[data-item-id="address"]'), "Address:");
  }
  if (fields.has("phone")) {
    lead.phone = stripPrefix(await aria('button[data-item-id^="phone"]'), "Phone:");
  }
  if (fields.has("website")) {
    const site = page.locator('a[data-item-id="authority"]').first();
    if (await site.count()) {
      lead.website = (await site.getAttribute("href", { timeout: 2000 }).catch(() => null)) ?? undefined;
    }
  }
  if (fields.has("priceLevel")) {
    const priceText = await text('span[aria-label^="Price"], span[aria-label*="Price:"]');
    lead.priceLevel =
      parsePriceLevel(priceText) ?? parsePriceLevel(await aria('span[aria-label^="Price"]'));
  }
  if (fields.has("latitude") || fields.has("longitude")) {
    const geo = parseLatLng(page.url());
    if (fields.has("latitude")) lead.latitude = geo.latitude;
    if (fields.has("longitude")) lead.longitude = geo.longitude;
  }
  if (fields.has("plusCode")) {
    lead.plusCode = stripPrefix(await aria('button[data-item-id="oloc"]'), "Plus code:");
  }
  // The open-hours widget's label doubles as the open-now signal.
  let hoursLabel: string | undefined;
  if (fields.has("hours") || fields.has("openNow")) {
    hoursLabel =
      (await aria('div[jsaction*="openhours"]')) ??
      (await text('div[jsaction*="openhours"]'));
    if (fields.has("hours")) lead.hours = hoursLabel;
    if (fields.has("openNow")) {
      const open = parseOpenNow(hoursLabel);
      if (open !== undefined) lead.openNow = open;
    }
  }
  if (fields.has("businessStatus")) {
    // Maps surfaces closure banners near the title/hours; default a loaded,
    // non-closed listing to operational.
    const banner =
      (await text('span[style*="rgb(217, 48, 37)"], span.fCEvvc, div.o0Svhf')) ?? hoursLabel;
    lead.businessStatus =
      parseBusinessStatus(banner) ?? parseBusinessStatus(hoursLabel) ??
      (lead.name || fallbackName ? "operational" : undefined);
  }
  if (fields.has("claimed")) {
    // A "Claim this business" affordance means unclaimed; otherwise best-effort claimed.
    const claimText = await text(
      'a[href*="business.google.com"], button[aria-label*="Claim"], a[aria-label*="Claim"]',
    );
    const c = parseClaimed(claimText);
    lead.claimed = c ?? (lead.name || fallbackName ? true : undefined);
  }
  if (fields.has("mapsUrl")) lead.mapsUrl = page.url();

  return lead;
}

/**
 * Run the Google Maps search in a real browser and collect leads. This is the
 * scraping engine behind {@link searchLeads}; prefer that wrapper.
 *
 * @throws {LeadsError} when no browser can be launched, or the search is aborted.
 */
export async function scrapeLeads(opts: SearchOptions): Promise<Lead[]> {
  const query = composeQuery(opts);
  const limit = Math.max(1, Math.trunc(opts.limit ?? 60));
  const fields = new Set(normalizeFields(opts.fields ?? DEFAULT_FIELDS));
  const delayMs = Math.max(0, Math.trunc(opts.delayMs ?? 700));
  const headless = opts.headless ?? false;
  const retries = Math.max(0, Math.trunc(opts.retries ?? 1));
  const onProgress = opts.onProgress;
  const onLead = opts.onLead;
  const signal = opts.signal;
  const startedAt = Date.now();
  const overBudget = (): boolean => opts.maxMs !== undefined && Date.now() - startedAt > opts.maxMs;
  // A politeness pause in ms, optionally jittered ±40% to look more human.
  const pauseMs = (): number =>
    opts.jitter ? Math.round(delayMs * (0.6 + Math.random() * 0.8)) : delayMs;

  // Enrichment (email/socials) needs a website, so extract it even if the user
  // didn't ask for the website column.
  const wantVerify = Boolean(opts.verifyEmails) || Boolean(opts.filters?.hasValidEmail) || fields.has("emailStatus");
  const wantEnrich =
    Boolean(opts.enrich) ||
    ENRICHED_FIELDS.some((f) => fields.has(f)) ||
    Boolean(opts.filters?.hasEmail) ||
    wantVerify;
  const near = opts.near;
  const collect = new Set<LeadField>(fields);
  if (wantEnrich) collect.add("website");
  // Website filters need the website even when it isn't an output column.
  if (opts.filters?.hasWebsite || opts.filters?.noWebsite || opts.filters?.hasContact) collect.add("website");
  // A radius search needs coordinates to measure distance, even if the user
  // didn't ask for the lat/long columns.
  if (near) { collect.add("latitude"); collect.add("longitude"); }
  // Details are needed unless the user only wants name/mapsUrl and no enrichment.
  const detailOnly: LeadField[] = ["name", "mapsUrl"];
  const wantDetails =
    (opts.details ?? true) &&
    ([...collect].some((f) => !detailOnly.includes(f)) || wantEnrich);

  onProgress?.(`searching Google Maps for "${query}"…`);
  const browser = await launchBrowser(headless, opts.proxy);
  try {
    const locale = opts.locale ?? "en-US";
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale,
    });
    const page = await context.newPage();
    // Reads on an open listing are instant or absent; never wait 30 s for an element that isn't there.
    page.setDefaultTimeout(5000);
    const urlOpts: { hl?: string; gl?: string; center?: { lat: number; lng: number; zoom?: number } } = { hl: locale };
    if (opts.region) urlOpts.gl = opts.region;
    if (near) urlOpts.center = { lat: near.lat, lng: near.lng, zoom: zoomForRadius(opts.radiusM ?? opts.zoomRadiusM ?? 2000, near.lat) };
    await page.goto(mapsSearchUrl(query, urlOpts), { waitUntil: "domcontentloaded", timeout: 45000 });
    await dismissConsent(page);

    await loadResults(page, limit, delayMs, onProgress, signal);
    if (signal?.aborted) throw new LeadsError("Search aborted.", "ABORTED");

    // Tell the caller where Google actually centred this search. A target sweep
    // uses it to tile the map, which needs no geocoding service at all.
    if (opts.onCenter) {
      const at = parseLatLng(page.url());
      if (at.latitude !== undefined && at.longitude !== undefined) {
        try { opts.onCenter({ lat: at.latitude, lng: at.longitude }); } catch { /* a bad hook never breaks a run */ }
      }
    }

    // Collect result links (name + href) from the feed.
    const cards = await page
      .locator("a.hfpxzc")
      .evaluateAll((els, lim) =>
        (els as HTMLAnchorElement[]).slice(0, lim).map((a) => ({
          href: a.href,
          name: a.getAttribute("aria-label") ?? undefined,
        })),
      limit)
      .catch(() => [] as { href: string; name?: string }[]);

    if (cards.length === 0) {
      onProgress?.("no listings found (Google may have shown a CAPTCHA or an empty result).");
      return [];
    }
    // The feed can list one place twice (an ad and the organic result): open each place once.
    {
      const seen = new Set<string>();
      const uniq = (cards as { href: string; name?: string }[]).filter((card) => {
        const k = placeKey(card.href);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (uniq.length !== cards.length) {
        onProgress?.(`${cards.length - uniq.length} listing${cards.length - uniq.length === 1 ? "" : "s"} shown twice in the feed — opening each place once.`);
        (cards as { href: string; name?: string }[]).splice(0, cards.length, ...uniq);
      }
    }

    // Drop anything the caller already has BEFORE opening listings — on an
    // overlapping map tile that is most of them, and each open costs a page load.
    if (opts.skipListing) {
      const all = cards as { href: string; name?: string }[];
      const before = all.length;
      const fresh = all.filter((card) => {
        try { return !opts.skipListing!({ name: card.name, href: card.href }); } catch { return true; }
      });
      if (fresh.length !== before) {
        onProgress?.(`${before - fresh.length} of ${before} already collected — skipping them.`);
        all.splice(0, before, ...fresh);
      }
      if (all.length === 0) return [];
    }

    // Each listing is finished on its own the moment it is read: cleaned, measured, de-duplicated,
    // enriched from its website, verified, normalised and filtered. A finished lead goes straight
    // to `onResult`, so the caller can write it to disk while the browser opens the next listing.
    // Website enrichment runs in the background, `concurrency` at a time.
    const dedupeBy = opts.dedupe ?? "smart";
    const seenKeys = new Set<string>();
    const accepted: Lead[] = [];
    const order = new Map<Lead, number>();
    const socialFields = ENRICHED_FIELDS.filter((f) => f !== "email");
    const concurrency = Math.max(1, Math.trunc(opts.concurrency ?? 3));
    let inflight = 0;
    let enriched = 0;
    const waiters: (() => void)[] = [];
    const tasks: Promise<void>[] = [];
    const settleOne = (): Promise<void> => new Promise<void>((res) => waiters.push(res));

    const finish = async (lead: Lead): Promise<void> => {
      if ((opts.cleanUrls ?? true) && lead.website) lead.website = cleanWebsite(lead.website);
      if (near && typeof lead.latitude === "number" && typeof lead.longitude === "number") {
        const m = haversineMeters(near, { lat: lead.latitude, lng: lead.longitude });
        lead.distanceKm = Math.round((m / 1000) * 100) / 100;
      }
      if (near && opts.radiusM !== undefined && !(lead.distanceKm !== undefined && lead.distanceKm * 1000 <= opts.radiusM)) return;
      // De-duplicate before the expensive website visit.
      const key = dedupeKey(lead, dedupeBy);
      if (key !== undefined) {
        if (seenKeys.has(key)) return;
        seenKeys.add(key);
      }
      if (wantEnrich && lead.website && !overBudget() && !signal?.aborted) {
        onProgress?.(`enriching ${++enriched}: ${lead.name ?? lead.website}…`);
        try {
          const c = await enrichContacts(lead.website);
          if (fields.has("email") && c.email) lead.email = c.email;
          for (const f of socialFields) {
            const v = c[f as keyof Contacts];
            if (fields.has(f) && v) (lead as Record<string, unknown>)[f] = v;
          }
        } catch { /* an unreachable website just means no contacts */ }
      }
      if (wantVerify && lead.email && !signal?.aborted) {
        try { await verifyEmails([lead], { concurrency: 1 }); } catch { /* unknown status */ }
      }
      if (opts.country && fields.has("phone") && lead.phone) lead.phone = normalizePhone(lead.phone, opts.country);
      // Filters see the enriched, verified lead, before the helper columns go.
      if (opts.filters && filterLeads([lead], opts.filters).length === 0) return;
      if (!fields.has("website")) delete lead.website;
      if (wantVerify && !fields.has("emailStatus")) delete lead.emailStatus;
      if (near) {
        if (!fields.has("latitude")) delete lead.latitude;
        if (!fields.has("longitude")) delete lead.longitude;
        if (!fields.has("distanceKm")) delete lead.distanceKm;
      }
      accepted.push(lead);
      try { opts.onResult?.(lead); } catch { /* a bad onResult never breaks the run */ }
    };

    const schedule = async (lead: Lead, index: number): Promise<void> => {
      order.set(lead, index);
      while (inflight >= concurrency) await settleOne();
      inflight++;
      tasks.push(finish(lead).catch(() => {}).finally(() => { inflight--; waiters.shift()?.(); }));
    };

    // With `remaining`, stop opening listings once the leads still being finished would cover it.
    const wantMore = async (): Promise<boolean> => {
      if (!opts.remaining) return true;
      for (;;) {
        const left = opts.remaining();
        if (left <= 0) return false;
        if (left - inflight > 0) return true;
        if (inflight === 0) return true;
        await settleOne();
      }
    };

    let read = 0;
    if (!wantDetails) {
      // Fast path: just the names + maps URLs from the feed.
      for (let i = 0; i < cards.length; i++) {
        if (signal?.aborted || !(await wantMore())) break;
        const c = cards[i]!;
        const lead: Lead = {};
        if (collect.has("name")) lead.name = c.name;
        if (collect.has("mapsUrl")) lead.mapsUrl = c.href;
        if (collect.has("latitude") || collect.has("longitude")) {
          const geo = parseLatLng(c.href);
          if (collect.has("latitude")) lead.latitude = geo.latitude;
          if (collect.has("longitude")) lead.longitude = geo.longitude;
        }
        read++;
        try { onLead?.(lead); } catch { /* ignore */ }
        await schedule(lead, i);
      }
    } else {
      for (let i = 0; i < cards.length; i++) {
        if (signal?.aborted || overBudget() || !(await wantMore())) break;
        const card = cards[i]!;
        onProgress?.(`reading ${i + 1}/${cards.length}: ${card.name ?? "listing"}…`);
        let lead: Lead | undefined;
        for (let attempt = 0; attempt <= retries; attempt++) {
          try {
            await page.goto(card.href, { waitUntil: "domcontentloaded", timeout: 30000 });
            await page.locator("h1.DUwDvf").first().waitFor({ timeout: 8000 }).catch(() => {});
            lead = await extractDetail(page, collect, card.name);
            break;
          } catch {
            if (attempt < retries && !signal?.aborted) {
              onProgress?.(`  retrying ${i + 1}/${cards.length} (attempt ${attempt + 2})…`);
              if (delayMs) await page.waitForTimeout(pauseMs());
            }
          }
        }
        if (!lead) {
          // Keep a partial rather than losing the listing entirely.
          if (card.name && (collect.has("name") || collect.has("mapsUrl"))) {
            lead = {};
            if (collect.has("name")) lead.name = card.name;
            if (collect.has("mapsUrl")) lead.mapsUrl = card.href;
          }
        }
        if (lead) {
          read++;
          try { onLead?.(lead); } catch { /* a bad onLead never breaks the run */ }
          await schedule(lead, i);
        }
        if (delayMs) await page.waitForTimeout(pauseMs());
      }
    }
    await Promise.all(tasks);
    onProgress?.(`read ${read} listing${read === 1 ? "" : "s"}.`);

    // Listing order, unless a sort was asked for.
    let leads = accepted.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    if (opts.sort) leads = sortLeads(leads, opts.sort, opts.sortDir);

    onProgress?.(`collected ${leads.length} lead${leads.length === 1 ? "" : "s"}.`);
    return leads;
  } finally {
    await browser.close().catch(() => {});
  }
}

/** A search result with aggregate stats and timing. */
export interface DetailedResult {
  leads: Lead[];
  stats: LeadStats;
  /** Wall-clock time of the search, in milliseconds. */
  elapsedMs: number;
}

/**
 * Like {@link scrapeLeads}, but also returns aggregate {@link LeadStats} and the
 * elapsed time — handy for dashboards, reports and CI summaries.
 */
export async function searchLeadsDetailed(opts: SearchOptions): Promise<DetailedResult> {
  const started = Date.now();
  const leads = await scrapeLeads(opts);
  return { leads, stats: computeStats(leads), elapsedMs: Date.now() - started };
}
