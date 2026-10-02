import { keyFacts, splitSentences, summarize } from "@lacspace/extractive";
import { keyphrase } from "@lacspace/keyphrase";
import { isCommonWord, looksLikeName, NE_NAMES } from "@lacspace/translit";

const VERSION = "1.0.0";

export type Lang = "en" | "ne";
export type SlideKind = "title" | "what" | "why" | "numbers" | "who" | "background" | "next" | "cta";

export interface Slide {
  kind: SlideKind;
  heading: string;
  body: string;
  bullets?: string[];
  stat?: { value: string; label: string };
}

export interface Scene {
  n: number;
  heading: string;
  /** What the voice says (≤ ~30 words). */
  voiceover: string;
  /** Short on-screen line (caption/kicker). */
  onScreen: string;
  durationSec: number;
  /** English stock-footage queries for @lacspace/stockmedia. */
  visualQueries: string[];
  overlay: "stinger" | "lowerThird" | "stat" | "none";
}

export interface Explainer {
  lang: Lang;
  category: string;
  headline: string;
  kicker: string;
  slides: Slide[];
  /** Ready for @lacspace/newscard renderCarousel({ slides }). */
  carousel: Array<{ type: "headline" | "stat" | "quote"; kicker?: string; headline?: string; attribution?: string; stat?: { value: string; label: string } }>;
  script: { scenes: Scene[]; totalSec: number; words: number };
  faq: Array<{ q: string; a: string }>;
  facts: ReturnType<typeof keyFacts>;
  hashtags: string[];
  warnings: string[];
}

export interface ExplainOptions {
  title?: string;
  lang?: Lang | "auto";
  /** Max slides (default 7 incl. title + CTA). */
  slides?: number;
  /** Max scenes (default 5). */
  scenes?: number;
  /** Target seconds per scene (default 8; actual follows word count). */
  sceneSeconds?: number;
  /** Category lexicons { category: [terms] }; defaults to DEFAULT_CATEGORIES. */
  categories?: Record<string, string[]>;
  /** Optional polish: rewrite a voiceover line (same facts, ≤ 25 words). Deterministic text is kept if it fails or invents digits. */
  llm?: (prompt: string) => Promise<string>;
  brand?: string;
}

export const DEFAULT_CATEGORIES: Record<string, string[]> = {
  politics: ["government", "minister", "parliament", "election", "party", "cabinet", "prime minister", "सरकार", "मन्त्री", "संसद", "निर्वाचन", "पार्टी", "प्रधानमन्त्री", "मन्त्रिपरिषद्", "सांसद"],
  economy: ["nepse", "share", "market", "bank", "nrb", "rupee", "forex", "budget", "tax", "price", "inflation", "trade", "remittance", "नेप्से", "सेयर", "बजार", "बैंक", "रुपैयाँ", "बजेट", "कर", "मूल्य", "मुद्रास्फीति", "व्यापार", "रेमिट्यान्स", "अर्थ"],
  sports: ["cricket", "football", "match", "team", "player", "tournament", "series", "goal", "wicket", "क्रिकेट", "फुटबल", "खेल", "टोली", "खेलाडी", "प्रतियोगिता", "सिरिज", "गोल", "विकेट"],
  weather: ["rain", "monsoon", "flood", "landslide", "temperature", "forecast", "storm", "snow", "वर्षा", "मनसुन", "बाढी", "पहिरो", "तापक्रम", "मौसम", "हिमपात", "आँधी"],
  tech: ["app", "software", "ai", "internet", "digital", "startup", "data", "cyber", "एप", "सफ्टवेयर", "इन्टरनेट", "डिजिटल", "स्टार्टअप", "डाटा", "साइबर", "प्रविधि"],
  health: ["hospital", "doctor", "disease", "vaccine", "patient", "health", "dengue", "covid", "अस्पताल", "डाक्टर", "रोग", "खोप", "बिरामी", "स्वास्थ्य", "डेंगु", "कोभिड"],
  education: ["school", "university", "exam", "student", "teacher", "विद्यालय", "विश्वविद्यालय", "परीक्षा", "विद्यार्थी", "शिक्षक", "शिक्षा"],
  entertainment: ["film", "movie", "song", "actor", "singer", "concert", "फिल्म", "चलचित्र", "गीत", "अभिनेता", "गायक", "कन्सर्ट"],
  world: ["india", "china", "us", "united states", "un", "international", "border", "भारत", "चीन", "अमेरिका", "अन्तर्राष्ट्रिय", "सीमा"],
  local: ["ward", "municipality", "district", "road", "highway", "water", "electricity", "वडा", "नगरपालिका", "जिल्ला", "सडक", "राजमार्ग", "पानी", "बिजुली"],
};

