/**
 * Extended file-based verification — the well-known HTML/XML file variants
 * beyond the built-in Google/Bing/Yandex trio (Baidu, plus a generic HTML
 * fallback for any provider that gives you a token).
 *
 * Zero dependencies · isomorphic · fully typed.
 */
import { verificationFile, verificationTag, type VerificationFile } from "./index";

/**
 * Build the verification file for a provider, extending {@link verificationFile}
 * to more providers. `google`/`bing`/`yandex` delegate to the built-in helper
 * unchanged; `baidu` emits `baidu_verify_<code>.html`; anything else produces a
 * generic HTML file carrying the provider's `<meta>` tag.
 *
 * @example verificationFileFor("baidu", "code123")
 * // { path: "/baidu_verify_code123.html", content: "code123", contentType: "text/html" }
 */
export function verificationFileFor(provider: string, token: string): VerificationFile {
  switch (provider) {
    case "google":
    case "bing":
    case "yandex":
      return verificationFile(provider, token);
    case "baidu": {
      const code = token.replace(/^baidu_verify_/, "").replace(/\.html$/, "");
      return {
        path: `/baidu_verify_${code}.html`,
        content: code,
        contentType: "text/html",
      };
    }
    default: {
      const { name, content } = verificationTag(provider, token);
      const esc = (s: string): string =>
        s
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      const base = provider.replace(/[^A-Za-z0-9_.-]/g, "") || "site-verification";
      const file = base.endsWith(".html") ? base : `${base}.html`;
      return {
        path: `/${file}`,
        content: `<html><head><meta name="${esc(name)}" content="${esc(content)}" /></head><body>${esc(content)}</body></html>`,
        contentType: "text/html",
      };
    }
  }
}
