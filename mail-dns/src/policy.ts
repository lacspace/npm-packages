/** MTA-STS (RFC 8461), TLS-RPT (RFC 8460) and BIMI. */
import { normalizeDomain, type Dns } from "./resolver.js";
import type { Check, FetchLike, MailDomainConfig, Problem } from "./types.js";
import { parseTags, prob as p, splitUris, statusFrom } from "./util.js";

// ---------------------------------------------------------------------------
// MTA-STS
// ---------------------------------------------------------------------------

export interface ParsedMtaStsTxt {
  record: string;
  valid: boolean;
  id?: string;
  problems: Problem[];
}

/** Parse the `_mta-sts` TXT record (`v=STSv1; id=...`). Pure. */
export function parseMtaStsTxt(record: string): ParsedMtaStsTxt {
  const { tags, order } = parseTags(record.trim());
  const out: ParsedMtaStsTxt = { record: record.trim(), valid: true, problems: [] };
  if (order[0] !== "v" || tags.v !== "STSv1") {
    out.valid = false;
    out.problems.push(p("mta-sts-txt-version", "error", 'Your _mta-sts record must start with "v=STSv1;".'));
  }
  if (!tags.id) {
    out.valid = false;
    out.problems.push(p("mta-sts-txt-id", "error", 'Your _mta-sts record needs an id, e.g. "v=STSv1; id=20261007T000000;". Change the id every time you change the policy file.'));
  } else if (!/^[A-Za-z0-9]{1,32}$/.test(tags.id)) {
    out.valid = false;
    out.problems.push(p("mta-sts-txt-id", "error", `The id "${tags.id}" in your _mta-sts record must be 1–32 letters and digits only.`));
  } else out.id = tags.id;
  return out;
}

export interface MtaStsPolicy {
  valid: boolean;
  version?: string;
  mode?: "testing" | "enforce" | "none";
  mx: string[];
  maxAge?: number;
  problems: Problem[];
}

/** Parse an MTA-STS policy file (`version: STSv1` / `mode:` / `mx:` / `max_age:`). Pure. */
export function parseMtaStsPolicy(body: string): MtaStsPolicy {
  const out: MtaStsPolicy = { valid: true, mx: [], problems: [] };
  const bad = (code: string, msg: string) => { out.valid = false; out.problems.push(p(code, "error", msg)); };
  for (const line of body.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    const i = s.indexOf(":");
    if (i < 0) { bad("mta-sts-policy-syntax", `The policy file has a line we can't read: "${s}". Each line must look like "key: value".`); continue; }
    const k = s.slice(0, i).trim().toLowerCase();
    const v = s.slice(i + 1).trim();
    if (k === "version") out.version = v;
    else if (k === "mode") {
      if (v === "testing" || v === "enforce" || v === "none") out.mode = v;
      else bad("mta-sts-policy-mode", `"mode: ${v}" isn't valid. Use testing, enforce or none.`);
    } else if (k === "mx") out.mx.push(v.toLowerCase().replace(/\.$/, ""));
    else if (k === "max_age") {
      if (/^\d{1,10}$/.test(v) && Number(v) <= 31557600) out.maxAge = Number(v);
      else bad("mta-sts-policy-max-age", `"max_age: ${v}" must be a number of seconds up to 31557600 (one year).`);
    }
  }
  if (out.version !== "STSv1") bad("mta-sts-policy-version", 'The policy file must contain "version: STSv1".');
  if (!out.mode) bad("mta-sts-policy-mode", 'The policy file is missing a "mode:" line (testing, enforce or none).');
  if (out.maxAge === undefined) bad("mta-sts-policy-max-age", 'The policy file is missing "max_age:" (seconds senders may cache it, e.g. 604800).');
  if (!out.mx.length && out.mode !== "none") bad("mta-sts-policy-mx", 'The policy file lists no "mx:" lines, so no mail server is allowed. Add one "mx:" line per mail server.');
  return out;
}

/** Does MX `host` match a policy `mx:` pattern? `*.example.com` covers exactly one extra label. Pure. */
export function mxMatchesPattern(host: string, pattern: string): boolean {
  const h = normalizeDomain(host);
  const pat = normalizeDomain(pattern);
  if (pat.startsWith("*.")) {
    const rest = pat.slice(2);
    if (!h.endsWith("." + rest)) return false;
    const label = h.slice(0, -(rest.length + 1));
    return label.length > 0 && !label.includes(".");
  }
  return h === pat;
}

