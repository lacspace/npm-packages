/**
 * Lexical content moderation.
 *
 * The built-in scan matches against **small, deliberately conservative** word
 * and pattern lists per category. It catches obvious cases and is fully
 * deterministic and offline — but it is **not** a substitute for a real
 * moderation model: it has no understanding of context, sarcasm, negation or
 * obfuscation, and will both miss and over-flag. For production safety, inject
 * a `classify` function that wraps a real moderation endpoint or LLM; when you
 * do, the built-in lists are bypassed entirely.
 */

import type { ClassifyFn, ModerateOptions, ModerationResult } from "./types";

/** The categories the built-in lexical scanner scores. */
export const MODERATION_CATEGORIES = [
  "harassment",
  "hate",
  "violence",
  "self-harm",
  "sexual",
  "profanity",
] as const;

export type ModerationCategory = (typeof MODERATION_CATEGORIES)[number];

/**
 * Small, documented term lists per category. Intentionally short — this is a
 * heuristic tripwire, not a lexicon. Matching is whole-word and
 * case-insensitive.
 */
const LEXICONS: Record<ModerationCategory, string[]> = {
  harassment: ["idiot", "moron", "stupid", "loser", "shut up", "worthless", "pathetic"],
  hate: ["bigot", "racist", "inferior race", "subhuman", "ethnic slur"],
  violence: ["kill you", "kill them", "shoot", "stab", "bomb", "murder", "assault", "behead"],
  "self-harm": ["kill myself", "suicide", "self harm", "self-harm", "end my life", "cut myself"],
  sexual: ["porn", "explicit sex", "nude", "nsfw", "xxx"],
  profanity: ["fuck", "shit", "bastard", "asshole", "bitch", "crap"],
};

/** Default score at/above which a category is flagged. */
export const DEFAULT_MODERATION_THRESHOLD = 0.5;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scoreCategory(text: string, terms: string[]): number {
  let hits = 0;
  for (const term of terms) {
    // Word-ish boundaries; phrases match on internal spaces literally.
    const re = new RegExp(`(?:^|[^\\p{L}])${escapeRegex(term)}(?:$|[^\\p{L}])`, "iu");
    if (re.test(text)) hits++;
  }
  if (hits === 0) return 0;
  return Math.min(1, 0.5 + 0.15 * (hits - 1) + 0.1);
}

/**
 * The built-in, offline lexical classifier. Exposed so callers can compose or
 * inspect it; {@link moderateText} uses it by default.
 */
export function lexicalModerate(
  text: string,
  categories: readonly string[] = MODERATION_CATEGORIES,
  threshold: number = DEFAULT_MODERATION_THRESHOLD,
): ModerationResult {
  const scores: Record<string, number> = {};
  const cats: Record<string, boolean> = {};
  let flagged = false;
  for (const cat of categories) {
    const terms = LEXICONS[cat as ModerationCategory];
    const score = terms ? scoreCategory(text, terms) : 0;
    scores[cat] = score;
    const isFlagged = score >= threshold;
    cats[cat] = isFlagged;
    if (isFlagged) flagged = true;
  }
  return { flagged, categories: cats, scores };
}

/**
 * Moderate `text`. By default runs the built-in lexical scan (deterministic,
 * offline). Pass `opts.classify` to delegate to a real moderation model or
 * endpoint you wrap — its {@link ModerationResult} is returned verbatim.
 */
export async function moderateText(
  text: string,
  opts: ModerateOptions = {},
): Promise<ModerationResult> {
  const classify: ClassifyFn | undefined = opts.classify;
  if (classify) return classify(text);
  return lexicalModerate(
    text,
    opts.categories ?? MODERATION_CATEGORIES,
    opts.threshold ?? DEFAULT_MODERATION_THRESHOLD,
  );
}
