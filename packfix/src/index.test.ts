import { describe, expect, it } from "vitest";
import { article, describe as describeApi, fix, overlap, parseFailure, replaceSentence, sentences, type Pack } from "./index.js";
import { existsSync, readFileSync } from "node:fs";

// Real failing packs from WeNepal's logs quote third-party source text, so they stay out of this
// public repo (gitignored). Drop the file in src/fixtures/ to run these locally.
type Fx = { kind: string; failures: string[]; pack: Pack; sources: { n: number; language: string; title: string; text: string }[] };
const FILE = new URL("./fixtures/wenepal-4oct2026.json", import.meta.url);
const FX: Fx[] = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : [];
const run = (i: number) => fix(FX[i]!.pack, FX[i]!.failures, FX[i]!.sources);

describe.skipIf(!FX.length)("WeNepal real packs (4 Oct 2026)", () => {
  it("#0 event names written from a Nepali source are descriptive phrases", () => {
    const r = run(0);
    expect(r.names.map((n) => n.verdict)).toEqual(["not-a-name", "not-a-name"]);
    expect(r.remaining.some((x) => x.startsWith("names"))).toBe(false);
    expect(r.remaining.some((x) => x.startsWith("lengths"))).toBe(true); // passed through untouched
  });
  it("#1 institution described in common words", () => {
    expect(run(1).names[0]).toMatchObject({ name: "Provincial Traffic Police Office", verdict: "not-a-name" });
  });
  it("#2 Title Case headline fragment", () => {
    expect(run(2).names[0]!.verdict).toBe("not-a-name");
  });
  it("#3 Gandak is in the Nepali source (गण्डक) via transliteration", () => {
    const r = run(3);
    expect(r.names.find((n) => n.name === "Gandak Barrage")!.verdict).toBe("in-source");
    expect(r.names.find((n) => n.name === "Barrage")!.verdict).toBe("not-a-name");
  });
  it("#5 invented event name is flagged with its sentence, removed nowhere else", () => {
    const r = run(5);
    expect(r.names[0]).toMatchObject({ name: "Sagarmatha Sambaad", verdict: "unbacked" });
    expect(r.remaining).toContain("names: names not in sources or gazetteer: Sagarmatha Sambaad");
    const ids = r.rewrite.filter((w) => w.reason === "names").map((w) => w.id);
    expect(ids).toHaveLength(1);
    expect(r.rewrite.find((w) => w.reason === "names")!.text).toContain("Sagarmatha Sambaad");
  });
  it("#6 plagiarism: worst sentence first, smallest rewrite set under the limit", () => {
    const r = run(6);
    expect(r.overlap!.sentences[0]!.id).toBe(r.overlap!.rewrite[0]);
    expect(r.overlap!.rewrite.length).toBeLessThanOrEqual(2);
    const left = r.overlap!.sentences.filter((s) => !r.overlap!.rewrite.includes(s.id)).reduce((a, s) => a + s.shared, 0);
    expect(left).toBeGreaterThanOrEqual(0);
    expect(r.rewrite.every((w) => w.reason === "plagiarism")).toBe(true);
  });
  it("#4 #5 #7 each plagiarism case asks for at most 2 sentences", () => {
    for (const i of [4, 5, 7]) expect(run(i).rewrite.filter((w) => w.reason === "plagiarism").length).toBeLessThanOrEqual(2);
  });
  it("#7 explosive knock → aggressive knock", () => {
    const r = run(7);
    const body = r.pack.body.join(" ");
    expect(body).toContain("aggressive knock");
    expect(body).not.toMatch(/explosive/i);
    expect(r.remaining.some((x) => x.startsWith("tone"))).toBe(false);
  });
  it("#8 massive collapse → major collapse, four phrase false positives cleared", () => {
    const r = run(8);
    expect(r.pack.body.join(" ")).toContain("a major collapse");
    expect(r.names.every((n) => n.verdict === "not-a-name")).toBe(true);
  });
  it("#9 question headline goes back to the model", () => {
    const r = run(9);
    expect(r.remaining).toContain("tone: question headline");
    expect(r.rewrite).toContainEqual(expect.objectContaining({ id: "headline", reason: "tone" }));
  });
  it("leaves validator failures it doesn't own (lengths, numbers) untouched", () => {
    expect(run(3).remaining.filter((x) => /^(lengths|numbers)/.test(x))).toHaveLength(2);
  });
});

const PACK: Pack = {
  language: "en",
  headline: "Minister Adhikary inaugurates bridge",
  deck: "A new bridge opened.",
  summary: "Minister Adhikary opened it. Locals attended.",
  body: ["Minister Ram Adhikary inaugurated the bridge on Friday. Police found an explosive device nearby.", "The historic site drew a massive crowd."],
  bullets: ["Bridge opened by Adhikary"],
  entities: ["Ram Adhikary"],
  tags: ["bridge"],
};
const SRC = [{ language: "en", text: "Minister Ram Adhikari inaugurated the Karnali bridge on Friday, officials said." }];

