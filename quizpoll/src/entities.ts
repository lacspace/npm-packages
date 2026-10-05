import { DISTRICTS, PROVINCES } from "@lacspace/nepali-utils";

/**
 * Typed entities for cloze questions, so the options are all the same kind (place↔place,
 * person↔person, org↔org). Conservative: anything we can't type is left out. @since 1.1.0
 */
export type EntityType = "person" | "place" | "org";
export interface TypedEntity {
  text: string;
  type: EntityType;
}

const NE_CITIES = ["काठमाडौं", "काठमाडौँ", "ललितपुर", "भक्तपुर", "पोखरा", "विराटनगर", "वीरगञ्ज", "धरान", "बुटवल", "भैरहवा", "नेपालगञ्ज", "धनगढी", "हेटौंडा", "जनकपुर", "इटहरी", "भरतपुर", "बिरेन्द्रनगर", "दमक", "तुलसीपुर", "घोराही"];
const EN_CITIES = ["Kathmandu", "Lalitpur", "Bhaktapur", "Pokhara", "Biratnagar", "Birgunj", "Dharan", "Butwal", "Bhairahawa", "Nepalgunj", "Dhangadhi", "Hetauda", "Janakpur", "Itahari", "Bharatpur", "Birendranagar", "Damak", "Tulsipur", "Ghorahi"];
const NE_COUNTRIES = ["भारत", "चीन", "अमेरिका", "जापान", "कतार", "मलेसिया", "साउदी अरब", "श्रीलंका", "बंगलादेश", "पाकिस्तान", "भुटान", "बेलायत", "अष्ट्रेलिया", "दक्षिण कोरिया", "युएई", "रुस", "क्यानडा", "जर्मनी", "फ्रान्स"];
const EN_COUNTRIES = ["India", "China", "United States", "America", "Japan", "Qatar", "Malaysia", "Saudi Arabia", "Sri Lanka", "Bangladesh", "Pakistan", "Bhutan", "United Kingdom", "Britain", "Australia", "South Korea", "Korea", "UAE", "Russia", "Canada", "Germany", "France", "Israel", "Kuwait"];
const EN_WORLD_CITIES = ["Washington", "New Delhi", "Delhi", "Beijing", "Tokyo", "Doha", "Dubai", "London", "Colombo", "Dhaka", "Islamabad", "Thimphu", "Moscow", "New York", "Kuala Lumpur"];

export const PLACES = {
  en: {
    domestic: [...DISTRICTS.map((d) => d.name), ...DISTRICTS.flatMap((d) => (d.aliases ?? []).filter((a) => /^[A-Za-z]/.test(a))), ...PROVINCES.map((p) => p.name), ...EN_CITIES],
    abroad: [...EN_COUNTRIES, ...EN_WORLD_CITIES],
  },
  ne: {
    domestic: [...DISTRICTS.map((d) => d.nameNp), ...PROVINCES.map((p) => p.nameNp), ...NE_CITIES],
    abroad: NE_COUNTRIES,
  },
};
// Distractor pools when the article names too few places: districts (and countries for a country answer).
export const PLACE_POOL = { en: { domestic: DISTRICTS.map((d) => d.name), abroad: EN_COUNTRIES }, ne: { domestic: DISTRICTS.map((d) => d.nameNp), abroad: NE_COUNTRIES } };
// "Nepal" is too easy as an answer and is mostly part of an org name.
const TRIVIAL = new Set(["Nepal", "नेपाल"]);

