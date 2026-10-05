// Bilingual (Nepali / English) sensitivity lexicons.
// strong = on its own the story is about this; weak = needs support (another hit, or the title).
// Nepali terms match at a word start and take any suffix (अदालत → अदालतमा, अदालतले).

export type Category = "election" | "court" | "death" | "communal" | "named_individual" | "minor" | "health_emergency";
export interface Term { cat: Category; w: "strong" | "weak"; ne?: string[]; en?: string[] }

export const TERMS: Term[] = [
  // ---- election ----
  { cat: "election", w: "strong",
    ne: ["निर्वाचन", "चुनाव", "मतदान", "मतदाता", "मतपत्र", "मतगणना", "मतपेटिका", "उम्मेदवार", "उमेदवार", "पुनर्मतदान", "निर्वाचित"],
    en: ["elections?", "electoral", "ballots?", "voters?", "voting", "polling", "candidacy", "candidates?", "re-?election", "by-?elections?", "election commission", "the polls", "heads? to (?:the )?polls", "constituenc(?:y|ies)", "campaign trail", "electorate"] },
  { cat: "election", w: "weak", ne: ["महाधिवेशन", "अधिवेशन प्रतिनिधि"], en: ["votes?", "elected", "convention delegates?"] },

  // ---- court & charges ----
  { cat: "court", w: "strong",
    ne: ["अदालत", "न्यायाधीश", "प्रधानन्यायाधीश", "न्यायालय", "फैसला", "धरौटी", "थुनामा", "पुर्पक्ष", "अभियोग", "अभियुक्त", "आरोपित", "बयान", "रिट", "परमादेश", "बन्दीप्रत्यक्षीकरण", "मुद्दा दर्ता", "मुद्दा चलाउ", "सजाय", "कैद", "जेल"],
    en: ["courts?", "judges?", "chief justice", "justices", "verdict", "bail", "custody", "remanded", "pre-trial", "trial", "lawsuit", "sued", "writ", "mandamus", "habeas corpus", "indicted", "convicted", "sentenced", "acquitted", "charge ?sheet", "prosecutors?", "prosecution", "plaintiff", "defendant"] },
  { cat: "court", w: "weak", ne: ["मुद्दा", "पक्राउ", "सुनुवाइ", "सुनुवाई", "हिरासत"], en: ["arrest(?:ed|s)?", "hearing", "charged", "accused", "detained", "case filed"] },

  // ---- deaths & casualties ----
  { cat: "death", w: "strong",
    ne: ["मृत्यु", "मृत्यू", "मृतक", "मारिए", "मारिएका", "मारिएकी", "मारियो", "हत्या", "शव", "लास", "लाश", "ज्यान गयो", "ज्यान गुमा", "निधन", "आत्महत्या", "आत्मदाह", "हताहत", "मरे", "मरेका"],
    en: ["died", "dies", "dead", "deaths?", "killed", "kills", "killing", "bodies", "body of", "death toll", "toll (?:hits|rises|reaches|climbs)", "fatalit(?:y|ies)", "casualt(?:y|ies)", "murder(?:ed|s)?", "suicide", "self-immolation", "perished", "deceased", "lost their lives", "lost his life", "lost her life", "slain", "massacre"] },
  { cat: "death", w: "weak", ne: ["बेपत्ता", "घाइते", "बगाएर", "बगाए", "उद्धार"], en: ["missing", "injured", "swept away", "deadly", "victims?", "search and rescue", "recovery operation"] },

  // ---- communal ----
  { cat: "communal", w: "strong",
    ne: ["साम्प्रदायिक", "धार्मिक तनाव", "जातीय तनाव", "जातीय भेदभाव", "छुवाछुत", "छुवाछूत", "धर्म परिवर्तन", "गोवध", "दंगा", "कर्फ्यु", "कर्फ्यू", "घृणा फैलाउ"],
    en: ["communal", "sectarian", "riots?", "rioting", "religious tension", "ethnic tension", "caste[- ]based discrimination", "untouchability", "hate speech", "blasphemy", "mob violence", "lynch(?:ed|ing)?", "curfew"] },
  { cat: "communal", w: "weak", ne: ["जातीय", "धार्मिक"], en: ["ethnic", "religious", "caste"] },

  // ---- allegations against people (named_individual needs a person too) ----
  { cat: "named_individual", w: "strong",
    ne: ["आरोप", "भ्रष्टाचार", "घुस", "ठगी", "अनियमितता", "बिचौलिया", "दादागिरी", "दुरुपयोग", "किर्ते", "अख्तियार", "यौन दुर्व्यवहार", "बलात्कार", "धम्की", "कमिसन", "सम्पत्ति शुद्धीकरण"],
    en: ["alleg(?:ed|edly|ations?)", "irregularit(?:y|ies)", "corruption", "corrupt", "bribes?", "bribery", "kickbacks?", "fraud", "scam", "rackets?", "embezzle(?:d|ment)", "misconduct", "harassment", "money laundering", "extortion", "defam(?:ed|ation|atory)", "rape", "sexual abuse"] },

  // ---- minors (only sensitive with a harm context, see index.ts) ----
  { cat: "minor", w: "strong",
    ne: ["बालबालिका", "बालक", "बालिका", "नाबालक", "नाबालिग", "किशोर", "किशोरी", "बच्चा", "बच्ची", "शिशु", "नानी", "छात्रा"],
    en: ["child", "children", "minors?", "juveniles?", "teenagers?", "teens?", "schoolgirls?", "schoolboys?", "infants?", "toddlers?", "underage", "under-age", "boys?", "girls?", "kids?"] },

  // ---- health emergencies ----
  { cat: "health_emergency", w: "strong",
    ne: ["महामारी", "हैजा", "झाडापखाला", "स्क्रब टाइफस", "खाद्य विषाक्तता", "संक्रमण फैलि", "संक्रमितको संख्या", "स्वास्थ्य आपतकाल"],
    en: ["outbreaks?", "epidemic", "pandemic", "cholera", "food poisoning", "health emergency", "infections? (?:spread|surge)", "contaminated water", "bird flu", "avian flu", "mpox", "ebola"] },
  { cat: "health_emergency", w: "weak", ne: ["प्रकोप", "डेंगु", "डेङ्गु", "भाइरस"], en: ["dengue", "virus", "infected", "contaminat(?:ed|ion)", "quarantine"] },
];

