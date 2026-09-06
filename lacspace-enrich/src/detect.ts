/**
 * Pure enrichment helpers — normalise a domain, clean a company name, detect the
 * tech stack from HTML, and pull structured facts (name/address/socials) out of
 * schema.org JSON-LD. No network here.
 */

/** Normalise any input (URL, email, bare host) to a lower-case registrable domain. */
export function normalizeDomain(input: string): string {
  let s = input.trim().toLowerCase();
  if (s.includes("@")) s = s.slice(s.lastIndexOf("@") + 1);
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split("/")[0]!.split("?")[0]!.split("#")[0]!;
  return s;
}

/** A best-effort company name from a page title, stripped of boilerplate. */
export function cleanName(title: string | undefined, domain: string): string {
  if (!title) return domainName(domain);
  // Titles are often "Home | Acme" or "Acme — tagline"; keep the strongest chunk.
  const parts = title.split(/\s*[|–—\-·:]\s*/).map((p) => p.trim()).filter(Boolean);
  const junk = /^(home|welcome|official site|homepage)$/i;
  const candidates = parts.filter((p) => !junk.test(p));
  const pick = candidates.sort((a, b) => a.length - b.length)[0];
  if (!pick) return domainName(domain);
  return pick.length > 1 && pick.length <= 60 ? pick : domainName(domain);
}

