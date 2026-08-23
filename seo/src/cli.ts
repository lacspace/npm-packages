/**
 * @lacspace/seo CLI — grade a live page's on-page SEO.
 *
 *   npx @lacspace/seo audit https://example.com
 *   npx @lacspace/seo audit https://example.com --json
 */
import { auditHtml, type SeoAudit, type SeoCheck } from "./index";

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m", cyan: "\x1b[36m",
};
const paint = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;

const ICON: Record<SeoCheck["status"], string> = {
  pass: paint("green", "✔"),
  warn: paint("yellow", "▲"),
  fail: paint("red", "✘"),
};

function gradeColor(grade: SeoAudit["grade"]): string {
  if (grade === "A" || grade === "B") return paint("green", grade);
  if (grade === "C" || grade === "D") return paint("yellow", grade);
  return paint("red", grade);
}

const HELP = `
${paint("bold", "@lacspace/seo")} — audit a page's on-page SEO

${paint("bold", "Usage")}
  npx @lacspace/seo audit <url> [--json]

${paint("bold", "Options")}
  --json     Print the report as JSON (for CI / tooling)
  -h,--help  Show this help

${paint("bold", "Exit code")}
  Non-zero if any check fails — wire it into CI.
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    process.stdout.write(HELP + "\n");
    return;
  }
  const json = args.includes("--json");
  const rest = args.filter((a) => a !== "audit" && !a.startsWith("--"));
  let url = rest[0];
  if (!url) {
    process.stderr.write(paint("red", "\n✘ Provide a URL: npx @lacspace/seo audit https://example.com\n\n"));
    process.exit(1);
    return;
  }
  if (!/^https?:\/\//.test(url)) url = `https://${url}`;

  let html: string;
  try {
    const res = await fetch(url, { headers: { "user-agent": "lacspace-seo-audit" }, redirect: "follow" });
    if (!res.ok) {
      process.stderr.write(paint("red", `\n✘ ${url} returned HTTP ${res.status}.\n\n`));
      process.exit(1);
      return;
    }
    html = await res.text();
  } catch (err) {
    process.stderr.write(paint("red", `\n✘ Could not fetch ${url}: ${err instanceof Error ? err.message : String(err)}\n\n`));
    process.exit(1);
    return;
  }

  const report = auditHtml(html, { url });

  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    process.exit(report.failed > 0 ? 1 : 0);
    return;
  }

  process.stdout.write(`\n${paint("bold", "SEO audit")} ${paint("dim", report.url ?? "")}\n\n`);
  const bar = "█".repeat(Math.round(report.score / 5)).padEnd(20, "░");
  process.stdout.write(`  Score ${paint("bold", String(report.score))}/100   Grade ${paint("bold", gradeColor(report.grade))}\n`);
  process.stdout.write(`  ${paint(report.score >= 80 ? "green" : report.score >= 60 ? "yellow" : "red", bar)}\n\n`);

  for (const c of report.checks) {
    process.stdout.write(`  ${ICON[c.status]} ${c.label.padEnd(18)} ${paint("dim", c.detail)}\n`);
  }

  process.stdout.write(
    `\n  ${paint("green", `${report.passed} passed`)} · ${paint("yellow", `${report.warnings} warnings`)} · ${paint("red", `${report.failed} failed`)}\n`,
  );
  process.stdout.write(`\n${paint("dim", "  SEO Kit → https://lacspace.com/packages")}\n\n`);
  process.exit(report.failed > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  process.stderr.write(paint("red", `\n✘ ${err instanceof Error ? err.message : String(err)}\n\n`));
  process.exit(1);
});
