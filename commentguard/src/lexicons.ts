// Small STARTER lexicons per category. They are intentionally compact — callers extend
// them via options.lexicons for their own community. Each entry is matched after
// normalization (lowercased, elongations collapsed), against Latin, romanized-Nepali and
// Devanagari text. This is moderation tooling: the goal is to triage, not to be a
// perfect classifier — borderline items are surfaced for human/AI review, not auto-hidden.

export type Category = "spam" | "abuse" | "hate" | "doxxing" | "linkspam";

export const LEXICONS: Record<Category, string[]> = {
  // Promotional / scam spam (en + romanized ne + Devanagari).
  spam: [
    "buy now", "discount", "best price", "loan", "investment", "forex", "crypto",
    "casino", "lottery", "winner", "free money", "earn from home", "work from home",
    "double your money", "guaranteed return", "dm for price", "price kati", "sasto",
    "छुट", "सस्तो", "कमाउनुहोस्", "लगानी", "नि:शुल्क",
  ],
  // Harassment / insults (compact; extend per community).
  abuse: [
    "idiot", "stupid", "shut up", "trash", "loser", "fool", "nonsense",
    "murkha", "bekar", "chor", "मूर्ख", "बेकार", "चोर", "गधा",
  ],
  // Group-targeted hate (compact starter; callers MUST extend responsibly).
  hate: [
    "go back to your country", "subhuman", "vermin",
    "देश छोड", "जात",
  ],
  // Doxxing cue words (combined with the PII regexes below).
  doxxing: ["address is", "lives at", "his number", "her number", "ghar", "ठेगाना", "घर नम्बर"],
  // Link-spam phrasing (combined with URL/shortener detection).
  linkspam: [
    "join whatsapp", "join telegram", "click the link", "link in", "subscribe my",
    "visit my channel", "follow back", "whatsapp group", "telegram group",
    "व्हाट्सएप", "टेलिग्राम", "लिंक",
  ],
};

// PII / link patterns used by the doxxing and linkspam detectors.
export const PATTERNS = {
  phoneNp: /\b9[78]\d{8}\b/g, // Nepali mobile
  email: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g,
  url: /\bhttps?:\/\/\S+|\bwww\.\S+|\b[\w-]+\.(?:com|net|org|np|io|co|me|ly|xyz)\b/gi,
  shortener: /\b(?:bit\.ly|tinyurl\.com|t\.me|cutt\.ly|rb\.gy|is\.gd|shorturl)\b/gi,
};
