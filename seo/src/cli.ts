/**
 * @lacspace/seo CLI — grade on-page SEO for one page or an entire site.
 *
 *   npx @lacspace/seo audit https://example.com
 *   npx @lacspace/seo audit https://example.com --json
 *   npx @lacspace/seo crawl https://example.com --min-grade A   # audit the whole sitemap
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

type Grade = SeoAudit["grade"];
const GRADE_RANK: Record<Grade, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };

function gradeColor(grade: Grade): string {
  if (grade === "A" || grade === "B") return paint("green", grade);
  if (grade === "C" || grade === "D") return paint("yellow", grade);
  return paint("red", grade);
}

const HELP = `
${paint("bold", "@lacspace/seo")} — audit on-page SEO

${paint("bold", "Usage")}
  npx @lacspace/seo audit <url> [--json]
  npx @lacspace/seo crawl <sitemap-or-base-url> [options]

${paint("bold", "audit")}  — grade a single page
  --json            Print the report as JSON (for CI / tooling)

${paint("bold", "crawl")}  — grade every page in a sitemap and gate the build
  --min-grade <A-F> Fail if any page scores below this grade (default A)
  --min-score <n>   Fail if any page scores below this number (overrides grade)
  --limit <n>       Only audit the first N pages (default 100)
  --concurrency <n> Pages to fetch in parallel (default 6)
  --keep-origin     Follow the sitemap's own hosts (default: audit <base-url>)
  --json            Print the full report as JSON

${paint("bold", "Common")}
  -h, --help        Show this help

${paint("bold", "Exit code")}
  Non-zero if any page fails the threshold — wire it into CI so SEO can't regress.
`;

/* ------------------------------------------------------------------ *
 * Fetch helpers
 * ------------------------------------------------------------------ */

function normUrl(u: string): string {
  return /^https?:\/\//.test(u) ? u : `https://${u}`;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": "lacspace-seo-audit" }, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** Force `url` onto `baseOrigin`, keeping its path/query. Falsy base = no rewrite. */
function toOrigin(url: string, baseOrigin: string | null): string {
  if (!baseOrigin) return url;
  try {
    const u = new URL(url);
    const b = new URL(baseOrigin);
    u.protocol = b.protocol;
    u.host = b.host;
    return u.toString();
  } catch {
    return url;
  }
}

/** Pull <loc> URLs from a sitemap, following one level of sitemap-index nesting. */
async function collectSitemapUrls(entry: string, limit: number, sameOrigin: boolean): Promise<string[]> {
  const start = entry.endsWith(".xml") ? entry : `${entry.replace(/\/$/, "")}/sitemap.xml`;
  const baseOrigin = sameOrigin ? entry : null;
  const seen = new Set<string>();
  const pages: string[] = [];

  async function pull(sitemapUrl: string, depth: number): Promise<void> {
    if (pages.length >= limit || depth > 2) return;
    let xml: string;
    try {
      xml = await fetchText(sitemapUrl);
    } catch {
      return;
    }
    const rawLocs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]!);
    const locs = rawLocs.map((l) => toOrigin(l, baseOrigin));
    const nested = locs.filter((l) => l.endsWith(".xml"));
    const leaves = locs.filter((l) => !l.endsWith(".xml"));
    for (const p of leaves) {
      if (pages.length >= limit) break;
      if (!seen.has(p)) {
        seen.add(p);
        pages.push(p);
      }
    }
    for (const s of nested) {
      if (pages.length >= limit) break;
      await pull(s, depth + 1);
    }
  }

  await pull(start, 0);
  return pages;
}

/** Run tasks with a bounded concurrency pool, preserving input order. */
async function pool<T, R>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}

