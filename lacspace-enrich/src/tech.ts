/**
 * Expanded, categorized tech detection. Each signature carries a category, a
 * base confidence and a note on what signal matched; some can pull a version
 * (e.g. a `generator` meta). This is ADDITIVE — the classic flat `detectTech`
 * in detect.ts is untouched. Pure and unit-tested on HTML fixtures.
 */
import type { TechItem } from "./types.js";

interface TechSig {
  name: string;
  category: string;
  re: RegExp;
  confidence: number;
  source: string;
  /** Optional version extractor: given the html, return a version string. */
  version?: (html: string) => string | undefined;
}

const genVersion = (product: string) => (html: string): string | undefined => {
  const re = new RegExp(`content=["']${product}\\s*([0-9][0-9.]*)`, "i");
  return html.match(re)?.[1];
};

/** The categorized signature catalogue. Order = detection order. */
export const TECH_SIGNATURES: TechSig[] = [
  // ── CMS ──
  { name: "WordPress", category: "cms", confidence: 0.95, source: "wp-content / generator", re: /wp-content\/|wp-includes\/|content=["']WordPress/i, version: genVersion("WordPress") },
  { name: "Shopify", category: "ecommerce", confidence: 0.97, source: "cdn.shopify.com", re: /cdn\.shopify\.com|Shopify\.theme|myshopify\.com/i },
  { name: "Wix", category: "cms", confidence: 0.95, source: "wixstatic / X-Wix", re: /static\.wixstatic\.com|wixsite\.com|X-Wix/i },
  { name: "Squarespace", category: "cms", confidence: 0.95, source: "squarespace.com", re: /squarespace\.com|static1\.squarespace/i },
  { name: "Webflow", category: "cms", confidence: 0.9, source: "website-files.com / generator", re: /assets-global\.website-files\.com|assets\.website-files\.com|content=["']Webflow/i },
  { name: "Ghost", category: "cms", confidence: 0.9, source: "generator / ghost.io", re: /content=["']Ghost |\.ghost\.io/i, version: genVersion("Ghost") },
  { name: "Drupal", category: "cms", confidence: 0.9, source: "generator / sites/default", re: /content=["']Drupal|\/sites\/default\/files\//i, version: genVersion("Drupal") },
  { name: "Joomla", category: "cms", confidence: 0.9, source: "generator / media/jui", re: /content=["']Joomla|\/media\/jui\//i },
  { name: "HubSpot CMS", category: "cms", confidence: 0.85, source: "hs-sites.com", re: /\.hs-sites\.com|hubspotusercontent/i },
  { name: "Framer", category: "cms", confidence: 0.85, source: "framerusercontent", re: /framerusercontent\.com|content=["']Framer/i },
  { name: "BigCommerce", category: "ecommerce", confidence: 0.9, source: "bigcommerce", re: /cdn[0-9]*\.bigcommerce\.com|bigcommerce/i },
  { name: "WooCommerce", category: "ecommerce", confidence: 0.9, source: "woocommerce assets", re: /woocommerce\/assets|wc-ajax|class=["'][^"']*woocommerce/i },
  { name: "Magento", category: "ecommerce", confidence: 0.85, source: "mage / static/version", re: /Magento_|mage\/|static\/version/i },
  { name: "PrestaShop", category: "ecommerce", confidence: 0.85, source: "prestashop", re: /prestashop|content=["']PrestaShop/i },

  // ── Frameworks ──
  { name: "Next.js", category: "framework", confidence: 0.95, source: "/_next/ · __NEXT_DATA__", re: /\/_next\/|__NEXT_DATA__/i },
  { name: "Nuxt", category: "framework", confidence: 0.9, source: "__NUXT__ · /_nuxt/", re: /__NUXT__|\/_nuxt\//i },
  { name: "Gatsby", category: "framework", confidence: 0.9, source: "___gatsby", re: /___gatsby|gatsby-/i },
  { name: "SvelteKit", category: "framework", confidence: 0.85, source: "__sveltekit / _app/immutable", re: /__sveltekit|_app\/immutable/i },
  { name: "Remix", category: "framework", confidence: 0.8, source: "__remixContext", re: /__remixContext|__remixManifest/i },
  { name: "Astro", category: "framework", confidence: 0.85, source: "astro-island / generator", re: /astro-island|content=["']Astro/i, version: genVersion("Astro") },
  { name: "Angular", category: "framework", confidence: 0.85, source: "ng-version", re: /ng-version=|angular\.js/i, version: (h) => h.match(/ng-version=["']([0-9.]+)/i)?.[1] },
  { name: "Vue", category: "framework", confidence: 0.7, source: "vue.js · data-v-", re: /vue(?:\.min)?\.js|data-v-[0-9a-f]/i },
  { name: "React", category: "javascript", confidence: 0.6, source: "data-reactroot · react-dom", re: /data-reactroot|react-dom/i },

  // ── JS / CSS libs ──
  { name: "jQuery", category: "javascript", confidence: 0.8, source: "jquery.js", re: /jquery(?:[-.][0-9.]+)?(?:\.min)?\.js/i, version: (h) => h.match(/jquery[-.]([0-9.]+)(?:\.min)?\.js/i)?.[1] },
  { name: "Alpine.js", category: "javascript", confidence: 0.75, source: "x-data / alpinejs", re: /alpinejs|x-data=|@click=/i },
  { name: "Tailwind", category: "css", confidence: 0.7, source: "tailwind", re: /tailwind/i },
  { name: "Bootstrap", category: "css", confidence: 0.8, source: "bootstrap.css", re: /bootstrap(?:[-.][0-9.]+)?(?:\.min)?\.css/i, version: (h) => h.match(/bootstrap[-.]([0-9.]+)(?:\.min)?\.css/i)?.[1] },
  { name: "Font Awesome", category: "css", confidence: 0.7, source: "fontawesome", re: /font-?awesome|fa-[a-z]/i },

  // ── Fonts ──
  { name: "Google Fonts", category: "fonts", confidence: 0.85, source: "fonts.googleapis.com", re: /fonts\.googleapis\.com|fonts\.gstatic\.com/i },
  { name: "Adobe Fonts", category: "fonts", confidence: 0.8, source: "use.typekit.net", re: /use\.typekit\.net|typekit/i },

  // ── Analytics ──
  { name: "Google Analytics", category: "analytics", confidence: 0.9, source: "gtag / G- id", re: /www\.google-analytics\.com|gtag\(|['"]G-[A-Z0-9]{6,}['"]/i, version: (h) => (/gtag\(/.test(h) || /G-[A-Z0-9]{6,}/.test(h) ? "GA4" : "UA") },
  { name: "Plausible", category: "analytics", confidence: 0.9, source: "plausible.io", re: /plausible\.io\/js|data-domain=/i },
  { name: "Fathom", category: "analytics", confidence: 0.9, source: "usefathom.com", re: /cdn\.usefathom\.com/i },
  { name: "Matomo", category: "analytics", confidence: 0.85, source: "matomo / piwik", re: /matomo\.js|piwik\.js|_paq\.push/i },
  { name: "Hotjar", category: "analytics", confidence: 0.9, source: "static.hotjar.com", re: /static\.hotjar\.com|hotjar/i },
  { name: "Mixpanel", category: "analytics", confidence: 0.85, source: "mixpanel", re: /cdn\.mxpnl\.com|mixpanel/i },
  { name: "Segment", category: "analytics", confidence: 0.85, source: "segment analytics.js", re: /cdn\.segment\.com|analytics\.load\(/i },
  { name: "Amplitude", category: "analytics", confidence: 0.8, source: "amplitude", re: /cdn\.amplitude\.com|amplitude/i },
  { name: "Vercel Analytics", category: "analytics", confidence: 0.8, source: "/_vercel/insights", re: /\/_vercel\/insights|va\.vercel-scripts/i },
  { name: "Cloudflare Analytics", category: "analytics", confidence: 0.8, source: "beacon.min.js", re: /static\.cloudflareinsights\.com|beacon\.min\.js/i },

  // ── Tag managers ──
  { name: "Google Tag Manager", category: "tag-manager", confidence: 0.9, source: "googletagmanager.com", re: /googletagmanager\.com\/gtm|GTM-[A-Z0-9]+/i },
  { name: "Segment", category: "tag-manager", confidence: 0.6, source: "segment", re: /cdn\.segment\.com\/analytics\.js/i },

  // ── Ads ──
  { name: "Google AdSense", category: "ads", confidence: 0.9, source: "pagead2 / adsbygoogle", re: /pagead2\.googlesyndication|adsbygoogle/i },
  { name: "Google Ads (gtag conversion)", category: "ads", confidence: 0.75, source: "AW- id", re: /AW-[0-9]{6,}/i },
  { name: "Meta Pixel", category: "ads", confidence: 0.9, source: "fbevents.js / fbq", re: /connect\.facebook\.net\/[^"']*\/fbevents\.js|fbq\(/i },
  { name: "TikTok Pixel", category: "ads", confidence: 0.85, source: "analytics.tiktok.com", re: /analytics\.tiktok\.com|ttq\.load/i },
  { name: "LinkedIn Insight", category: "ads", confidence: 0.8, source: "snap.licdn.com", re: /snap\.licdn\.com|_linkedin_partner_id/i },
  { name: "Twitter/X Pixel", category: "ads", confidence: 0.75, source: "static.ads-twitter.com", re: /static\.ads-twitter\.com|twq\(/i },

  // ── CDN / hosting ──
  { name: "Cloudflare", category: "cdn", confidence: 0.7, source: "cdn-cgi / cloudflare", re: /cloudflare|\/cdn-cgi\//i },
  { name: "Vercel", category: "hosting", confidence: 0.8, source: "vercel headers / assets", re: /vercel\.app|_vercel|x-vercel/i },
  { name: "Netlify", category: "hosting", confidence: 0.8, source: "netlify", re: /netlify\.app|netlify/i },
  { name: "GitHub Pages", category: "hosting", confidence: 0.7, source: "github.io", re: /github\.io/i },
  { name: "AWS CloudFront", category: "cdn", confidence: 0.75, source: "cloudfront.net", re: /cloudfront\.net/i },
  { name: "Fastly", category: "cdn", confidence: 0.7, source: "fastly", re: /fastly\.net|x-served-by:\s*cache/i },
  { name: "jsDelivr", category: "cdn", confidence: 0.6, source: "cdn.jsdelivr.net", re: /cdn\.jsdelivr\.net/i },
  { name: "unpkg", category: "cdn", confidence: 0.6, source: "unpkg.com", re: /unpkg\.com/i },

  // ── Payments ──
  { name: "Stripe", category: "payment", confidence: 0.9, source: "js.stripe.com", re: /js\.stripe\.com/i },
  { name: "PayPal", category: "payment", confidence: 0.85, source: "paypalobjects / paypal.com/sdk", re: /paypalobjects\.com|paypal\.com\/sdk/i },
  { name: "Razorpay", category: "payment", confidence: 0.85, source: "checkout.razorpay.com", re: /checkout\.razorpay\.com|razorpay/i },
  { name: "Square", category: "payment", confidence: 0.8, source: "squareup / web.squarecdn", re: /squareup\.com|web\.squarecdn\.com/i },
  { name: "Adyen", category: "payment", confidence: 0.8, source: "adyen", re: /checkoutshopper-live\.adyen|adyen/i },

  // ── Marketing / widgets ──
  { name: "HubSpot", category: "marketing", confidence: 0.85, source: "js.hs-scripts.com", re: /js\.hs-scripts\.com|hs-analytics/i },
  { name: "Mailchimp", category: "marketing", confidence: 0.8, source: "list-manage.com", re: /list-manage\.com|mailchimp|mc\.us[0-9]+/i },
  { name: "Klaviyo", category: "marketing", confidence: 0.8, source: "klaviyo", re: /static\.klaviyo\.com|klaviyo/i },
  { name: "Intercom", category: "widget", confidence: 0.85, source: "widget.intercom.io", re: /widget\.intercom\.io|intercomcdn/i },
  { name: "Drift", category: "widget", confidence: 0.8, source: "js.driftt.com", re: /js\.driftt\.com|drift\.com/i },
  { name: "Zendesk", category: "widget", confidence: 0.8, source: "zdassets / zendesk", re: /static\.zdassets\.com|zendesk/i },
  { name: "Crisp", category: "widget", confidence: 0.8, source: "client.crisp.chat", re: /client\.crisp\.chat/i },
  { name: "Tawk.to", category: "widget", confidence: 0.8, source: "embed.tawk.to", re: /embed\.tawk\.to/i },

  // ── Security / bot ──
  { name: "Cloudflare Turnstile", category: "security", confidence: 0.85, source: "challenges.cloudflare.com", re: /challenges\.cloudflare\.com\/turnstile/i },
  { name: "reCAPTCHA", category: "security", confidence: 0.85, source: "google.com/recaptcha", re: /google\.com\/recaptcha|grecaptcha/i },
  { name: "hCaptcha", category: "security", confidence: 0.8, source: "hcaptcha.com", re: /hcaptcha\.com/i },
];

/**
 * Detect the tech stack from raw HTML, categorized, each with a confidence, the
 * matching signal and (where visible) a version. First match per NAME wins.
 * Pure.
 */
export function detectTechDetailed(html: string): TechItem[] {
  const out: TechItem[] = [];
  const seen = new Set<string>();
  for (const s of TECH_SIGNATURES) {
    if (seen.has(s.name)) continue;
    if (!s.re.test(html)) continue;
    seen.add(s.name);
    const item: TechItem = { name: s.name, category: s.category, confidence: s.confidence, source: s.source };
    const v = s.version?.(html);
    if (v) item.version = v;
    out.push(item);
  }
  // Stable, useful ordering: category then confidence desc.
  return out.sort((a, b) => (a.category < b.category ? -1 : a.category > b.category ? 1 : b.confidence - a.confidence));
}

/** Group a detailed detection by category → items. Pure. */
export function groupTechByCategory(items: TechItem[]): Record<string, TechItem[]> {
  const groups: Record<string, TechItem[]> = {};
  for (const it of items) (groups[it.category] ??= []).push(it);
  return groups;
}
