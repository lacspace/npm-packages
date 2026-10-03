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

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NE_END = "(?=[\\s,।.;:!?)\"'”’]|$)";

export interface ScrubOptions {
  /** Extra outlet names to treat as third parties. */
  outlets?: string[];
  /** Names that must never be removed (e.g. your own brand). */
  keep?: string[];
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
  const removed: string[] = [];
  let text = input;
  const cut = (re: RegExp, repl = "") => {
    text = text.replace(re, (m, ...rest) => {
      removed.push(m.trim());
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

  // 3) Nepali attribution phrases.
  cut(new RegExp(`${N}(?:का|को|की)?\\s*अनुसार\\s*,?\\s*`, "gu"));
  cut(new RegExp(`${N}\\s*(?:मा|बाट)\\s*(?:प्रकाशित|प्रसारित)\\s*(?:समाचार|सामग्री|रिपोर्ट)?\\s*(?:अनुसार)?\\s*,?\\s*`, "gu"));
  cut(new RegExp(`,?\\s*(?:भनी|भन्दै)?\\s*${N}(?:ले)\\s*(?:जनाएको|लेखेको|उल्लेख गरेको|खबर दिएको|समाचार दिएको|बताएको|रिपोर्ट गरेको)\\s*(?:छ|छन्|हो)?(?=[।.!?]|$)`, "gu"));
  cut(new RegExp(`${N}सँगको\\s*कुराकानीमा\\s*`, "gu"));

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

  const remaining = names.filter((n) => new RegExp(/[A-Za-z]/.test(n) ? `\\b${esc(n)}\\b` : `${esc(n)}${NE_END}`, "u").test(text));
  return { text, removed, remaining, clean: remaining.length === 0 };
}

/** Outlet names present in `text` (for a validator gate). */
export function mentionsOutlet(text: string, o: ScrubOptions = {}): string[] {
  const keep = new Set((o.keep ?? []).map((k) => k.toLowerCase()));
  return [...new Set([...OUTLETS, ...(o.outlets ?? [])])]
    .filter((n) => !keep.has(n.toLowerCase()))
    .filter((n) => new RegExp(/[A-Za-z]/.test(n) ? `\\b${esc(n)}\\b` : `${esc(n)}${NE_END}`, "u").test(text));
}
