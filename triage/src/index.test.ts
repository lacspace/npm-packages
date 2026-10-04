import { describe, expect, it } from "vitest";
import { describe as describeApi, registrableDomain, roundups, triage, type Candidate, type TriageOptions } from "./index.js";

// WeNepal live candidates, 4 Oct 2026 ~15:00 UTC (a–e), plus synthetic f and g.
const NOW = "2026-10-04T15:00:00Z";
const t = (min: number) => new Date(Date.parse(NOW) - min * 60_000).toISOString();
const sebon = (min: number) => ({ domain: "https://www.sebon.gov.np/notices/123", primary: true, trust: 95, at: t(min) });

const A: Candidate = { id: "a", title: "धितोपत्र दलाल व्यवसाय सुदृढीकरण नीति, २०८३ लागू गरिएको सम्बन्धमा", lang: "ne", category: "economy", firstSeenAt: t(40), sources: [sebon(40), sebon(35)], trend: 0, novelty: 1 };
const B: Candidate = { id: "b", title: "उदयपुर जिल्ला अदालत", lang: "ne", category: "society/courts", firstSeenAt: t(50), sources: [{ domain: "supremecourt.gov.np", primary: true, at: t(50) }, { domain: "www.supremecourt.gov.np", primary: true, at: t(45) }], trend: 0, novelty: 1, kind: "notice" };
const C: Candidate = { id: "c", title: "Bonus Share Registered", lang: "en", category: "nepse", firstSeenAt: t(30), sources: [sebon(30)], trend: 0, novelty: 1 };
const D: Candidate = { id: "d", title: "Right Share Approved", lang: "en", category: "nepse", firstSeenAt: t(25), sources: [sebon(25)], trend: 0, novelty: 1 };
const E: Candidate = { id: "e", title: "संस्थागत सामाजिक उत्तरदायित्व कोषमा रहेको रकम प्रधानमन्त्री दैवी प्रकोप…", lang: "ne", category: "politics", firstSeenAt: t(20), sources: [sebon(20)], trend: 0, novelty: 1 };
const F: Candidate = { id: "f", title: "Minister accused of …", lang: "en", category: "politics", firstSeenAt: t(10), sources: [{ domain: "setopati.com", at: t(10) }], trend: 0.4, novelty: 1, allegation: true };
const G: Candidate = { id: "g", title: "Flood sweeps away bridge", lang: "en", category: "society", firstSeenAt: t(40), newestKnownAt: t(2), sources: ["a.com", "b.org", "news.c.com.np", "d.net"].map((d, i) => ({ domain: d, at: t(40 - i * 13) })), trend: 0.7, novelty: 1 };

const OPTS: TriageOptions = { now: NOW, slots: { perHour: { en: 3, ne: 3 }, usedThisHour: { en: 0, ne: 0 } }, freshnessHours: { default: 48, weather: 12, nepse: 24 } };
const byId = (rs: ReturnType<typeof triage>) => Object.fromEntries(rs.map((r) => [r.id, r]));

describe("WeNepal fixtures", () => {
  const r = byId(triage([A, B, C, D, E, F], OPTS));

  it("a) official policy change → write_now, mid priority", () => {
    expect(r.a!.action).toBe("write_now");
    expect(r.a!.independentSources).toBe(1); // 2 × sebon.gov.np = 1 domain
    expect(r.a!.priority).toBeGreaterThan(0.4);
    expect(r.a!.priority).toBeLessThan(0.75);
  });
  it("b) court notice board → queue, low priority", () => {
    expect(r.b!.action).toBe("queue");
    expect(r.b!.priority).toBeLessThan(0.4);
    expect(r.b!.reasons).toContain("routine_notice");
  });
  it("c, d) NEPSE notices → queue, grouped into one roundup", () => {
    expect([r.c!.action, r.d!.action]).toEqual(["queue", "queue"]);
    expect(roundups(Object.values(r))).toEqual({ "nepse-notices": ["d", "c"], "society/courts-notices": ["b"] });
  });
  it("e) politics with an official source → write_now (slots left after a)", () => {
    expect(r.e!.action).toBe("write_now");
    expect(r.e!.reasons).toContain("sensitive:official_source");
  });
  it("f) allegation with one non-official source → drop", () => {
    expect(r.f!.action).toBe("drop");
    expect(r.f!.reasons).toContain("sensitive:needs_2_sources_or_official");
  });
  it("g) 4 independent sources within 40 min, trend 0.7 → fast lane with slots full", () => {
    const full = byId(triage([G, { ...A, id: "x", lang: "en", category: "economy" }], { ...OPTS, slots: { perHour: { en: 3 }, usedThisHour: { en: 3 } } }));
    expect(full.g!.action).toBe("write_now");
    expect(full.g!.reasons).toContain("fast_lane");
    expect(full.x!.action).toBe("queue");
    expect(full.x!.reasons).toContain("slots_full");
  });
});

describe("rules", () => {
  it("fast lane is capped per hour", () => {
    const gs = [1, 2, 3].map((i) => ({ ...G, id: `g${i}` }));
    const r = triage(gs, { ...OPTS, slots: { perHour: { en: 0 } } });
    expect(r.filter((x) => x.action === "write_now").length).toBe(2);
  });
  it("stale and duplicate candidates are dropped before any slot is used", () => {
    const r = byId(triage([{ ...A, id: "old", firstSeenAt: t(49 * 60) }, { ...A, id: "dup", novelty: 0.2 }], OPTS));
    expect(r.old!.action).toBe("drop");
    expect(r.old!.reasons[0]).toMatch(/^stale/);
    expect(r.dup!.reasons).toContain("duplicate");
  });
  it("queued items that expire before the next window are dropped; category freshness overrides", () => {
    const w: Candidate = { ...A, id: "w", category: "weather", lang: "en", firstSeenAt: t(11.5 * 60) };
    const r = byId(triage([w], { ...OPTS, slots: { perHour: { en: 0 } } }));
    expect(r.w!.action).toBe("drop");
    expect(r.w!.reasons).toContain("expires_before_next_slot");
  });
  it("category quotas, then priority order fills the slots", () => {
    const xs = [0.9, 0.5, 0.1].map((tr, i) => ({ ...A, id: `p${i}`, lang: "en", category: "sports", trend: tr }));
    const r = byId(triage(xs, { ...OPTS, quotas: { sports: 1 } }));
    expect([r.p0!.action, r.p1!.action, r.p2!.action]).toEqual(["write_now", "queue", "queue"]);
    expect(r.p1!.reasons).toContain("quota:sports");
  });
  it("registrable domains", () => {
    expect(registrableDomain("https://www.sebon.gov.np/x")).toBe("sebon.gov.np");
    expect(registrableDomain("news.bbc.co.uk")).toBe("bbc.co.uk");
    expect(registrableDomain("a.b.example.com")).toBe("example.com");
    expect(registrableDomain("ekantipur.com")).toBe("ekantipur.com");
  });
  it("deterministic and describe()", () => {
    expect(triage([A, B, C, D, E, F], OPTS)).toEqual(triage([F, E, D, C, B, A], OPTS));
    expect(describeApi().commands[0]!.name).toBe("triage");
  });
});
