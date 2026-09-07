import type { AuditReport } from "./audit.js";
import { formatBytes } from "./size.js";
import type { LicenseCategory } from "./licenses.js";

/** ANSI colour keys used across the report. */
export type ColorKey =
  | "reset" | "bold" | "dim"
  | "green" | "cyan" | "yellow" | "red" | "magenta" | "blue" | "gray";

const CODES: Record<ColorKey, string> = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m",
  red: "\x1b[31m", magenta: "\x1b[35m", blue: "\x1b[34m", gray: "\x1b[90m",
};

export type Colorize = (key: ColorKey, s: string) => string;

/** Build a colourizer; when `enabled` is false it returns text unchanged. */
export function makeColor(enabled: boolean): Colorize {
  if (!enabled) return (_k, s) => s;
  return (k, s) => `${CODES[k]}${s}${CODES.reset}`;
}

const CAT_LABEL: Record<LicenseCategory, string> = {
  permissive: "permissive",
  "weak-copyleft": "weak-copyleft",
  "strong-copyleft": "strong-copyleft",
  unknown: "unknown/none",
};

function healthColor(score: number): ColorKey {
  if (score >= 85) return "green";
  if (score >= 60) return "yellow";
  return "red";
}

/** Render the full human report (grouped, coloured). */
export function renderHuman(r: AuditReport, c: Colorize, topN = 8): string {
  const L: string[] = [];
  const push = (s = ""): void => void L.push(s);

  const name = r.projectName ? `${r.projectName}@${r.projectVersion ?? "?"}` : r.root;
  push();
  push(`${c("bold", c("magenta", "◆ lacspace-deps"))}  ${c("dim", name)}`);
  push(
    `  ${c("dim", `lockfile: ${r.lockfileType}`)}  ${c("dim", "·")}  ` +
      `${c("dim", `${r.counts.declared} declared`)}  ${c("dim", "·")}  ` +
      `${c("dim", `${r.counts.installed} installed (${r.counts.distinct} distinct)`)}`,
  );
  if (!r.hasNodeModules) {
    push(`  ${c("yellow", "⚠ no node_modules found")} ${c("dim", "— run `npm install` for licence/size/duplicate data")}`);
  }

  // Health line
  const hc = healthColor(r.health);
  push();
  push(`  ${c("bold", "Health")} ${c(hc, `${r.health}/100`)}  ${c("dim", healthNote(r))}`);

  // Licences
  push();
  push(`  ${c("bold", "Licences")}`);
  const t = r.licenses.totals;
  push(
    `    ${c("green", `${t.permissive} permissive`)}  ` +
      `${c("yellow", `${t["weak-copyleft"]} weak-copyleft`)}  ` +
      `${c("red", `${t["strong-copyleft"]} strong-copyleft`)}  ` +
      `${c("gray", `${t.unknown} unknown/none`)}`,
  );
  const topLicenses = Object.entries(r.licenses.byLicense)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  if (topLicenses.length) {
    push(`    ${c("dim", topLicenses.map(([lic, n]) => `${lic}×${n}`).join("  "))}`);
  }
  if (r.licenses.violations.length) {
    push(`    ${c("red", `✗ ${r.licenses.violations.length} policy violation(s)`)}`);
    for (const v of r.licenses.violations.slice(0, 10)) {
      const why = v.reason === "deny" ? "denied" : "not in allowlist";
      push(`      ${c("red", "•")} ${v.name}@${v.version} ${c("dim", `— ${v.license ?? "UNKNOWN"} (${why})`)}`);
    }
    if (r.licenses.violations.length > 10) push(`      ${c("dim", `…and ${r.licenses.violations.length - 10} more`)}`);
  }

  // Size
  push();
  const gz = r.size.gzipEstimateBytes ? `  ${c("dim", `≈${formatBytes(r.size.gzipEstimateBytes)} gzip est.`)}` : "";
  push(`  ${c("bold", "Install size")} ${c("cyan", formatBytes(r.size.totalBytes))} ${c("dim", `· ${r.size.totalFiles} files`)}${gz}`);
  for (const e of r.size.entries.slice(0, topN)) {
    push(`    ${c("cyan", pad(formatBytes(e.bytes), 9))} ${e.name} ${c("dim", e.version)}`);
  }

  // Duplicates
  push();
  if (r.duplicates.length) {
    push(`  ${c("bold", "Duplicates")} ${c("yellow", `${r.duplicates.length} package(s) at multiple versions`)}`);
    for (const d of r.duplicates.slice(0, topN)) {
      push(`    ${c("yellow", "•")} ${d.name} ${c("dim", `→ ${d.versions.join(", ")}`)}`);
    }
    if (r.duplicates.length > topN) push(`    ${c("dim", `…and ${r.duplicates.length - topN} more`)}`);
  } else {
    push(`  ${c("bold", "Duplicates")} ${c("green", "none")} ${c("dim", "— every package resolves to a single version")}`);
  }

  // Unused / missing
  push();
  push(`  ${c("bold", "Unused & missing")} ${c("dim", `· scanned ${r.usage.files} source file(s)`)}`);
  if (r.usage.unused.length) {
    push(`    ${c("yellow", `unused (${r.usage.unused.length})`)} ${c("dim", r.usage.unused.join(", "))}`);
  } else {
    push(`    ${c("green", "unused: none")}`);
  }
  if (r.usage.missing.length) {
    push(`    ${c("red", `missing (${r.usage.missing.length})`)} ${c("dim", r.usage.missing.join(", "))}`);
  } else {
    push(`    ${c("green", "missing: none")}`);
  }
  if (r.usage.ignoredTooling.length) {
    push(`    ${c("dim", `ignored as tooling: ${r.usage.ignoredTooling.join(", ")}`)}`);
  }

  // Outdated
  if (r.outdated) {
    push();
    push(`  ${c("bold", "Outdated")} ${c("dim", `· ${r.outdated.behind} behind, ${r.outdated.majors} major(s)`)}`);
    for (const e of r.outdated.entries.filter((x) => x.level !== "up-to-date").slice(0, topN)) {
      const col: ColorKey = e.level === "major" ? "red" : e.level === "minor" ? "yellow" : "cyan";
      const latest = e.latest ?? "?";
      push(`    ${c(col, pad(e.level, 6))} ${e.name} ${c("dim", `${e.current} → ${latest}`)}`);
    }
  }

  push();
  return L.join("\n");
}

