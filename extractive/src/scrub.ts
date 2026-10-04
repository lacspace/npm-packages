/**
 * Remove third-party news/media names and credit lines from text before it is published.
 * House rule for newsrooms that rewrite reporting in their own words: facts stay, outlet
 * names and "Source:/Photo:" credits go. Anything it can't safely rewrite is reported in
 * `remaining` so a validator can hold the post.
 */

/** Outlets / agencies / stock libraries (en + ne). Extend with `outlets`. Common words are deliberately excluded. */
export const OUTLETS: string[] = [
  // Nepal (Latin)
  "Kantipur", "eKantipur", "Ekantipur", "Kantipur TV", "Kathmandu Post", "The Kathmandu Post", "Setopati", "Onlinekhabar", "OnlineKhabar", "Online Khabar",
  "Ratopati", "Nagarik News", "Nagarik Daily", "Republica", "My Republica", "myRepublica", "Himalayan Times", "The Himalayan Times", "Annapurna Post",
  "Annapurna Express", "Gorkhapatra", "Rising Nepal", "The Rising Nepal", "Nepal Live", "Baahrakhari", "Ujyaalo", "Lokaantar", "Deshsanchar", "Khabarhub",
  "Nepal Press", "Pahilo Post", "Swasthya Khabar", "ICT Samachar", "Techpana", "Sharesansar", "ShareSansar", "Merolagani", "MeroLagani", "Arthasarokar",
  "Bizmandu", "Clickmandu", "Image Channel", "Avenues TV", "News24 Nepal", "AP1 TV", "Radio Nepal", "Nepal Television", "Rastriya Samachar Samiti",
  "Himal Khabar", "Himal Khabarpatrika", "Nepali Times", "Kathmandu Tribune", "Nepal Samacharpatra", "Naya Patrika", "Shilapatra", "Nepalkhabar", "Ukeraa",
  // Nepal (Devanagari)
  "कान्तिपुर", "कान्तिपुर टेलिभिजन", "अनलाइनखबर", "सेतोपाटी", "रातोपाटी", "नागरिक दैनिक", "नागरिक न्यूज", "नागरिक न्युज", "अन्नपूर्ण पोस्ट", "गोरखापत्र",
  "हिमाल खबर", "हिमालखबर", "बाह्रखरी", "उज्यालो", "लोकान्तर", "देशसञ्चार", "खबरहब", "नेपाल प्रेस", "पहिलो पोस्ट", "स्वास्थ्य खबर", "आईसीटी समाचार",
  "टेकपाना", "सेयरसन्सार", "मेरोलगानी", "अर्थसरोकार", "बिजमाण्डु", "क्लिकमाण्डु", "इमेज च्यानल", "एभिन्युज", "राष्ट्रिय समाचार समिति", "रासस",
  "नेपाल टेलिभिजन", "रेडियो नेपाल", "नयाँ पत्रिका", "शिलापत्र", "नेपाल समाचारपत्र", "नेपालखबर", "उकेरा", "न्युज २४",
  // International
  "Reuters", "Associated Press", "AFP", "Agence France-Presse", "BBC", "BBC Nepali", "CNN", "Al Jazeera", "The Guardian", "New York Times", "The New York Times",
  "NYT", "Washington Post", "The Washington Post", "Bloomberg", "Times of India", "Hindustan Times", "NDTV", "The Hindu", "Indian Express", "ANI", "PTI",
  "Xinhua", "Global Times", "CGTN", "Dawn", "The Daily Star", "Kyodo", "Yonhap", "Sky News", "Fox News", "CNBC", "Economic Times", "India Today", "Aaj Tak",
  "बीबीसी", "बीबीसी नेपाली", "रोयटर्स", "एएफपी", "एपी", "सिन्ह्वा",
  // Stock / image libraries
  "Getty Images", "Getty", "Shutterstock", "Pexels", "Pixabay", "Unsplash", "Wikimedia Commons", "Wikimedia", "iStock", "Alamy", "EPA", "AP Photo",
];

/**
 * Outlet names that are also ordinary words ("उज्यालो" = light, "शिलापत्र" = plaque, "Dawn").
 * They are removed only inside credit lines / attribution phrases / datelines, never on a bare
 * mention, so ordinary prose is left alone.
 */
export const AMBIGUOUS_OUTLETS: string[] = ["उज्यालो", "शिलापत्र", "नयाँ पत्रिका", "उकेरा", "Dawn", "Ukeraa"];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NE_END = "(?=[\\s,।.;:!?)\"'”’]|$)";
/** Nepali case endings / postpositions that attach to a noun ("कान्तिपुरको", "सेतोपाटीमा"). */
export const NE_CASE = ["द्वारा", "मार्फत", "बाट", "लाई", "सँगै", "सँग", "समेत", "को", "का", "की", "ले", "मा", "कै", "मै"];
/** Romanised equivalents, written joined or apart ("Kantipur ko", "Setopatima"). */
export const ROMAN_CASE = ["dwara", "marfat", "bata", "lai", "sanga", "sangai", "ko", "ka", "ki", "le", "ma"];
const CASE = `(?:${NE_CASE.join("|")})`;
const RCASE = `(?:${ROMAN_CASE.join("|")})`;
const isLatin = (n: string) => /[A-Za-z]/.test(n);
/** A bare-mention matcher for one outlet name, including inflected forms. */
function mentionRe(n: string, flags = "u"): RegExp {
  return isLatin(n)
    ? new RegExp(`\\b${esc(n)}(?:\\s?${RCASE})?\\b`, flags)
    : new RegExp(`${esc(n)}${CASE}?${NE_END}`, flags);
}

