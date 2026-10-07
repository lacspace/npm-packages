import { describe, expect, it } from "vitest";
import {
  AUTOMATED,
  CALENDAR,
  CALENDAR_SUBJECT,
  CATEGORIES,
  CATEGORY_META,
  FOCUSED,
  NOTIF_DOM,
  SOCIAL_DOM,
  categoryMeta,
  classify,
  createClassifier,
  getHeader,
  isCategory,
  parseAddress,
  splitAddressList,
} from "./index";

const ME = "me@acme.com";
const base = { mailboxAddress: ME, to: [ME] };

describe("parseAddress", () => {
  it("parses a bare address", () => expect(parseAddress("Anita@X.com")).toEqual({ name: "", address: "anita@x.com" }));
  it("parses name <address>", () => expect(parseAddress('"Anita K" <anita@x.com>')).toEqual({ name: "Anita K", address: "anita@x.com" }));
  it("accepts objects", () => expect(parseAddress({ name: "Bo", address: "BO@Y.COM" })).toEqual({ name: "Bo", address: "bo@y.com" }));
  it("never throws on junk", () => {
    expect(parseAddress(null)).toEqual({ name: "", address: "" });
    expect(parseAddress(42 as unknown as string)).toEqual({ name: "", address: "" });
    expect(parseAddress({} as { address: string })).toEqual({ name: "", address: "" });
  });
  it("splits address lists respecting quotes", () => {
    expect(splitAddressList('a@x.com, "Doe, Jo" <jo@y.com>; c@z.com')).toEqual(["a@x.com", '"Doe, Jo" <jo@y.com>', "c@z.com"]);
  });
});

describe("categories", () => {
  it("has the 10 categories and the focused subset", () => {
    expect(CATEGORIES).toHaveLength(10);
    expect(FOCUSED.every((c) => CATEGORIES.includes(c))).toBe(true);
    expect(isCategory("finance")).toBe(true);
    expect(isCategory("spam")).toBe(false);
  });

  it("calendar: invite flag", () => {
    const r = classify({ ...base, from: "a@client.io", subject: "hello", hasInvite: true });
    expect(r.category).toBe("calendar");
    expect(r.reasons[0]).toBe("calendar:invite");
  });
  it("calendar: .ics mention", () => expect(classify({ ...base, from: "a@client.io", snippet: "see invite.ics" }).category).toBe("calendar"));
  it("calendar: invitation subject", () => expect(classify({ ...base, from: "a@client.io", subject: "Accepted: Sync" }).category).toBe("calendar"));
  it("calendar: text/calendar content-type header", () => {
    const r = classify({ ...base, from: "a@client.io", subject: "hi", headers: { "content-type": "text/calendar; method=REQUEST" } });
    expect(r.category).toBe("calendar");
    expect(r.reasons).toContain("header:calendar");
  });
  it("calendar: meeting words from a person late in the cascade", () => {
    const r = classify({ ...base, from: "raj@partnerco.com", subject: "Quick call tomorrow" });
    expect(r.category).toBe("calendar");
    expect(r.reasons[0]).toBe("calendar:words");
  });

  it("social: linkedin domain", () => expect(classify({ ...base, from: "messages-noreply@linkedin.com", subject: "You appeared in 5 searches" }).category).toBe("social"));
  it("social: x.com now matches (source regex required x.com.)", () => expect(classify({ ...base, from: "info@x.com", subject: "hey" }).category).toBe("social"));
  it("social: lookalike domain does not match", () => expect(SOCIAL_DOM.test("mylinkedin.com")).toBe(false));

  it("finance: subject", () => expect(classify({ ...base, from: "acc@vendor.com", subject: "Invoice #442" }).category).toBe("finance"));
  it("finance: snippet needs a confirm word", () => {
    expect(classify({ ...base, from: "acc@vendor.com", subject: "Hello", snippet: "Your payment of USD 20 went through" }).category).toBe("finance");
    expect(classify({ ...base, from: "jo@vendor.com", subject: "Hello", snippet: "the balance of the design" }).category).toBe("clients");
  });

  it("recruiting: subject", () => expect(classify({ ...base, from: "cand@gmail.com", subject: "Application for frontend role" }).category).toBe("recruiting"));
  it("recruiting: snippet with CV", () => expect(classify({ ...base, from: "cand@gmail.com", subject: "Hi", snippet: "Attached my CV for the job" }).category).toBe("recruiting"));

  it("promotions: subject", () => expect(classify({ ...base, from: "shop@brand.com", subject: "Flash sale: 50% off" }).category).toBe("promotions"));

  it("newsletters: isList", () => expect(classify({ ...base, from: "editor@blog.com", subject: "Thoughts", isList: true }).category).toBe("newsletters"));
  it("newsletters: List-Id header", () => {
    const r = classify({ ...base, from: "editor@blog.com", subject: "Thoughts", headers: { "List-Id": "<blog.example>" } });
    expect(r.category).toBe("newsletters");
    expect(r.reasons).toContain("header:list");
  });
  it("newsletters: explicit isList:false beats headers", () => {
    expect(classify({ ...base, from: "editor@blog.com", subject: "Thoughts", isList: false, headers: { "List-Id": "x" } }).category).toBe("clients");
  });
  it("newsletters: words", () => expect(classify({ ...base, from: "editor@blog.com", subject: "This week in design" }).category).toBe("newsletters"));

  it("notifications: automated sender", () => {
    const r = classify({ ...base, from: "no-reply@service.io", subject: "Your build passed" });
    expect(r.category).toBe("notifications");
    expect(r.reasons[0]).toBe("notifications:automated-sender");
  });
  it("notifications: known service domain", () => expect(classify({ ...base, from: "ana@github.com", subject: "New sign-in" }).category).toBe("notifications"));
  it("notifications: Auto-Submitted header", () => {
    const r = classify({ ...base, from: "ana@service.io", subject: "Done", headers: new Map([["auto-submitted", "auto-generated"]]) });
    expect(r.category).toBe("notifications");
  });
  it("notifications: lookalike service domain does not match", () => expect(NOTIF_DOM.test("pineapple.com")).toBe(false));

  it("team: same domain", () => expect(classify({ ...base, from: "Sita <sita@acme.com>", subject: "Plan" }).category).toBe("team"));
  it("personal: free mail", () => expect(classify({ ...base, from: "friend@gmail.com", subject: "Dinner" }).category).toBe("personal"));
  it("clients: default", () => expect(classify({ ...base, from: "ceo@bigcorp.com", subject: "Project scope" }).category).toBe("clients"));
});

