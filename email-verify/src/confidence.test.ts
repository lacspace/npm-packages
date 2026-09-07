import { test, expect } from "vitest";
import { scoreConfidence } from "./confidence";

// Pure aggregator — no network, no I/O.

test("invalid syntax → score 0, high risk", () => {
  const r = scoreConfidence({ syntax: false, mxFound: false, disposable: false, role: false });
  expect(r.score).toBe(0);
  expect(r.risk).toBe("high");
  expect(r.reasons).toContain("invalid syntax");
});

test("SMTP deliverable on a clean domain → high confidence, low risk", () => {
  const r = scoreConfidence({
    syntax: true,
    mxFound: true,
    disposable: false,
    role: false,
    smtp: "deliverable",
  });
  expect(r.score).toBeGreaterThanOrEqual(70);
  expect(r.risk).toBe("low");
  expect(r.reasons).toContain("SMTP accepted recipient");
});

test("catch-all lowers the score of an otherwise-deliverable address", () => {
  const clean = scoreConfidence({
    syntax: true,
    mxFound: true,
    disposable: false,
    role: false,
    smtp: "deliverable",
  });
  const catchAll = scoreConfidence({
    syntax: true,
    mxFound: true,
    disposable: false,
    role: false,
    smtp: "deliverable",
    catchAll: true,
  });
  expect(catchAll.score).toBeLessThan(clean.score);
  expect(catchAll.reasons.join(" ")).toMatch(/catch-all/i);
});

test("SMTP undeliverable is a hard negative", () => {
  const r = scoreConfidence({
    syntax: true,
    mxFound: true,
    disposable: false,
    role: false,
    smtp: "undeliverable",
  });
  expect(r.score).toBeLessThan(10);
  expect(r.risk).toBe("high");
});

test("disposable domain drags the score down", () => {
  const normal = scoreConfidence({ syntax: true, mxFound: true, disposable: false, role: false, smtp: "unknown" });
  const disposable = scoreConfidence({ syntax: true, mxFound: true, disposable: true, role: false, smtp: "unknown" });
  expect(disposable.score).toBeLessThan(normal.score);
  expect(disposable.reasons.join(" ")).toMatch(/disposable/i);
});

test("role account applies a smaller penalty than disposable", () => {
  const base = scoreConfidence({ syntax: true, mxFound: true, disposable: false, role: false, smtp: "unknown" }).score;
  const role = scoreConfidence({ syntax: true, mxFound: true, disposable: false, role: true, smtp: "unknown" }).score;
  const disposable = scoreConfidence({ syntax: true, mxFound: true, disposable: true, role: false, smtp: "unknown" }).score;
  expect(role).toBeLessThan(base);
  expect(disposable).toBeLessThan(role);
});

test("no MX records lowers confidence even with valid syntax", () => {
  const withMx = scoreConfidence({ syntax: true, mxFound: true, disposable: false, role: false, smtp: "unknown" });
  const noMx = scoreConfidence({ syntax: true, mxFound: false, disposable: false, role: false, smtp: "unknown" });
  expect(noMx.score).toBeLessThan(withMx.score);
  expect(noMx.reasons).toContain("no MX records for domain");
});

test("score is always clamped to 0–100", () => {
  const worst = scoreConfidence({
    syntax: true,
    mxFound: false,
    disposable: true,
    role: true,
    catchAll: true,
    smtp: "unknown",
  });
  expect(worst.score).toBeGreaterThanOrEqual(0);
  expect(worst.score).toBeLessThanOrEqual(100);
});
