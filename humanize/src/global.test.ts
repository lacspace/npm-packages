import { test, expect } from "vitest";
import { plural, pluralize, compact, truncate, truncateMiddle, titleCase, initials, unit } from "./index";

const p = (w: string) => plural(w, 2);

test("plural knows English irregulars", () => {
  expect(["child", "person", "man", "woman", "tooth", "foot", "mouse", "goose", "ox", "die"].map(p))
    .toEqual(["children", "people", "men", "women", "teeth", "feet", "mice", "geese", "oxen", "dice"]);
});

test("plural leaves uncountables alone", () => {
  expect(["sheep", "fish", "deer", "series", "species", "news", "data", "software", "information", "equipment", "feedback"].map(p))
    .toEqual(["sheep", "fish", "deer", "series", "species", "news", "data", "software", "information", "equipment", "feedback"]);
  expect(["goldfish", "reindeer", "firmware", "spacecraft", "metadata"].map(p))
    .toEqual(["goldfish", "reindeer", "firmware", "spacecraft", "metadata"]);
});

test("plural handles -f/-fe, -o, -sis and Latin/Greek endings", () => {
  expect(["leaf", "wolf", "knife", "life", "half", "shelf"].map(p)).toEqual(["leaves", "wolves", "knives", "lives", "halves", "shelves"]);
  expect(["roof", "chief", "belief", "cliff", "chef"].map(p)).toEqual(["roofs", "chiefs", "beliefs", "cliffs", "chefs"]);
  expect(["hero", "potato", "tomato", "echo", "photo", "piano", "video", "radio"].map(p))
    .toEqual(["heroes", "potatoes", "tomatoes", "echoes", "photos", "pianos", "videos", "radios"]);
  expect(["analysis", "crisis", "thesis", "axis"].map(p)).toEqual(["analyses", "crises", "theses", "axes"]);
  expect(["criterion", "phenomenon", "datum", "cactus", "matrix", "vertex"].map(p))
    .toEqual(["criteria", "phenomena", "data", "cacti", "matrices", "vertices"]);
  expect(["quiz", "stomach", "epoch"].map(p)).toEqual(["quizzes", "stomachs", "epochs"]);
});

test("plural keeps the regular rules that were already right", () => {
  expect(["item", "box", "bus", "church", "dish", "city", "day", "index", "status", "virus", "price"].map(p))
    .toEqual(["items", "boxes", "buses", "churches", "dishes", "cities", "days", "indexes", "statuses", "viruses", "prices"]);
});

test("plural handles compounds, case, and already-plural input", () => {
  expect(["salesperson", "grandchild", "chairman", "chairwoman", "housewife", "human", "German"].map(p))
    .toEqual(["salespeople", "grandchildren", "chairmen", "chairwomen", "housewives", "humans", "Germans"]);
  expect(["Child", "CHILD", "Person", "API", "URL"].map(p)).toEqual(["Children", "CHILDREN", "People", "APIS", "URLS"]);
  expect(["children", "people", "criteria"].map(p)).toEqual(["children", "people", "criteria"]);
  expect(plural("child", 1)).toBe("child");
  expect(pluralize(3, "person")).toBe("3 people");
  expect(unit(2, "foot")).toBe("2 feet");
});

test("compact promotes a value that rounds up to the next unit", () => {
  expect(compact(999_999)).toBe("1.0M");
  expect(compact(999_950_000)).toBe("1.0B");
  expect(compact(999.96)).toBe("1.0K");
  expect(compact(999)).toBe("999");
  expect(compact(1500)).toBe("1.5K");
  expect(compact(-999_999)).toBe("-1.0M");
});

test("truncate never splits a grapheme cluster", () => {
  const family = "\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}";
  expect(truncate(`${family} family trip`, 3)).toBe(`${family} …`.replace(" …", "…"));
  // Unicode 15.1: "स्ते" is one conjunct cluster, so "नमस्ते" is three characters.
  expect(truncate("नमस्ते दुनिया", 4)).toBe("नमस्ते…");
  expect(truncate("👍🏽👍🏽👍🏽👍🏽", 3)).toBe("👍🏽👍🏽…");
  expect(truncate("short", 10)).toBe("short");
  expect(truncateMiddle("🇳🇵🇯🇵🇺🇸🇩🇪🇫🇷", 3)).toBe("🇳🇵…🇫🇷");
  expect(initials("Ünal Öztürk")).toBe("ÜÖ");
});

test("titleCase capitalises accented and non-Latin word starts", () => {
  expect(titleCase("élan vital")).toBe("Élan Vital");
  expect(titleCase("über straße")).toBe("Über Straße");
  expect(titleCase("привет мир")).toBe("Привет Мир");
  expect(titleCase("o'neil's café")).toBe("O'neil's Café");
  expect(titleCase("hello world")).toBe("Hello World");
});