describe("priority", () => {
  it("high: direct, urgent, question, client", () => {
    const r = classify({ ...base, from: "ceo@bigcorp.com", subject: "Urgent: can you review?" });
    expect(r.priority).toBe("high");
    expect(r.score).toBe(2 + 1 + 2 + 1);
  });
  it("known sender adds 2", () => {
    const a = classify({ ...base, from: "ceo@bigcorp.com", subject: "Hello" });
    const b = classify({ ...base, from: "ceo@bigcorp.com", subject: "Hello", knownSender: true });
    expect(b.score - a.score).toBe(2);
  });
  it("finance adds 1 on top of focused", () => expect(classify({ ...base, from: "a@v.com", subject: "Receipt" }).score).toBe(2 + 1 + 1));
  it("low: promotions", () => expect(classify({ ...base, from: "shop@brand.com", subject: "Big sale" }).priority).toBe("low"));
  it("low: list mail", () => expect(classify({ ...base, from: "x@blog.com", subject: "Thoughts", isList: true }).priority).toBe("low"));
  it("many recipients subtracts 1", () => {
    const many = Array.from({ length: 7 }, (_, k) => `p${k}@bigcorp.com`);
    const r = classify({ mailboxAddress: ME, from: "ceo@bigcorp.com", to: many, subject: "Hello" });
    expect(r.reasons).toContain("-1 many recipients");
  });
  it("normal in between", () => expect(classify({ ...base, from: "ceo@bigcorp.com", subject: "Hello" }).priority).toBe("normal"));
  it("thresholds are configurable", () => {
    expect(classify({ ...base, from: "ceo@bigcorp.com", subject: "Hello" }, { highAt: 3 }).priority).toBe("high");
  });
});

