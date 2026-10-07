/** DMARC (RFC 7489): parse, validate, check a domain, report-address authorization. */
import type { Dns } from "./resolver.js";
import type { Check, DmarcPolicy, MailDomainConfig, Problem } from "./types.js";
import { mailtoDomain, orgDomain, parseTags, prob as p, splitUris, statusFrom } from "./util.js";

export interface ParsedDmarc {
  record: string;
  valid: boolean;
  tags: Record<string, string>;
  p?: DmarcPolicy;
  sp?: DmarcPolicy;
  pct: number;
  rua: string[];
  ruf: string[];
  adkim: "r" | "s";
  aspf: "r" | "s";
  fo: string[];
  ri?: number;
  problems: Problem[];
}

const POLICIES = new Set(["none", "quarantine", "reject"]);
const STRENGTH: Record<DmarcPolicy, number> = { none: 0, quarantine: 1, reject: 2 };

/** Is this TXT string a DMARC record? Pure. */
export function isDmarcRecord(t: string): boolean {
  return /^v\s*=\s*dmarc1\s*(;|$)/i.test(t.trim());
}

/** Parse and validate a DMARC record. Pure; never throws. */
export function parseDmarc(record: string): ParsedDmarc {
  const rec = record.trim();
  const { tags, order, duplicates } = parseTags(rec);
  const out: ParsedDmarc = { record: rec, valid: true, tags, pct: 100, rua: [], ruf: [], adkim: "r", aspf: "r", fo: ["0"], problems: [] };
  const bad = (code: string, msg: string) => { out.valid = false; out.problems.push(p(code, "error", msg)); };
  if (order[0] !== "v" || tags.v?.toUpperCase() !== "DMARC1") {
    bad("dmarc-version", 'Your DMARC record must start with "v=DMARC1;" — receivers ignore it otherwise.');
    return out;
  }
  for (const d of duplicates) bad("dmarc-duplicate-tag", `Your DMARC record sets "${d}=" more than once. Keep only one.`);
  const pol = tags.p?.toLowerCase();
  if (pol === undefined) {
    if (splitUris(tags.rua).length) {
      out.p = "none";
      out.problems.push(p("dmarc-no-policy", "warning", 'Your DMARC record has no "p=" policy, so it is treated as "p=none". Add "p=none;" right after "v=DMARC1;".'));
    } else bad("dmarc-no-policy", 'Your DMARC record is missing the "p=" policy. Add "p=none;" right after "v=DMARC1;" to start.');
  } else if (!POLICIES.has(pol)) bad("dmarc-bad-policy", `"p=${tags.p}" is not a valid DMARC policy. Use none, quarantine or reject.`);
  else {
    out.p = pol as DmarcPolicy;
    if (order[1] !== "p") out.problems.push(p("dmarc-policy-order", "info", 'DMARC expects "p=" to come straight after "v=DMARC1;". Most receivers accept it anyway.'));
  }
  if (tags.sp !== undefined) {
    const sp = tags.sp.toLowerCase();
    if (POLICIES.has(sp)) out.sp = sp as DmarcPolicy;
    else bad("dmarc-bad-sp", `"sp=${tags.sp}" is not a valid subdomain policy. Use none, quarantine or reject.`);
  }
  if (tags.pct !== undefined) {
    const n = Number(tags.pct);
    if (!/^\d{1,3}$/.test(tags.pct) || n > 100) bad("dmarc-bad-pct", `"pct=${tags.pct}" must be a whole number from 0 to 100.`);
    else out.pct = n;
  }
  for (const k of ["adkim", "aspf"] as const) {
    if (tags[k] === undefined) continue;
    const v = tags[k]!.toLowerCase();
    if (v === "r" || v === "s") out[k] = v;
    else bad(`dmarc-bad-${k}`, `"${k}=${tags[k]}" must be "r" (relaxed) or "s" (strict).`);
  }
  if (tags.fo !== undefined) {
    const fo = tags.fo.split(":").map((s) => s.trim());
    if (fo.some((f) => !["0", "1", "d", "s"].includes(f))) bad("dmarc-bad-fo", `"fo=${tags.fo}" is invalid. Use 0, 1, d or s (separate several with ":").`);
    else out.fo = fo;
  }
  if (tags.ri !== undefined) {
    if (!/^\d+$/.test(tags.ri)) bad("dmarc-bad-ri", `"ri=${tags.ri}" must be a number of seconds.`);
    else out.ri = Number(tags.ri);
  }
  for (const k of ["rua", "ruf"] as const) {
    const uris = splitUris(tags[k]);
    for (const u of uris) {
      if (!/^mailto:[^@\s]+@[^@\s]+$/i.test(u) && !/^https?:\/\//i.test(u)) {
        bad(`dmarc-bad-${k}`, `"${u}" in ${k}= is not a valid report address. Write it as mailto:reports@example.com.`);
      }
    }
    out[k] = uris;
  }
  return out;
}

