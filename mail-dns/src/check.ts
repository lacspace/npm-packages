/** checkDomain(): look everything up, score it, and list fixes in plain English. */
import { checkDkim, COMMON_DKIM_SELECTORS } from "./dkim.js";
import { checkDmarc } from "./dmarc.js";
import { checkMx } from "./mx.js";
import { checkBimi, checkMtaSts, checkTlsRpt } from "./policy.js";
import { detectProviders, providerDkimSelectors } from "./providers.js";
import { Dns, normalizeDomain, pickResolver } from "./resolver.js";
import { checkSpf } from "./spf.js";
import type { Check, CheckOptions, CheckStatus, DomainReport, FetchLike } from "./types.js";

/** Points per check; they add up to 100. */
export const SCORE_WEIGHTS = { mx: 25, spf: 25, dkim: 20, dmarc: 20, mtaSts: 5, tlsRpt: 5 } as const;

/** Share of a check's points earned for each status. */
export const STATUS_CREDIT: Record<CheckStatus, number> = { pass: 1, warn: 0.5, fail: 0, missing: 0, error: 0 };

const RANK: Record<CheckStatus, number> = { pass: 4, warn: 3, fail: 2, error: 1, missing: 0 };

/** The DKIM check that counts: the expected selector if given, else the best one found. Pure. */
export function primaryDkim(checks: Check[], selector?: string): Check {
  if (selector) {
    const c = checks.find((x) => x.selector === selector.toLowerCase());
    if (c) return c;
  }
  // A revoked spare selector never counts as "DKIM working".
  const live = checks.filter((x) => !x.details?.revoked);
  return [...live].sort((a, b) => RANK[b.status] - RANK[a.status])[0] ?? { kind: "dkim", status: "missing", problems: [] };
}

/** Score a report's checks 0–100 using SCORE_WEIGHTS × STATUS_CREDIT. Pure. */
export function scoreChecks(checks: DomainReport["checks"], dkimSelector?: string): number {
  const dk = primaryDkim(checks.dkim, dkimSelector);
  const s =
    SCORE_WEIGHTS.mx * STATUS_CREDIT[checks.mx.status] +
    SCORE_WEIGHTS.spf * STATUS_CREDIT[checks.spf.status] +
    SCORE_WEIGHTS.dkim * STATUS_CREDIT[dk.status] +
    SCORE_WEIGHTS.dmarc * STATUS_CREDIT[checks.dmarc.status] +
    SCORE_WEIGHTS.mtaSts * STATUS_CREDIT[checks.mtaSts.status] +
    SCORE_WEIGHTS.tlsRpt * STATUS_CREDIT[checks.tlsRpt.status];
  return Math.round(s);
}

const works = (c: Check) => c.status === "pass" || c.status === "warn";

/**
 * Look up and verify a domain's email DNS. Never throws for DNS problems:
 * failed lookups come back as `status: "error"` checks.
 */
export async function checkDomain(domainIn: string, opts: CheckOptions = {}): Promise<DomainReport> {
  const domain = normalizeDomain(domainIn);
  const timeoutMs = opts.timeoutMs ?? 5000;
  const fetchFn: FetchLike | undefined = opts.fetch ?? (globalThis as { fetch?: FetchLike }).fetch;
  const dns = new Dns(pickResolver({ resolver: opts.resolver, doh: opts.doh, fetch: fetchFn }), timeoutMs);
  const expect = opts.expect;
  const selectors = [...(opts.dkimSelectors ?? []), ...COMMON_DKIM_SELECTORS, ...providerDkimSelectors()];

  const mxP = checkMx(dns, domain, expect);
  const dmarcP = checkDmarc(dns, domain, expect);
  const [mx, spf, dkim, dmarc, mtaSts, tlsRpt] = await Promise.all([
    mxP,
    checkSpf(dns, domain, expect),
    checkDkim(dns, domain, expect, selectors),
    dmarcP,
    mxP.then((m) => checkMtaSts(dns, domain, expect, (m.details?.hosts as string[] | undefined) ?? [], fetchFn, timeoutMs)),
    checkTlsRpt(dns, domain, expect),
  ]);
  const bimi = await checkBimi(dns, domain, dmarc.details?.p as string | undefined, dmarc.details?.pct as number | undefined, !!opts.bimi);

  const checks: DomainReport["checks"] = { mx, spf, dkim, dmarc, mtaSts, tlsRpt, ...(bimi ? { bimi } : {}) };
  const dkimSel = expect?.dkim?.selector;
  const dk = primaryDkim(dkim, dkimSel);
  let ok = works(mx) && works(spf) && works(dk) && works(dmarc);
  if (expect?.mtaSts && expect.mtaSts.mode !== "none") ok &&= works(mtaSts);
  if (expect?.tlsRpt) ok &&= works(tlsRpt);

  // Fixes: errors first, then warnings, de-duplicated, in check order.
  const dkimForFixes = dkimSel ? dkim.filter((c) => c.selector === dkimSel.toLowerCase() || c.status === "fail") : dk.status === "missing" ? [dk] : dkim;
  const ordered = [mx, spf, ...dkimForFixes, dmarc, mtaSts, tlsRpt, ...(bimi ? [bimi] : [])];
  const fixes: string[] = [];
  for (const sev of ["error", "warning"] as const) {
    for (const c of ordered) for (const pr of c.problems) if (pr.severity === sev && !fixes.includes(pr.message)) fixes.push(pr.message);
  }

  const providers = detectProviders({
    mx: (mx.details?.hosts as string[] | undefined) ?? [],
    spfIncludes: (spf.details?.includes as string[] | undefined) ?? [],
    dkimSelectors: dkim.filter((c) => c.selector && c.found && !(c.details?.revoked)).map((c) => c.selector!),
  }).map((p) => p.id);

  return { domain, ok, score: scoreChecks(checks, dkimSel), checks, fixes, providers };
}