/** MX hosts not covered by any policy pattern. Pure. */
export function uncoveredMx(hosts: string[], patterns: string[]): string[] {
  return hosts.filter((h) => !patterns.some((pt) => mxMatchesPattern(h, pt)));
}

/** Build the MTA-STS policy file body (CRLF line endings, per RFC 8461). Pure. */
export function buildMtaStsPolicy(mode: "testing" | "enforce" | "none", mx: string[], maxAge: number): string {
  return ["version: STSv1", `mode: ${mode}`, ...mx.map((m) => `mx: ${m}`), `max_age: ${maxAge}`].join("\r\n") + "\r\n";
}

/** @internal */
export async function checkMtaSts(
  dns: Dns,
  domain: string,
  expect: Partial<MailDomainConfig> | undefined,
  mxHosts: string[],
  fetchFn: FetchLike | undefined,
  timeoutMs: number,
): Promise<Check> {
  const want = expect?.mtaSts;
  const base: Check = { kind: "mtaSts", status: "missing", problems: [] };
  const r = await dns.txt(`_mta-sts.${domain}`);
  if (r.kind === "error" || r.kind === "unsupported") {
    return { ...base, status: "error", problems: [p("dns-error", "error", `We couldn't look up _mta-sts.${domain} (${r.kind === "error" ? r.error : "unsupported"}). Try again shortly.`)] };
  }
  const recs = r.kind === "ok" ? r.value.filter((t) => /^v\s*=\s*STSv1/i.test(t.trim())) : [];
  if (!recs.length) {
    return {
      ...base,
      problems: [want
        ? p("mta-sts-missing", "error", `MTA-STS isn't set up yet. Add a TXT record named _mta-sts and publish the policy file at https://mta-sts.${domain}/.well-known/mta-sts.txt.`)
        : p("mta-sts-missing", "info", "Optional: MTA-STS isn't set up. It makes other mail servers insist on an encrypted connection when delivering to you.")],
    };
  }
  if (recs.length > 1) {
    return { ...base, status: "fail", found: recs, problems: [p("mta-sts-multiple", "error", `You have ${recs.length} _mta-sts records; senders ignore MTA-STS when there's more than one. Keep one.`)] };
  }
  const txt = parseMtaStsTxt(recs[0]!);
  const problems: Problem[] = [...txt.problems];
  const url = `https://mta-sts.${domain}/.well-known/mta-sts.txt`;
  let policy: MtaStsPolicy | undefined;
  if (!fetchFn) {
    problems.push(p("mta-sts-no-fetch", "warning", "We can't download the MTA-STS policy file in this environment (no fetch available), so only the DNS part was checked."));
  } else {
    const ctl = typeof AbortController !== "undefined" ? new AbortController() : undefined;
    const t = setTimeout(() => ctl?.abort(), timeoutMs);
    try {
      const res = await fetchFn(url, { redirect: "manual", signal: ctl?.signal, headers: { accept: "text/plain" } });
      if (res.status >= 300 && res.status < 400) {
        problems.push(p("mta-sts-policy-redirect", "error", `${url} redirects somewhere else. Senders must not follow redirects, so they can't read your policy. Serve the file directly at that address.`));
      } else if (!res.ok) {
        problems.push(p("mta-sts-policy-http", "error", `Your MTA-STS policy file isn't available: ${url} returned HTTP ${res.status}. Upload the file there (it must be served over HTTPS with a valid certificate).`));
      } else {
        const ct = res.headers.get("content-type") ?? "";
        if (!/^text\/plain/i.test(ct)) problems.push(p("mta-sts-policy-content-type", "warning", `The policy file is served as "${ct || "unknown type"}"; it should be "text/plain".`));
        policy = parseMtaStsPolicy(await res.text());
        problems.push(...policy.problems);
      }
    } catch {
      problems.push(p("mta-sts-policy-unreachable", "error", `We couldn't download ${url}. Check that mta-sts.${domain} exists in DNS and has a valid HTTPS certificate.`));
    } finally {
      clearTimeout(t);
    }
  }
  if (policy?.valid) {
    const missing = uncoveredMx(mxHosts, policy.mx);
    if (missing.length) {
      problems.push(policy.mode === "enforce"
        ? p("mta-sts-mx-uncovered", "error", `Your MTA-STS policy is enforced but doesn't list ${missing.join(", ")}. Senders will refuse to deliver mail to that server. Add "mx: ${missing[0]}" to the policy file and change the id in the _mta-sts record.`)
        : p("mta-sts-mx-uncovered", "warning", `Your MTA-STS policy doesn't list ${missing.join(", ")}. Add "mx: ${missing[0]}" before switching to enforce mode.`));
    }
    if (policy.mode === "testing") problems.push(p("mta-sts-testing", "warning", 'MTA-STS is in "testing" mode: senders report problems but still deliver unencrypted. Once TLS reports look clean, switch to "mode: enforce" and change the id.'));
    if (policy.mode === "none") problems.push(p("mta-sts-mode-none", "warning", 'MTA-STS is switched off ("mode: none"). Use testing or enforce to protect your mail.'));
    if (policy.mode === "enforce" && policy.maxAge !== undefined && policy.maxAge < 86400) {
      problems.push(p("mta-sts-max-age-short", "warning", `max_age is only ${policy.maxAge} seconds. For enforce mode use at least a day (86400), ideally a week or more (604800).`));
    }
    if (want && want.mode !== policy.mode) problems.push(p("mta-sts-mode-mismatch", "warning", `Your MTA-STS mode is "${policy.mode}" but should be "${want.mode}".`));
  }
  return {
    ...base,
    status: statusFrom(problems),
    found: recs[0]!,
    problems,
    details: { id: txt.id, url, ...(policy ? { policy: { mode: policy.mode, mx: policy.mx, maxAge: policy.maxAge } } : {}) },
  };
}

