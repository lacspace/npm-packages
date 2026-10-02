import { CopyType, Platform, PLATFORMS, limitFor, fitText } from "./platforms.js";
import { Lang, SENSATIONAL, Style, Template, TEMPLATES } from "./templates.js";

export { PLATFORMS, limitFor, fitText } from "./platforms.js";
export { TEMPLATES } from "./templates.js";
export type { Platform, CopyType } from "./platforms.js";
export type { Style, Lang } from "./templates.js";

const VERSION = "1.0.0";

/** The ONLY source of content — the generator never invents facts beyond these. */
export interface Facts {
  topic?: string;
  headline?: string;
  place?: string;
  number?: string;
  percent?: string;
  amount?: string;
  date?: string;
  entity?: string;
  quote?: string;
  who?: string;
  category?: string;
  /** Hashtags (without '#'); used by compose(). */
  hashtags?: string[];
}

export interface GenerateOptions {
  type: CopyType;
  platform: Platform;
  /** "en", "ne", or "both" (default "en"). */
  lang?: Lang | "both";
  /** Restrict to these styles. */
  styles?: Style[];
  /** Cap the number of variants returned. */
  max?: number;
}

export interface Variant {
  style: Style;
  lang: Lang;
  text: string;
  length: number;
}

const SLOT_RE = /\{(\w+)\}/g;

function slotsOf(t: string): string[] {
  return [...t.matchAll(SLOT_RE)].map((m) => m[1]!);
}

function fillable(t: Template, facts: Facts): boolean {
  return slotsOf(t.text).every((s) => {
    const v = (facts as any)[s];
    return typeof v === "string" ? v.trim().length > 0 : false;
  });
}

function fill(t: string, facts: Facts): string {
  return t.replace(SLOT_RE, (_, s) => String((facts as any)[s] ?? "")).replace(/\s+\n/g, "\n").trim();
}

function sensational(text: string): boolean {
  const low = text.toLowerCase();
  return SENSATIONAL.some((w) => low.includes(w));
}

/**
 * Generate platform-ready copy of one type (hook/title/caption/cta/description) from
 * facts, in many styles. Deterministic: it fills templates with ONLY the supplied facts
 * (a template whose slots are missing is skipped — nothing is invented), trims to the
 * platform's limit, and drops any sensational phrasing. For slot-filling by an LLM, see
 * `slotTemplates`.
 */
export function generate(facts: Facts, options: GenerateOptions): Variant[] {
  const langs: Lang[] = options.lang === "both" ? ["ne", "en"] : [options.lang ?? "en"];
  const limit = limitFor(options.platform, options.type);
  const seen = new Set<string>();
  const out: Variant[] = [];
  for (const lang of langs) {
    for (const t of TEMPLATES[options.type]) {
      if (t.lang !== lang) continue;
      if (options.styles && !options.styles.includes(t.style)) continue;
      if (!fillable(t, facts)) continue;
      const filled = fill(t.text, facts);
      if (!filled || sensational(filled)) continue;
      const text = fitText(filled, limit);
      const key = `${lang}:${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ style: t.style, lang, text, length: text.length });
    }
  }
  return options.max ? out.slice(0, options.max) : out;
}

export interface ComposeOptions {
  platform: Platform;
  lang?: Lang;
  /** Preferred hook/caption style. */
  style?: Style;
  /** Include a CTA line. Default true. */
  cta?: boolean;
  /** Max hashtags to append (IG caps at 30). Default 8. */
  maxHashtags?: number;
}

export interface Composed {
  hook: string;
  caption: string;
  hashtags: string[];
  /** The full post text: hook + caption + CTA + hashtags, fitted to the platform. */
  text: string;
}

/** Assemble a complete post: a hook line, a caption body, a CTA, and hashtags. */
export function compose(facts: Facts, options: ComposeOptions): Composed {
  const lang = options.lang ?? "en";
  const pick = (type: CopyType) => {
    const v = generate(facts, { type, platform: options.platform, lang, styles: options.style ? [options.style] : undefined });
    return v[0] ?? generate(facts, { type, platform: options.platform, lang })[0];
  };
  const hook = pick("hook")?.text ?? facts.headline ?? "";
  const caption = pick("caption")?.text ?? facts.headline ?? "";
  const cta = options.cta === false ? undefined : pick("cta")?.text;
  const maxTags = options.maxHashtags ?? (options.platform === "instagram" ? 30 : 8);
  const hashtags = (facts.hashtags ?? []).slice(0, maxTags).map((h) => "#" + h.replace(/[^\p{L}\p{N}]/gu, ""));

  const blocks = [hook, caption, cta, hashtags.join(" ")].filter(Boolean) as string[];
  const text = fitText(blocks.join("\n\n"), limitFor(options.platform, "caption"));
  return { hook, caption, hashtags, text };
}

/** Raw templates (with {slots}) for a type — for an LLM to fill the slots itself. */
export function slotTemplates(type: CopyType, lang: Lang = "en"): Array<{ style: Style; template: string; slots: string[] }> {
  return TEMPLATES[type]
    .filter((t) => t.lang === lang)
    .map((t) => ({ style: t.style, template: t.text, slots: slotsOf(t.text) }));
}

/** Machine-readable capability + options descriptor for an AI "conductor". */
export function describe() {
  const styles = [...new Set(Object.values(TEMPLATES).flat().map((t) => t.style))];
  return {
    name: "@lacspace/hookwriter",
    version: VERSION,
    summary: "Deterministic platform copy (hooks, titles, captions, CTAs, descriptions) from facts, many styles, en + ne. Fills only supplied facts; never sensationalizes.",
    types: ["hook", "title", "caption", "cta", "description"] as CopyType[],
    styles,
    platforms: Object.keys(PLATFORMS) as Platform[],
    commands: [
      {
        name: "generate",
        input: {
          type: "object",
          properties: {
            facts: { type: "object", description: "topic, headline, place, number, percent, amount, date, entity, quote, who, category, hashtags[]" },
            type: { enum: ["hook", "title", "caption", "cta", "description"] },
            platform: { enum: Object.keys(PLATFORMS) },
            lang: { enum: ["en", "ne", "both"] },
            styles: { type: "array", items: { enum: styles } },
            max: { type: "integer" },
          },
          required: ["facts", "type", "platform"],
        },
        output: "Variant[] = { style, lang, text, length }[]",
      },
      {
        name: "compose",
        input: { type: "object", properties: { facts: { type: "object" }, platform: { enum: Object.keys(PLATFORMS) }, lang: { enum: ["en", "ne"] }, style: { enum: styles }, cta: { type: "boolean" }, maxHashtags: { type: "integer" } }, required: ["facts", "platform"] },
        output: "{ hook, caption, hashtags, text }",
      },
    ],
  };
}