function domainName(domain: string): string {
  const base = domain.split(".")[0] ?? domain;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

interface Sig { name: string; re: RegExp }
const SIGNATURES: Sig[] = [
  { name: "WordPress", re: /wp-content\/|wp-includes\/|content=["']WordPress/i },
  { name: "Shopify", re: /cdn\.shopify\.com|Shopify\.theme|myshopify\.com/i },
  { name: "Wix", re: /static\.wixstatic\.com|wixsite\.com|X-Wix/i },
  { name: "Squarespace", re: /squarespace\.com|static1\.squarespace/i },
  { name: "Webflow", re: /assets-global\.website-files\.com|content=["']Webflow/i },
  { name: "Ghost", re: /content=["']Ghost |\.ghost\.io/i },
  { name: "Next.js", re: /\/_next\/|__NEXT_DATA__/i },
  { name: "Gatsby", re: /___gatsby|gatsby-/i },
  { name: "Nuxt", re: /__NUXT__|\/_nuxt\//i },
  { name: "React", re: /data-reactroot|react-dom/i },
  { name: "Vue", re: /vue(?:\.min)?\.js|data-v-[0-9a-f]/i },
  { name: "Angular", re: /ng-version=|angular\.js/i },
  { name: "Tailwind", re: /tailwind/i },
  { name: "Bootstrap", re: /bootstrap(?:\.min)?\.css/i },
  { name: "jQuery", re: /jquery(?:\.min)?\.js/i },
  { name: "Google Analytics", re: /www\.google-analytics\.com|gtag\(|['"]G-[A-Z0-9]{6,}['"]/i },
  { name: "Google Tag Manager", re: /googletagmanager\.com/i },
  { name: "Cloudflare", re: /cloudflare|\/cdn-cgi\//i },
  { name: "HubSpot", re: /js\.hs-scripts\.com|hubspot/i },
  { name: "Mailchimp", re: /list-manage\.com|mailchimp/i },
  { name: "Stripe", re: /js\.stripe\.com/i },
  { name: "Intercom", re: /widget\.intercom\.io/i },
  { name: "Cloudflare Turnstile", re: /challenges\.cloudflare\.com\/turnstile/i },
];

/** Detect the tech stack from raw HTML. Pure. */
export function detectTech(html: string): string[] {
  const out: string[] = [];
  for (const s of SIGNATURES) if (s.re.test(html) && !out.includes(s.name)) out.push(s.name);
  return out;
}

/** Extract social profile links (8 networks) from raw HTML. Pure. */
export function extractSocials(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const absol = (u: string): string => (u.startsWith("//") ? "https:" + u : u.startsWith("http") ? u : "https://" + u.replace(/^\/+/, ""));
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const u = (m[1] ?? "").trim();
    if (!u) continue;
    if (!out.facebook && /(^|\/\/|\.)facebook\.com\//i.test(u) && !/sharer|plugins|\/tr\?|dialog\//i.test(u)) out.facebook = absol(u);
    else if (!out.instagram && /(^|\/\/|\.)instagram\.com\//i.test(u) && !/\/(share|p)\//i.test(u)) out.instagram = absol(u);
    else if (!out.whatsapp && /(wa\.me\/|api\.whatsapp\.com\/|whatsapp:\/\/)/i.test(u)) out.whatsapp = u.startsWith("http") || u.startsWith("whatsapp") ? u : "https:" + u;
    else if (!out.linkedin && /(^|\/\/|\.)linkedin\.com\/(company|in|school)\//i.test(u) && !/sharing|shareArticle/i.test(u)) out.linkedin = absol(u);
    else if (!out.twitter && /(^|\/\/|\.)(twitter|x)\.com\//i.test(u) && !/(intent|share|widgets|hashtag)\b/i.test(u)) out.twitter = absol(u);
    else if (!out.youtube && /(youtube\.com\/(channel|c|user|@)|youtu\.be\/)/i.test(u)) out.youtube = absol(u);
    else if (!out.tiktok && /(^|\/\/|\.)tiktok\.com\/@/i.test(u)) out.tiktok = absol(u);
    else if (!out.telegram && /(t\.me\/|telegram\.me\/)/i.test(u) && !/\/share\b/i.test(u)) out.telegram = absol(u);
  }
  return out;
}

/** Classify a social URL to a network key. Pure. */
export function socialKey(url: string): string | undefined {
  const u = url.toLowerCase();
  if (/facebook\.com/.test(u)) return "facebook";
  if (/instagram\.com/.test(u)) return "instagram";
  if (/(wa\.me|whatsapp)/.test(u)) return "whatsapp";
  if (/linkedin\.com/.test(u)) return "linkedin";
  if (/(twitter|x)\.com/.test(u)) return "twitter";
  if (/(youtube\.com|youtu\.be)/.test(u)) return "youtube";
  if (/tiktok\.com/.test(u)) return "tiktok";
  if (/(t\.me|telegram)/.test(u)) return "telegram";
  return undefined;
}

interface JsonLdFacts {
  name?: string;
  description?: string;
  logo?: string;
  email?: string;
  phone?: string;
  address?: string;
  sameAs?: string[];
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v == null ? [] : [v];
}

/** Walk parsed JSON-LD blocks and pull org/contact facts. Pure. */
export function factsFromJsonLd(blocks: unknown[]): JsonLdFacts {
  const facts: JsonLdFacts = {};
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const o = node as Record<string, unknown>;
    if (Array.isArray(o["@graph"])) (o["@graph"] as unknown[]).forEach(visit);
    const type = String(o["@type"] ?? "").toLowerCase();
    const orgish = /organization|localbusiness|store|corporation|ngo|restaurant|company/.test(type);
    if (orgish) {
      if (!facts.name && typeof o.name === "string") facts.name = o.name;
      if (!facts.description && typeof o.description === "string") facts.description = o.description;
      if (!facts.logo) {
        const logo = o.logo;
        facts.logo = typeof logo === "string" ? logo : typeof (logo as Record<string, unknown>)?.url === "string" ? String((logo as Record<string, unknown>).url) : undefined;
      }
      if (!facts.email && typeof o.email === "string") facts.email = o.email.replace(/^mailto:/i, "");
      if (!facts.phone && typeof o.telephone === "string") facts.phone = o.telephone;
      if (!facts.address && o.address) facts.address = formatAddress(o.address);
      const same = asArray(o.sameAs).filter((x): x is string => typeof x === "string");
      if (same.length) facts.sameAs = [...(facts.sameAs ?? []), ...same];
    }
    // Recurse into nested objects to catch @graph-less nesting.
    for (const v of Object.values(o)) if (v && typeof v === "object") visit(v);
  };
  blocks.forEach(visit);
  return facts;
}

function formatAddress(addr: unknown): string | undefined {
  if (typeof addr === "string") return addr;
  if (!addr || typeof addr !== "object") return undefined;
  const a = addr as Record<string, unknown>;
  const parts = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode, a.addressCountry]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}
