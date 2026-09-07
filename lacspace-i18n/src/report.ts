/**
 * Render an {@link I18nReport} as a human table (with coverage bars), Markdown,
 * or JSON. The human renderer accepts an optional colorizer so the CLI can add
 * ANSI colour while tests can render plain text.
 */
import type { I18nReport } from "./check.js";

/** `(style, text) => text` — CLI passes a colour helper, tests pass identity. */
export type Colorize = (style: string, s: string) => string;
const plain: Colorize = (_s, t) => t;

function bar(pct: number, width = 12): string {
  const filled = Math.round((pct / 100) * width);
  return "█".repeat(Math.max(0, Math.min(width, filled))) + "░".repeat(Math.max(0, width - filled));
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
function padStart(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

function list(items: string[], limit = 12): string {
  if (items.length <= limit) return items.join(", ");
  return items.slice(0, limit).join(", ") + `, …and ${items.length - limit} more`;
}

/** Render the report as a coloured (or plain) human-readable string. */
export function renderHuman(report: I18nReport, c: Colorize = plain): string {
  const out: string[] = [];
  out.push("");
  out.push(`${c("bold", c("magenta", "◆ lacspace-i18n"))}  ${c("dim", report.dir)}`);
  out.push(`  ${c("dim", `base ${report.base} · ${report.baseTotal} keys · layout ${report.layout}`)}`);
  out.push("");

  const localeW = Math.max(6, ...report.locales.map((l) => l.locale.length));
  out.push(
    `  ${pad("Locale", localeW)}  ${pad("Coverage", 22)} ${padStart("miss", 5)} ${padStart("extra", 5)} ${padStart("empty", 5)} ${padStart("ident", 5)}`,
  );
  for (const l of report.locales) {
    const covColor = l.coverage >= 100 ? "green" : l.coverage >= 80 ? "cyan" : l.coverage >= 50 ? "yellow" : "red";
    const cov = `${c(covColor, bar(l.coverage))} ${padStart(l.coverage.toFixed(1) + "%", 6)}`;
    out.push(
      `  ${pad(l.locale, localeW)}  ${cov} ${padStart(String(l.missing.length), 5)} ${padStart(String(l.extra.length), 5)} ${padStart(String(l.empty.length), 5)} ${padStart(String(l.identical.length), 5)}`,
    );
  }
  out.push("");

  for (const l of report.locales) {
    if (!l.missing.length && !l.extra.length && !l.empty.length) continue;
    out.push(`  ${c("bold", l.locale)}`);
    if (l.missing.length) out.push(`    ${c("red", `missing (${l.missing.length})`)}  ${c("dim", list(l.missing))}`);
    if (l.empty.length) out.push(`    ${c("yellow", `empty (${l.empty.length})`)}    ${c("dim", list(l.empty))}`);
    if (l.extra.length) out.push(`    ${c("yellow", `extra (${l.extra.length})`)}    ${c("dim", list(l.extra))}`);
  }
  if (report.locales.some((l) => l.missing.length || l.extra.length || l.empty.length)) out.push("");

  if (report.placeholders.length) {
    out.push(`  ${c("bold", c("magenta", `Placeholder / interpolation mismatches (${report.placeholders.length})`))}`);
    for (const p of report.placeholders.slice(0, 20)) {
      const bits: string[] = [];
      if (p.missing.length) bits.push(c("red", `missing ${p.missing.join(" ")}`));
      if (p.extra.length) bits.push(c("yellow", `extra ${p.extra.join(" ")}`));
      out.push(`    ${c("cyan", p.locale)}  ${p.key}  ${bits.join("  ")}`);
    }
    if (report.placeholders.length > 20) out.push(`    ${c("dim", `…and ${report.placeholders.length - 20} more`)}`);
    out.push("");
  }

  if (report.malformed.length) {
    out.push(`  ${c("bold", c("red", `Malformed ICU (${report.malformed.length})`))}`);
    for (const m of report.malformed.slice(0, 20)) {
      out.push(`    ${c("cyan", m.locale)}  ${m.key}  ${c("dim", m.errors.join("; "))}`);
    }
    out.push("");
  }

  if (report.code) {
    out.push(`  ${c("bold", "Code scan")} ${c("dim", `· ${report.code.files} files · ${report.code.used.size} keys used · ${report.code.dynamic} dynamic usage(s)`)}`);
    if (report.code.undefinedKeys.length) {
      out.push(`    ${c("red", `undefined in base (${report.code.undefinedKeys.length})`)}  ${c("dim", list(report.code.undefinedKeys))}`);
    }
    if (report.code.dead.length) {
      out.push(`    ${c("yellow", `dead / unused (${report.code.dead.length})`)}  ${c("dim", list(report.code.dead))}`);
    }
    if (report.code.dynamic > 0) {
      out.push(`    ${c("dim", `note: ${report.code.dynamic} dynamic t(var) usage(s) can't be resolved — dead results are advisory; use --ignore`)}`);
    }
    out.push("");
  }

  const p = report.problems;
  const bad = p.missing + p.empty + p.icu + p.undefinedKeys;
  if (bad === 0 && p.extra === 0 && p.dead === 0) {
    out.push(`  ${c("green", "✓ all locales healthy")}`);
  } else {
    const parts: string[] = [];
    if (p.missing) parts.push(`missing ${p.missing}`);
    if (p.empty) parts.push(`empty ${p.empty}`);
    if (p.extra) parts.push(`extra ${p.extra}`);
    if (p.icu) parts.push(`icu ${p.icu}`);
    if (p.undefinedKeys) parts.push(`undefined ${p.undefinedKeys}`);
    if (p.dead) parts.push(`dead ${p.dead}`);
    out.push(`  ${c("yellow", "▲ " + parts.join(" · "))}`);
  }
  out.push("");
  return out.join("\n");
}

/** Render the report as Markdown. */
export function renderMarkdown(report: I18nReport): string {
  const out: string[] = [];
  out.push(`# i18n report — \`${report.dir}\``);
  out.push("");
  out.push(`Base locale: \`${report.base}\` · ${report.baseTotal} keys · layout: ${report.layout}`);
  out.push("");
  out.push("| Locale | Coverage | Missing | Extra | Empty | Identical |");
  out.push("| --- | --- | --- | --- | --- | --- |");
  for (const l of report.locales) {
    out.push(`| ${l.locale} | ${l.coverage.toFixed(1)}% | ${l.missing.length} | ${l.extra.length} | ${l.empty.length} | ${l.identical.length} |`);
  }
  out.push("");
  for (const l of report.locales) {
    if (!l.missing.length && !l.empty.length && !l.extra.length) continue;
    out.push(`## ${l.locale}`);
    if (l.missing.length) out.push(`- **Missing (${l.missing.length}):** ${l.missing.join(", ")}`);
    if (l.empty.length) out.push(`- **Empty (${l.empty.length}):** ${l.empty.join(", ")}`);
    if (l.extra.length) out.push(`- **Extra (${l.extra.length}):** ${l.extra.join(", ")}`);
    out.push("");
  }
  if (report.placeholders.length) {
    out.push(`## Placeholder / interpolation mismatches (${report.placeholders.length})`);
    for (const p of report.placeholders) {
      const bits = [p.missing.length ? `missing ${p.missing.join(" ")}` : "", p.extra.length ? `extra ${p.extra.join(" ")}` : ""].filter(Boolean);
      out.push(`- \`${p.locale}\` — \`${p.key}\`: ${bits.join("; ")}`);
    }
    out.push("");
  }
  if (report.malformed.length) {
    out.push(`## Malformed ICU (${report.malformed.length})`);
    for (const m of report.malformed) out.push(`- \`${m.locale}\` — \`${m.key}\`: ${m.errors.join("; ")}`);
    out.push("");
  }
  if (report.code) {
    out.push(`## Code scan`);
    out.push(`${report.code.files} files scanned · ${report.code.used.size} keys used · ${report.code.dynamic} dynamic usage(s).`);
    if (report.code.undefinedKeys.length) out.push(`- **Undefined in base (${report.code.undefinedKeys.length}):** ${report.code.undefinedKeys.join(", ")}`);
    if (report.code.dead.length) out.push(`- **Dead / unused (${report.code.dead.length}):** ${report.code.dead.join(", ")}`);
    out.push("");
  }
  return out.join("\n") + "\n";
}

/** The report as a plain JSON-serializable object (Sets expanded to arrays). */
export function toJson(report: I18nReport): Record<string, unknown> {
  return {
    dir: report.dir,
    base: report.base,
    baseTotal: report.baseTotal,
    layout: report.layout,
    locales: report.locales,
    placeholders: report.placeholders,
    malformed: report.malformed,
    code: report.code
      ? {
          files: report.code.files,
          dynamic: report.code.dynamic,
          used: [...report.code.used].sort(),
          dead: report.code.dead,
          undefined: report.code.undefinedKeys,
        }
      : null,
    problems: report.problems,
  };
}