/** English stock-footage fallbacks per category (for @lacspace/stockmedia). */
export const CATEGORY_VISUALS: Record<string, string[]> = {
  politics: ["Nepal parliament building", "government office Kathmandu", "press conference podium"],
  economy: ["stock market display board", "Nepali rupee notes", "bank counter", "Kathmandu market street"],
  sports: ["cricket stadium crowd", "cricket batsman", "football match stadium"],
  weather: ["heavy rain street", "monsoon clouds mountains", "flooded river Nepal"],
  tech: ["smartphone app close up", "laptop coding", "data center servers"],
  health: ["hospital corridor", "doctor with patient", "vaccine vial"],
  education: ["school classroom students", "university campus", "exam hall"],
  entertainment: ["concert stage lights", "film camera set", "cinema audience"],
  world: ["world map globe", "international airport", "city skyline aerial"],
  local: ["Kathmandu street traffic", "Nepal village road", "municipality office"],
  general: ["Kathmandu city aerial", "Nepal flag", "newspaper reading"],
};

const T = {
  en: { what: "What happened", why: "Why it matters", numbers: "Key numbers", who: "Who's involved", background: "Background", next: "What's next", cta: "Follow for more", ctaBody: "Follow {brand} for clear explainers on the stories that matter.", faq: { what: "What happened?", why: "Why does it matter?", numbers: "What are the key numbers?", who: "Who is involved?", next: "What happens next?" }, explainer: "Explainer" },
  ne: { what: "के भयो", why: "किन महत्त्वपूर्ण छ", numbers: "मुख्य तथ्याङ्क", who: "को संलग्न छन्", background: "पृष्ठभूमि", next: "अब के हुन्छ", cta: "थप जानकारीका लागि फलो गर्नुहोस्", ctaBody: "महत्त्वपूर्ण समाचारका सजिला व्याख्याका लागि {brand} फलो गर्नुहोस्।", faq: { what: "के भयो?", why: "यो किन महत्त्वपूर्ण छ?", numbers: "मुख्य तथ्याङ्क के हुन्?", who: "को संलग्न छन्?", next: "अब के हुन्छ?" }, explainer: "व्याख्या" },
};

const WHY = { en: /\b(because|due to|as a result|so that|which means|impact|affect|matters|significan|crucial|important|threat|risk|benefit|cost|lead to|causing|result|concern)/i, ne: /(कारण|ले गर्दा|असर|प्रभाव|महत्त्व|जोखिम|खतरा|फाइदा|नोक्सान|परिणाम|चिन्ता|समस्या)/ };
const NEXT = { en: /\b(will|next|plan|expected|upcoming|scheduled|set to|deadline|until|from (monday|tuesday|wednesday|thursday|friday|saturday|sunday)|by 20\d\d)\b/i, ne: /(हुनेछ|गरिनेछ|आगामी|योजना|अपेक्षा|तयारी|सुरु हुने|सम्म|भोलि|अर्को|लागू हुने)/ };
const BACK = { en: /\b(earlier|last (year|month|week)|previously|in 20\d\d|since|had been|was first)\b/i, ne: /(अघि|गत|पहिले|विगत|अघिल्लो|यसअघि|देखि)/ };

