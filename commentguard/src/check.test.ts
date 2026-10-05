import { describe, expect, it } from "vitest";
import { check } from "./check.js";

const ok = (text: string, lang?: "en" | "ne") => expect(check({ text, lang }).ok, text).toBe(true);
const bad = (text: string, code: string) => expect(check({ text }).code, text).toBe(code);

describe("abuse", () => {
  it("English, masked and leet", () => {
    for (const t of ["what the fuck is this", "f*ck the government", "this is sh!t", "you b1tch", "F U C K", "what an asshole"]) bad(t, "abuse");
  });
  it("romanised Nepali", () => {
    for (const t of ["muji neta haru", "m.u.j.i", "machikne sarkar", "randi ko ban", "lado khau", "gandu ho", "chutiya"]) bad(t, "abuse");
  });
  it("Devanagari, with case endings", () => {
    for (const t of ["मुजी नेताहरू", "यो मुजीको काम", "मचिक्ने सरकार", "हरामीहरू"]) bad(t, "abuse");
  });
  it("mild words only ask for review", () => {
    const r = check({ text: "these leaders are chor and idiots" });
    expect(r).toMatchObject({ ok: true, review: true });
    expect(check({ text: "neta haru chor", }, { strict: true }).code).toBe("abuse");
  });
});

describe("no false positives on news vocabulary", () => {
  it("English", () => {
    for (const t of ["A classic assessment of the class assistant", "Putin met Modi in Moscow", "Kami Rita Sherpa climbs Everest for the 32nd time", "Dickens and Scunthorpe", "The cocktail party was cocky", "Shiitake mushrooms", "Crypto ban: NRB warns about illegal crypto trading", "Lottery for housing units announced", "Hello, title of the essay"]) ok(t);
  });
  it("Nepali and romanised", () => {
    for (const t of ["चोरी भएको सामान बरामद", "गेडागुडीको भाउ बढ्यो", "मुला र गाजरको खेती", "भालुको आक्रमणमा घाइते", "कुकुरको टोकाइबाट बच्न खोप", "dal bhat power 24 hour", "putin ko bhasan", "sala ma sammelan bhayo"]) {
      const r = check({ text: t });
      expect(r.ok, t).toBe(true);
    }
  });
});

describe("personal data", () => {
  it("Nepal phones", () => {
    for (const t of ["call me 9841234567", "+977 984-123-4567", "९८४१२३४५६७ मा फोन गर्नुस्", "office 01-4123456"]) bad(t, "personal");
  });
  it("email, citizenship, NID, account", () => {
    for (const t of ["mail ram@example.com", "मेरो नागरिकता नं. २७-०१-७१-१२३४५", "NID 123 456 789 0", "account no 01234567890123"]) bad(t, "personal");
  });
  it("years, prices and scores are not phone numbers", () => {
    for (const t of ["Budget Rs 1,860,000,000 for 2083/84", "NEPSE at 2,683.45 on 2026-10-04", "Nepal 149/1 in 20 overs"]) ok(t);
  });
});

describe("spam", () => {
  it("invites, shorteners, too many links", () => {
    bad("join https://t.me/freesignals", "spam");
    bad("see bit.ly/abc", "spam");
    bad("read a.com and b.com and c.net", "spam");
    expect(check({ text: "full story at https://wenepal.com/article/x and https://wenepal.com/ne/y" }, { ownDomains: ["wenepal.com"] }).ok).toBe(true);
  });
  it("promo and betting with contact", () => {
    bad("earn Rs 5000 daily, whatsapp me 9812345678", "personal");
    bad("Earn 5000 daily from home, DM me", "spam");
    bad("best betting app 1xbet link www.win.xyz", "spam");
    expect(check({ text: "Is crypto betting legal in Nepal?" })).toMatchObject({ ok: true, review: true });
  });
});

describe("repeat", () => {
  it("same text from the same user", () => {
    expect(check({ text: "Government must resign now!!", userHistory: ["government must resign now"] }).code).toBe("repeat");
    expect(check({ text: "Government must resign now", userHistory: ["completely different take on the budget"] }).ok).toBe(true);
  });
  it("floods", () => {
    bad("nooooooooooooooo", "repeat");
    bad("wow wow wow wow wow wow wow", "repeat");
    bad("😂".repeat(20), "repeat");
  });
});

describe("options", () => {
  it("allow and extraAbuse", () => {
    expect(check({ text: "sala ko kura" }, { allow: ["sala"] }).hits).toHaveLength(0);
    expect(check({ text: "you are a goonda" }, { extraAbuse: ["goonda"] }).code).toBe("abuse");
  });
});
