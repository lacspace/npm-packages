/** Plain-English summaries of checks and reports, for founder-facing UI. Pure. */
import type { Check, CheckKind, CheckStatus, DomainReport } from "./types.js";

export const CHECK_LABELS: Record<CheckKind, string> = {
  mx: "Receiving email (MX)",
  spf: "Allowed senders (SPF)",
  dkim: "Email signature (DKIM)",
  dmarc: "Spoofing protection (DMARC)",
  mtaSts: "Encrypted delivery (MTA-STS)",
  tlsRpt: "Encryption reports (TLS-RPT)",
  bimi: "Brand logo in inboxes (BIMI)",
};

export const STATUS_TEXT: Record<CheckStatus, string> = {
  pass: "All good.",
  warn: "Working, but it can be improved.",
  fail: "Broken: this needs fixing.",
  missing: "Not set up yet.",
  error: "We couldn't check this right now. Try again in a minute.",
};

/** One check as a short paragraph: label, status, then each problem on its own line. */
export function explain(check: Check, opts: { includeInfo?: boolean } = {}): string {
  const label = CHECK_LABELS[check.kind] + (check.selector ? ` [${check.selector}]` : "");
  const status = check.details?.revoked ? "Revoked key, not used for signing." : STATUS_TEXT[check.status];
  const lines = [`${label}: ${status}`];
  // When a non-passing check has only info-level notes, show them: they explain the status.
  const showInfo = opts.includeInfo || (check.status !== "pass" && check.problems.every((x) => x.severity === "info"));
  for (const pr of check.problems) {
    if (pr.severity === "info" && !showInfo) continue;
    lines.push(`- ${pr.message}`);
  }
  return lines.join("\n");
}

/** A whole report as text: score, headline, one paragraph per check. */
export function explainReport(report: DomainReport): string {
  const head = report.ok
    ? `${report.domain} is ready to send and receive email (score ${report.score}/100).`
    : `${report.domain} needs ${report.fixes.length === 1 ? "one fix" : `${report.fixes.length} fixes`} before email will work reliably (score ${report.score}/100).`;
  const { mx, spf, dkim, dmarc, mtaSts, tlsRpt, bimi } = report.checks;
  return [head, ...[mx, spf, ...dkim, dmarc, mtaSts, tlsRpt, ...(bimi ? [bimi] : [])].map((c) => explain(c))].join("\n\n");
}
