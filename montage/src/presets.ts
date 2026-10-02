export interface SafeArea {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface PresetInfo {
  label: string;
  width: number;
  height: number;
  /** Pixel insets reserved for platform UI (captions/CTA/account chrome). */
  safe: SafeArea;
}

export type PresetName =
  | "reels" | "tiktok" | "shorts" // 1080×1920 (9:16)
  | "fb-feed" // 1080×1350 (4:5)
  | "fb-square" | "square" // 1080×1080 (1:1)
  | "youtube" | "landscape"; // 1920×1080 (16:9)

// Safe-area insets are conservative approximations of each platform's UI overlays as of
// 2026 (right-rail actions, caption band, progress/CTA). Tune per campaign if needed.
export const PRESETS: Record<PresetName, PresetInfo> = {
  reels: { label: "Instagram Reels", width: 1080, height: 1920, safe: { top: 220, bottom: 380, left: 60, right: 180 } },
  tiktok: { label: "TikTok", width: 1080, height: 1920, safe: { top: 160, bottom: 440, left: 40, right: 200 } },
  shorts: { label: "YouTube Shorts", width: 1080, height: 1920, safe: { top: 160, bottom: 380, left: 40, right: 150 } },
  "fb-feed": { label: "Facebook Feed", width: 1080, height: 1350, safe: { top: 90, bottom: 120, left: 60, right: 60 } },
  "fb-square": { label: "Square", width: 1080, height: 1080, safe: { top: 80, bottom: 100, left: 60, right: 60 } },
  square: { label: "Square", width: 1080, height: 1080, safe: { top: 80, bottom: 100, left: 60, right: 60 } },
  youtube: { label: "YouTube", width: 1920, height: 1080, safe: { top: 60, bottom: 90, left: 80, right: 80 } },
  landscape: { label: "Landscape 16:9", width: 1920, height: 1080, safe: { top: 60, bottom: 90, left: 80, right: 80 } },
};

export function resolvePreset(p: PresetName | PresetInfo): PresetInfo {
  return typeof p === "string" ? PRESETS[p] : p;
}
