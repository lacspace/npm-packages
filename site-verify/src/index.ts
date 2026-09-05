/**
 * @lacspace/site-verify
 * Search-engine & platform site verification — meta tags and file tokens.
 *
 * One typed input → verification `<meta>` tags, a Next.js `verification`
 * metadata object, or the file-based verification content, for Google Search
 * Console, Bing, Yandex, Baidu, Pinterest, Ahrefs, Facebook and more.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

/**
 * The full registry of known verification providers → their exact meta `name`.
 * Add-only: extend `other` for anything not listed here.
 */
export const VERIFICATION_PROVIDERS = {
  google: "google-site-verification",
  bing: "msvalidate.01",
  yandex: "yandex-verification",
  baidu: "baidu-site-verification",
  pinterest: "p:domain_verify",
  ahrefs: "ahrefs-site-verification",
  facebook: "facebook-domain-verification",
  /** Norton / Symantec Safe Web. */
  norton: "norton-safeweb-site-verification",
  /** Alexa (msvalidate-style verify id). */
  alexa: "alexaVerifyID",
  /** Naver Webmaster (Korea). */
  naver: "naver-site-verification",
  /** Brave Search webmaster. */
  brave: "brave-site-verification",
} as const;

/** Union of the known provider keys. */
export type VerificationProvider = keyof typeof VERIFICATION_PROVIDERS;

export interface VerificationInput {
  google?: string;
  bing?: string;
  yandex?: string;
  baidu?: string;
  pinterest?: string;
  ahrefs?: string;
  facebook?: string;
  norton?: string;
  alexa?: string;
  naver?: string;
  brave?: string;
  /** Any other provider, keyed by the exact meta `name`. */
  other?: Record<string, string>;
}

const META_NAME: Record<string, string> = VERIFICATION_PROVIDERS;

export interface MetaTag {
  name: string;
  content: string;
}

/** Build verification `<meta>` tag descriptors. */
export function verificationMeta(input: VerificationInput): MetaTag[] {
  const tags: MetaTag[] = [];
  for (const [key, name] of Object.entries(META_NAME)) {
    const value = (input as Record<string, string | undefined>)[key];
    if (value) tags.push({ name, content: value });
  }
  for (const [name, content] of Object.entries(input.other ?? {})) {
    if (content) tags.push({ name, content });
  }
  return tags;
}

/** Build verification meta tags as an HTML string (any SSR framework). */
export function verificationMetaHtml(input: VerificationInput): string {
  const esc = (s: string): string =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  return verificationMeta(input)
    .map((t) => `<meta name="${esc(t.name)}" content="${esc(t.content)}" />`)
    .join("\n");
}

export interface NextVerification {
  google?: string;
  yandex?: string;
  yahoo?: string;
  other?: Record<string, string>;
}

/** Convert to the shape Next.js `metadata.verification` expects. */
export function toNextVerification(input: VerificationInput): NextVerification {
  const other: Record<string, string> = {};
  for (const [key, name] of Object.entries(META_NAME)) {
    if (key === "google" || key === "yandex") continue;
    const value = (input as Record<string, string | undefined>)[key];
    if (value) other[name] = value;
  }
  for (const [name, content] of Object.entries(input.other ?? {})) other[name] = content;
  const out: NextVerification = {};
  if (input.google) out.google = input.google;
  if (input.yandex) out.yandex = input.yandex;
  if (Object.keys(other).length) out.other = other;
  return out;
}

export interface VerificationFile {
  path: string;
  content: string;
  contentType: string;
}

/**
 * File-based verification (when a provider gives you a file to upload).
 * @example verificationFile("google", "googleabc123.html")
 * @example verificationFile("bing", "1A2B3C")
 */
export function verificationFile(
  provider: "google" | "bing" | "yandex",
  token: string,
): VerificationFile {
  switch (provider) {
    case "google": {
      const name = token.endsWith(".html") ? token : `google${token}.html`;
      return { path: `/${name}`, content: `google-site-verification: ${name}`, contentType: "text/html" };
    }
    case "bing":
      return {
        path: "/BingSiteAuth.xml",
        content: `<?xml version="1.0"?>\n<users>\n  <user>${token}</user>\n</users>`,
        contentType: "application/xml",
      };
    case "yandex": {
      const name = token.startsWith("yandex_") ? token : `yandex_${token}.html`;
      return {
        path: `/${name}`,
        content: `<html><head><meta name="yandex-verification" content="${token}" /></head><body>Verification: ${token}</body></html>`,
        contentType: "text/html",
      };
    }
  }
}

/* ---------------------------- record helpers --------------------------- */

/** A record keyed by provider id (e.g. `google`) or a raw meta `name`, → token. */
export type VerificationRecord = Partial<Record<VerificationProvider, string>> &
  Record<string, string | undefined>;

/**
 * Build meta tag descriptors from a loose record. Each key is resolved through
 * {@link VERIFICATION_PROVIDERS} when it is a known provider id, otherwise the
 * key is used verbatim as the meta `name`. Empty/undefined values are skipped.
 *
 * @example allVerifications({ google: "abc", bing: "xyz", "custom-verify": "t" })
 * // [{ name: "google-site-verification", content: "abc" },
 * //  { name: "msvalidate.01", content: "xyz" },
 * //  { name: "custom-verify", content: "t" }]
 */
export function allVerifications(record: VerificationRecord): MetaTag[] {
  const tags: MetaTag[] = [];
  for (const [key, content] of Object.entries(record)) {
    if (!content) continue;
    const name = (VERIFICATION_PROVIDERS as Record<string, string>)[key] ?? key;
    tags.push({ name, content });
  }
  return tags;
}

/**
 * Build a Next.js `metadata.verification`-shaped object from a loose record,
 * so it can be spread straight into a `Metadata`. `google`, `yandex` and
 * `yahoo` map to their first-class fields; everything else goes under `other`
 * keyed by its resolved meta `name`.
 *
 * @example nextVerification({ google: "abc", bing: "xyz", yandex: "y1" })
 * // { google: "abc", yandex: "y1", other: { "msvalidate.01": "xyz" } }
 */
export function nextVerification(record: VerificationRecord): NextVerification {
  const out: NextVerification = {};
  const other: Record<string, string> = {};
  for (const [key, content] of Object.entries(record)) {
    if (!content) continue;
    if (key === "google") out.google = content;
    else if (key === "yandex") out.yandex = content;
    else if (key === "yahoo") out.yahoo = content;
    else {
      const name = (VERIFICATION_PROVIDERS as Record<string, string>)[key] ?? key;
      other[name] = content;
    }
  }
  if (Object.keys(other).length) out.other = other;
  return out;
}

/**
 * Build a single meta tag for a known provider id or a raw meta `name`.
 * The escape hatch for one-off / generic providers.
 * @example verificationTag("google", "abc") // { name: "google-site-verification", content: "abc" }
 * @example verificationTag("my-engine-verify", "t") // { name: "my-engine-verify", content: "t" }
 */
export function verificationTag(providerOrName: string, content: string): MetaTag {
  const name = (VERIFICATION_PROVIDERS as Record<string, string>)[providerOrName] ?? providerOrName;
  return { name, content };
}

/* ------------------------------ adapters ------------------------------ */

/** A verification file as a Fetch/edge `Response`, for a route that serves the token file. */
export function verificationFileResponse(
  provider: "google" | "bing" | "yandex",
  token: string,
  init: ResponseInit = {},
): Response {
  const file = verificationFile(provider, token);
  return new Response(file.content, {
    ...init,
    headers: { "content-type": `${file.contentType}; charset=utf-8`, ...(init.headers ?? {}) },
  });
}