// ---------------------------------------------------------------------------
// TLS-RPT
// ---------------------------------------------------------------------------

export interface ParsedTlsRpt {
  record: string;
  valid: boolean;
  rua: string[];
  problems: Problem[];
}

/** Parse a `_smtp._tls` TLS-RPT record. Pure. */
export function parseTlsRpt(record: string): ParsedTlsRpt {
  const { tags, order } = parseTags(record.trim());
  const out: ParsedTlsRpt = { record: record.trim(), valid: true, rua: splitUris(tags.rua), problems: [] };
  if (order[0] !== "v" || tags.v !== "TLSRPTv1") {
    out.valid = false;
    out.problems.push(p("tls-rpt-version", "error", 'Your _smtp._tls record must start with "v=TLSRPTv1;".'));
  }
  if (!out.rua.length) {
    out.valid = false;
    out.problems.push(p("tls-rpt-no-rua", "error", 'Your _smtp._tls record has no "rua=" address for reports. Add rua=mailto:tls-reports@yourdomain.'));
  }
  for (const u of out.rua) {
    if (!/^mailto:[^@\s]+@[^@\s]+$/i.test(u) && !/^https:\/\//i.test(u)) {
      out.valid = false;
      out.problems.push(p("tls-rpt-bad-rua", "error", `"${u}" isn't a valid TLS report address. Use mailto:you@example.com or an https:// URL.`));
    }
  }
  return out;
}

/** Build a TLS-RPT TXT value. Pure. */
export function buildTlsRpt(rua: string[]): string {
  return `v=TLSRPTv1; rua=${rua.map((a) => (/^mailto:|^https:/i.test(a) ? a : `mailto:${a}`)).join(",")}`;
}

