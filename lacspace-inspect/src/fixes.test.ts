import { describe, it, expect } from "vitest";
import { attachFixes, fixFor, FIXES } from "./fixes.js";
import { analyzeHtml } from "./checks.js";
import type { Finding, Report } from "./types.js";

const find = (r: Report, id: string): Finding | undefined =>
  r.categories.flatMap((c) => c.findings).find((f) => f.id === id);

describe("fix suggestions", () => {
  it("attaches a fix to warn/fail findings only, never to ok/info", () => {
    const fs: Finding[] = [
      { id: "seo.title", status: "fail", message: "" },
      { id: "seo.canonical", status: "warn", message: "" },
      { id: "seo.viewport", status: "ok", message: "" },
      { id: "content.alt", status: "info", message: "" },
    ];
    attachFixes(fs);
    expect(fs[0]!.fix).toContain("<title>");
    expect(fs[1]!.fix).toContain("canonical");
    expect(fs[2]!.fix).toBeUndefined();
    expect(fs[3]!.fix).toBeUndefined();
  });

  it("falls back to a family prefix (e.g. budget.foo → budget)", () => {
    expect(fixFor("sec.hsts")).toBe(FIXES["sec.hsts"]);
    expect(fixFor("budget.images")).toBe(FIXES["budget.images"]);
    expect(fixFor("nope.unknown")).toBeUndefined();
  });

  it("analyzeHtml populates fixes on real failing findings", () => {
    const r = analyzeHtml("<html><body><p>hi</p></body></html>", { url: "https://example.com/" });
    const title = find(r, "seo.title")!;
    expect(title.status).toBe("fail");
    expect(title.fix).toBeTruthy();
    // A passing/absent-graded finding keeps no fix.
    const https = find(r, "sec.https")!;
    expect(https.status).toBe("ok");
    expect(https.fix).toBeUndefined();
  });
});
