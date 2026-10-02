// Bundled, deterministic word lists for looksLikeName / isCommonWord.
// These are small, high-signal sets — NOT exhaustive dictionaries. They exist so a
// newsroom search box can cheaply decide "is this a person's name?" before spending
// a transliteration/match call on ordinary words ("india west indies", "breaking news").
// Callers can extend (extraCommonWords) or override the name side (knownNames).

// --- Common English words (function words + frequent non-name content words) -------
// Lowercased, apostrophes/diacritics stripped. Being here means "probably NOT a name".
export const EN_COMMON = new Set<string>([
  // articles / determiners / pronouns
  "a", "an", "the", "this", "that", "these", "those", "some", "any", "all", "each",
  "every", "no", "none", "both", "few", "many", "much", "most", "more", "less",
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
  "my", "your", "his", "its", "our", "their", "mine", "yours", "hers", "ours", "theirs",
  "who", "whom", "whose", "which", "what", "where", "when", "why", "how",
  // prepositions / conjunctions
  "of", "in", "on", "at", "by", "for", "with", "about", "against", "between", "into",
  "through", "during", "before", "after", "above", "below", "to", "from", "up", "down",
  "out", "off", "over", "under", "again", "then", "once", "here", "there", "and", "or",
  "but", "nor", "so", "yet", "if", "because", "as", "until", "while", "than", "though",
  // common verbs / auxiliaries
  "is", "are", "was", "were", "be", "been", "being", "am", "do", "does", "did", "done",
  "have", "has", "had", "having", "will", "would", "shall", "should", "can", "could",
  "may", "might", "must", "get", "got", "go", "goes", "went", "gone", "make", "made",
  "say", "said", "says", "see", "saw", "seen", "take", "took", "come", "came", "want",
  "use", "find", "give", "tell", "ask", "work", "call", "try", "need", "feel", "become",
  "leave", "put", "mean", "keep", "let", "begin", "seem", "help", "show", "hear", "play",
  "run", "move", "live", "believe", "bring", "happen", "write", "sit", "stand", "lose",
  "pay", "meet", "include", "set", "learn", "change", "lead", "watch", "follow", "stop",
  // frequent nouns / adjectives / news vocabulary
  "news", "breaking", "latest", "update", "report", "live", "video", "photo", "story",
  "today", "yesterday", "tomorrow", "year", "month", "week", "day", "time", "people",
  "world", "country", "city", "state", "government", "party", "election", "market",
  "price", "stock", "share", "match", "team", "game", "score", "cup", "series", "final",
  "west", "east", "north", "south", "indies", "new", "old", "big", "small", "good", "bad",
  "first", "last", "next", "best", "high", "low", "great", "long", "little", "own", "other",
  "right", "left", "top", "end", "part", "way", "thing", "man", "woman", "child", "life",
  "hand", "eye", "place", "case", "point", "fact", "number", "group", "problem", "money",
  "water", "food", "road", "company", "money", "percent", "crore", "lakh", "million",
  "billion", "dollar", "rupee", "rupees", "weather", "rain", "road", "accident", "police",
  "court", "case", "bank", "school", "college", "hospital", "road", "border", "water",
]);

// --- Common Nepali words (Devanagari + frequent romanizations) ---------------------
// Being here means "probably NOT a name" on the Nepali side.
export const NE_COMMON = new Set<string>([
  // Devanagari function / frequent words
  "र", "वा", "तर", "कि", "को", "का", "की", "मा", "ले", "लाई", "बाट", "सँग", "देखि",
  "सम्म", "पनि", "हो", "होइन", "छ", "छन", "थियो", "भयो", "गर्यो", "भएको", "गरेको",
  "यो", "त्यो", "यी", "ती", "म", "तिमी", "ऊ", "हामी", "उनी", "उनले", "हरु", "हरू",
  "समाचार", "ताजा", "आज", "हिजो", "भोलि", "वर्ष", "महिना", "हप्ता", "दिन", "समय",
  "सरकार", "देश", "सहर", "नगर", "पार्टी", "निर्वाचन", "बजार", "मूल्य", "खेल", "टोली",
  "प्रहरी", "अदालत", "बैंक", "विद्यालय", "अस्पताल", "सिमाना", "पानी", "सडक", "मौसम",
  "करोड", "लाख", "अर्ब", "खर्ब", "रुपैयाँ", "प्रतिशत", "नयाँ", "पुरानो", "ठूलो", "सानो",
  // frequent romanizations
  "ra", "wa", "tara", "ki", "ko", "ka", "ki", "ma", "le", "lai", "bata", "sanga",
  "dekhi", "samma", "pani", "ho", "hoina", "chha", "chhan", "thiyo", "bhayo", "garyo",
  "yo", "tyo", "ma", "timi", "hami", "uni", "haru", "samachar", "taja", "aaja", "hijo",
  "bholi", "barsha", "mahina", "hapta", "din", "samaya", "sarkar", "desh", "sahar",
  "nagar", "party", "nirwachan", "bajar", "mulya", "khel", "toli", "prahari", "adalat",
  "bank", "bidyalaya", "aspatal", "simana", "pani", "sadak", "mausam", "nayaa", "purano",
]);

