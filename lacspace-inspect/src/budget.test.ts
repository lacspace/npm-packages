import { describe, it, expect } from "vitest";
import { parseBudget, parseBudgetDetailed, evaluateBudget, budgetExceeded, metricValue } from "./budget.js";
import { analyzeHtml } from "./checks.js";
import type { Report } from "./types.js";

const HTTPS = "https://example.com/";

/** A report with a few external scripts + images so budgets have something to bite on. */
function sampleReport(): Report {
  const html = `<head><title>Budget sample page title</title>
    <script src="/a.js"></script><script src="/b.js"></script><script src="/c.js"></script>
    </head><body><img src="/1.png"><img src="/2.png"></body>`;
  return analyzeHtml(html, { url: HTTPS });
}

describe("parseBudget", () => {
  it("parses metrics, operators and size/time units", () => {
    const b = parseBudget("html<100kb, scripts<10, images<=20, responsetime<600ms");
    expect(b).toHaveLength(4);
    expect(b[0]).toMatchObject({ metric: "html", op: "<", value: 100 * 1024 });
    expect(b[1]).toMatchObject({ metric: "scripts", op: "<", value: 10 });
    expect(b[2]).toMatchObject({ metric: "images", op: "<=", value: 20 });
    expect(b[3]).toMatchObject({ metric: "responsetime", op: "<", value: 600 });
  });

  it("reports errors for unknown metrics / bad values", () => {
    const { budgets, errors } = parseBudgetDetailed("frobs<10, scripts<abc, js<5");
    expect(budgets).toHaveLength(1); // only js<5 (alias of scripts)
    expect(budgets[0]!.metric).toBe("scripts");
    expect(errors.length).toBe(2);
  });
});

describe("evaluateBudget", () => {
  it("fails when a metric exceeds its budget and passes when within", () => {
    const r = sampleReport();
    expect(metricValue(r, "scripts")).toBe(3);

    const over = evaluateBudget(r, parseBudget("scripts<2"));
    expect(budgetExceeded(over)).toBe(true);
    expect(over.findings.find((f) => f.id === "budget.scripts")!.status).toBe("fail");
    expect(over.weight).toBe(0); // never changes the overall grade

    const ok = evaluateBudget(r, parseBudget("scripts<10,images<20"));
    expect(budgetExceeded(ok)).toBe(false);
    expect(ok.findings.every((f) => f.status === "ok")).toBe(true);
  });

  it("marks unmeasured metrics as info, not a failure", () => {
    const r = sampleReport(); // no responseTimeMs on a pure report
    const cat = evaluateBudget(r, parseBudget("responsetime<600"));
    expect(cat.findings.find((f) => f.id === "budget.responsetime")!.status).toBe("info");
    expect(budgetExceeded(cat)).toBe(false);
  });
});
