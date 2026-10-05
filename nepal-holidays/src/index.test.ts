import { bsToAd } from "@lacspace/nepali-date";
import { describe, expect, it } from "vitest";
import { _printedSaturdays, _rows, adToBS, bsToAD, describe as describeApi, holidays, holidaysOn, isHoliday, source, upcoming } from "./index.js";

const wd = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("BS 2083 calendar", () => {
  it("every day of the year matches @lacspace/nepali-date", () => {
    const months = [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30];
    for (let m = 1; m <= 12; m++) for (let d = 1; d <= months[m - 1]!; d++) expect(bsToAD(2083, m, d)).toBe(localIso(bsToAd(2083, m, d)));
    expect(bsToAD(2083, 1, 1)).toBe("2026-04-14");
    expect(adToBS("2027-04-13")).toBe("2083-12-30");
    expect(adToBS("2027-04-14")).toBeNull();
  });
  it("every Saturday printed in the notice is a Saturday", () => {
    for (const [m, days] of Object.entries(_printedSaturdays(2083)!)) for (const d of days) expect(wd(bsToAD(2083, +m, d))).toBe(6);
  });
  it("every weekday printed next to a holiday matches", () => {
    for (const r of _rows(2083)!) {
      if (r.bs) expect([r.id, wd(bsToAD(2083, r.bs[0], r.bs[1]))]).toEqual([r.id, r.wd]);
      if (r.to) expect([r.id, wd(bsToAD(2083, r.to[0], r.to[1]))]).toEqual([r.id, r.toWd]);
    }
  });
  it("dates the notice pins to the Gregorian calendar", () => {
    const by = Object.fromEntries(holidays(2083).map((h) => [h.id, h]));
    expect(by["christmas"]!.dateAD).toBe("2026-12-25");
    expect(by["labour-day"]!.dateAD).toBe("2026-05-01");
    expect(by["womens-day"]!.dateAD).toBe("2027-03-08");
    expect(by["disability-day"]!.dateAD).toBe("2026-12-03");
  });
});

describe("holidays()", () => {
  const list = holidays(2083);
  it("transcribes the whole notice", () => {
    expect(list).toHaveLength(45);
    expect(new Set(list.map((h) => h.id)).size).toBe(45);
    expect(list.filter((h) => !h.dateAD).map((h) => h.id).sort()).toEqual(["bhoto-jatra", "eid-ul-adha", "eid-ul-fitr", "guru-nanak-jayanti", "mohammed-jayanti", "sirua-pawani"]);
    expect(source(2083)!.gazette).toBe("Nepal Rajpatra, Khanda 75, Sankhya 67, Bhag 5");
  });
  it("Dashain and Tihar are ranges", () => {
    const d = list.find((h) => h.id === "dashain")!;
    expect(d).toMatchObject({ dateBS: "2083-06-31", dateAD: "2026-10-17", endBS: "2083-07-06", endAD: "2026-10-23", days: 7 });
    const t = list.find((h) => h.id === "tihar")!;
    expect(t).toMatchObject({ dateAD: "2026-11-08", endAD: "2026-11-12", days: 5 });
  });
  it("filters by scope and district", () => {
    expect(holidays(2083, { scope: "women" }).map((h) => h.id)).toEqual(["teej", "jitiya"]);
    const birgunj = holidays(2083, { district: "Parsa", scope: "regional", undated: false }).map((h) => h.id);
    expect(birgunj).toEqual(["fagu-purnima-terai"]);
    const ktm = holidays(2083, { district: "Kathmandu", scope: "regional", undated: false }).map((h) => h.id);
    expect(ktm).toEqual(["gaijatra-valley", "indra-jatra", "fagu-purnima-hill", "ghode-jatra"]);
    expect(holidays(2083, { kind: "observance" })).toHaveLength(3);
  });
});

describe("lookups", () => {
  it("holidaysOn a day inside Dashain", () => {
    expect(holidaysOn("2026-10-20").map((h) => h.id)).toEqual(["dashain"]);
    expect(holidaysOn("2026-05-01").map((h) => h.id).sort()).toEqual(["buddha-jayanti", "chandi-purnima", "labour-day"]);
  });
  it("isHoliday counts Saturdays and national holidays; women-only Teej is not a national holiday", () => {
    expect(isHoliday("2026-10-21").holiday).toBe(true);
    expect(isHoliday("2026-10-24")).toMatchObject({ holiday: true, saturday: true });
    expect(isHoliday(bsToAD(2083, 5, 29)).holiday).toBe(false);
    expect(isHoliday(bsToAD(2083, 5, 29), { scope: ["national", "women"] }).holiday).toBe(true);
    expect(isHoliday(bsToAD(2083, 5, 22)).holiday).toBe(false); // Civil Service Day: offices open
  });
  it("upcoming from 5 Oct 2026", () => {
    expect(upcoming("2026-10-05", 3, { scope: "national" }).map((h) => h.id)).toEqual(["ghatasthapana", "dashain", "tihar"]);
  });
  it("describe()", () => expect(describeApi().years).toEqual([2083]));
});
