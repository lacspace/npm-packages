/**
 * English pluralisation that knows the language, not just "add -s".
 * Covers irregulars (child → children), uncountables (sheep, data, software),
 * -f/-fe (knife → knives), -o (potato → potatoes), -sis (analysis → analyses),
 * Latin/Greek plurals (criterion → criteria, cactus → cacti) and compounds
 * (salesperson → salespeople). Case is preserved (Child → Children).
 */

const UNCOUNTABLE = new Set(
  (
    "advice aircraft bison chassis corps data deer equipment evidence feedback fish furniture " +
    "hardware headquarters homework information jeans knowledge luggage means metadata money " +
    "moose music news offspring police research rice salmon scissors series sheep shrimp " +
    "software species swine traffic trousers trout weather wildlife"
  ).split(" "),
);

const IRREGULAR: Record<string, string> = {
  person: "people", man: "men", woman: "women", child: "children", tooth: "teeth",
  foot: "feet", mouse: "mice", goose: "geese", ox: "oxen", louse: "lice", die: "dice",
  quiz: "quizzes", fez: "fezzes", whiz: "whizzes",
  // Latin / Greek
  analysis: "analyses", axis: "axes", basis: "bases", crisis: "crises",
  diagnosis: "diagnoses", ellipsis: "ellipses", hypothesis: "hypotheses",
  oasis: "oases", parenthesis: "parentheses", synopsis: "synopses", thesis: "theses",
  criterion: "criteria", phenomenon: "phenomena", datum: "data", medium: "media",
  curriculum: "curricula", bacterium: "bacteria", memorandum: "memoranda",
  stimulus: "stimuli", cactus: "cacti", fungus: "fungi", nucleus: "nuclei",
  radius: "radii", alumnus: "alumni", syllabus: "syllabi",
  matrix: "matrices", vertex: "vertices", appendix: "appendices", apex: "apices",
  // -f / -fe → -ves
  leaf: "leaves", loaf: "loaves", thief: "thieves", sheaf: "sheaves", wolf: "wolves",
  calf: "calves", half: "halves", elf: "elves", self: "selves", shelf: "shelves",
  knife: "knives", life: "lives", wife: "wives", scarf: "scarves", wharf: "wharves",
  // -o → -oes
  hero: "heroes", potato: "potatoes", tomato: "tomatoes", echo: "echoes",
  veto: "vetoes", torpedo: "torpedoes", embargo: "embargoes", mosquito: "mosquitoes",
  volcano: "volcanoes", domino: "dominoes", tornado: "tornadoes",
  // -ch said /k/ takes a plain -s
  stomach: "stomachs", epoch: "epochs", monarch: "monarchs", patriarch: "patriarchs",
  matriarch: "matriarchs", tech: "techs",
};

// Irregulars that also apply as the tail of a compound word.
const COMPOUND_TAILS = ["person", "woman", "child", "tooth", "foot", "mouse", "goose", "knife", "wife", "life"];

const MAN_REGULAR = /(?:^|hu|ger|sha|talis|cai|cay|otto|ro|walk|dober|des)man$/;

const PLURAL_FORMS = new Set(Object.values(IRREGULAR));

function matchCase(source: string, out: string): string {
  if (source.length > 1 && source === source.toUpperCase() && source !== source.toLowerCase()) {
    return out.toUpperCase();
  }
  if (source[0] && source[0] !== source[0].toLowerCase()) return out[0]!.toUpperCase() + out.slice(1);
  return out;
}

/** English plural of a single word. `inflectPlural("child")` → "children". */
export function inflectPlural(word: string): string {
  const lower = word.toLowerCase();
  if (!lower || UNCOUNTABLE.has(lower) || PLURAL_FORMS.has(lower)) return word;
  const irregular = Object.prototype.hasOwnProperty.call(IRREGULAR, lower) ? IRREGULAR[lower] : undefined;
  if (irregular) return matchCase(word, irregular);
  for (const tail of COMPOUND_TAILS) {
    if (lower.endsWith(tail) && lower.length > tail.length) {
      return word.slice(0, word.length - tail.length) + matchCase(word.slice(-tail.length), IRREGULAR[tail]!);
    }
  }
  // Compounds of uncountables: goldfish, reindeer, miniseries, firmware, spacecraft, metadata.
  if (/(fish|sheep|deer|series|species|ware|craft|data)$/.test(lower)) return word;
  // chairman → chairmen, but human → humans.
  if (/man$/.test(lower) && !MAN_REGULAR.test(lower)) return word.slice(0, -2) + matchCase(word.slice(-2), "en");
  let out: string;
  if (/(s|x|z|ch|sh)$/i.test(word)) out = `${word}es`;
  else if (/[^aeiou]y$/i.test(word)) out = `${word.slice(0, -1)}ies`;
  else out = `${word}s`;
  return word === word.toUpperCase() && word.length > 1 && /[A-Z]/.test(word) ? out.toUpperCase() : out;
}