export interface ScrubOptions {
  /** Extra outlet names to treat as third parties. */
  outlets?: string[];
  /** Names that must never be removed (e.g. your own brand). */
  keep?: string[];
  /**
   * Replace any outlet mention that survives the attribution rules with a neutral noun,
   * keeping the case ending ("सेतोपाटीका पत्रकार" → "सञ्चारमाध्यमका पत्रकार"). `true` uses
   * the defaults; pass strings to choose your own. Off by default (survivors go to `remaining`).
   */
  neutralize?: boolean | { ne?: string; en?: string };
}

export interface ScrubResult {
  text: string;
  /** What was removed (credit lines and attribution phrases). */
  removed: string[];
  /** Outlet names still present (couldn't be removed safely) — hold or rewrite. */
  remaining: string[];
  /** True when no outlet names remain. */
  clean: boolean;
}

/** Strip credit lines, "according to <outlet>" phrases and outlet attributions in English and Nepali. */
export function scrubSources(input: string, o: ScrubOptions = {}): ScrubResult {
  const keep = new Set((o.keep ?? []).map((k) => k.toLowerCase()));
  const names = [...new Set([...OUTLETS, ...(o.outlets ?? [])])].filter((n) => !keep.has(n.toLowerCase())).sort((a, b) => b.length - a.length);
  const N = `(?:${names.map(esc).join("|")})`;
  const ambiguous = new Set(AMBIGUOUS_OUTLETS);
  const removed: string[] = [];
  let text = input;
  const cut = (re: RegExp, repl: string | ((m: string, ...g: any[]) => string) = "") => {
    text = text.replace(re, (m, ...rest) => {
      removed.push(m.trim());
      if (typeof repl === "function") return repl(m, ...rest);
      return repl === "$1" ? String(rest[0] ?? "") : repl;
    });
  };

  // 1) Whole credit lines / bylines: "Source: X", "Photo: X", "तस्बिर: X", "स्रोत: X", "Courtesy X", "(Photo: X)".
  const LABEL = "(?:sources?|photos?|photo credit|image|images|picture|pic|credit|credits|courtesy|via|video|footage|file photo|स्रोत|तस्बिर|तस्विर|फोटो|फोटो सौजन्य|सौजन्य|भिडियो|साभार)";
  cut(new RegExp(`[(\\[]\\s*${LABEL}\\s*[:：\\-–]?\\s*[^)\\]\\n]{1,80}[)\\]]`, "giu"));
  cut(new RegExp(`(^|\\n)[ \\t]*${LABEL}\\s*[:：\\-–]\\s*[^\\n]{1,120}(?=\\n|$)`, "giu"), "$1");
  // Trailing "— Reuters" / "/ AFP" signatures and leading "KATHMANDU (Reuters) -" datelines.
  cut(new RegExp(`\\s*[—–\\-/|]\\s*${N}\\s*$`, "gmu"));
  cut(new RegExp(`\\(\\s*${N}\\s*\\)\\s*[—–\\-:]?\\s*`, "gu"));

  // 2) English attribution phrases.
  cut(new RegExp(`,?\\s*(?:according to|as reported by|reported by|citing|cited by|quoted by|in an interview with|told|speaking to|writes|wrote)\\s+(?:the\\s+)?${N}(?:'s\\s+\\w+)?\\s*,?`, "giu"), " ");
  cut(new RegExp(`(?:^|(?<=[.!?]\\s))(?:the\\s+)?${N}\\s+(?:reported|reports|said|says|wrote|writes|has learned|learnt|learned)\\s+(?:that\\s+)?`, "gmu"));
  cut(new RegExp(`,?\\s*(?:the\\s+)?${N}\\s+(?:reported|reports|said)\\s*(?=[.!?])`, "giu"));

  // 3) Nepali attribution phrases (any case ending on the outlet name).
  const NOUN = "(?:रिपोर्ट|समाचार|खबर|सामग्री|लेख|भिडियो|प्रतिवेदन|विवरण|अन्तर्वार्ता)";
  const SAID = "(?:जनाए|लेखे|उल्लेख\\s*गरे|बताए|खबर\\s*दिए|समाचार\\s*दिए|रिपोर्ट\\s*गरे|प्रकाशित\\s*गरे|प्रसारित\\s*गरे|सार्वजनिक\\s*गरे)";
  // "कान्तिपुरको रिपोर्ट अनुसार", "कान्तिपुरका अनुसार", "कान्तिपुरले प्रकाशित गरेको समाचार अनुसार", "अनलाइनखबरले जनाएअनुसार"
  cut(new RegExp(`${N}(?:का|को|की)?\\s*(?:${NOUN}\\s*)?अनुसार\\s*,?\\s*`, "gu"));
  cut(new RegExp(`${N}ले\\s*${SAID}(?:को)?\\s*(?:${NOUN}\\s*)?अनुसार\\s*,?\\s*`, "gu"));
  // "सेतोपाटीमा प्रकाशित समाचार अनुसार", "रातोपाटीद्वारा प्रसारित", "कान्तिपुरबाट प्रकाशित"
  cut(new RegExp(`${N}\\s*(?:मा|बाट|द्वारा|मार्फत)\\s*(?:प्रकाशित|प्रसारित|सार्वजनिक)\\s*(?:भएको|गरिएको)?\\s*(?:${NOUN})?\\s*(?:अनुसार)?\\s*,?\\s*`, "gu"));
  // "... बढेको अनलाइनखबरले जनाएको छ।" → "... बढेको छ।"
  cut(new RegExp(`,?\\s*(?:भनी|भन्दै)?\\s*${N}(?:ले)\\s*(?:जनाएको|लेखेको|उल्लेख गरेको|खबर दिएको|समाचार दिएको|बताएको|रिपोर्ट गरेको)\\s*(छ|छन्|हो)?(?=[।.!?]|$)`, "gu"), (_m: string, aux?: string) => " " + (aux ?? "छ"));
  // "कान्तिपुरसँगको कुराकानीमा", "सेतोपाटीसँग कुरा गर्दै"
  cut(new RegExp(`${N}सँग(?:को)?\\s*(?:कुराकानीमा|कुराकानी\\s*गर्दै|कुरा\\s*गर्दै|अन्तर्वार्तामा)\\s*`, "gu"));
  // "उनले कान्तिपुरलाई बताए" → "उनले बताए"
  cut(new RegExp(`${N}(?:लाई|सँग)\\s*(?=(?:बताए|बताइन्|बताउनुभयो|बताएका|बताएकी|भने|भनिन्|भन्नुभयो|जानकारी\\s*दि|प्रतिक्रिया\\s*दि))`, "gu"));
  // "सेतोपाटीका संवाददाता" → "संवाददाता"
  cut(new RegExp(`${N}(?:का|को|की)\\s*(?=(?:संवाददाता|प्रतिनिधि|पत्रकार|सम्पादक|फोटोपत्रकार))`, "gu"));

  // 4) Romanised Nepali: "Kantipur ko report anusar", "Setopati ma prakashit samachar anusar".
  const RN = "(?:report|samachar|khabar|lekh|video)";
  cut(new RegExp(`${N}\\s?(?:ko|ka|ki)?\\s*(?:${RN}\\s*)?anusar\\s*,?\\s*`, "giu"));
  cut(new RegExp(`${N}\\s?(?:ma|bata|dwara)\\s*(?:prakashit|prasarit)\\s*(?:${RN})?\\s*(?:anusar)?\\s*,?\\s*`, "giu"));
  cut(new RegExp(`${N}\\s?le\\s*(?:janayeko|janaeko|lekheko|bataeko|bata[iy]eko)\\s*(?:chha|cha|ho)?(?=[.!?।]|$)`, "giu"));

  // 5) Optional: neutralise whatever is left (unambiguous names only), keeping the case ending.
  if (o.neutralize) {
    const neNoun = (typeof o.neutralize === "object" && o.neutralize.ne) || "सञ्चारमाध्यम";
    const enNoun = (typeof o.neutralize === "object" && o.neutralize.en) || "local media";
    const bare = names.filter((n) => !ambiguous.has(n));
    const NE = bare.filter((n) => !isLatin(n)).map(esc).join("|");
    const EN = bare.filter(isLatin).map(esc).join("|");
    if (NE) cut(new RegExp(`(?:${NE})(${CASE})?${NE_END}`, "gu"), (_m: string, c?: string) => neNoun + (c ?? ""));
    if (EN) cut(new RegExp(`\\b(?:the\\s+)?(?:${EN})('s)?\\b`, "gu"), (_m: string, c?: string) => enNoun + (c ?? ""));
  }

  // Tidy whitespace / punctuation left behind.
  text = text
    .replace(/[ \t]+([,।.;:!?])/g, "$1")
    .replace(/([,;:])\s*([।.!?])/g, "$2")
    .replace(/^[\s,;:]+/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Re-capitalise sentence starts we may have exposed.
  text = text.replace(/(^|[.!?]\s+)([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());

  const remaining = names.filter((n) => !ambiguous.has(n) && mentionRe(n).test(text));
  return { text, removed, remaining, clean: remaining.length === 0 };
}

/** Outlet names present in `text` (for a validator gate). */
export function mentionsOutlet(text: string, o: ScrubOptions = {}): string[] {
  const keep = new Set((o.keep ?? []).map((k) => k.toLowerCase()));
  return [...new Set([...OUTLETS, ...(o.outlets ?? [])])]
    .filter((n) => !keep.has(n.toLowerCase()))
    .filter((n) => !AMBIGUOUS_OUTLETS.includes(n) && mentionRe(n).test(text));
}