/** Phrases that look like a hit but aren't; removed before matching. */
export const EXCLUDE: RegExp[] = [
  /\bdeath overs?\b/gi, /\bdeadlines?\b/gi, /\bdead heat\b/gi, /\bdead ball\b/gi, /\bdead rubber\b/gi, /\bdeadlock(?:ed)?\b/gi,
  /\b(?:climate|transitional|social|gender|economic|environmental) justice\b/gi, /\blaw,? justice\b/gi, /\bjustice and parliamentary\b/gi,
  /\bhearing aids?\b/gi, /\bpublic hearing\b/gi, /\bwild ?life\b/gi,
  /\bchild(?:hood)? (?:development|care) centres?\b/gi,
  /राष्ट्रिय मुद्दा/g, /मुद्दा उठा/g, /मुद्दाहरू/g, /सरोकारका मुद्दा/g, /मुख्य मुद्दा/g,
  /वर्षका लागि/g, /वर्षको अवधि/g, /साना खपटेको प्रकोप/g, /रोगको प्रकोप/g, /कीराको प्रकोप/g,
  /मतदाता नामावली अद्यावधिक/g,
  /शव परीक्षण (?:सेवा|सुरु|कक्ष)/g, /\bpost-?mortem (?:service|facility|unit)s?\b/gi, // routine voter-roll update notices stay weak via "मतदाता" elsewhere
];

/** Harm context that makes a minor mention sensitive. */
export const HARM = {
  ne: ["दुर्व्यवहार", "बलात्कार", "बेपत्ता", "अपहरण", "बेचबिखन", "हत्या", "मृत्यु", "घाइते", "पक्राउ", "अदालत", "कुटपिट", "यौन", "आत्महत्या", "ओसारपसार", "श्रम शोषण", "पीडित"],
  en: ["abuse(?:d)?", "rape(?:d)?", "missing", "abduct(?:ed|ion)", "kidnap(?:ped|ping)?", "traffick(?:ed|ing|ers?)", "murder(?:ed)?", "killed", "died", "injured", "arrest(?:ed)?", "court", "assault(?:ed)?", "sexual", "suicide", "exploit(?:ed|ation)", "victims?", "detention", "deport(?:ed|ation)"],
};

/** Words that mark a person in Nepali text (titles/roles). */
export const PERSON_ROLES_NE = ["मन्त्री", "सांसद", "नेता", "अध्यक्ष", "सभापति", "प्रधानमन्त्री", "न्यायाधीश", "प्रधानन्यायाधीश", "व्यवसायी", "प्रमुख", "महानिरीक्षक", "मेयर", "उपमेयर", "सचिव", "राजदूत", "प्रवक्ता", "श्री", "श्रीमती"];
/** Capitalised words that make a Title Case span an institution or place, not a person. */
export const NOT_PERSON_EN = new Set(
  "Court Supreme High Special District Party Committee Office Bank Ministry Province Nepal Nepali Government Parliament House Assembly Commission Council Police Army Corporation Company Limited Ltd University College Hospital Board Authority Department Municipality Metropolitan City Valley River Highway Airport Airlines Club Association Federation Union Congress League National International Federal Provincial Rastriya Swatantra Kathmandu Lalitpur Bhaktapur Pokhara India China United States Nations General Secretariat Medical Prime Minister President Chief Justice Election Inspector".split(" "),
);