describe("names (synthetic)", () => {
  const p: Pack = {
    language: "en",
    headline: "Kosi Barrage Opens All Gates as Water Flow Rises",
    body: ["The Kosi Barrage opened all 56 gates on Sunday. The District Disaster Management Committee asked residents to stay alert. The first Himalayan Water Summit was also mentioned."],
    entities: ["Kosi Barrage", "Himalayan Water Summit"],
  };
  const ne = [{ language: "ne", text: "कोसी ब्यारेजका सबै ५६ ढोका आइतबार खोलिएका छन्। जिल्ला विपद् व्यवस्थापन समितिले सतर्क रहन आग्रह गरेको छ।" }];
  const r = fix(p, ["names: names not in sources or gazetteer: Kosi Barrage, District Disaster Management Committee, Opens All Gates, Himalayan Water Summit"], ne);
  it("other-script source backs the proper part via transliteration", () => {
    expect(r.names.find((n) => n.name === "Kosi Barrage")!.verdict).toBe("in-source");
  });
  it("common-word institution and headline fragment are not names", () => {
    expect(r.names.find((n) => n.name === "District Disaster Management Committee")!.verdict).toBe("not-a-name");
    expect(r.names.find((n) => n.name === "Opens All Gates")!.verdict).toBe("not-a-name");
  });
  it("limitation: an invented name made only of common words is not flagged", () => {
    expect(r.names.find((n) => n.name === "Himalayan Water Summit")!.verdict).toBe("not-a-name");
  });
});

describe("rules", () => {
  it("respells a near-miss to the source spelling everywhere", () => {
    const r = fix(PACK, ["names: names not in sources or gazetteer: Ram Adhikary"], SRC);
    expect(r.names[0]).toMatchObject({ verdict: "respelled", replacement: "Ram Adhikari" });
    expect(r.pack.body[0]).toContain("Ram Adhikari");
    expect(r.pack.entities).toEqual(["Ram Adhikari"]);
  });
  it("keeps factual uses (explosive device, historic site)", () => {
    const r = fix(PACK, ["tone: banned phrases: explosive, historic, massive"], SRC);
    expect(r.pack.body.join(" ")).toContain("explosive device");
    expect(r.pack.body.join(" ")).toContain("historic site");
    expect(r.pack.body.join(" ")).toContain("a major crowd");
    expect(r.remaining[0]).toBe("tone: banned phrases: explosive, historic");
  });
  it("a/an: only the article before a replaced word changes", () => {
    const p: Pack = { language: "en", headline: "Nepal beat Japan in Group A encounter", body: [
      "It was a shocking upset in a university town. An explosive rise in runs followed a one-day break.",
      "Group A encounter: a huge crowd, an explosive knock and a massive cheer.",
    ] };
    const r = fix(p, ["tone: banned phrases: shocking, explosive, huge, massive"], []);
    expect(r.pack.headline).toBe("Nepal beat Japan in Group A encounter");
    expect(r.pack.body[0]).toBe("It was an unexpected upset in a university town. A rapid rise in runs followed a one-day break.");
    expect(r.pack.body[1]).toBe("Group A encounter: a large crowd, an aggressive knock and a major cheer.");
  });
  it("article() handles sounds", () => {
    expect(["aggressive", "university", "one-day", "hour", "unexpected", "European", "major"].map(article)).toEqual(["an", "a", "a", "an", "an", "a", "a"]);
  });
  it("whopping is removed with its article", () => {
    const r = fix({ language: "en", headline: "h", body: ["Prices rose a whopping 40% this year."] }, ["tone: banned phrases: whopping"], []);
    expect(r.pack.body[0]).toBe("Prices rose 40% this year.");
  });
  it("unknown banned phrase is left for the model", () => {
    expect(fix(PACK, ["tone: banned phrases: jaw-dropping"], SRC).remaining).toEqual(["tone: banned phrases: jaw-dropping"]);
  });
  it("sentence ids round-trip through replaceSentence", () => {
    const ids = sentences(PACK).map((s) => s.id);
    expect(ids).toEqual(["headline", "deck", "summary.0", "summary.1", "body.0.0", "body.0.1", "body.1.0", "bullets.0"]);
    const p = replaceSentence(PACK, "body.0.1", "Police are investigating.");
    expect(p.body[0]).toBe("Minister Ram Adhikary inaugurated the bridge on Friday. Police are investigating.");
    expect(PACK.body[0]).toContain("explosive"); // input not mutated
  });
  it("overlap only compares same-language sources", () => {
    const p: Pack = { language: "en", headline: "x", body: ["Minister Ram Adhikari inaugurated the Karnali bridge on Friday, officials said today."] };
    expect(overlap(p, SRC).pct).toBeGreaterThan(50);
    expect(overlap(p, [{ language: "ne", text: SRC[0]!.text }]).pct).toBe(0);
  });
  it("parses failure strings", () => {
    expect(parseFailure("plagiarism: 8-gram overlap 3.7% (limit 3%)")).toMatchObject({ type: "plagiarism", pct: 3.7, limit: 3 });
    expect(parseFailure("tone: banned phrases: explosive")).toMatchObject({ type: "tone", phrases: ["explosive"] });
    expect(parseFailure("names: names not in sources or gazetteer: A B, C")).toMatchObject({ names: ["A B", "C"] });
  });
  it("describe()", () => expect(describeApi().name).toBe("@lacspace/packfix"));
});