// --- Common Nepali given names & surnames (seed gazetteer) --------------------------
// Latin + Devanagari. Being here is a POSITIVE name signal. Not exhaustive by design —
// callers pass their own `knownNames` for authoritative coverage.
export const NE_NAMES = new Set<string>([
  // given names
  "ram", "shyam", "hari", "krishna", "gopal", "govinda", "bishnu", "shiva", "mahesh",
  "ganesh", "ramesh", "suresh", "dinesh", "mukesh", "rajesh", "naresh", "umesh", "prakash",
  "subash", "subas", "bikash", "bikas", "deepak", "dipak", "manoj", "anil", "sunil",
  "sanjay", "sanjaya", "rajan", "rabin", "robin", "binod", "pramod", "arjun", "bimal",
  "kamal", "nabin", "navin", "sagar", "sujan", "bibek", "abhishek", "ashok", "ashish",
  "ashis", "santosh", "santos", "rabindra", "rajendra", "narendra", "surendra", "mahendra",
  "dependra", "birendra", "gyanendra", "upendra", "devendra", "jitendra", "ramchandra",
  "ramesh", "keshav", "madhav", "basanta", "basant", "prabin", "pravin", "nirajan",
  "niranjan", "roshan", "rohan", "aayush", "ayush", "aashish", "sabin", "sabina",
  // female given names
  "sita", "gita", "geeta", "rita", "reeta", "sunita", "anita", "kabita", "kavita",
  "sarita", "sabita", "savita", "laxmi", "lakshmi", "saraswati", "parvati", "durga",
  "kamala", "bimala", "nirmala", "sushila", "susila", "radha", "maya", "mina", "meena",
  "rekha", "sabitri", "savitri", "goma", "puja", "pooja", "suman", "sumana", "manisha",
  "aasha", "asha", "usha", "pramila", "sharmila", "arzu", "aarju", "muna", "samjhana",
  // surnames / family names
  "sharma", "poudel", "paudel", "paudyal", "pokharel", "pokhrel", "adhikari", "adhikary",
  "shrestha", "srestha", "shresth", "thapa", "gurung", "magar", "rai", "limbu", "tamang",
  "sherpa", "lama", "bhandari", "bhandary", "karki", "basnet", "basnyat", "khadka",
  "khatri", "chhetri", "kshetri", "bista", "bisht", "joshi", "pandey", "pande", "pant",
  "regmi", "rijal", "gautam", "ghimire", "dahal", "koirala", "nepal", "oli", "deuba",
  "bhattarai", "bhatta", "acharya", "upadhyay", "upadhyaya", "aryal", "dhakal", "sapkota",
  "subedi", "wagle", "lamsal", "parajuli", "timilsina", "neupane", "kafle", "dhungana",
  "maharjan", "shakya", "tuladhar", "pradhan", "manandhar", "bajracharya", "dangol",
  "shah", "sah", "yadav", "mahato", "mandal", "chaudhary", "chaudhari", "thakur", "jha",
  "mishra", "singh", "bahadur", "kumar", "kumari", "devi", "prasad", "lal", "raj",
  "kc", "gc", "bk", "bc",
  // Devanagari forms (common)
  "राम", "श्याम", "हरि", "कृष्ण", "गोपाल", "विष्णु", "शिव", "महेश", "गणेश", "रमेश",
  "सुरेश", "प्रकाश", "दीपक", "अनिल", "सुनिल", "अर्जुन", "कमल", "नवीन", "सागर",
  "राजेन्द्र", "नरेन्द्र", "सुरेन्द्र", "महेन्द्र", "वीरेन्द्र", "ज्ञानेन्द्र", "रामचन्द्र",
  "सीता", "गीता", "सुनिता", "अनिता", "कविता", "लक्ष्मी", "सरस्वती", "दुर्गा", "कमला",
  "सुशीला", "राधा", "माया", "आरजु", "आर्जु",
  "शर्मा", "पौडेल", "पोखरेल", "अधिकारी", "श्रेष्ठ", "थापा", "गुरुङ", "मगर", "राई",
  "तामाङ", "भण्डारी", "कार्की", "बस्नेत", "खड्का", "क्षेत्री", "जोशी", "पाण्डे", "पन्त",
  "रेग्मी", "घिमिरे", "दाहाल", "कोइराला", "नेपाल", "ओली", "देउवा", "भट्टराई", "आचार्य",
  "उपाध्याय", "न्यौपाने", "सुवेदी", "प्रधान", "शाह", "साह", "यादव", "चौधरी", "ठाकुर",
  "सिंह", "बहादुर", "कुमार", "कुमारी", "देवी", "प्रसाद",
]);
