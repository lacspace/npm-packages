/**
 * Manifest of the pixel-exact brand files bundled with this package (the master
 * traced artwork, Lottie motion and the favicon/app-icon set). Import them by
 * subpath — e.g. `import markUrl from "@lacspace/brand/assets/svg/mark.svg"` — or
 * read the file with the path helper in Node. The lean, self-contained SVG marks
 * come from `mark()` / `craftMark()` and need none of these.
 */

export interface AssetEntry {
  /** package-relative path, also the subpath import specifier */
  path: string;
  kind: "svg" | "lottie" | "png" | "manifest";
  label: string;
}

export const ASSETS = {
  markFullColor: { path: "assets/svg/mark.svg", kind: "svg", label: "Master mark — full colour" },
  markWhite: { path: "assets/svg/mark-white.svg", kind: "svg", label: "Mark — white (dark grounds)" },
  markBlack: { path: "assets/svg/mark-black.svg", kind: "svg", label: "Mark — black (light grounds)" },
  wordmark: { path: "assets/svg/wordmark.svg", kind: "svg", label: "Wordmark (Space Grotesk, embedded)" },
  lockupHorizontal: { path: "assets/svg/lockup-horizontal.svg", kind: "svg", label: "Horizontal lockup" },
  lottiePulse: { path: "assets/lottie/pulse.json", kind: "lottie", label: "Lottie — breathing pulse" },
  lottieReveal: { path: "assets/lottie/reveal.json", kind: "lottie", label: "Lottie — scale-in reveal" },
  faviconSvg: { path: "assets/favicon/favicon.svg", kind: "svg", label: "Favicon (scalable)" },
  safariPinnedTab: { path: "assets/favicon/safari-pinned-tab.svg", kind: "svg", label: "Safari pinned-tab mask" },
  appleTouchIcon: { path: "assets/favicon/apple-touch-icon.png", kind: "png", label: "Apple touch icon 180" },
  favicon32: { path: "assets/favicon/favicon-32.png", kind: "png", label: "Favicon 32" },
  favicon16: { path: "assets/favicon/favicon-16.png", kind: "png", label: "Favicon 16" },
  webManifest: { path: "assets/favicon/site.webmanifest", kind: "manifest", label: "Web app manifest" },
} satisfies Record<string, AssetEntry>;

export type AssetKey = keyof typeof ASSETS;

/** Build a URL to a bundled asset under a base you host it at. */
export function assetUrl(base: string, key: AssetKey): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${b}/${ASSETS[key].path.replace(/^assets\//, "")}`;
}

/**
 * Absolute path to a bundled asset on disk (Node only). Throws in the browser.
 * `import { assetFile } from "@lacspace/brand"; readFileSync(assetFile("markFullColor"))`
 */
export function assetFile(key: AssetKey): string {
  if (typeof process === "undefined" || !process.versions?.node) {
    throw new Error("assetFile() is Node-only; in the browser import the asset subpath directly.");
  }
  // dist/ sits one level under the package root; assets/ sits at the root.
  const rel = ASSETS[key].path;
  const here = new URL(".", import.meta.url).pathname;
  return here.replace(/\/dist\/?$/, "/") + rel;
}
