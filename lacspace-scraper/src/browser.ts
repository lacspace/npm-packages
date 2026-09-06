/**
 * Optional browser rendering for JS-heavy pages, via `playwright-core` (a peer
 * dependency imported lazily — the static HTTP engine never loads it). One
 * session renders many URLs; it tries system Chrome, then Edge, then a bundled
 * Chromium.
 */
import { ScraperError } from "./fetch.js";

export interface RenderResult {
  url: string;
  status: number;
  html: string;
}

/** Per-render options for {@link BrowserSession.render}. */
export interface RenderOptions {
  /** Wait for this CSS selector to appear before extracting. */
  waitFor?: string;
  /** Navigation/selector timeout in ms. */
  timeoutMs?: number;
  /** Extra fixed wait in ms after load (e.g. to let animations settle). */
  waitMs?: number;
  /** Auto-scroll this many passes to trigger lazy-loaded content. */
  scroll?: number;
  /** Save a full-page PNG screenshot to this path. */
  screenshot?: string;
  /** Save the page as a PDF to this path (headless Chromium only). */
  pdf?: string;
}

export interface BrowserSession {
  render(url: string, opts?: RenderOptions): Promise<RenderResult>;
  close(): Promise<void>;
}

export interface LaunchOptions {
  headless?: boolean;
  proxy?: string;
  userAgent?: string;
}

/** Launch a reusable browser session for rendering pages. */
export async function launchSession(opts: LaunchOptions = {}): Promise<BrowserSession> {
  let pw: typeof import("playwright-core");
  try {
    pw = await import("playwright-core");
  } catch {
    throw new ScraperError(
      "The browser engine needs `playwright-core`. Install it (npm i playwright-core) or use the default http engine.",
      "NO_PLAYWRIGHT",
    );
  }
  const { chromium } = pw;
  const headless = opts.headless ?? true;
  const launch: Parameters<typeof chromium.launch>[0] = { headless };
  if (opts.proxy) launch.proxy = { server: opts.proxy };

  let browser: import("playwright-core").Browser | undefined;
  let lastErr: unknown;
  for (const channel of ["chrome", "msedge"] as const) {
    try { browser = await chromium.launch({ ...launch, channel }); break; } catch (e) { lastErr = e; }
  }
  if (!browser) {
    try { browser = await chromium.launch(launch); } catch (e) { lastErr = e; }
  }
  if (!browser) {
    throw new ScraperError(
      "Could not launch a browser. Install Google Chrome/Edge, or run `npx playwright install chromium`.",
      "NO_BROWSER",
    );
  }

  /** Repeatedly scroll to the bottom to trigger lazy-loaded / infinite content. */
  async function autoScroll(page: import("playwright-core").Page, passes: number): Promise<void> {
    let lastHeight = 0;
    for (let i = 0; i < passes; i++) {
      const height = await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        return document.body.scrollHeight;
      }).catch(() => 0);
      await page.waitForTimeout(350);
      if (height && height === lastHeight) break; // page stopped growing
      lastHeight = height;
    }
  }

  const ctxOpts: import("playwright-core").BrowserContextOptions = { viewport: { width: 1280, height: 900 } };
  if (opts.userAgent) ctxOpts.userAgent = opts.userAgent;
  const context = await browser.newContext(ctxOpts);

  return {
    async render(url, o = {}) {
      const page = await context.newPage();
      try {
        const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: o.timeoutMs ?? 30000 });
        if (o.waitFor) await page.waitForSelector(o.waitFor, { timeout: o.timeoutMs ?? 15000 }).catch(() => {});
        if (o.scroll && o.scroll > 0) await autoScroll(page, o.scroll);
        if (o.waitMs && o.waitMs > 0) await page.waitForTimeout(o.waitMs);
        const html = await page.content();
        if (o.screenshot) await page.screenshot({ path: o.screenshot, fullPage: true }).catch(() => {});
        if (o.pdf) await page.pdf({ path: o.pdf }).catch(() => {});
        return { url: page.url(), status: resp?.status() ?? 0, html };
      } finally {
        await page.close().catch(() => {});
      }
    },
    async close() {
      await browser!.close().catch(() => {});
    },
  };
}