const DEV = /[ऀ-ॿ]/;
function detect(text: string): Lang { return (text.match(/[ऀ-ॿ]/g)?.length ?? 0) > (text.match(/[A-Za-z]/g)?.length ?? 0) ? "ne" : "en"; }
function words(s: string): number { return s.trim().split(/\s+/).filter(Boolean).length; }
function trimWords(s: string, max: number): string {
  const w = s.trim().split(/\s+/);
  if (w.length <= max) return s.trim();
  // cut at the last clause boundary before max, else hard cut.
  const cut = w.slice(0, max).join(" ");
  const m = cut.match(/^(.*[,;।.])\s/u);
  return (m ? m[1]! : cut).replace(/[,;]$/, "") + (DEV.test(s) ? "।" : ".");
}
function strip(s: string): string { return s.replace(/[।.!?]+$/u, "").trim(); }

/** Show an amount with the currency token that precedes it in the sentence ("रु. ५० अर्ब", "Rs 1.2 billion"). */
function displayNumber(raw: string, sentence: string | undefined): string {
  if (!sentence) return raw;
  const i = sentence.indexOf(raw);
  if (i <= 0) return raw;
  const before = sentence.slice(Math.max(0, i - 8), i);
  const m = before.match(/(रु\.?|रू\.?|ने\.?रु\.?|Rs\.?|NPR|USD|\$|₹)\s*$/);
  return m ? `${m[1]} ${raw}`.replace(/\s+/g, " ") : raw;
}

const NE_SUFFIX = /^(को|का|की|ले|मा|बाट|लाई|सम्म|भन्दा|देखि|सँग|पनि)\s*/;
/** Label for a stat slide: the sentence minus the figure, with a leading Nepali case suffix dropped. */
function statLabel(sentence: string, figure: string, fallback: string): string {
  const rest = sentence.replace(figure, "").replace(figure.replace(/^[^0-9०-९]+/, ""), "").trim().replace(NE_SUFFIX, "");
  const label = strip(trimWords(rest, 10));
  return label.length > 3 ? label : fallback;
}

