import { CopyType } from "./platforms.js";

export type Style =
  | "plain" | "question" | "number" | "whatItMeans" | "contrast"
  | "curiosity" | "breaking" | "howto" | "quote" | "list";

export type Lang = "en" | "ne";

export interface Template {
  style: Style;
  lang: Lang;
  text: string;
}

// Slots are filled ONLY from supplied facts; a template whose slots aren't all present
// is skipped (never fabricated). Boilerplate (no slots) is always usable. These are
// deliberately factual — no sensational superlatives.
export const TEMPLATES: Record<CopyType, Template[]> = {
  hook: [
    { style: "breaking", lang: "en", text: "BREAKING: {headline}" },
    { style: "breaking", lang: "en", text: "Just in — {topic}" },
    { style: "question", lang: "en", text: "{place}: what changes now?" },
    { style: "question", lang: "en", text: "What does {topic} mean for you?" },
    { style: "number", lang: "en", text: "{number} — here's the story" },
    { style: "number", lang: "en", text: "{percent}: what the figure shows" },
    { style: "whatItMeans", lang: "en", text: "{topic}, explained in 30 seconds" },
    { style: "whatItMeans", lang: "en", text: "Here's what {topic} actually means" },
    { style: "curiosity", lang: "en", text: "What {place} needs to know today" },
    { style: "contrast", lang: "en", text: "{topic}: before and after" },

    { style: "breaking", lang: "ne", text: "ताजा खबर: {headline}" },
    { style: "breaking", lang: "ne", text: "भर्खरै — {topic}" },
    { style: "question", lang: "ne", text: "{place}: अब के बदलिन्छ?" },
    { style: "question", lang: "ne", text: "{topic} को अर्थ तपाईंका लागि के?" },
    { style: "number", lang: "ne", text: "{number} — पूरा कुरा यहाँ" },
    { style: "number", lang: "ne", text: "{percent}: तथ्यांकले के देखाउँछ" },
    { style: "whatItMeans", lang: "ne", text: "{topic}, ३० सेकेन्डमा बुझौं" },
    { style: "curiosity", lang: "ne", text: "आज {place} ले थाहा पाउनुपर्ने कुरा" },
  ],
  title: [
    { style: "plain", lang: "en", text: "{headline}" },
    { style: "number", lang: "en", text: "{headline} ({number})" },
    { style: "howto", lang: "en", text: "How {topic} affects {place}" },
    { style: "question", lang: "en", text: "{topic}: what you need to know" },
    { style: "plain", lang: "ne", text: "{headline}" },
    { style: "number", lang: "ne", text: "{headline} ({number})" },
    { style: "howto", lang: "ne", text: "{topic} ले {place} लाई कसरी असर गर्छ" },
    { style: "question", lang: "ne", text: "{topic}: जान्नैपर्ने कुरा" },
  ],
  caption: [
    { style: "plain", lang: "en", text: "{headline}" },
    { style: "whatItMeans", lang: "en", text: "{headline}\n\nHere's what it means for {place}." },
    { style: "number", lang: "en", text: "{headline}\n\nKey figure: {number}." },
    { style: "quote", lang: "en", text: "“{quote}” — {who}\n\n{headline}" },
    { style: "contrast", lang: "en", text: "{headline}\n\nWhat changed in {place}: the key numbers below." },
    { style: "plain", lang: "ne", text: "{headline}" },
    { style: "whatItMeans", lang: "ne", text: "{headline}\n\n{place} का लागि यसको अर्थ के हो, यहाँ।" },
    { style: "number", lang: "ne", text: "{headline}\n\nमुख्य तथ्यांक: {number}।" },
    { style: "quote", lang: "ne", text: "“{quote}” — {who}\n\n{headline}" },
  ],
  cta: [
    { style: "plain", lang: "en", text: "Full story — link in bio." },
    { style: "plain", lang: "en", text: "Follow for daily updates from {place}." },
    { style: "plain", lang: "en", text: "Follow for daily news updates." },
    { style: "question", lang: "en", text: "What do you think? Tell us in the comments." },
    { style: "plain", lang: "en", text: "Share this with someone who should see it." },
    { style: "plain", lang: "ne", text: "पूरा समाचार — बायोको लिंकमा।" },
    { style: "plain", lang: "ne", text: "दैनिक अपडेटका लागि फलो गर्नुहोस्।" },
    { style: "question", lang: "ne", text: "तपाईंलाई के लाग्छ? कमेन्टमा लेख्नुहोस्।" },
    { style: "plain", lang: "ne", text: "यो समाचार आफ्नो साथीसँग सेयर गर्नुहोस्।" },
  ],
  description: [
    { style: "plain", lang: "en", text: "{headline}\n\n{topic} — the full report." },
    { style: "number", lang: "en", text: "{headline}\n\nThe figure that matters: {number}." },
    { style: "plain", lang: "ne", text: "{headline}\n\n{topic} — पूरा विवरण।" },
    { style: "number", lang: "ne", text: "{headline}\n\nमहत्त्वपूर्ण तथ्यांक: {number}।" },
  ],
};

// Sensational words a factual newsroom should never auto-insert (defensive check).
export const SENSATIONAL = [
  "shocking", "unbelievable", "you won't believe", "insane", "destroyed", "slammed",
  "epic", "miracle", "secret", "exposed", "gone wrong", "will blow your mind",
];