/** Build the DMARC record a config asks for. Pure. */
export function buildDmarc(d: NonNullable<MailDomainConfig["dmarc"]>): string {
  const parts = ["v=DMARC1", `p=${d.policy ?? "none"}`];
  if (d.sp) parts.push(`sp=${d.sp}`);
  if (d.pct !== undefined && d.pct !== 100) parts.push(`pct=${d.pct}`);
  const mt = (a: string) => (/^mailto:|^https?:/i.test(a) ? a : `mailto:${a}`);
  if (d.rua?.length) parts.push(`rua=${d.rua.map(mt).join(",")}`);
  if (d.ruf?.length) parts.push(`ruf=${d.ruf.map(mt).join(",")}`, "fo=1");
  if (d.adkim) parts.push(`adkim=${d.adkim}`);
  if (d.aspf) parts.push(`aspf=${d.aspf}`);
  return parts.join("; ");
}

/** Report addresses on another organisation's domain, needing `<domain>._report._dmarc.<rua-domain>`. Pure. */
export function externalReportDomains(domain: string, uris: string[]): string[] {
  const org = orgDomain(domain);
  const out = new Set<string>();
  for (const u of uris) {
    const d = mailtoDomain(u);
    if (d && orgDomain(d) !== org) out.add(d);
  }
  return [...out];
}

