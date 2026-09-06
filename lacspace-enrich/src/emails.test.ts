import { describe, it, expect } from "vitest";
import { guessEmails, detectPatternFromEmail, splitName } from "./emails.js";

describe("splitName", () => {
  it("splits first/last and strips accents", () => {
    expect(splitName("Jane Doe")).toEqual({ first: "jane", last: "doe", middle: [] });
    expect(splitName("José  Ñañez")).toEqual({ first: "jose", last: "nanez", middle: [] });
    expect(splitName("Madonna")).toEqual({ first: "madonna", last: "", middle: [] });
    expect(splitName("Mary Jane Watson")).toEqual({ first: "mary", last: "watson", middle: ["jane"] });
  });
});

describe("guessEmails", () => {
  it("produces ranked, de-duped addresses at the domain", () => {
    const g = guessEmails("Jane Doe", "https://www.Acme.com/");
    const emails = g.map((x) => x.email);
    expect(emails).toContain("jane.doe@acme.com");
    expect(emails).toContain("jdoe@acme.com");
    expect(emails).toContain("jane@acme.com");
    // ranked: first.last is the strongest default.
    expect(g[0]!.email).toBe("jane.doe@acme.com");
    // sorted descending by confidence.
    for (let i = 1; i < g.length; i++) expect(g[i - 1]!.confidence).toBeGreaterThanOrEqual(g[i]!.confidence);
  });

  it("promotes the org's real pattern from a known colleague", () => {
    const g = guessEmails("Jane Doe", "acme.com", { knownContact: { name: "Bob Smith", email: "bsmith@acme.com" } });
    // Bob Smith → bsmith = flast, so flast should now rank first at confidence 1.
    expect(g[0]).toMatchObject({ email: "jdoe@acme.com", pattern: "flast", confidence: 1 });
  });

  it("promotes a known email for the same person", () => {
    const g = guessEmails("Jane Doe", "acme.com", { knownEmail: "jane.doe@acme.com" });
    expect(g[0]).toMatchObject({ pattern: "first.last", confidence: 1 });
  });

  it("honours limit and a custom pattern list", () => {
    const g = guessEmails("Jane Doe", "acme.com", { patterns: ["first", "first.last"], limit: 1 });
    expect(g).toHaveLength(1);
    expect(g[0]!.pattern).toBe("first.last");
  });
});

describe("detectPatternFromEmail", () => {
  it("recognises the pattern behind a known address", () => {
    expect(detectPatternFromEmail("jane.doe@acme.com", "Jane Doe")).toBe("first.last");
    expect(detectPatternFromEmail("jdoe@acme.com", "Jane Doe")).toBe("flast");
    expect(detectPatternFromEmail("jane@acme.com", "Jane Doe")).toBe("first");
    expect(detectPatternFromEmail("xyz@acme.com", "Jane Doe")).toBeUndefined();
  });
});
