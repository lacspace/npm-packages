import type { CheckStatus, Problem } from "./types.js";

/** Status from the worst problem: error → fail, warning → warn, else pass. */
export function statusFrom(problems: Problem[]): CheckStatus {
  if (problems.some((x) => x.severity === "error")) return "fail";
  if (problems.some((x) => x.severity === "warning")) return "warn";
  return "pass";
}

export const prob = (code: string, severity: Problem["severity"], message: string): Problem => ({ code, severity, message });

/** Parse `k=v; k=v` tag lists (DKIM, DMARC, MTA-STS, TLS-RPT, BIMI). Keys lower-cased; first wins. */
export function parseTags(record: string): { tags: Record<string, string>; order: string[]; duplicates: string[] } {
  const tags: Record<string, string> = {};
  const order: string[] = [];
  const duplicates: string[] = [];
  for (const part of record.split(";")) {
    const s = part.trim();
    if (!s) continue;
    const eq = s.indexOf("=");
    const k = (eq < 0 ? s : s.slice(0, eq)).trim().toLowerCase();
    const v = eq < 0 ? "" : s.slice(eq + 1).trim();
    if (k in tags) { duplicates.push(k); continue; }
    tags[k] = v;
    order.push(k);
  }
  return { tags, order, duplicates };
}

/** Split a `mailto:a@x,mailto:b@y!10m` list. */
export function splitUris(v: string | undefined): string[] {
  return (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

/** Domain of a `mailto:` URI (ignores the `!size` suffix), lower-cased. */
export function mailtoDomain(uri: string): string | undefined {
  const m = /^mailto:[^@]+@([^!?]+)/i.exec(uri.trim());
  return m?.[1]?.toLowerCase().replace(/\.$/, "");
}

/**
 * A rough organisational domain (last two labels, or three for common
 * second-level registries like co.uk / com.np). Without the Public Suffix List
 * this is a heuristic.
 */
export function orgDomain(d: string): string {
  const labels = d.toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length <= 2) return labels.join(".");
  const sld = labels[labels.length - 2]!;
  const tld = labels[labels.length - 1]!;
  const twoLevel = tld.length === 2 && ["co", "com", "net", "org", "gov", "edu", "ac", "or", "ne", "go", "gen", "ltd", "plc"].includes(sld);
  return labels.slice(twoLevel ? -3 : -2).join(".");
}

/** FNV-1a 32-bit hash as hex. Deterministic id for MTA-STS. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
