/**
 * Audit an existing favicon / PWA setup — a local output directory or a live
 * URL — and report which recommended files and `<head>` tags are missing, so a
 * user can tell at a glance whether their icons are actually wired up.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** One checked item in an audit. */
export interface CheckItem {
  label: string;
  ok: boolean;
  /** true = a strong recommendation whose absence counts against the score. */
  required: boolean;
  detail?: string;
}

/** The result of auditing a target. */
export interface CheckReport {
  target: string;
  kind: "dir" | "url";
  items: CheckItem[];
  /** Labels of the required items that are missing. */
  missing: string[];
  /** 0..100 completeness score over the required items. */
  score: number;
}

function score(items: CheckItem[]): { missing: string[]; score: number } {
  const required = items.filter((i) => i.required);
  const missing = required.filter((i) => !i.ok).map((i) => i.label);
  const pct = required.length === 0 ? 100 : Math.round(((required.length - missing.length) / required.length) * 100);
  return { missing, score: pct };
}

const REQUIRED_FILES = [
  "favicon.ico",
  "favicon-32x32.png",
  "favicon-16x16.png",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "manifest.webmanifest",
];
const OPTIONAL_FILES = ["icon-maskable-512.png", "og.png"];

/** Audit a directory of generated assets on disk. */
export function checkDir(dir: string): CheckReport {
  const root = resolve(dir);
  const items: CheckItem[] = [];
  for (const f of REQUIRED_FILES) {
    items.push({ label: f, ok: existsSync(resolve(root, f)), required: true });
  }
  for (const f of OPTIONAL_FILES) {
    items.push({ label: f, ok: existsSync(resolve(root, f)), required: false });
  }
  // If a manifest exists, sanity-check it.
  const manifestPath = resolve(root, "manifest.webmanifest");
  if (existsSync(manifestPath)) {
    try {
      const m = JSON.parse(readFileSync(manifestPath, "utf8"));
      const has192 = Array.isArray(m.icons) && m.icons.some((i: { sizes?: string }) => i.sizes === "192x192");
      const has512 = Array.isArray(m.icons) && m.icons.some((i: { sizes?: string }) => i.sizes === "512x512");
      items.push({ label: "manifest lists a 192px icon", ok: has192, required: true });
      items.push({ label: "manifest lists a 512px icon", ok: has512, required: true });
      items.push({ label: "manifest has theme_color", ok: typeof m.theme_color === "string", required: false });
      const maskable = Array.isArray(m.icons) && m.icons.some((i: { purpose?: string }) => (i.purpose ?? "").includes("maskable"));
      items.push({ label: "manifest has a maskable icon", ok: maskable, required: false });
    } catch {
      items.push({ label: "manifest.webmanifest is valid JSON", ok: false, required: true });
    }
  }
  return { target: root, kind: "dir", items, ...score(items) };
}

/** Audit a live URL: fetch its HTML `<head>` and (if linked) its manifest. */
export async function checkUrl(url: string): Promise<CheckReport> {
  const items: CheckItem[] = [];
  let html = "";
  try {
    const res = await fetch(url, { redirect: "follow" });
    html = await res.text();
  } catch (e) {
    return {
      target: url,
      kind: "url",
      items: [{ label: "page is reachable", ok: false, required: true, detail: (e as Error).message }],
      missing: ["page is reachable"],
      score: 0,
    };
  }

  const has = (re: RegExp) => re.test(html);
  items.push({ label: '<link rel="icon"> present', ok: has(/<link[^>]+rel=["']?[^"'>]*icon/i), required: true });
  items.push({ label: '<link rel="apple-touch-icon"> present', ok: has(/rel=["']?apple-touch-icon/i), required: true });
  items.push({ label: '<link rel="manifest"> present', ok: has(/rel=["']?manifest/i), required: true });
  items.push({ label: '<meta name="theme-color"> present', ok: has(/name=["']?theme-color/i), required: false });
  items.push({ label: 'apple-touch-startup-image present', ok: has(/apple-touch-startup-image/i), required: false });

  // Try to resolve + fetch the manifest.
  const manifestHref = html.match(/rel=["']?manifest["']?[^>]*href=["']([^"']+)["']/i)?.[1] ||
    html.match(/href=["']([^"']+)["'][^>]*rel=["']?manifest/i)?.[1];
  if (manifestHref) {
    try {
      const manifestUrl = new URL(manifestHref, url).toString();
      const mres = await fetch(manifestUrl, { redirect: "follow" });
      const m = JSON.parse(await mres.text());
      const has192 = Array.isArray(m.icons) && m.icons.some((i: { sizes?: string }) => i.sizes === "192x192");
      const has512 = Array.isArray(m.icons) && m.icons.some((i: { sizes?: string }) => i.sizes === "512x512");
      items.push({ label: "manifest fetched OK", ok: true, required: true, detail: manifestUrl });
      items.push({ label: "manifest lists a 192px icon", ok: has192, required: true });
      items.push({ label: "manifest lists a 512px icon", ok: has512, required: true });
    } catch (e) {
      items.push({ label: "manifest fetched OK", ok: false, required: true, detail: (e as Error).message });
    }
  }

  return { target: url, kind: "url", items, ...score(items) };
}

/** Audit a target that is either a URL (http/https) or a local directory. */
export async function check(target: string): Promise<CheckReport> {
  if (/^https?:\/\//i.test(target)) return checkUrl(target);
  return checkDir(target);
}
