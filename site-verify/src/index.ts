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

export interface VerificationInput {
  google?: string;
  bing?: string;
  yandex?: string;
  baidu?: string;
  pinterest?: string;
  ahrefs?: string;
  facebook?: string;
  norton?: string;
  /** Any other provider, keyed by the exact meta `name`. */
  other?: Record<string, string>;
}

const META_NAME: Record<string, string> = {
  google: "google-site-verification",
  bing: "msvalidate.01",
  yandex: "yandex-verification",
  baidu: "baidu-site-verification",
  pinterest: "p:domain_verify",
  ahrefs: "ahrefs-site-verification",
  facebook: "facebook-domain-verification",
  norton: "norton-safeweb-site-verification",
};

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