const EN_ORG = /\b(?:Fund|Bank|Association|Ministry|Council|Committee|Commission|Party|Company|Limited|Ltd|University|Authority|Office|Department|Court|Board|Federation|Organi[sz]ation|Union|Corporation|Institute|Agency|Police|Army|Assembly|Parliament|Government|Secretariat|Hospital|School|College|Club|Society|Foundation|Network|Chamber|Exchange|Airlines|Congress|Alliance|Front|Centre|Center|Trust|Bureau|Cabinet|Forum)\b/;
const EN_PLACE = /\b(?:Rural Municipality|Municipality|Metropolitan City|Sub-Metropolitan City|District|Province|Valley|Lake|River|Village|Airport|Highway|National Park|Himal)$/;
const ROLE_WORDS = new Set(["Businessman", "Businesswoman", "Trader", "Farmer", "Minister", "President", "Vice-President", "Chairman", "Chairperson", "Chair", "Captain", "Coach", "Mayor", "Governor", "Secretary", "Spokesperson", "Spokesman", "Chief", "Inspector", "Superintendent", "Director", "Professor", "Prof", "Dr", "Mr", "Mrs", "Ms", "Leader", "Lawmaker", "MP", "Judge", "Justice", "General", "Gen", "Colonel", "Officer", "Principal", "Teacher", "Doctor", "Ambassador", "Lt", "Sgt", "SP", "DSP", "DIG", "IGP", "CEO", "Commissioner", "Speaker"]);
const EN_ROLE_LC = /\b(?:businessman|businesswoman|trader|farmer|minister|president|chairman|chairperson|captain|coach|mayor|governor|secretary|spokesperson|spokesman|chief|inspector|superintendent|director|professor|leader|lawmaker|judge|officer|principal|teacher|doctor|ambassador|according to)\s+$/i;
// Capitalised pairs that are not people: weather events, festivals, days, months.
const NOT_PERSON = new Set(["El", "La", "Niño", "Niña", "Nino", "Nina", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December", "Dashain", "Tihar", "Chhath", "Holi", "Teej", "Lhosar", "Covid", "Covid-19", "New", "Year", "Day", "Week", "North", "South", "East", "West", "Mount", "Everest", "Himalaya", "Himalayas", "Terai", "Hilly", "Global", "International", "National"]);
const DEMONYM = new Set(["Nepali", "Nepalese", "Indian", "Chinese", "American", "Japanese", "Sri Lankan", "Lankan", "Bangladeshi", "Pakistani", "Bhutanese", "British", "Australian", "Korean", "Russian", "Qatari", "Malaysian", "Himalayan", "Madhesi", "Newar", "Tharu", "Sherpa", "Asian", "European", "African", "Western", "Eastern", "Hindu", "Buddhist", "Muslim", "Christian"]);
// Never offer a news outlet as an option (WeNepal output names no media outlets).
export const MEDIA = /\b(?:Post|Times|Express|Herald|Tribune|Guardian|Journal|Daily|News|Online|Khabar|Kantipur|Republica|Setopati|Ratopati|Onlinekhabar|Nagarik|Gorkhapatra|Annapurna|Reuters|AFP|AP|BBC|CNN|Xinhua|ANI|PTI|IANS|Bloomberg|Al Jazeera|Telegraph|Gazette|Kathmandu Post)\b/;
// Words that start a sentence or a clause; never the first word of an entity.
const STARTERS = new Set(["According", "However", "Meanwhile", "Also", "But", "And", "The", "This", "That", "These", "Those", "In", "On", "At", "After", "Before", "Earlier", "Today", "Yesterday", "While", "When", "Since", "As", "If", "Now", "Some", "Many", "Most", "A", "An", "Of", "For", "With", "From", "By", "To", "He", "She", "They", "It", "We", "I", "His", "Her", "Their", "Its", "Our", "Last", "Next", "Every", "Each", "All", "Both", "Other", "Such", "There", "Here", "Despite", "Although", "Though", "Because", "During", "Under", "Over", "Following", "Amid"]);

const CAP_TOKEN = String.raw`\p{Lu}[\p{L}\p{M}'’\-]*`;
const SPAN = new RegExp(String.raw`${CAP_TOKEN}(?:\s+(?:of|for|the|de)\s+${CAP_TOKEN}|\s+${CAP_TOKEN})*`, "gu");
const ACRONYM = /^\p{Lu}{2,6}$/u;

function typeEn(text: string, rolePrefixed: boolean): EntityType | null {
  if (TRIVIAL.has(text) || MEDIA.test(text)) return null;
  const tokens = text.split(/\s+/);
  if (DEMONYM.has(text) || DEMONYM.has(tokens[tokens.length - 1]!)) return null;
  if (PLACES.en.domestic.includes(text) || PLACES.en.abroad.includes(text) || EN_PLACE.test(text)) return "place";
  if (EN_ORG.test(text) || ACRONYM.test(text)) return "org";
  if (rolePrefixed) return "person";
  // Two or three plain capitalised words, no connector: most likely a person's name.
  if (tokens.length >= 2 && tokens.length <= 3 && tokens.every((t) => /^\p{Lu}\p{Ll}+$/u.test(t) && !NOT_PERSON.has(t))) return "person";
  return null;
}

function entitiesEn(sentences: string[]): TypedEntity[] {
  const out: TypedEntity[] = [];
  for (const s of sentences) {
    for (const m of s.matchAll(SPAN)) {
      let text = m[0].replace(/['’]s$/u, "").replace(/['’\-]+$/u, "");
      let start = m.index!;
      let tokens = text.split(/\s+/);
      // Drop sentence/clause starters ("According", "The") from the front.
      while (tokens.length && STARTERS.has(tokens[0]!)) { start += tokens[0]!.length + 1; tokens = tokens.slice(1); }
      if (!tokens.length) continue;
      // A single word at the very start of the sentence is just a capitalised word ("Traders").
      const atStart = !/\S/u.test(s.slice(0, start).replace(/^["“‘'(]+/u, ""));
      let rolePrefixed = EN_ROLE_LC.test(s.slice(0, start));
      // "Finance Minister Bishnu Paudel" → the name after the last role word.
      const lastRole = tokens.reduce((at, t, i) => (ROLE_WORDS.has(t.replace(/\.$/, "")) ? i : at), -1);
      if (lastRole === tokens.length - 1) continue; // "the Prime Minister": a role, no name
      if (lastRole >= 0) { tokens = tokens.slice(lastRole + 1); rolePrefixed = true; }
      text = tokens.join(" ");
      if (atStart && lastRole < 0 && tokens.length === 1 && !PLACES.en.domestic.includes(text) && !PLACES.en.abroad.includes(text) && !ACRONYM.test(text)) continue;
      const type = typeEn(text, rolePrefixed);
      if (type && !out.some((e) => e.text === text)) out.push({ text, type });
    }
  }
  return out;
}

const NE_CASE = /(?:हरू)?(?:ले|लाई|को|का|की|मा|बाट|देखि|सम्म|सँग|द्वारा|तर्फ|भित्र|माथि|प्रति|ज्यू|स्थित|बीच)$/u;
const NE_ORG_SUFFIX = /(?:बैंक|मन्त्रालय|समिति|महासंघ|संघ|पार्टी|कोष|आयोग|प्राधिकरण|विभाग|कार्यालय|अदालत|परिषद्|सभा|निगम|कम्पनी|विश्वविद्यालय|प्रतिष्ठान|संस्थान|बोर्ड|केन्द्र|मोर्चा|कांग्रेस)$/u;
const NE_ROLES = ["प्रधानमन्त्री", "उपप्रधानमन्त्री", "मन्त्री", "राष्ट्रपति", "उपराष्ट्रपति", "अध्यक्ष", "उपाध्यक्ष", "महासचिव", "व्यवसायी", "व्यापारी", "किसान", "प्रवक्ता", "सांसद", "मेयर", "उपमेयर", "प्रमुख", "सचिव", "गभर्नर", "कप्तान", "प्रशिक्षक", "नेता", "न्यायाधीश", "प्राध्यापक", "शिक्षक", "डा.", "श्री", "निरीक्षक", "उपरीक्षक", "निर्देशक", "राजदूत"];
const NE_WORD = String.raw`[\u0900-\u0963\u0966-\u097F\u200C\u200D]+`;
const NE_PERSON = new RegExp(String.raw`(?:^|[\s,(])(?:${NE_ROLES.map((r) => r.replace(".", "\\.")).join("|")})\s+(${NE_WORD}(?:\s+${NE_WORD})?)`, "gu");
const strip = (w: string) => w.replace(NE_CASE, "");
// Inside a person's name: no role or common words.
const NE_NOT_NAME = new Set([...NE_ROLES, "नेपाल", "सरकार", "प्रदेश", "जिल्ला", "पनि", "र", "तथा", "यो", "त्यो", "उनी", "उनले", "हाल", "अहिले"]);

function entitiesNe(text: string, extracted: string[]): TypedEntity[] {
  const out: TypedEntity[] = [];
  const add = (t: string, type: EntityType) => { if (t && !TRIVIAL.has(t) && !out.some((e) => e.text === t)) out.push({ text: t, type }); };
  // Places: the gazetteer, at a word start, any case ending.
  for (const p of [...PLACES.ne.domestic, ...PLACES.ne.abroad]) {
    if (new RegExp(String.raw`(?<![\p{Script=Devanagari}\p{M}])${p}`, "u").test(text)) add(p, "place");
  }
  // People: a role word, then one or two name words ("व्यवसायी शंकर अग्रवाललाई" → शंकर अग्रवाल).
  for (const m of text.matchAll(NE_PERSON)) {
    const words = m[1]!.split(/\s+/);
    const name: string[] = [];
    for (const w of words) {
      const bare = strip(w);
      if (NE_NOT_NAME.has(bare) || bare.length < 2) break;
      name.push(bare);
      if (bare !== w) break; // a case ending closes the name
    }
    if (name.length) add(name.join(" "), "person");
  }
  // Organisations: extracted phrases ending in an org word.
  for (const e of extracted) {
    if (!/[\u0900-\u097F]/.test(e) || /\n/.test(e)) continue;
    const bare = e.split(/\s+/).map(strip).join(" ");
    if (NE_ORG_SUFFIX.test(bare) && bare.split(/\s+/).length >= 2) add(bare, "org");
  }
  return out;
}

/** Typed entities in reading order of first appearance. */
export function typedEntities(text: string, sentences: string[], lang: "en" | "ne", extracted: string[] = []): TypedEntity[] {
  return lang === "en" ? entitiesEn(sentences) : entitiesNe(text, extracted);
}