describe("options and exports", () => {
  it("exports the AUTOMATED, NOTIF_DOM and CALENDAR regexes", () => {
    expect(AUTOMATED.test("noreply@x.com")).toBe(true);
    expect(AUTOMATED.test("anita@x.com")).toBe(false);
    expect(NOTIF_DOM.test("github.com")).toBe(true);
    expect(CALENDAR.test("Team meeting")).toBe(true);
    expect(CALENDAR_SUBJECT.test("Invitation: Demo")).toBe(true);
  });
  it("patterns are overridable", () => {
    const r = classify({ ...base, from: "ana@mycrm.io", subject: "Ping" }, { patterns: { notificationDomain: /(^|\.)mycrm\./i } });
    expect(r.category).toBe("notifications");
  });
  it("an overridden AUTOMATED can disable the sender check", () => {
    const r = classify({ ...base, from: "support@vendor.com", subject: "Re: plan" }, { patterns: { automated: /^$/ } });
    expect(r.category).toBe("clients");
  });
  it("global-flag patterns are safe to reuse", () => {
    const re = /promo/gi;
    const c = createClassifier({ patterns: { promo: re } });
    expect(c({ ...base, from: "a@b.com", subject: "promo" }).category).toBe("promotions");
    expect(c({ ...base, from: "a@b.com", subject: "promo" }).category).toBe("promotions");
  });
  it("focused list is overridable", () => {
    const r = classify({ ...base, from: "ceo@bigcorp.com", subject: "Hello" }, { focused: [] });
    expect(r.reasons).not.toContain("+2 focused category");
  });
  it("CATEGORY_META has labels and colours for every category", () => {
    for (const c of CATEGORIES) {
      expect(CATEGORY_META[c].label).toBeTruthy();
      expect(CATEGORY_META[c].color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it("categoryMeta merges overrides without mutating the default", () => {
    const m = categoryMeta({ clients: { label: "Customers" } });
    expect(m.clients.label).toBe("Customers");
    expect(m.clients.color).toBe(CATEGORY_META.clients.color);
    expect(CATEGORY_META.clients.label).toBe("Clients");
  });
  it("getHeader handles plain objects, Maps and Headers-like objects", () => {
    expect(getHeader({ "LIST-ID": "x" }, "list-id")).toBe("x");
    expect(getHeader(new Map([["list-id", "y"]]) as unknown as { get(n: string): string }, "List-Id")).toBe("y");
    expect(getHeader({ a: ["1", "2"] }, "A")).toBe("1, 2");
    expect(getHeader(null, "x")).toBeUndefined();
  });
});

describe("robustness", () => {
  it("never throws on malformed input", () => {
    expect(() => classify(undefined as never)).not.toThrow();
    expect(() => classify({ from: null } as never)).not.toThrow();
    expect(() => classify({ from: 5, to: "x", cc: [null, {}], subject: 3 } as never)).not.toThrow();
    expect(classify({ from: "" }).category).toBe("clients");
  });
  it("works without a mailbox address", () => {
    const r = classify({ from: "a@bigcorp.com", subject: "Hi" });
    expect(r.category).toBe("clients");
    expect(r.reasons).not.toContain("+1 sent directly to me");
  });
  it("to accepts a comma-separated string", () => {
    const r = classify({ from: "a@bigcorp.com", subject: "Hi", mailboxAddress: ME, to: `x@y.com, Me <${ME}>` });
    expect(r.reasons).toContain("+1 sent directly to me");
  });
});

describe("README example", () => {
  it("matches the documented output", () => {
    const r = classify({
      from: "Raj Patel <raj@partnerco.com>",
      to: ["me@acme.com"],
      subject: "Urgent: can you review the quote?",
      snippet: "Attached is the revised estimate…",
      mailboxAddress: "me@acme.com",
    });
    expect(r).toEqual({
      category: "finance",
      priority: "high",
      score: 7,
      reasons: ["finance:subject", "+2 focused category", "+1 sent directly to me", "+2 urgent words", "+1 question", "+1 finance"],
    });
  });
});
