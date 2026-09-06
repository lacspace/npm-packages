/**
 * Website enrichment — visit a business's site and pull an email + social
 * links. Uses global `fetch` (Node 20+); every network call is guarded so a
 * dead or slow site never breaks a run.
 */

/** Contact details discoverable from a website. */
export interface Contacts {
  email?: string;
  facebook?: string;
  instagram?: string;
  whatsapp?: string;
  linkedin?: string;
  twitter?: string;
  youtube?: string;
  tiktok?: string;
  telegram?: string;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Junk that looks like an email but isn't a contact (asset hashes, placeholders).
const EMAIL_JUNK = /(@\d+x\.)|(\.(png|jpe?g|gif|svg|webp|css|js)$)|(^[a-f0-9]{16,}@)|(@(sentry|example|domain|email|your|test)\.)/i;

/** Extract the best contact email from HTML, or `undefined`. Pure. */
export function extractEmails(html: string): string | undefined {
  const found = new Map<string, number>(); // email -> score (prefer info@/contact@)
  const push = (raw: string): void => {
    const email = raw.trim().toLowerCase().replace(/\.$/, "");
    if (email.length > 100 || EMAIL_JUNK.test(email)) return;
    if (!found.has(email)) {
      const local = email.split("@")[0] ?? "";
      const score = /^(info|contact|hello|sales|admin|enquir|support)/.test(local) ? 2 : 1;
      found.set(email, score);
    }
  };
  // mailto: links first (most reliable), then any inline addresses.
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) push(decodeURIComponent(m[1] ?? ""));
  for (const m of html.matchAll(EMAIL_RE)) push(m[0]);
  if (found.size === 0) return undefined;
  // Highest score wins; ties keep first-seen (insertion order).
  return [...found.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

/**
 * Extract social links (Facebook, Instagram, WhatsApp, LinkedIn, Twitter/X,
 * YouTube, TikTok, Telegram) from HTML. Skips share/intent/widget links. Pure.
 */
export function extractSocials(html: string): Omit<Contacts, "email"> {
  const out: Omit<Contacts, "email"> = {};
  const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1] ?? "");
  for (const href of hrefs) {
    const u = href.trim();
    if (!u) continue;
    if (!out.facebook && /(^|\/\/|\.)facebook\.com\//i.test(u) && !/sharer|plugins|\/tr\?|dialog\//i.test(u)) {
      out.facebook = absolutize(u);
    } else if (!out.instagram && /(^|\/\/|\.)instagram\.com\//i.test(u) && !/\/(share|p)\//i.test(u)) {
      out.instagram = absolutize(u);
    } else if (!out.whatsapp && /(wa\.me\/|api\.whatsapp\.com\/|whatsapp:\/\/)/i.test(u)) {
      out.whatsapp = u.startsWith("http") || u.startsWith("whatsapp") ? u : `https:${u}`;
    } else if (!out.linkedin && /(^|\/\/|\.)linkedin\.com\/(company|in|school)\//i.test(u) && !/sharing|shareArticle/i.test(u)) {
      out.linkedin = absolutize(u);
    } else if (!out.twitter && /(^|\/\/|\.)(twitter|x)\.com\//i.test(u) && !/(intent|share|widgets|hashtag)\b/i.test(u)) {
      out.twitter = absolutize(u);
    } else if (!out.youtube && /(youtube\.com\/(channel|c|user|@)|youtu\.be\/)/i.test(u)) {
      out.youtube = absolutize(u);
    } else if (!out.tiktok && /(^|\/\/|\.)tiktok\.com\/@/i.test(u)) {
      out.tiktok = absolutize(u);
    } else if (!out.telegram && /(t\.me\/|telegram\.me\/)/i.test(u) && !/\/share\b/i.test(u)) {
      out.telegram = absolutize(u);
    }
  }
  return out;
}

function absolutize(u: string): string {
  if (u.startsWith("//")) return `https:${u}`;
  if (u.startsWith("http")) return u;
  return `https://${u.replace(/^\/+/, "")}`;
}

async function fetchText(url: string, timeoutMs: number): Promise<string | undefined> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; lacspace-leads/0.2)" },
    });
    if (!res.ok) return undefined;
    const ct = res.headers.get("content-type") ?? "";
    if (ct && !/html|text|xml/i.test(ct)) return undefined;
    const buf = await res.arrayBuffer();
    // Cap at ~2 MB to avoid pathological pages.
    return new TextDecoder("utf-8").decode(buf.slice(0, 2_000_000));
  } catch {
    return undefined;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Fetch a website (home page, then a /contact page if needed) and pull an email
 * + social links. Never throws — returns `{}` on any failure.
 */
export async function enrichContacts(
  website: string,
  opts: { timeoutMs?: number; contactPages?: boolean } = {},
): Promise<Contacts> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  let base: URL;
  try {
    base = new URL(website.startsWith("http") ? website : `https://${website}`);
  } catch {
    return {};
  }

  const contacts: Contacts = {};
  const home = await fetchText(base.href, timeoutMs);
  if (home) {
    contacts.email = extractEmails(home);
    Object.assign(contacts, extractSocials(home));
  }

  // If we still lack an email, try common contact pages.
  if (!contacts.email && (opts.contactPages ?? true)) {
    for (const path of ["contact", "contact-us", "about"]) {
      const page = await fetchText(new URL(path, base.origin).href, timeoutMs);
      if (page) {
        const email = extractEmails(page);
        if (email) {
          contacts.email = email;
          const s = extractSocials(page);
          for (const k of Object.keys(s) as (keyof typeof s)[]) {
            if (!contacts[k] && s[k]) contacts[k] = s[k];
          }
          break;
        }
      }
    }
  }

  // Drop empty keys.
  for (const k of Object.keys(contacts) as (keyof Contacts)[]) {
    if (!contacts[k]) delete contacts[k];
  }
  return contacts;
}