/** @internal */
export async function checkDmarc(dns: Dns, domain: string, expect?: Partial<MailDomainConfig>): Promise<Check> {
  const wanted = expect?.dmarc ? buildDmarc(expect.dmarc) : undefined;
  const base: Check = { kind: "dmarc", status: "missing", problems: [], ...(wanted ? { expected: wanted } : {}) };
  const name = `_dmarc.${domain}`;
  const r = await dns.txt(name);
  if (r.kind === "error" || r.kind === "unsupported") {
    return { ...base, status: "error", problems: [p("dns-error", "error", `We couldn't look up ${name} (${r.kind === "error" ? r.error : "unsupported"}). This is usually temporary; try again shortly.`)] };
  }
  const recs = r.kind === "ok" ? r.value.filter(isDmarcRecord) : [];
  if (!recs.length) {
    const problems: Problem[] = [
      p("dmarc-missing", "error", wanted
        ? `You don't have a DMARC record yet. Add a TXT record with the name _dmarc and the value: ${wanted}`
        : 'You don\'t have a DMARC record. Gmail and Yahoo now require one from bulk senders. Add a TXT record named _dmarc with the value "v=DMARC1; p=none; rua=mailto:you@yourdomain".'),
    ];
    // Common mistakes: published at the apex, or at _dmarc.<domain>.<domain>.
    const [apex, doubled] = await Promise.all([dns.txt(domain), dns.txt(`_dmarc.${domain}.${domain}`)]);
    if (apex.kind === "ok" && apex.value.some(isDmarcRecord)) {
      problems.push(p("dmarc-wrong-name", "error", 'Your DMARC record is on your main domain (@) instead of "_dmarc". Move it: create the TXT record with the name _dmarc and delete the one at @.'));
    }
    if (doubled.kind === "ok" && doubled.value.some(isDmarcRecord)) {
      problems.push(p("dmarc-doubled-name", "error", `Your DMARC record ended up at _dmarc.${domain}.${domain} — your DNS panel added the domain a second time. Change the name to just "_dmarc".`));
    }
    return { ...base, problems };
  }
  if (recs.length > 1) {
    return { ...base, status: "fail", found: recs, problems: [p("dmarc-multiple", "error", `You have ${recs.length} DMARC records at _dmarc. Receivers ignore DMARC completely when there's more than one. Delete all but one.`)] };
  }
  const rec = recs[0]!;
  const d = parseDmarc(rec);
  const problems = [...d.problems];
  if (d.valid && d.p) {
    if (d.p === "none") {
      problems.push(p("dmarc-policy-none", "warning", 'Your DMARC policy is "p=none": you get reports, but fake emails using your domain are still delivered. Once reports show your real mail passing (usually 2–4 weeks), change it to "p=quarantine", and later "p=reject".'));
    } else if (d.pct < 100) {
      problems.push(p("dmarc-pct", "warning", `Your DMARC policy only applies to ${d.pct}% of failing mail ("pct=${d.pct}"). Raise it to 100 once you're confident.`));
    }
    if (d.p !== "none" && d.sp === "none") {
      problems.push(p("dmarc-sp-none", "warning", 'Your subdomain policy is "sp=none", so fake mail from made-up subdomains (like billing.yourdomain) is still delivered. Remove "sp=none" or set it to quarantine/reject.'));
    }
    if (!d.rua.length) {
      problems.push(p("dmarc-no-rua", "warning", 'Your DMARC record has no "rua=" report address, so you never see who is sending as you. Add rua=mailto:dmarc@yourdomain.'));
    }
  }
  // External report authorization
  const ext = externalReportDomains(domain, [...d.rua, ...d.ruf]);
  const unauthorized: string[] = [];
  await Promise.all(
    ext.map(async (rd) => {
      // A wildcard (*._report._dmarc.<rd>) also answers this exact name.
      const w = await dns.txt(`${domain}._report._dmarc.${rd}`);
      if (!(w.kind === "ok" && w.value.some(isDmarcRecord))) unauthorized.push(rd);
    }),
  );
  for (const rd of unauthorized.sort()) {
    problems.push(p("dmarc-rua-unauthorized", "warning", `Reports are sent to an address at ${rd}, but ${rd} hasn't agreed to receive them, so most receivers won't send them. The owner of ${rd} must add a TXT record "${domain}._report._dmarc.${rd}" with the value "v=DMARC1".`));
  }
  if (expect?.dmarc) {
    const want = expect.dmarc.policy ?? "none";
    if (d.p && STRENGTH[d.p] < STRENGTH[want]) {
      problems.push(p("dmarc-policy-weaker", "error", `Your DMARC policy is "p=${d.p}" but should be "p=${want}". Update the _dmarc record to: ${wanted}`));
    }
    for (const a of expect.dmarc.rua ?? []) {
      const addr = a.replace(/^mailto:/i, "").toLowerCase();
      if (!d.rua.some((u) => u.replace(/^mailto:/i, "").replace(/!.*$/, "").toLowerCase() === addr)) {
        problems.push(p("dmarc-rua-absent", "warning", `Your DMARC reports don't go to ${addr} yet. Add "mailto:${addr}" to the rua= list.`));
      }
    }
  }
  return {
    ...base,
    status: statusFrom(problems),
    found: rec,
    problems,
    details: { p: d.p, sp: d.sp, pct: d.pct, rua: d.rua, ruf: d.ruf, adkim: d.adkim, aspf: d.aspf, externalReportDomains: ext },
  };
}
