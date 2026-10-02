export type Platform =
  | "youtube" | "instagram" | "tiktok" | "facebook" | "x" | "threads" | "linkedin" | "telegram";

export type CopyType = "hook" | "title" | "caption" | "cta" | "description";

export interface PlatformLimits {
  /** Max characters for each copy type on this platform. */
  title: number;
  caption: number;
  description: number;
  hook: number;
}

// Practical limits (hard caps where the platform enforces one, sensible soft caps
// otherwise — e.g. a caption that stays above the "more" fold).
export const PLATFORMS: Record<Platform, PlatformLimits> = {
  youtube: { title: 100, caption: 5000, description: 5000, hook: 100 },
  instagram: { title: 125, caption: 2200, description: 2200, hook: 125 },
  tiktok: { title: 150, caption: 2200, description: 2200, hook: 150 },
  facebook: { title: 120, caption: 2000, description: 2000, hook: 250 },
  x: { title: 280, caption: 280, description: 280, hook: 280 },
  threads: { title: 500, caption: 500, description: 500, hook: 500 },
  linkedin: { title: 200, caption: 3000, description: 3000, hook: 210 },
  telegram: { title: 256, caption: 1024, description: 4096, hook: 256 },
};

export function limitFor(platform: Platform, type: CopyType): number {
  const p = PLATFORMS[platform];
  return type === "title" ? p.title : type === "description" ? p.description : type === "hook" ? p.hook : p.caption;
}

/** Trim to a max length at a word boundary, adding an ellipsis only if it was cut. */
export function fitText(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const atSpace = cut.replace(/\s+\S*$/, "");
  return (atSpace.length > max * 0.6 ? atSpace : cut).trim() + "…";
}
