import { chromium, type Browser, type Page } from "playwright-core";
import { composeQuery, mapsSearchUrl, normalizeFields } from "./query.js";
import { enrichContacts } from "./enrich.js";
import { dedupeLeads, filterLeads } from "./filter.js";
import { DEFAULT_FIELDS, ENRICHED_FIELDS, type Lead, type LeadField, type SearchOptions } from "./types.js";

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

/** Try to launch a browser: system Chrome, then Edge, then a bundled Chromium. */
async function launchBrowser(headless: boolean): Promise<Browser> {
  let lastErr: unknown;
  for (const channel of ["chrome", "msedge"] as const) {
    try {
      return await chromium.launch({ headless, channel });
    } catch (e) {
      lastErr = e;
    }
  }
  try {
    return await chromium.launch({ headless });
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
      const t = (await loc.innerText().catch(() => "")).trim();
      return t || undefined;
    }
    return undefined;
  };
  const aria = async (sel: string): Promise<string | undefined> => {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      return (await loc.getAttribute("aria-label").catch(() => null)) ?? undefined;
    }
    return undefined;
  };

  if (fields.has("name")) lead.name = (await text("h1.DUwDvf")) ?? fallbackName;
  else if (fallbackName) lead.name = fallbackName;

  if (fields.has("category")) {
    lead.category = (await text('button[jsaction*="category"]')) ?? undefined;
  }

  if (fields.has("rating") || fields.has("reviews")) {
    const box = page.locator("div.F7nice").first();
    if (await box.count()) {
      if (fields.has("rating")) {
        const rt = await box
          .locator('span[aria-hidden="true"]')
          .first()
          .innerText()
          .catch(() => "");
        lead.rating = parseRating(rt);
      }
      if (fields.has("reviews")) {
        const rv = await box
          .locator('span[aria-label*="review"]')
          .first()
          .getAttribute("aria-label")
          .catch(() => null);
        lead.reviews = parseReviewCount(rv);
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
      lead.website = (await site.getAttribute("href").catch(() => null)) ?? undefined;
    }
  }
  if (fields.has("priceLevel")) {
    const priceText = await text('span[aria-label^="Price"], span[aria-label*="Price:"]');
    lead.priceLevel =
      (priceText && /^[$€£₹¥₩]+$/.test(priceText.trim()) ? priceText.trim() : undefined) ??
      stripPrefix(await aria('span[aria-label^="Price"]'), "Price: ");
  }
  if (fields.has("latitude") || fields.has("longitude")) {
    const geo = parseLatLng(page.url());
    if (fields.has("latitude")) lead.latitude = geo.latitude;
    if (fields.has("longitude")) lead.longitude = geo.longitude;
  }
  if (fields.has("plusCode")) {
    lead.plusCode = stripPrefix(await aria('button[data-item-id="oloc"]'), "Plus code:");
  }
  if (fields.has("hours")) {
    lead.hours =
      stripPrefix(await aria('div[jsaction*="openhours"]'), "") ??
      (await text('div[jsaction*="openhours"]'));
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
  const onProgress = opts.onProgress;
  const signal = opts.signal;
  const startedAt = Date.now();
  const overBudget = (): boolean => opts.maxMs !== undefined && Date.now() - startedAt > opts.maxMs;

  // Enrichment (email/socials) needs a website, so extract it even if the user
  // didn't ask for the website column.
  const wantEnrich =
    Boolean(opts.enrich) ||
    ENRICHED_FIELDS.some((f) => fields.has(f)) ||
    Boolean(opts.filters?.hasEmail);
  const collect = new Set<LeadField>(fields);
  if (wantEnrich) collect.add("website");
  // Details are needed unless the user only wants name/mapsUrl and no enrichment.
  const detailOnly: LeadField[] = ["name", "mapsUrl"];
  const wantDetails =
    (opts.details ?? true) &&
    ([...collect].some((f) => !detailOnly.includes(f)) || wantEnrich);

  onProgress?.(`searching Google Maps for "${query}"…`);
  const browser = await launchBrowser(headless);
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: "en-US",
    });
    const page = await context.newPage();
    await page.goto(mapsSearchUrl(query), { waitUntil: "domcontentloaded", timeout: 45000 });
    await dismissConsent(page);

    await loadResults(page, limit, delayMs, onProgress, signal);
    if (signal?.aborted) throw new LeadsError("Search aborted.", "ABORTED");

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

    let leads: Lead[] = [];
    if (!wantDetails) {
      // Fast path: just the names + maps URLs from the feed.
      leads = cards.map((c) => {
        const lead: Lead = {};
        if (collect.has("name")) lead.name = c.name;
        if (collect.has("mapsUrl")) lead.mapsUrl = c.href;
        if (collect.has("latitude") || collect.has("longitude")) {
          const geo = parseLatLng(c.href);
          if (collect.has("latitude")) lead.latitude = geo.latitude;
          if (collect.has("longitude")) lead.longitude = geo.longitude;
        }
        return lead;
      });
    } else {
      for (let i = 0; i < cards.length; i++) {
        if (signal?.aborted || overBudget()) break;
        const card = cards[i]!;
        onProgress?.(`reading ${i + 1}/${cards.length}: ${card.name ?? "listing"}…`);
        try {
          await page.goto(card.href, { waitUntil: "domcontentloaded", timeout: 30000 });
          await page.locator("h1.DUwDvf").first().waitFor({ timeout: 8000 }).catch(() => {});
          leads.push(await extractDetail(page, collect, card.name));
        } catch {
          // Skip a listing that fails to load, keep the run going.
          if (card.name && (collect.has("name") || collect.has("mapsUrl"))) {
            const partial: Lead = {};
            if (collect.has("name")) partial.name = card.name;
            if (collect.has("mapsUrl")) partial.mapsUrl = card.href;
            leads.push(partial);
          }
        }
        if (delayMs) await page.waitForTimeout(delayMs);
      }
    }
    onProgress?.(`collected ${leads.length} listing${leads.length === 1 ? "" : "s"}.`);

    // Dedupe before the expensive enrichment step.
    leads = dedupeLeads(leads, opts.dedupe ?? "website");

    // Enrich from each website (email + socials).
    if (wantEnrich) {
      for (let i = 0; i < leads.length; i++) {
        if (signal?.aborted || overBudget()) break;
        const site = leads[i]!.website;
        if (!site) continue;
        onProgress?.(`enriching ${i + 1}/${leads.length}: ${leads[i]!.name ?? site}…`);
        const c = await enrichContacts(site);
        if (fields.has("email") && c.email) leads[i]!.email = c.email;
        if (fields.has("facebook") && c.facebook) leads[i]!.facebook = c.facebook;
        if (fields.has("instagram") && c.instagram) leads[i]!.instagram = c.instagram;
        if (fields.has("whatsapp") && c.whatsapp) leads[i]!.whatsapp = c.whatsapp;
        // Drop the internal-only website when the user didn't ask for it.
        if (!fields.has("website")) delete leads[i]!.website;
      }
    }

    // Apply filters last (so hasEmail sees enriched data).
    if (opts.filters) leads = filterLeads(leads, opts.filters);

    onProgress?.(`collected ${leads.length} lead${leads.length === 1 ? "" : "s"}.`);
    return leads;
  } finally {
    await browser.close().catch(() => {});
  }
}
