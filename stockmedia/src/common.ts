import { Orientation, Provider, MediaType, StockAsset } from "./types.js";

export function orientationOf(w: number, h: number): Orientation {
  if (w > h * 1.05) return "landscape";
  if (h > w * 1.05) return "portrait";
  return "square";
}

// Tag/description cues that suggest an identifiable person or a brand/logo — used by
// the conservative `safeForNews` heuristic. Not exhaustive; errs toward "not safe".
const PERSON_CUES = [
  "portrait", "selfie", "face", "person", "people", "man", "woman", "men", "women",
  "boy", "girl", "child", "children", "kid", "model", "crowd", "family", "couple",
  "teenager", "adult", "human", "businessman", "businesswoman", "worker", "player",
];
const BRAND_CUES = ["logo", "brand", "trademark", "signage", "billboard", "advertisement"];

export function isNewsSafe(tags: string[]): boolean {
  const set = tags.map((t) => t.toLowerCase());
  for (const t of set) {
    if (PERSON_CUES.includes(t) || BRAND_CUES.includes(t)) return false;
  }
  return true;
}

const PROVIDER_NAME: Record<Provider, string> = { pexels: "Pexels", pixabay: "Pixabay" };

/** One-line credit short enough for a video description. */
export function attribution(type: MediaType, author: string, provider: Provider): string {
  const t = type === "video" ? "Video" : "Photo";
  const who = author ? ` by ${author}` : "";
  return `${t}${who} on ${PROVIDER_NAME[provider]}`;
}

/** Apply the client-side filters the provider params can't guarantee exactly. */
export function passesFilters(a: StockAsset, o: {
  orientation?: Orientation;
  minWidth?: number;
  minHeight?: number;
  minDuration?: number;
  maxDuration?: number;
  newsSafeOnly?: boolean;
}): boolean {
  if (o.orientation && a.orientation !== o.orientation) return false;
  if (o.minWidth && a.width < o.minWidth) return false;
  if (o.minHeight && a.height < o.minHeight) return false;
  if (a.type === "video") {
    if (o.minDuration && (a.duration ?? 0) < o.minDuration) return false;
    if (o.maxDuration && (a.duration ?? Infinity) > o.maxDuration) return false;
  }
  if (o.newsSafeOnly && !a.safeForNews) return false;
  return true;
}

export function splitTags(s: string | undefined | null): string[] {
  if (!s) return [];
  return s
    .split(/[,\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}
