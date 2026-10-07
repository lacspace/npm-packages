/**
 * SPF (RFC 7208): parse, validate, count DNS lookups recursively, evaluate an
 * IP, and check a domain's published record against what you expect.
 */
import { cidrMatch, ipFamily, parseIp4, parseIp6 } from "./ip.js";
import { Dns, normalizeDomain, pickResolver } from "./resolver.js";
import type { Check, DnsResolver, FetchLike, MailDomainConfig, Problem } from "./types.js";
import { statusFrom } from "./util.js";

export type SpfQualifier = "+" | "-" | "~" | "?";
export type SpfMechanism = "all" | "include" | "a" | "mx" | "ptr" | "ip4" | "ip6" | "exists";

export interface SpfTerm {
  raw: string;
  type: "mechanism" | "modifier";
  /** Mechanism or modifier name, lower-case. */
  name: string;
  qualifier?: SpfQualifier;
  /** Domain / IP argument as written. */
  value?: string;
  cidr4?: number;
  cidr6?: number;
  /** True when the domain uses `%{...}` macros. */
  macro?: boolean;
}

export interface ParsedSpf {
  record: string;
  valid: boolean;
  terms: SpfTerm[];
  /** Qualifier of the `all` mechanism, when present. */
  all?: SpfQualifier;
  redirect?: string;
  exp?: string;
  includes: string[];
  ip4: string[];
  ip6: string[];
  /** DNS-querying terms in this record alone (include/a/mx/ptr/exists/redirect). */
  lookupTerms: number;
  problems: Problem[];
}

