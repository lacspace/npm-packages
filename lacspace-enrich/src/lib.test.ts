import { describe, it, expect } from "vitest";
import { flattenProfile, selectFields } from "./lib.js";
import type { EnrichedProfile } from "./types.js";

describe("flattenProfile", () => {
  it("keeps the classic columns unchanged when no v0.2 data is present", () => {
    const p: EnrichedProfile = { domain: "acme.com", name: "Acme", emails: ["hi@acme.com"], socials: { linkedin: "https://linkedin.com/company/acme" }, tech: ["Next.js"] };
    const row = flattenProfile(p);
    expect(row).toMatchObject({ domain: "acme.com", name: "Acme", emails: "hi@acme.com", linkedin: "https://linkedin.com/company/acme", tech: "Next.js" });
    // No new columns leak in when the features are off.
    expect(row.hasMx).toBeUndefined();
    expect(row.registrar).toBeUndefined();
    expect(row.page_about).toBeUndefined();
  });

  it("adds dns/registration/pages columns only when present", () => {
    const p: EnrichedProfile = {
      domain: "acme.com",
      dns: { hasMx: true, mailProvider: "Google Workspace", spfPolicy: "softfail", dmarcPolicy: "reject", dkim: true },
      emailStatus: { "hi@acme.com": "valid", "bad@acme.com": "no-mx" },
      registration: { source: "rdap", registrar: "MarkMonitor", createdAt: "2000-01-01", expiresAt: "2030-01-01", nameServers: ["ns1.x", "ns2.x"] },
      pages: { about: "https://acme.com/about", careers: "https://acme.com/jobs" },
      techDetailed: [{ name: "Stripe", category: "payment", confidence: 0.9, source: "js.stripe.com" }],
    };
    const row = flattenProfile(p);
    expect(row).toMatchObject({
      hasMx: "yes", mailProvider: "Google Workspace", spf: "softfail", dmarc: "reject", dkim: "yes",
      validEmails: "hi@acme.com", registrar: "MarkMonitor", created: "2000-01-01", expires: "2030-01-01",
      nameServers: "ns1.x; ns2.x", page_about: "https://acme.com/about", page_careers: "https://acme.com/jobs",
      techCategories: "payment",
    });
  });
});

describe("selectFields", () => {
  it("keeps only the requested columns in order, blanking missing", () => {
    const row = { domain: "acme.com", name: "Acme", tech: "Next.js" };
    expect(selectFields(row, ["name", "domain", "missing"])).toEqual({ name: "Acme", domain: "acme.com", missing: "" });
  });
});
