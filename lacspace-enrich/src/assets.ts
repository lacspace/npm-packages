/**
 * Asset download — save a site's logo/favicon to disk. Network + fs; used by the
 * enrich pipeline when an `assetsDir` is given. Never throws: returns the local
 * path on success, or undefined.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";

const EXT_BY_CT: Record<string, string> = {
  "image/png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/gif": ".gif",
  "image/svg+xml": ".svg", "image/webp": ".webp", "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico", "image/avif": ".avif",
};

function safeBase(domain: string): string {
  return domain.replace(/[^a-z0-9.-]/gi, "_");
}

/** Download one asset URL into `dir`, named `<domain>.<kind><ext>`. Never throws. */
export async function downloadAsset(
  url: string,
  dir: string,
  domain: string,
  kind: "logo" | "favicon",
  opts: { timeoutMs?: number } = {},
): Promise<string | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) return undefined;
    const ct = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return undefined;
    const ext = EXT_BY_CT[ct] ?? extname(new URL(url).pathname) ?? "";
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${safeBase(domain)}.${kind}${ext || ".bin"}`);
    writeFileSync(path, buf);
    return path;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