/* ------------------------------------------------------------------ *
 * Commands
 * ------------------------------------------------------------------ */

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function runAudit(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const rest = args.filter((a) => a !== "audit" && !a.startsWith("--"));
  let url = rest[0];
  if (!url) {
    process.stderr.write(paint("red", "\n✘ Provide a URL: npx @lacspace/seo audit https://example.com\n\n"));
    process.exit(1);
    return;
  }
  url = normUrl(url);

  let html: string;
  try {
    html = await fetchText(url);
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

async function runCrawl(args: string[]): Promise<void> {
  const json = args.includes("--json");
  const rest = args.filter((a) => a !== "crawl" && !a.startsWith("--"));
  let entry = rest[0];
  if (!entry) {
    process.stderr.write(paint("red", "\n✘ Provide a sitemap or base URL: npx @lacspace/seo crawl https://example.com\n\n"));
    process.exit(1);
    return;
  }
  entry = normUrl(entry);

  const minScoreRaw = flag(args, "--min-score");
  const minGrade = ((flag(args, "--min-grade") ?? "A").toUpperCase() as Grade);
  const minScore = minScoreRaw !== undefined ? Number(minScoreRaw) : undefined;
  const limit = Number(flag(args, "--limit") ?? "100");
  const concurrency = Number(flag(args, "--concurrency") ?? "6");
  // By default, audit the origin you asked for — rewrite sitemap URLs onto it.
  // Pass --keep-origin to follow the sitemap's own hosts (multi-domain sitemaps).
  const sameOrigin = !args.includes("--keep-origin");

  process.stdout.write(`\n${paint("bold", "Discovering pages")} ${paint("dim", entry)}\n`);
  const urls = await collectSitemapUrls(entry, limit, sameOrigin);
  if (urls.length === 0) {
    process.stderr.write(paint("red", `\n✘ No pages found. Is there a sitemap at ${entry}?\n\n`));
    process.exit(1);
    return;
  }
  process.stdout.write(paint("dim", `  Found ${urls.length} page${urls.length === 1 ? "" : "s"}. Auditing…\n\n`));

  type Row = { url: string; score: number; grade: Grade; failed: number; error?: string };
  const rows = await pool<string, Row>(urls, concurrency, async (url) => {
    try {
      const html = await fetchText(url);
      const r = auditHtml(html, { url });
      return { url, score: r.score, grade: r.grade, failed: r.failed };
    } catch (err) {
      return { url, score: 0, grade: "F" as Grade, failed: 99, error: err instanceof Error ? err.message : String(err) };
    }
  });

  const passes = (row: Row): boolean =>
    minScore !== undefined ? row.score >= minScore : GRADE_RANK[row.grade] >= GRADE_RANK[minGrade];

  if (json) {
    const failing = rows.filter((r) => !passes(r));
    process.stdout.write(JSON.stringify({ threshold: { minGrade, minScore }, total: rows.length, failing: failing.length, rows }, null, 2) + "\n");
    process.exit(failing.length ? 1 : 0);
    return;
  }

  const path = (u: string): string => {
    try {
      return new URL(u).pathname || "/";
    } catch {
      return u;
    }
  };
  const width = Math.min(52, Math.max(...rows.map((r) => path(r.url).length)) + 1);
  let failing = 0;
  let total = 0;
  for (const row of rows) {
    total += row.score;
    const okRow = passes(row);
    if (!okRow) failing++;
    const mark = okRow ? paint("green", "✔") : paint("red", "✘");
    const scoreStr = row.error ? paint("red", "ERR") : `${row.score}`.padStart(3);
    process.stdout.write(
      `  ${mark} ${path(row.url).padEnd(width).slice(0, width)} ${scoreStr}  ${gradeColor(row.grade)}${row.error ? paint("dim", "  " + row.error) : ""}\n`,
    );
  }

  const avg = Math.round(total / rows.length);
  process.stdout.write(
    `\n  ${paint("bold", `${rows.length} pages`)} · avg ${paint("bold", String(avg))}/100 · threshold ${paint("bold", minScore !== undefined ? `≥${minScore}` : `grade ${minGrade}`)}\n`,
  );
  if (failing) {
    process.stdout.write(paint("red", `\n  ✘ ${failing} page${failing === 1 ? "" : "s"} below threshold — failing the build.\n\n`));
    process.exit(1);
  } else {
    process.stdout.write(paint("green", `\n  ✔ All pages meet the SEO bar.\n\n`));
    process.exit(0);
  }
}

/* ------------------------------------------------------------------ *
 * Entry
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    process.stdout.write(HELP + "\n");
    return;
  }
  const cmd = args[0];
  if (cmd === "crawl") return runCrawl(args);
  // default (and explicit "audit") → single-page audit
  return runAudit(args);
}

main().catch((err: unknown) => {
  process.stderr.write(paint("red", `\n✘ ${err instanceof Error ? err.message : String(err)}\n\n`));
  process.exit(1);
});
