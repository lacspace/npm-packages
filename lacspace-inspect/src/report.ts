/**
 * Terminal formatter — render a {@link Report} as a clean, sectioned, coloured
 * report: an overall grade banner, per-category grades, and the failing/warning
 * findings under each (passing findings are summarised as a count).
 */
import type { Category, Finding, Grade, Report } from "./types.js";

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m", blue: "\x1b[34m",
};
const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;

function gradeColor(g: Grade | null): keyof typeof C {
  switch (g) {
    case "A": return "green";
    case "B": return "cyan";
    case "C": return "yellow";
    case "D": return "yellow";
    case "F": return "red";
    default: return "dim";
  }
}

function icon(status: Finding["status"]): string {
  switch (status) {
    case "ok": return c("green", "✔");
    case "warn": return c("yellow", "▲");
    case "fail": return c("red", "✗");
    default: return c("blue", "ℹ");
  }
}

function bar(score: number | null): string {
  if (score === null) return c("dim", "─".repeat(20));
  const filled = Math.round((score / 100) * 20);
  const col = gradeColor(score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F");
  return c(col, "█".repeat(filled)) + c("dim", "░".repeat(20 - filled));
}

function categoryBlock(cat: Category, verbose: boolean): string {
  const head = cat.score === null
    ? `${c("bold", cat.title)} ${c("dim", "— not graded")}`
    : `${c(gradeColor(cat.grade), c("bold", cat.grade ?? "?"))}  ${c("bold", cat.title)}  ${bar(cat.score)} ${c("dim", String(cat.score))}`;

  const shown = cat.findings.filter((f) => verbose || f.status !== "ok");
  const okCount = cat.findings.filter((f) => f.status === "ok").length;
  const lines: string[] = [`  ${head}`];
  for (const f of shown) {
    lines.push(`     ${icon(f.status)} ${f.message}`);
    if (f.detail && f.status !== "ok") {
      for (const d of String(f.detail).split("\n").slice(0, 8)) lines.push(`         ${c("dim", d)}`);
    }
    if (f.fix && (f.status === "warn" || f.status === "fail")) {
      lines.push(`         ${c("cyan", "→ fix:")} ${c("dim", f.fix)}`);
    }
  }
  if (!verbose && okCount > 0) lines.push(`     ${c("dim", `+ ${okCount} passing check${okCount === 1 ? "" : "s"}`)}`);
  return lines.join("\n");
}

/** Render a full terminal report. Set `verbose` to also list passing checks. */
export function formatReport(report: Report, verbose = false): string {
  const gc = gradeColor(report.grade);
  const banner = [
    "",
    `${c("bold", c("magenta", "◆ lacspace-inspect"))} ${c("dim", "— website audit")}`,
    "",
    `  ${c("dim", report.url)}`,
    `  ${c(gc, c("bold", `  ${report.grade}  `))} ${c("bold", `${report.score}/100`)}   ${bar(report.score)}`,
  ];
  if (report.httpStatus) banner.push(`  ${c("dim", `HTTP ${report.httpStatus} · ${report.https ? "HTTPS" : "HTTP"} · ${(report.stats.htmlBytes / 1024).toFixed(0)} KB`)}`);

  const cats = report.categories.map((cat) => categoryBlock(cat, verbose)).join("\n\n");

  const tech = report.tech.length
    ? `\n  ${c("bold", "Tech")}  ${report.tech.map((t) => c("cyan", t)).join(c("dim", " · "))}`
    : "";

  const fails = report.categories.flatMap((c2) => c2.findings).filter((f) => f.status === "fail").length;
  const warns = report.categories.flatMap((c2) => c2.findings).filter((f) => f.status === "warn").length;
  const footer = `\n  ${c("dim", `${fails} failing · ${warns} warning · overall grade `)}${c(gc, c("bold", report.grade))}`;

  return [banner.join("\n"), "", cats, tech, footer, ""].join("\n");
}
