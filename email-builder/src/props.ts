import { VAR_RE } from "./escape";
import { blockSchema } from "./schema";
import type { Block } from "./types";

/** Prop value, falling back to the schema default. Empty strings count as unset. */
export function prop(b: Block, key: string): unknown {
  const v = b.props?.[key];
  if (v !== undefined && v !== null && v !== "") return v;
  return blockSchema[b.type]?.props[key]?.default;
}

export function str(b: Block, key: string): string {
  const v = prop(b, key);
  return v == null ? "" : String(v);
}

export function num(b: Block, key: string, def: number): number {
  const v = prop(b, key);
  const x = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(x) ? x : def;
}

export function bool(b: Block, key: string): boolean {
  const v = prop(b, key);
  return v === true || v === "true";
}

export function align(b: Block, def: "left" | "center" | "right" = "left"): "left" | "center" | "right" {
  const v = str(b, "align");
  return v === "left" || v === "center" || v === "right" ? v : def;
}

/** List items from string[] or a newline-separated string. */
export function listItems(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => (x == null ? "" : String(x))).filter((x) => x.trim() !== "");
  if (typeof v === "string") return v.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  return [];
}

/** Table rows from string[][] or lines with cells split by `|` (a `|` inside a {{var}} doesn't split). */
export function tableRows(v: unknown): string[][] {
  if (Array.isArray(v)) {
    return v
      .map((row) => (Array.isArray(row) ? row.map((c) => (c == null ? "" : String(c))) : [row == null ? "" : String(row)]))
      .filter((r) => r.length > 0);
  }
  if (typeof v !== "string") return [];
  return v
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .map((line) => {
      const vars: string[] = [];
      const masked = line.replace(VAR_RE, (m) => {
        vars.push(m);
        return `\u0001${vars.length - 1}\u0001`;
      });
      return masked.split("|").map((c) => c.trim().replace(/\u0001(\d+)\u0001/g, (_m, i: string) => vars[Number(i)] ?? ""));
    });
}

/** Column ratios from number[] or "1,2"; null when absent or unusable. */
export function ratios(v: unknown, n: number): number[] | null {
  let arr: number[] | null = null;
  if (Array.isArray(v)) arr = v.map(Number);
  else if (typeof v === "string" && v.trim()) arr = v.split(/[,:\s]+/).filter(Boolean).map(Number);
  if (!arr || arr.length !== n || arr.some((x) => !Number.isFinite(x) || x <= 0)) return null;
  return arr;
}

const SOCIAL_LABELS: Record<string, string> = {
  x: "X",
  twitter: "Twitter",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  facebook: "Facebook",
  instagram: "Instagram",
  github: "GitHub",
  whatsapp: "WhatsApp",
  website: "Website",
};

export function socialLabel(kind: string): string {
  const k = kind.trim().toLowerCase();
  return SOCIAL_LABELS[k] ?? (k ? k[0]!.toUpperCase() + k.slice(1) : "Link");
}