/** @internal */
export async function checkTlsRpt(dns: Dns, domain: string, expect?: Partial<MailDomainConfig>): Promise<Check> {
  const want = expect?.tlsRpt;
  const expected = want?.rua.length ? buildTlsRpt(want.rua) : undefined;
  const base: Check = { kind: "tlsRpt", status: "missing", problems: [], ...(expected ? { expected } : {}) };
  const r = await dns.txt(`_smtp._tls.${domain}`);
  if (r.kind === "error" || r.kind === "unsupported") {
    return { ...base, status: "error", problems: [p("dns-error", "error", `We couldn't look up _smtp._tls.${domain} (${r.kind === "error" ? r.error : "unsupported"}). Try again shortly.`)] };
  }
  const recs = r.kind === "ok" ? r.value.filter((t) => /^v\s*=\s*TLSRPTv1/i.test(t.trim())) : [];
  if (!recs.length) {
    return {
      ...base,
      problems: [expected
        ? p("tls-rpt-missing", "error", `Add a TXT record named _smtp._tls with the value: ${expected}`)
        : p("tls-rpt-missing", "info", "Optional: TLS reporting isn't set up. With it, other mail servers tell you when encrypted delivery to you fails.")],
    };
  }
  if (recs.length > 1) {
    return { ...base, status: "fail", found: recs, problems: [p("tls-rpt-multiple", "error", `You have ${recs.length} _smtp._tls records; keep exactly one.`)] };
  }
  const t = parseTlsRpt(recs[0]!);
  const problems = [...t.problems];
  for (const a of want?.rua ?? []) {
    const addr = a.replace(/^mailto:/i, "").toLowerCase();
    if (!t.rua.some((u) => u.replace(/^mailto:/i, "").toLowerCase() === addr)) {
      problems.push(p("tls-rpt-rua-absent", "warning", `TLS reports don't go to ${addr} yet. Add it to the rua= list.`));
    }
  }
  return { ...base, status: statusFrom(problems), found: recs[0]!, problems, details: { rua: t.rua } };
}

// ---------------------------------------------------------------------------
// BIMI
// ---------------------------------------------------------------------------

export interface ParsedBimi {
  record: string;
  valid: boolean;
  logo?: string;
  authority?: string;
  problems: Problem[];
}

/** Parse a `default._bimi` record (`v=BIMI1; l=<svg url>; a=<vmc url>`). Pure. */
export function parseBimi(record: string): ParsedBimi {
  const { tags, order } = parseTags(record.trim());
  const out: ParsedBimi = { record: record.trim(), valid: true, problems: [] };
  if (order[0] !== "v" || tags.v !== "BIMI1") {
    out.valid = false;
    out.problems.push(p("bimi-version", "error", 'Your BIMI record must start with "v=BIMI1;".'));
  }
  if (tags.l) {
    out.logo = tags.l;
    if (!/^https:\/\/.+\.svg(\?.*)?$/i.test(tags.l)) out.problems.push(p("bimi-logo", "warning", "The BIMI logo (l=) should be an https:// link to an SVG file (SVG Tiny PS format)."));
  } else if (!tags.a) {
    out.problems.push(p("bimi-no-logo", "warning", "Your BIMI record has no logo link (l=)."));
  }
  if (tags.a) out.authority = tags.a;
  else out.problems.push(p("bimi-no-vmc", "info", "No certificate (a=) — Gmail and Apple Mail only show BIMI logos backed by a VMC or CMC certificate."));
  return out;
}

/** @internal */
export async function checkBimi(dns: Dns, domain: string, dmarcPolicy: string | undefined, dmarcPct: number | undefined, force: boolean): Promise<Check | undefined> {
  const r = await dns.txt(`default._bimi.${domain}`);
  const recs = r.kind === "ok" ? r.value.filter((t) => /^v\s*=\s*BIMI1/i.test(t.trim())) : [];
  if (!recs.length) {
    if (!force) return undefined;
    if (r.kind === "error") return { kind: "bimi", status: "error", problems: [p("dns-error", "error", `We couldn't look up default._bimi.${domain} (${r.error}).`)] };
    return { kind: "bimi", status: "missing", problems: [p("bimi-missing", "info", "Optional: no BIMI record, so inboxes won't show your logo next to your emails.")] };
  }
  const b = parseBimi(recs[0]!);
  const problems = [...b.problems];
  if (recs.length > 1) problems.push(p("bimi-multiple", "error", "You have more than one BIMI record at default._bimi; keep one."));
  if (!(dmarcPolicy === "quarantine" || dmarcPolicy === "reject") || (dmarcPct ?? 100) < 100) {
    problems.push(p("bimi-dmarc", "warning", "BIMI logos only appear when DMARC is set to quarantine or reject for 100% of mail. Tighten your DMARC policy first."));
  }
  return { kind: "bimi", status: statusFrom(problems), found: recs[0]!, problems, details: { logo: b.logo, authority: b.authority } };
}
