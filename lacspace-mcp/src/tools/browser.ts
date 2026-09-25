/** One lazily launched browser session shared by the tools that render. */
import { launchSession, type BrowserSession } from "lacspace-scraper";

let session: Promise<BrowserSession> | undefined;

export function getBrowser(): Promise<BrowserSession> {
  if (!session) {
    session = launchSession({ headless: true }).catch((err) => {
      session = undefined; // let the next call retry (e.g. after the user installs Chromium)
      throw err;
    });
  }
  return session;
}

/** Turn a launch failure into advice the model can pass on. */
export function browserAdvice(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return `${message}\n\nInstall a browser with: npx playwright install chromium   (or install Google Chrome). Then try again.`;
}

export async function closeBrowser(): Promise<void> {
  const s = session;
  session = undefined;
  if (s) await (await s.catch(() => undefined))?.close();
}