const ROLE_RE = /^(गभर्नर|मन्त्री|प्रधानमन्त्री|राष्ट्रपति|उपराष्ट्रपति|मुख्यमन्त्री|सांसद|अध्यक्ष|उपाध्यक्ष|सचिव|प्रमुख|निर्देशक|महानिर्देशक|कप्तान|प्रशिक्षक|डा\.?|डाक्टर|प्रा\.?|श्री|सुश्री|श्रीमती|इन्जिनियर|अधिवक्ता|प्रवक्ता|महासचिव|सभापति|मेयर|उपमेयर|खेलाडी|गायक|गायिका|अभिनेता|अभिनेत्री|कलाकार)$/;
const CASE_RE = /(ले|को|का|की|लाई|सँग|बाट|मा)$/;
const VERB_RE = /(ए|यो|छ|छन्|थियो|थिए|गरे|भए|बताए|दिए|गर्छ|हुन्छ|भयो|गरेको|भएको)$/;
/** Nepali person names: 1–3 name-like tokens after a role/honorific, or known first+last pairs from the gazetteer. */
export function nepaliNames(text: string): string[] {
  const toks = text.replace(/[।,.!?()"“”]/g, " ").split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  const bare = (w: string) => w.replace(CASE_RE, "");
  const isName = (w: string, afterRole: boolean) => {
    const b = bare(w);
    if (b.length < 2 || VERB_RE.test(w) || /[0-9०-९]/.test(b)) return false;
    if (NE_NAMES.has(b)) return true; // gazetteer first: common words like अधिकारी are also surnames
    if (isCommonWord(b, { lang: "ne" })) return false;
    return afterRole || looksLikeName(b, { bundled: true }).score >= 0.6;
  };
  for (let i = 0; i < toks.length; i++) {
    let start = -1;
    const afterRole = ROLE_RE.test(toks[i]!);
    if (afterRole) start = i + 1;
    else if (NE_NAMES.has(bare(toks[i]!)) && i + 1 < toks.length && isName(toks[i + 1]!, false)) start = i;
    if (start === -1) continue;
    const parts: string[] = [];
    for (let j = start; j < Math.min(toks.length, start + 3) && isName(toks[j]!, afterRole && j === start); j++) parts.push(bare(toks[j]!));
    if (parts.length >= (ROLE_RE.test(toks[i]!) ? 1 : 2)) out.add(parts.join(" "));
  }
  return [...out];
}

export function pickCategory(text: string, categories = DEFAULT_CATEGORIES): string {
  const kp = keyphrase(text, { categories, topK: 12 });
  const top = kp.categories?.[0];
  return top && top.score > 0 ? top.category : "general";
}

/** Deterministic explainer structure from an article: slides, carousel, video script, FAQ. */
export function explain(text: string, o: ExplainOptions = {}): Explainer {
  const lang: Lang = !o.lang || o.lang === "auto" ? detect(text) : o.lang;
  const t = T[lang];
  const warnings: string[] = [];
  const sents = splitSentences(text);
  if (!sents.length) throw new Error("explainer: empty text");
  const { ranked } = summarize(text, { maxSentences: Math.max(3, Math.ceil(sents.length * 0.4)) });
  const byScore = [...ranked].sort((a, b) => b.score - a.score);
  const facts = keyFacts(text);
  const kp = keyphrase(text, { topK: 10 });
  const category = pickCategory(text, o.categories);
  const used = new Set<number>();
  const take = (pred: (s: string) => boolean, fallbackIdx?: number): string | undefined => {
    const hit = byScore.find((s) => !used.has(s.index) && pred(s.text));
    const pick = hit ?? (fallbackIdx !== undefined ? ranked[fallbackIdx] : undefined);
    if (!pick || used.has(pick.index)) return undefined;
    used.add(pick.index);
    return pick.text;
  };

  const lead = ranked[0]!.text;
  used.add(0);
  const shortTop = byScore.find((s) => s.text.length <= 110)?.text ?? lead;
  const headline = strip(o.title ?? (lead.length <= 120 ? lead : shortTop));
  // "What happened": the lead; when the title already IS the lead, use the next sentence in reading order.
  const neutral = ranked.slice(1).find((s) => !WHY[lang].test(s.text) && !NEXT[lang].test(s.text) && !BACK[lang].test(s.text));
  const what = strip(lead) === headline && ranked[1] ? (neutral ?? ranked[1]!).text : lead;
  if (what !== lead) used.add(ranked.find((s) => s.text === what)!.index);
  const why = take((s) => WHY[lang].test(s), undefined);
  const next = take((s) => NEXT[lang].test(s), undefined);
  const background = take((s) => BACK[lang].test(s), undefined);

  // Numbers: prefer amounts, then percentages, then plain numbers; show as written (never recomputed).
  const numClaims = [...(facts.amounts as any[]), ...(facts.percentages as any[]), ...(facts.numbers as any[])].filter((c) => c && c.raw && String(c.raw).replace(/[^0-9०-९]/g, "").length >= 2);
  const seenSent = new Set<string>();
  const numItems = numClaims.map((c: any) => { const s = sents.find((x) => x.includes(c.raw)); return { raw: displayNumber(c.raw, text), sentence: s }; }).filter((n) => { if (!n.sentence || seenSent.has(n.sentence)) return false; seenSent.add(n.sentence); return true; });
  const topNum = numItems[0];
  const numSentence = topNum?.sentence;
  const numberBullets = numItems.slice(0, 4).map((n) => strip(trimWords(n.sentence!, 18)));
  const who = [...new Set([...facts.entities.filter((e) => e.length > 1), ...(lang === "ne" ? nepaliNames(text) : [])])].slice(0, 5);

  const slides: Slide[] = [{ kind: "title", heading: t.explainer, body: headline }];
  slides.push({ kind: "what", heading: t.what, body: what });
  if (why) slides.push({ kind: "why", heading: t.why, body: why });
  if (topNum) slides.push({ kind: "numbers", heading: t.numbers, body: numSentence ?? "", bullets: numberBullets, stat: { value: topNum.raw, label: numSentence ? statLabel(numSentence, topNum.raw, t.numbers) : t.numbers } });
  if (who.length) slides.push({ kind: "who", heading: t.who, body: who.join(" · "), bullets: who });
  if (background) slides.push({ kind: "background", heading: t.background, body: background });
  if (next) slides.push({ kind: "next", heading: t.next, body: next });
  const brand = o.brand ?? "";
  slides.push({ kind: "cta", heading: t.cta, body: t.ctaBody.replace("{brand}", brand).replace(/\s{2,}/g, " ").trim() });
  const maxSlides = o.slides ?? 8;
  const priority: SlideKind[] = ["title", "what", "why", "numbers", "next", "cta", "who", "background"];
  const kept = slides.filter((s) => priority.indexOf(s.kind) < maxSlides || s.kind === "cta").slice(0, maxSlides);
  // keep original order
  const finalSlides = slides.filter((s) => kept.includes(s));
  if (!why) warnings.push("no 'why it matters' sentence found — consider an editor line");
  if (!next) warnings.push("no 'what's next' sentence found");

  const kicker = category === "general" ? t.explainer : category.charAt(0).toUpperCase() + category.slice(1);
  const carousel: Explainer["carousel"] = finalSlides.map((s) =>
    s.kind === "numbers" && s.stat ? { type: "stat", kicker: s.heading, stat: s.stat }
    : s.kind === "title" ? { type: "headline", kicker: kicker, headline: s.body }
    : s.kind === "who" ? { type: "headline", kicker: s.heading, headline: s.bullets?.join("\n") ?? s.body }
    : { type: "headline", kicker: s.heading, headline: s.body });

  // Script: one scene per content slide, voiceover trimmed to ~30 words, duration from word count.
  const wpm = lang === "ne" ? 125 : 160;
  const latinEntities = who.filter((e) => !DEV.test(e)).slice(0, 2).map((e) => `${e} Nepal`);
  const visuals = [...latinEntities, ...(CATEGORY_VISUALS[category] ?? CATEGORY_VISUALS.general!)];
  // Scene 1 always speaks the lead; then the content slides (skipping a "what" that merely repeats it).
  const leadScene: Slide = { kind: "title", heading: t.explainer, body: lead };
  const seenBody = new Set<string>();
  const sceneSlides = [leadScene, ...finalSlides.filter((s) => s.kind !== "cta" && s.kind !== "title")].filter((s) => { const k = s.kind === "who" ? "who" : s.body; if (seenBody.has(k)) return false; seenBody.add(k); return true; }).slice(0, o.scenes ?? 5);
  const scenes: Scene[] = sceneSlides.map((s, i) => {
    const vo = trimWords(s.kind === "who" ? `${s.heading}: ${s.body}` : s.body, 30);
    const dur = Math.min((o.sceneSeconds ?? 8) * 1.6, Math.max(4, Math.round((words(vo) / wpm) * 60 + 1.5)));
    return { n: i + 1, heading: s.heading, voiceover: vo, onScreen: s.kind === "numbers" && s.stat ? s.stat.value : strip(trimWords(s.body, 9)), durationSec: dur, visualQueries: [visuals[i % visuals.length]!, visuals[(i + 1) % visuals.length]!].filter((v, j, a) => a.indexOf(v) === j), overlay: s.kind === "numbers" ? "stat" : s.kind === "who" ? "lowerThird" : i === 0 ? "stinger" : "none" };
  });
  const totalSec = scenes.reduce((a, s) => a + s.durationSec, 0);

  const faq: Explainer["faq"] = [];
  faq.push({ q: t.faq.what, a: what });
  if (why) faq.push({ q: t.faq.why, a: why });
  if (topNum) faq.push({ q: t.faq.numbers, a: numberBullets.join(lang === "ne" ? "; " : "; ") });
  if (who.length) faq.push({ q: t.faq.who, a: who.join(", ") });
  if (next) faq.push({ q: t.faq.next, a: next });

  return {
    lang, category, headline, kicker, slides: finalSlides, carousel,
    script: { scenes, totalSec, words: scenes.reduce((a, s) => a + words(s.voiceover), 0) },
    faq, facts, hashtags: kp.hashtags.slice(0, 6), warnings,
  };
}

/** Prompt for an optional LLM polish of one voiceover line (facts locked). */
export function polishPrompt(line: string, lang: Lang): string {
  return lang === "ne"
    ? `यो वाक्यलाई भिडियो भ्वाइसओभरका लागि सरल, बोलचालको नेपालीमा २५ शब्दभित्र लेख्नुहोस्। कुनै पनि सङ्ख्या, नाम वा मिति नबदल्नुहोस्; नयाँ तथ्य नथप्नुहोस्। वाक्य मात्र फर्काउनुहोस्।\n\n${line}`
    : `Rewrite this line for a video voiceover in plain, conversational English, under 25 words. Do not change any number, name or date; add no new facts. Return only the sentence.\n\n${line}`;
}

/** Apply the optional polish to every scene, keeping the deterministic line unless the rewrite passes the digit check. */
export async function polish(ex: Explainer, llm: NonNullable<ExplainOptions["llm"]>): Promise<Explainer> {
  const digits = (s: string) => (s.match(/[0-9०-९][0-9०-९.,]*/g) ?? []).map((d) => d.replace(/[.,]+$/, ""));
  const scenes = await Promise.all(ex.script.scenes.map(async (sc) => {
    try {
      const out = (await llm(polishPrompt(sc.voiceover, ex.lang))).trim().split("\n")[0]!.trim();
      const ok = out.length > 8 && words(out) <= 32 && digits(out).every((d) => digits(sc.voiceover).includes(d));
      return ok ? { ...sc, voiceover: out } : sc;
    } catch { return sc; }
  }));
  return { ...ex, script: { ...ex.script, scenes, words: scenes.reduce((a, s) => a + words(s.voiceover), 0) } };
}

/** Machine-readable descriptor for an AI "conductor". */
export function describe() {
  return {
    name: "@lacspace/explainer",
    version: VERSION,
    summary: "Deterministic explainer structure from an article (en/ne): title / what happened / why it matters / key numbers (as written) / who / background / what's next / CTA slides, a newscard carousel, a 30–60 s video script with scenes (voiceover ≤30 words, on-screen line, duration, stock-footage queries, overlay hint), FAQ pairs, category and hashtags. Optional LLM polish of voiceover lines with a facts lock.",
    categories: Object.keys(DEFAULT_CATEGORIES),
    commands: [
      { name: "explain", input: { type: "object", properties: { text: { type: "string" }, title: { type: "string" }, lang: { enum: ["en", "ne", "auto"] }, slides: { type: "integer" }, scenes: { type: "integer" }, sceneSeconds: { type: "number" }, brand: { type: "string" } }, required: ["text"] }, output: "Explainer { lang, category, headline, kicker, slides, carousel, script{scenes,totalSec,words}, faq, facts, hashtags, warnings }" },
      { name: "polish", input: { type: "object", properties: { explainer: { type: "object" }, llm: { type: "string", description: "injected function" } }, required: ["explainer", "llm"] }, output: "Explainer" },
      { name: "pickCategory", input: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }, output: "string" },
    ],
  };
}
