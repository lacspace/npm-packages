/** MX checks: present, resolvable, null MX, CNAME targets, expected hosts and priorities. */
import { ipFamily } from "./ip.js";
import { normalizeDomain, type Dns } from "./resolver.js";
import type { Check, MailDomainConfig, MxHost, Problem } from "./types.js";
import { prob as p, statusFrom } from "./util.js";

/** The MX hosts a config expects: `mxHosts`, else `mailHost` at priority 10. Pure. */
export function expectedMxHosts(cfg: Partial<MailDomainConfig> | undefined): MxHost[] {
  if (!cfg) return [];
  if (cfg.mxHosts?.length) return cfg.mxHosts.map((m) => ({ host: normalizeDomain(m.host), priority: m.priority }));
  if (cfg.mailHost) return [{ host: normalizeDomain(cfg.mailHost), priority: 10 }];
  return [];
}

/** True for an RFC 7505 null MX set (`0 .`): the domain accepts no mail. Pure. */
export function isNullMx(records: { exchange: string; priority: number }[]): boolean {
  return records.length === 1 && normalizeDomain(records[0]!.exchange) === "";
}

/** @internal */
export async function checkMx(dns: Dns, domain: string, expect?: Partial<MailDomainConfig>): Promise<Check> {
  const want = expectedMxHosts(expect);
  const wantStr = want.map((m) => `${m.priority} ${m.host}`).join(", ");
  const base: Check = { kind: "mx", status: "missing", problems: [], ...(want.length ? { expected: wantStr } : {}) };
  const r = await dns.mx(domain);
  if (r.kind === "error" || r.kind === "unsupported") {
    return { ...base, status: "error", problems: [p("dns-error", "error", `We couldn't look up ${domain}'s MX records (${r.kind === "error" ? r.error : "unsupported"}). This is usually temporary; try again shortly.`)] };
  }
  if (r.kind === "none") {
    return {
      ...base,
      problems: [p("mx-missing", "error", want.length
        ? `Your domain has no MX records, so nobody can email you. Add ${want.map((m) => `an MX record at @ pointing to ${m.host} with priority ${m.priority}`).join(", and ")}.`
        : "Your domain has no MX records, so nobody can email you. Add the MX records your mail provider gives you.")],
    };
  }
  const recs = [...r.value].sort((a, b) => a.priority - b.priority || a.exchange.localeCompare(b.exchange));
  const found = recs.map((m) => `${m.priority} ${m.exchange || "."}`);
  const problems: Problem[] = [];
  if (isNullMx(recs)) {
    problems.push(p("mx-null", want.length ? "error" : "warning", 'Your domain has a "null MX" record (priority 0, host "."), which tells the world it does not accept email at all. Delete it and add your mail provider\'s MX records.'));
    return { ...base, status: statusFrom(problems), found, problems, details: { nullMx: true } };
  }
  if (recs.some((m) => normalizeDomain(m.exchange) === "")) {
    problems.push(p("mx-null-mixed", "error", 'You have a "null MX" record (".") mixed in with real ones. Delete the "." record; it says your domain accepts no mail.'));
  }
  const seen = new Set<string>();
  const hosts = recs.map((m) => normalizeDomain(m.exchange)).filter((h) => h);
  for (const m of recs) {
    const h = normalizeDomain(m.exchange);
    if (!Number.isInteger(m.priority) || m.priority < 0 || m.priority > 65535) {
      problems.push(p("mx-bad-priority", "error", `The MX record for ${h} has priority ${m.priority}; it must be a whole number from 0 to 65535.`));
    }
    if (seen.has(h)) problems.push(p("mx-duplicate", "info", `${h} is listed more than once in your MX records. One entry is enough.`));
    seen.add(h);
  }
  await Promise.all(
    [...new Set(hosts)].map(async (h) => {
      if (ipFamily(h)) {
        problems.push(p("mx-ip", "error", `Your MX record points to an IP address (${h}). MX records must point to a host name, like mx1.example.com.`));
        return;
      }
      const [a, aaaa, cname] = await Promise.all([dns.a(h), dns.aaaa(h), dns.cname(h)]);
      if (cname.kind === "ok" && cname.value.length) {
        problems.push(p("mx-cname", "warning", `Your MX host ${h} is an alias (CNAME) for ${cname.value[0]}. Mail standards forbid this and some senders will fail; point the MX record directly at ${cname.value[0]}.`));
      }
      const unsupported = a.kind === "unsupported" && aaaa.kind === "unsupported";
      if (!unsupported && a.kind !== "ok" && aaaa.kind !== "ok" && a.kind !== "error" && aaaa.kind !== "error") {
        problems.push(p("mx-unresolvable", "error", `Your MX host ${h} doesn't exist in DNS (no IP address), so mail sent to you will bounce. Check the spelling of the host name.`));
      }
    }),
  );
  if (want.length) {
    const wantHosts = want.map((m) => m.host);
    for (const m of want) {
      if (!hosts.includes(m.host)) problems.push(p("mx-expected-missing", "error", `Add an MX record at @ pointing to ${m.host} with priority ${m.priority}.`));
    }
    const extra = [...new Set(hosts.filter((h) => !wantHosts.includes(h)))];
    if (extra.length) {
      problems.push(p("mx-extra", "warning", `Your domain also has MX records for ${extra.join(", ")}. Some mail may be delivered there instead of your new mailbox. Delete them unless you use them on purpose.`));
    }
    const primaryWant = [...want].sort((a, b) => a.priority - b.priority)[0]!.host;
    const primaryFound = recs.find((m) => normalizeDomain(m.exchange))?.exchange;
    if (hosts.includes(primaryWant) && primaryFound && normalizeDomain(primaryFound) !== primaryWant && !wantHosts.includes(normalizeDomain(primaryFound))) {
      problems.push(p("mx-priority", "warning", `${primaryFound} has a lower priority number than ${primaryWant}, so senders try it first. Give ${primaryWant} the lowest number.`));
    }
  }
  return { ...base, status: statusFrom(problems), found, problems, details: { hosts } };
}
