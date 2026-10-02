import { Category, LEXICONS, PATTERNS } from "./lexicons.js";

export type { Category } from "./lexicons.js";
export { LEXICONS, PATTERNS } from "./lexicons.js";

const VERSION = "1.0.0";

export type Action = "allow" | "review" | "flag" | "hide";

export interface FaqRule {
  /** Keywords/phrases (any match) or a RegExp that triggers this reply. */
  match: string[] | RegExp;
  reply: { en?: string; ne?: string } | string;
}

export interface ModerateOptions {
  /** Extra lexicon terms per category, merged with the bundled starters. */
  lexicons?: Partial<Record<Category, string[]>>;
  /** FAQ auto-replies to suggest when a comment is clean and matches. */
  faqs?: FaqRule[];
  /** Reply language preference for FAQ suggestions. Default "en". */
  lang?: "en" | "ne";
  /** Score ≥ hide → hide; ≥ flag → flag; ≥ review → review; else allow. */
  thresholds?: { review?: number; flag?: number; hide?: number };
}

export interface ModerationResult {
  action: Action;
  /** Per-category 0–1 severity. */
  categories: Record<Category, number>;
  /** Overall 0–1 severity (max of categories). */
  score: number;
  reasons: string[];
  /** True when the score sits in the gray zone — a good case for an AI second opinion. */
  borderline: boolean;
  /** A suggested FAQ reply, if one matched and the comment is clean. */
  suggestedReply?: string;
  /** Any PII detected (for doxxing handling / redaction). */
  pii: { phones: string[]; emails: string[]; urls: string[] };
}

const CATEGORIES: Category[] = ["spam", "abuse", "hate", "doxxing", "linkspam"];

/** Normalize for matching: lowercase, collapse elongations ("soooo"→"soo"), keep scripts. */
function normalize(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/(.)\1{2,}/gu, "$1$1") // "loooool" → "lool"
    .replace(/\s+/g, " ")
    .trim();
}

function countHits(text: string, terms: string[]): string[] {
  const hits: string[] = [];
  for (const t of terms) {
    const term = t.toLowerCase();
    if (!term) continue;
    if (text.includes(term)) hits.push(t);
  }
  return hits;
}

/**
 * Triage a user comment (English, romanized Nepali, or Devanagari) into an action —
 * allow / review / flag / hide — with per-category severities, detected PII, and an
 * optional FAQ reply suggestion. Deterministic rules + small lexicons; the `borderline`
 * flag marks gray-zone cases where you may want an AI second opinion (AI is NOT called
 * here — that stays your choice). Extend the lexicons via options for your community.
 */
export function moderate(comment: string, options: ModerateOptions = {}): ModerationResult {
  const text = normalize(comment);
  const reasons: string[] = [];
  const categories: Record<Category, number> = { spam: 0, abuse: 0, hate: 0, doxxing: 0, linkspam: 0 };

  // Lexicon hits per category.
  for (const cat of CATEGORIES) {
    const terms = [...LEXICONS[cat], ...(options.lexicons?.[cat] ?? [])];
    const hits = countHits(text, terms);
    if (hits.length) {
      categories[cat] = Math.min(1, 0.45 + 0.2 * hits.length);
      reasons.push(`${cat}: ${hits.slice(0, 3).join(", ")}`);
    }
  }

  // PII + links (raw, not normalized, to preserve structure).
  const phones = comment.match(PATTERNS.phoneNp) ?? [];
  const emails = comment.match(PATTERNS.email) ?? [];
  const urls = comment.match(PATTERNS.url) ?? [];
  const shorteners = comment.match(PATTERNS.shortener) ?? [];

  // Doxxing: PII sharpens a doxxing-cue hit, and PII alone is a review signal.
  if (phones.length || emails.length) {
    categories.doxxing = Math.min(1, Math.max(categories.doxxing, categories.doxxing > 0 ? 0.9 : 0.5) + 0.1 * (phones.length + emails.length - 1));
    reasons.push(`pii: ${phones.length} phone, ${emails.length} email`);
  }
  // Link-spam: links sharpen a linkspam-cue; many links or a shortener raises it.
  if (urls.length || shorteners.length) {
    const base = categories.linkspam > 0 ? 0.8 : 0.4;
    categories.linkspam = Math.min(1, base + 0.2 * (urls.length - 1) + (shorteners.length ? 0.3 : 0));
    reasons.push(`links: ${urls.length}${shorteners.length ? " (shortener)" : ""}`);
  }

  const score = Math.max(...CATEGORIES.map((c) => categories[c]));
  const th = { review: 0.4, flag: 0.6, hide: 0.85, ...options.thresholds };
  let action: Action = "allow";
  if (score >= th.hide) action = "hide";
  else if (score >= th.flag) action = "flag";
  else if (score >= th.review) action = "review";

  const borderline = score >= th.review - 0.1 && score < th.hide;

  // FAQ suggestion only for clean comments (don't reward spam/abuse with a reply).
  let suggestedReply: string | undefined;
  if (action === "allow" && options.faqs) {
    const lang = options.lang ?? "en";
    for (const f of options.faqs) {
      const matched = f.match instanceof RegExp ? f.match.test(text) : countHits(text, f.match).length > 0;
      if (matched) {
        suggestedReply = typeof f.reply === "string" ? f.reply : f.reply[lang] ?? f.reply.en ?? f.reply.ne;
        reasons.push("faq matched");
        break;
      }
    }
  }

  return { action, categories, score: round(score), reasons, borderline, suggestedReply, pii: { phones, emails, urls: [...urls, ...shorteners] } };
}

/** Machine-readable descriptor for an AI "conductor". */
export function describe() {
  return {
    name: "@lacspace/commentguard",
    version: VERSION,
    summary: "Comment moderation (en / romanized Nepali / Devanagari): spam, abuse, hate, doxxing, link-spam → allow/review/flag/hide, with PII detection and FAQ auto-replies. AI only for borderline.",
    categories: CATEGORIES,
    actions: ["allow", "review", "flag", "hide"] as Action[],
    commands: [
      {
        name: "moderate",
        input: {
          type: "object",
          properties: {
            comment: { type: "string" },
            lexicons: { type: "object", description: "extra terms per category" },
            faqs: { type: "array", description: "{ match, reply } rules" },
            lang: { enum: ["en", "ne"] },
            thresholds: { type: "object", properties: { review: { type: "number" }, flag: { type: "number" }, hide: { type: "number" } } },
          },
          required: ["comment"],
        },
        output: "{ action, categories, score, reasons, borderline, suggestedReply?, pii }",
      },
    ],
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
