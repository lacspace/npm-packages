export type Format = "video" | "image" | "carousel" | "text";
export type Platform =
  | "facebook" | "instagram" | "tiktok" | "youtube" | "x" | "threads" | "telegram" | "linkedin";

export interface StoryFeatures {
  /** A video asset (clip/render) is available. */
  hasVideo?: boolean;
  /** Number of usable images (a carousel needs ≥ 2; a newscard can always make 1). */
  imageCount?: number;
  hasStat?: boolean;
  hasQuote?: boolean;
  isBreaking?: boolean;
  /** Body length in characters. */
  textLength?: number;
  category?: string;
}

export interface PlanContext {
  platforms: Platform[];
  /** Recently posted formats per platform (most recent first) — keeps the mix natural. */
  recent?: Partial<Record<Platform, Format[]>>;
}

export interface PlanOptions {
  /** Optional cheap AI tie-break, called ONLY when the top two are within `tieThreshold`. */
  llm?: (prompt: string) => Promise<string>;
  /** Score gap under which a tie-break triggers. Default 0.1. */
  tieThreshold?: number;
  /** How many recent posts to weigh for the mix penalty. Default 5. */
  mixWindow?: number;
}

export interface PlatformPlan {
  platform: Platform;
  format: Format;
  score: number;
  alternatives: Array<{ format: Format; score: number }>;
  reasons: string[];
  /** Set when the AI tie-break decided between close candidates. */
  aiTieBreak?: boolean;
}

const FORMATS: Format[] = ["video", "image", "carousel", "text"];

// Base platform × format affinities. Facebook is deliberately balanced so it gets a mix.
const AFFINITY: Record<Platform, Record<Format, number>> = {
  facebook: { video: 0.6, image: 0.7, carousel: 0.62, text: 0.5 },
  instagram: { video: 0.8, image: 0.6, carousel: 0.82, text: 0.1 },
  tiktok: { video: 1.0, image: 0.12, carousel: 0.2, text: 0.0 },
  youtube: { video: 1.0, image: 0.05, carousel: 0.05, text: 0.0 },
  x: { video: 0.55, image: 0.72, carousel: 0.35, text: 0.8 },
  threads: { video: 0.45, image: 0.62, carousel: 0.42, text: 0.78 },
  telegram: { video: 0.5, image: 0.6, carousel: 0.42, text: 0.8 },
  linkedin: { video: 0.5, image: 0.6, carousel: 0.62, text: 0.7 },
};

/** Can the story physically produce this format? */
function capable(format: Format, f: StoryFeatures): boolean {
  if (format === "video") return !!f.hasVideo;
  if (format === "carousel") return (f.imageCount ?? 0) >= 2 || !!(f.hasStat && f.hasQuote);
  return true; // image (a newscard always works) and text are always possible
}

function priority(format: Format): number {
  return FORMATS.indexOf(format); // stable deterministic tie order
}

/**
 * Choose a post format per platform — rule-based and deterministic, with an optional AI
 * tie-break only when two formats are nearly tied. Balances platform fit, what the story
 * can produce, a breaking-news nudge, and a "don't repeat the last few" mix penalty so a
 * feed like Facebook gets a natural spread instead of all videos.
 */
export async function planPosts(
  features: StoryFeatures,
  context: PlanContext,
  options: PlanOptions = {},
): Promise<PlatformPlan[]> {
  const tie = options.tieThreshold ?? 0.1;
  const mixWindow = options.mixWindow ?? 5;
  const out: PlatformPlan[] = [];

  for (const platform of context.platforms) {
    const recent = (context.recent?.[platform] ?? []).slice(0, mixWindow);
    const scored: Array<{ format: Format; score: number; reasons: string[] }> = [];

    for (const format of FORMATS) {
      if (!capable(format, features)) continue;
      const reasons: string[] = [];
      let score = AFFINITY[platform][format];
      reasons.push(`${platform} affinity for ${format} ${score.toFixed(2)}`);

      // Breaking news favors fast formats (video if ready, else image).
      if (features.isBreaking) {
        if (format === "image") score += 0.12, reasons.push("breaking → image is fast");
        if (format === "video" && features.hasVideo) score += 0.08, reasons.push("breaking → video");
        if (format === "carousel") score -= 0.1, reasons.push("breaking → carousel too slow");
      }
      // Content nudges.
      if (format === "carousel" && features.hasStat && features.hasQuote) {
        score += 0.08, reasons.push("stat + quote suit a carousel");
      }
      if (format === "text" && (features.textLength ?? 0) > 400) {
        score += 0.06, reasons.push("long body suits text");
      }
      if (format === "video" && features.hasVideo && (features.imageCount ?? 0) === 0) {
        score += 0.04, reasons.push("video asset ready, few stills");
      }

      // Mix penalty: discourage repeating the last few posts' formats on this platform.
      const repeats = recent.filter((r) => r === format).length;
      if (repeats) {
        const pen = 0.16 * (repeats / mixWindow) * recent.length;
        score -= pen;
        reasons.push(`recent ${format}×${repeats} → mix penalty -${pen.toFixed(2)}`);
      }

      scored.push({ format, score: Math.max(0, Math.round(score * 1000) / 1000), reasons });
    }

    scored.sort((a, b) => b.score - a.score || priority(a.format) - priority(b.format));
    let chosen = scored[0]!;
    let aiTieBreak = false;

    // AI tie-break only when the top two are within the threshold and an llm is supplied.
    if (options.llm && scored.length > 1 && scored[0]!.score - scored[1]!.score < tie) {
      const cands = scored.slice(0, 2).map((s) => s.format);
      try {
        const ans = await options.llm(tieBreakPrompt(platform, features, cands));
        const pick = cands.find((c) => new RegExp(`\\b${c}\\b`, "i").test(ans));
        if (pick && pick !== chosen.format) {
          chosen = scored.find((s) => s.format === pick)!;
          aiTieBreak = true;
        }
      } catch {
        /* fall back to the deterministic choice */
      }
    }

    out.push({
      platform,
      format: chosen.format,
      score: chosen.score,
      alternatives: scored.filter((s) => s.format !== chosen.format).map((s) => ({ format: s.format, score: s.score })),
      reasons: chosen.reasons,
      ...(aiTieBreak ? { aiTieBreak: true } : {}),
    });
  }

  return out;
}

/** The compact tie-break prompt (kept tiny to stay cheap). */
export function tieBreakPrompt(platform: Platform, f: StoryFeatures, candidates: Format[]): string {
  const facts = [
    f.isBreaking ? "breaking" : "",
    f.hasVideo ? "has video" : "",
    f.imageCount ? `${f.imageCount} images` : "",
    f.hasStat ? "has stat" : "",
    f.hasQuote ? "has quote" : "",
    f.category ? `category ${f.category}` : "",
  ].filter(Boolean).join(", ");
  return (
    `For a ${platform} post about a story (${facts || "general news"}), which format is better: ` +
    `${candidates.join(" or ")}? Reply with one word.`
  );
}