/** Short note summarising the biggest issue for the health line. */
function healthNote(r: AuditReport): string {
  const bits: string[] = [];
  if (r.licenses.violations.length) bits.push(`${r.licenses.violations.length} licence violation(s)`);
  if (r.usage.missing.length) bits.push(`${r.usage.missing.length} missing`);
  if (r.usage.unused.length) bits.push(`${r.usage.unused.length} unused`);
  if (r.duplicates.length) bits.push(`${r.duplicates.length} duplicated`);
  if (r.outdated?.majors) bits.push(`${r.outdated.majors} major(s) behind`);
  return bits.length ? `— ${bits.join(", ")}` : "— clean";
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

/** Render the report as GitHub-flavoured Markdown (for `-f md`). */
export function renderMarkdown(r: AuditReport): string {
  const L: string[] = [];
  const name = r.projectName ? `${r.projectName}@${r.projectVersion ?? "?"}` : r.root;
  L.push(`# Dependency audit — ${name}`);
  L.push("");
  L.push(`- **Health:** ${r.health}/100`);
  L.push(`- **Lockfile:** ${r.lockfileType}`);
  L.push(`- **Declared:** ${r.counts.declared} · **Installed:** ${r.counts.installed} (${r.counts.distinct} distinct)`);
  L.push(`- **Install size:** ${formatBytes(r.size.totalBytes)} across ${r.size.totalFiles} files`);
  L.push("");

  L.push("## Licences");
  L.push("");
  L.push("| Category | Count |");
  L.push("| --- | --- |");
  for (const cat of ["permissive", "weak-copyleft", "strong-copyleft", "unknown"] as LicenseCategory[]) {
    L.push(`| ${CAT_LABEL[cat]} | ${r.licenses.totals[cat]} |`);
  }
  if (r.licenses.violations.length) {
    L.push("");
    L.push("### Policy violations");
    L.push("");
    for (const v of r.licenses.violations) {
      L.push(`- \`${v.name}@${v.version}\` — ${v.license ?? "UNKNOWN"} (${v.reason})`);
    }
  }
  L.push("");

  L.push("## Heaviest packages");
  L.push("");
  L.push("| Package | Version | Size | Files |");
  L.push("| --- | --- | ---: | ---: |");
  for (const e of r.size.entries.slice(0, 15)) {
    L.push(`| ${e.name} | ${e.version} | ${formatBytes(e.bytes)} | ${e.files} |`);
  }
  L.push("");

  if (r.duplicates.length) {
    L.push("## Duplicates");
    L.push("");
    for (const d of r.duplicates) L.push(`- \`${d.name}\` → ${d.versions.join(", ")}`);
    L.push("");
  }

  L.push("## Unused & missing");
  L.push("");
  L.push(`- **Unused:** ${r.usage.unused.length ? r.usage.unused.map((n) => `\`${n}\``).join(", ") : "none"}`);
  L.push(`- **Missing:** ${r.usage.missing.length ? r.usage.missing.map((n) => `\`${n}\``).join(", ") : "none"}`);
  L.push("");

  if (r.outdated) {
    L.push("## Outdated");
    L.push("");
    L.push("| Package | Current | Latest | Level |");
    L.push("| --- | --- | --- | --- |");
    for (const e of r.outdated.entries.filter((x) => x.level !== "up-to-date")) {
      L.push(`| ${e.name} | ${e.current} | ${e.latest ?? "?"} | ${e.level} |`);
    }
    L.push("");
  }

  return L.join("\n");
}