const MECHS = new Set<SpfMechanism>(["all", "include", "a", "mx", "ptr", "ip4", "ip6", "exists"]);
const LOOKUP_MECHS = new Set(["include", "a", "mx", "ptr", "exists"]);
const DOMAIN_RE = /^(?=.{1,253}\.?$)([a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.?$/i;
const MACRO_DOMAIN_RE = /^[\x21-\x7e]+$/;

/** The TXT strings that are SPF records (`v=spf1` followed by a space or the end). Pure. */
export function findSpfRecords(txts: string[]): string[] {
  return txts.map((t) => t.trim()).filter((t) => /^v=spf1(\s|$)/i.test(t));
}

function validDomainSpec(d: string): { ok: boolean; macro: boolean } {
  if (d.includes("%")) {
    const stripped = d.replace(/%\{[slodiphcrtv]\d*r?[.\-+,/_=]*\}|%%|%_|%-/gi, "");
    return { ok: MACRO_DOMAIN_RE.test(d) && !stripped.includes("%"), macro: true };
  }
  return { ok: DOMAIN_RE.test(d), macro: false };
}

const p = (code: string, severity: Problem["severity"], message: string): Problem => ({ code, severity, message });

/** Parse and validate one SPF record. Pure; never throws. */
export function parseSpf(record: string): ParsedSpf {
  const rec = record.trim();
  const out: ParsedSpf = { record: rec, valid: true, terms: [], includes: [], ip4: [], ip6: [], lookupTerms: 0, problems: [] };
  const bad = (raw: string, why: string) => {
    out.valid = false;
    out.problems.push(p("spf-syntax", "error", `Your SPF record has a typo: "${raw}" ${why}. Receivers treat the whole record as broken until it is fixed.`));
  };
  const tokens = rec.split(/\s+/).filter(Boolean);
  if (!tokens.length || tokens[0]!.toLowerCase() !== "v=spf1") {
    out.valid = false;
    out.problems.push(p("spf-not-spf", "error", 'This is not an SPF record: it must start with "v=spf1".'));
    return out;
  }
  let sawAll = false;
  const afterAll: string[] = [];
  for (const raw of tokens.slice(1)) {
    const mod = /^([a-z][a-z0-9_.-]*)=(.*)$/i.exec(raw);
    if (mod) {
      const name = mod[1]!.toLowerCase();
      const value = mod[2]!;
      const term: SpfTerm = { raw, type: "modifier", name, value };
      if (name === "redirect" || name === "exp") {
        if (out[name] !== undefined) bad(raw, `appears twice (only one ${name}= is allowed)`);
        const v = validDomainSpec(value);
        if (!v.ok) bad(raw, "does not point to a valid domain");
        term.macro = v.macro;
        if (name === "redirect") out.redirect = value; else out.exp = value;
      }
      out.terms.push(term);
      continue;
    }
    const m = /^([+\-~?]?)([a-z0-9]+)(.*)$/i.exec(raw);
    const name = m?.[2]?.toLowerCase() as SpfMechanism | undefined;
    if (!m || !name || !MECHS.has(name)) {
      bad(raw, "is not something SPF understands");
      continue;
    }
    const qualifier = (m[1] || "+") as SpfQualifier;
    const rest = m[3] ?? "";
    const term: SpfTerm = { raw, type: "mechanism", name, qualifier };
    if (sawAll) afterAll.push(raw);
    switch (name) {
      case "all":
        if (rest) bad(raw, 'cannot take a value (write just "-all" or "~all")');
        sawAll = true;
        out.all = qualifier;
        break;
      case "include":
      case "exists": {
        if (!rest.startsWith(":") || rest.length < 2) { bad(raw, `needs a domain, like ${name}:example.com`); break; }
        const d = rest.slice(1);
        const v = validDomainSpec(d);
        if (!v.ok) bad(raw, "does not point to a valid domain");
        term.value = d;
        term.macro = v.macro;
        if (name === "include") out.includes.push(d);
        break;
      }
      case "a":
      case "mx":
      case "ptr": {
        const mm = /^(?::([^/]+))?(?:\/(\d+))?(?:\/\/(\d+))?$/.exec(rest);
        if (!mm || (name === "ptr" && (mm[2] || mm[3]))) { bad(raw, "has an invalid domain or prefix length"); break; }
        if (mm[1]) {
          const v = validDomainSpec(mm[1]);
          if (!v.ok) bad(raw, "does not point to a valid domain");
          term.value = mm[1];
          term.macro = v.macro;
        }
        if (mm[2] !== undefined) { term.cidr4 = Number(mm[2]); if (term.cidr4 > 32) bad(raw, "has an IPv4 prefix over /32"); }
        if (mm[3] !== undefined) { term.cidr6 = Number(mm[3]); if (term.cidr6 > 128) bad(raw, "has an IPv6 prefix over /128"); }
        break;
      }
      case "ip4":
      case "ip6": {
        const mm = /^:([^/]+)(?:\/(\d+))?$/.exec(rest);
        const max = name === "ip4" ? 32 : 128;
        if (!mm) { bad(raw, `needs an address, like ${name === "ip4" ? "ip4:203.0.113.5" : "ip6:2001:db8::1"}`); break; }
        const addrOk = name === "ip4" ? parseIp4(mm[1]!) !== undefined : parseIp6(mm[1]!) !== undefined;
        if (!addrOk) { bad(raw, `is not a valid ${name === "ip4" ? "IPv4" : "IPv6"} address`); break; }
        const cidr = mm[2] !== undefined ? Number(mm[2]) : undefined;
        if (cidr !== undefined && cidr > max) { bad(raw, `has a prefix over /${max}`); break; }
        term.value = mm[1];
        if (name === "ip4") { term.cidr4 = cidr; out.ip4.push(mm[1]! + (cidr !== undefined ? `/${cidr}` : "")); }
        else { term.cidr6 = cidr; out.ip6.push(mm[1]! + (cidr !== undefined ? `/${cidr}` : "")); }
        if (cidr !== undefined && ((name === "ip4" && cidr < 8) || (name === "ip6" && cidr < 16))) {
          out.problems.push(p("spf-wide-range", "warning", `"${raw}" authorises an enormous range of addresses, so almost anyone could send as you. Narrow it to the servers you actually use.`));
        }
        break;
      }
    }
    out.terms.push(term);
    if (LOOKUP_MECHS.has(name)) out.lookupTerms++;
  }
  if (out.redirect && !sawAll) out.lookupTerms++;
  if (out.all === "+") out.problems.push(p("spf-all-pass", "error", 'Your SPF record ends in "+all", which lets every server on the internet send email as you. Change it to "~all" (or "-all" once you are confident).'));
  if (out.all === "?") out.problems.push(p("spf-all-neutral", "warning", 'Your SPF record ends in "?all", which tells receivers nothing about unknown senders. Change it to "~all" or "-all".'));
  if (!sawAll && !out.redirect) out.problems.push(p("spf-no-all", "warning", 'Your SPF record does not end with "~all" or "-all", so receivers don\'t know what to do with mail from other servers. Add "~all" at the end.'));
  if (sawAll && out.redirect) out.problems.push(p("spf-redirect-ignored", "info", 'Your SPF record has both "all" and "redirect=", so the redirect is ignored.'));
  if (afterAll.length) out.problems.push(p("spf-after-all", "warning", `Anything after "all" is ignored by receivers: ${afterAll.join(" ")}. Move it before the "all".`));
  if (out.terms.some((t) => t.name === "ptr")) out.problems.push(p("spf-ptr", "warning", 'Your SPF record uses "ptr", which is deprecated, slow, and ignored by some receivers. Replace it with ip4:/ip6: or include: entries.'));
  if (rec.length > 450) out.problems.push(p("spf-long", "info", `Your SPF record is ${rec.length} characters long. Very long records can be truncated by some DNS servers; consider removing unused entries.`));
  return out;
}

// ---------------------------------------------------------------------------
// Recursive lookup counting
// ---------------------------------------------------------------------------

export interface SpfNode {
  domain: string;
  record?: string;
  /** DNS-querying terms in this record. */
  lookups: number;
  children: SpfNode[];
  error?: string;
}

export interface SpfLookupReport {
  /** Total DNS-querying terms across the include/redirect tree (limit 10). */
  count: number;
  /** Lookups that returned nothing (limit 2). */
  voidLookups: number;
  tree: SpfNode;
  problems: Problem[];
}

/** @internal Walk the SPF include/redirect tree with an existing Dns. */
export async function analyzeSpfTree(dns: Dns, domain: string, record?: string): Promise<SpfLookupReport> {
  let count = 0;
  let voids = 0;
  const problems: Problem[] = [];
  const seenProblem = new Set<string>();
  const add = (pr: Problem) => {
    const k = pr.code + pr.message;
    if (!seenProblem.has(k)) { seenProblem.add(k); problems.push(pr); }
  };

  async function walk(d: string, rec: string | undefined, stack: string[], via: string | undefined): Promise<SpfNode> {
    const node: SpfNode = { domain: d, lookups: 0, children: [] };
    if (rec === undefined) {
      const r = await dns.txt(d);
      if (r.kind === "error" || r.kind === "unsupported") {
        node.error = "lookup-failed";
        add(p("spf-lookup-error", "warning", `We couldn't look up the SPF record of ${d} (${r.kind === "error" ? r.error : "unsupported"}). Try again in a minute.`));
        return node;
      }
      const spfs = r.kind === "ok" ? findSpfRecords(r.value) : [];
      if (!spfs.length) {
        if (via) {
          if (r.kind === "none") voids++;
          node.error = "no-record";
          add(p("spf-include-missing", "error", `Your SPF record includes "${d}", but that domain has no SPF record. Receivers treat this as broken; remove "${via}" or fix the name.`));
        }
        return node;
      }
      if (spfs.length > 1) {
        node.error = "multiple";
        if (via) add(p("spf-include-multiple", "error", `"${d}" (included by your SPF record) publishes ${spfs.length} SPF records, which receivers treat as broken.`));
        return node;
      }
      rec = spfs[0]!;
    }
    node.record = rec;
    const parsed = parseSpf(rec);
    if (!parsed.valid && via) {
      add(p("spf-include-invalid", "error", `"${d}" (included by your SPF record) has an invalid SPF record, so your record breaks too.`));
    }
    const terms = parsed.terms.filter(
      (t) => (t.type === "mechanism" && LOOKUP_MECHS.has(t.name)) || (t.type === "modifier" && t.name === "redirect" && parsed.all === undefined),
    );
    node.lookups = terms.length;
    count += terms.length;
    if (count > 40 || stack.length > 12) return node; // far past the limit already; stop walking
    await Promise.all(
      terms.map(async (t) => {
        const target = normalizeDomain(t.value ?? d);
        if (t.macro) return;
        if (t.name === "include" || t.name === "redirect") {
          if (stack.includes(target)) {
            add(p("spf-loop", "error", `Your SPF record loops: "${target}" ends up including itself (${[...stack, target].join(" → ")}). Receivers treat this as broken; remove the circular include.`));
            node.children.push({ domain: target, lookups: 0, children: [], error: "loop" });
            return;
          }
          node.children.push(await walk(target, undefined, [...stack, target], t.raw));
        } else if (t.name === "a" || t.name === "exists") {
          const [a, aaaa] = await Promise.all([dns.a(target), t.name === "a" ? dns.aaaa(target) : Promise.resolve({ kind: "none" } as const)]);
          if (a.kind === "none" && aaaa.kind === "none") voids++;
        } else if (t.name === "mx") {
          const r = await dns.mx(target);
          if (r.kind === "none") voids++;
          if (r.kind === "ok" && r.value.length > 10) add(p("spf-mx-too-many", "error", `"${t.raw}" points at ${r.value.length} mail servers; SPF allows at most 10 for the mx mechanism.`));
        }
      }),
    );
    return node;
  }

  const root = normalizeDomain(domain);
  const tree = await walk(root, record, [root], undefined);
  if (count > 10) {
    add(p("spf-too-many-lookups", "error", `Your SPF record has ${count} DNS lookups; the limit is 10, so receivers will treat it as broken. Remove an include you no longer use, or replace includes with ip4:/ip6: entries ("flattening").`));
  } else if (count >= 9) {
    add(p("spf-lookups-near-limit", "warning", `Your SPF record uses ${count} of the 10 allowed DNS lookups. Adding one more service will break it; consider removing unused includes.`));
  }
  if (voids > 2) {
    add(p("spf-void-lookups", "error", `Your SPF record has ${voids} entries that point at names with no DNS records (the limit is 2), so receivers may treat it as broken. Remove entries for services you no longer use.`));
  }
  return { count, voidLookups: voids, tree, problems };
}

export interface SpfDnsOptions {
  resolver?: DnsResolver;
  doh?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
}

/** Count SPF DNS lookups for a domain (or for `record` as if published at `domain`), following includes. */
export async function countSpfLookups(domain: string, opts: SpfDnsOptions & { record?: string } = {}): Promise<SpfLookupReport> {
  const dns = new Dns(pickResolver(opts), opts.timeoutMs);
  return analyzeSpfTree(dns, domain, opts.record);
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export type SpfResult = "pass" | "fail" | "softfail" | "neutral" | "none" | "permerror" | "temperror";

export interface SpfEvaluation {
  result: SpfResult;
  /** The term that decided the result, e.g. `include:_spf.google.com`. */
  mechanism?: string;
  /** Things we could not evaluate (macros, ptr) and other notes. */
  notes: string[];
  lookups: number;
}

const QUAL_RESULT: Record<SpfQualifier, SpfResult> = { "+": "pass", "-": "fail", "~": "softfail", "?": "neutral" };

/**
 * Would `ip` pass SPF for `domain`? Supports ip4/ip6 (CIDR), a, mx, include,
 * redirect and all. `exists`, `ptr` and macro domains are skipped with a note
 * (treated as not matching).
 */
export async function evaluateSpf(ip: string, domain: string, opts: SpfDnsOptions & { record?: string } = {}): Promise<SpfEvaluation> {
  const dns = new Dns(pickResolver(opts), opts.timeoutMs);
  return evaluateWith(dns, ip, domain, opts.record);
}

class SpfAbort extends Error {
  constructor(readonly result: SpfResult, msg: string) { super(msg); }
}

/** @internal */
export async function evaluateWith(dns: Dns, ip: string, domain: string, record?: string): Promise<SpfEvaluation> {
  const fam = ipFamily(ip);
  const notes: string[] = [];
  let lookups = 0;
  if (!fam) return { result: "permerror", notes: [`"${ip}" is not an IP address.`], lookups };
  const bump = () => { if (++lookups > 10) throw new SpfAbort("permerror", "more than 10 DNS lookups"); };

  async function addrs(host: string): Promise<string[]> {
    const r = fam === 4 ? await dns.a(host) : await dns.aaaa(host);
    if (r.kind === "error") throw new SpfAbort("temperror", `lookup of ${host} failed (${r.error})`);
    if (r.kind === "unsupported") { notes.push(`The resolver can't do ${fam === 4 ? "A" : "AAAA"} lookups; "${host}" not checked.`); return []; }
    return r.kind === "ok" ? r.value : [];
  }

  async function check(d: string, rec: string | undefined, depth: number): Promise<{ result: SpfResult; mechanism?: string }> {
    if (depth > 12) throw new SpfAbort("permerror", "include nesting too deep");
    if (rec === undefined) {
      const r = await dns.txt(d);
      if (r.kind === "error") throw new SpfAbort("temperror", `TXT lookup of ${d} failed (${r.error})`);
      const spfs = r.kind === "ok" ? findSpfRecords(r.value) : [];
      if (!spfs.length) return { result: "none" };
      if (spfs.length > 1) return { result: "permerror", mechanism: `${d}: multiple SPF records` };
      rec = spfs[0]!;
    }
    const parsed = parseSpf(rec);
    if (!parsed.valid) return { result: "permerror", mechanism: `${d}: invalid SPF record` };
    for (const t of parsed.terms) {
      if (t.type !== "mechanism") continue;
      const q = QUAL_RESULT[t.qualifier ?? "+"];
      const target = normalizeDomain(t.value ?? d);
      let match = false;
      switch (t.name) {
        case "all":
          match = true;
          break;
        case "ip4":
          match = fam === 4 && cidrMatch(ip, t.value!, t.cidr4);
          break;
        case "ip6":
          match = fam === 6 && cidrMatch(ip, t.value!, t.cidr6);
          break;
        case "a":
          bump();
          if (t.macro) { notes.push(`"${t.raw}" uses macros, which are not supported; skipped.`); break; }
          match = (await addrs(target)).some((x) => cidrMatch(ip, x, fam === 4 ? t.cidr4 : t.cidr6));
          break;
        case "mx": {
          bump();
          if (t.macro) { notes.push(`"${t.raw}" uses macros, which are not supported; skipped.`); break; }
          const r = await dns.mx(target);
          if (r.kind === "error") throw new SpfAbort("temperror", `MX lookup of ${target} failed (${r.error})`);
          const hosts = r.kind === "ok" ? r.value.slice(0, 10) : [];
          for (const h of hosts) {
            if ((await addrs(h.exchange)).some((x) => cidrMatch(ip, x, fam === 4 ? t.cidr4 : t.cidr6))) { match = true; break; }
          }
          break;
        }
        case "include": {
          bump();
          if (t.macro) { notes.push(`"${t.raw}" uses macros, which are not supported; skipped.`); break; }
          const sub = await check(target, undefined, depth + 1);
          if (sub.result === "temperror") throw new SpfAbort("temperror", `include ${target}`);
          if (sub.result === "permerror" || sub.result === "none") return { result: "permerror", mechanism: t.raw };
          match = sub.result === "pass";
          break;
        }
        case "exists":
          bump();
          notes.push(`"${t.raw}" (exists) is not supported by this evaluator; treated as no match.`);
          break;
        case "ptr":
          bump();
          notes.push(`"${t.raw}" (ptr) is deprecated and not evaluated; treated as no match.`);
          break;
      }
      if (match) return { result: q, mechanism: t.raw };
    }
    if (parsed.redirect && parsed.all === undefined) {
      bump();
      const target = normalizeDomain(parsed.redirect);
      if (/%/.test(target)) { notes.push("redirect= uses macros; not supported."); return { result: "neutral" }; }
      const sub = await check(target, undefined, depth + 1);
      return sub.result === "none" ? { result: "permerror", mechanism: `redirect=${target}` } : sub;
    }
    return { result: "neutral" };
  }

  try {
    const r = await check(normalizeDomain(domain), record, 0);
    return { ...r, notes, lookups };
  } catch (e) {
    if (e instanceof SpfAbort) return { result: e.result, mechanism: e.message, notes, lookups };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Domain check
// ---------------------------------------------------------------------------

/** Build the SPF record a config asks for. Pure. */
export function buildSpf(cfg: Pick<MailDomainConfig, "spfInclude" | "spfIp4" | "spfIp6" | "spfAll">): string {
  const parts = ["v=spf1"];
  for (const ip of cfg.spfIp4 ?? []) parts.push(`ip4:${ip}`);
  for (const ip of cfg.spfIp6 ?? []) parts.push(`ip6:${ip}`);
  for (const inc of cfg.spfInclude ?? []) parts.push(`include:${inc}`);
  if (parts.length === 1) parts.push("mx");
  parts.push(cfg.spfAll ?? "~all");
  return parts.join(" ");
}

/** @internal */
export async function checkSpf(dns: Dns, domain: string, expect?: Partial<MailDomainConfig>): Promise<Check> {
  const wantSpf = expect && (expect.spfInclude || expect.spfIp4 || expect.spfIp6) ? buildSpf(expect) : undefined;
  const base: Check = { kind: "spf", status: "missing", problems: [], ...(wantSpf ? { expected: wantSpf } : {}) };
  const r = await dns.txt(domain);
  if (r.kind === "error" || r.kind === "unsupported") {
    return { ...base, status: "error", problems: [p("dns-error", "error", `We couldn't look up ${domain}'s TXT records (${r.kind === "error" ? r.error : "unsupported"}). This is usually temporary; try again shortly.`)] };
  }
  const spfs = r.kind === "ok" ? findSpfRecords(r.value) : [];
  if (!spfs.length) {
    const typo = r.kind === "ok" ? r.value.find((t) => /^\s*"?\s*v\s*=\s*spf/i.test(t) || /^spf1?\b/i.test(t.trim())) : undefined;
    const problems = [
      p("spf-missing", "error", wantSpf
        ? `You don't have an SPF record yet. Add a TXT record at @ (your domain itself) with the value: ${wantSpf}`
        : "You don't have an SPF record, so receivers can't tell which servers may send your email and are more likely to mark it as spam. Add a TXT record at @ starting with v=spf1."),
    ];
    if (typo) problems.push(p("spf-typo", "error", `There's a TXT record that looks like SPF but isn't written correctly: "${typo}". It must start exactly with "v=spf1 ".`));
    return { ...base, status: "missing", problems };
  }
  if (spfs.length > 1) {
    return {
      ...base,
      status: "fail",
      found: spfs,
      problems: [p("spf-multiple", "error", `You have ${spfs.length} SPF records. A domain may only have one, so receivers ignore all of them. Merge them into a single TXT record${wantSpf ? `: ${wantSpf}` : ' (combine the include: parts, keep one "~all" at the end)'}.`)],
    };
  }
  const rec = spfs[0]!;
  const parsed = parseSpf(rec);
  const problems: Problem[] = [...parsed.problems];
  const tree = await analyzeSpfTree(dns, domain, rec);
  problems.push(...tree.problems);

  if (expect) {
    for (const inc of expect.spfInclude ?? []) {
      if (!parsed.includes.some((i) => normalizeDomain(i) === normalizeDomain(inc))) {
        problems.push(p("spf-include-absent", "error", `Your SPF record doesn't include "${inc}", so mail we send for you may be rejected. Add "include:${inc}" before the "all" at the end.`));
      }
    }
    for (const ip of [...(expect.spfIp4 ?? []), ...(expect.spfIp6 ?? [])]) {
      const [net, pre] = ip.split("/");
      const covered = parsed.terms.some((t) =>
        (t.name === "ip4" || t.name === "ip6") && cidrMatch(net!, t.value!, t.name === "ip4" ? t.cidr4 : t.cidr6) &&
        (pre === undefined || (t.name === "ip4" ? (t.cidr4 ?? 32) : (t.cidr6 ?? 128)) <= Number(pre)),
      );
      if (!covered) problems.push(p("spf-ip-absent", "error", `Your SPF record doesn't list ${ip}. Add "${ip.includes(":") ? "ip6" : "ip4"}:${ip}" before the "all" at the end.`));
    }
    if (expect.spfAll === "-all" && parsed.all === "~") {
      problems.push(p("spf-softfail", "info", 'Your SPF record ends in "~all" (soft fail). Once all your senders are listed, switch to "-all" for stronger protection.'));
    }
  }
  return {
    ...base,
    status: statusFrom(problems),
    found: rec,
    problems,
    details: { lookups: tree.count, voidLookups: tree.voidLookups, includes: parsed.includes, all: parsed.all, tree: tree.tree },
  };
}
