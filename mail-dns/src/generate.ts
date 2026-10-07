/** Generate the DNS records a domain needs for a mail platform. Pure. */
import { buildDkim } from "./dkim.js";
import { buildDmarc, externalReportDomains } from "./dmarc.js";
import { expectedMxHosts } from "./mx.js";
import { buildMtaStsPolicy, buildTlsRpt } from "./policy.js";
import { normalizeDomain } from "./resolver.js";
import { buildSpf, parseSpf } from "./spf.js";
import type { DnsRecord, GeneratedRecords, MailDomainConfig } from "./types.js";
import { fnv1a } from "./util.js";

/** Split a TXT value into ≤255-character DNS strings. Pure. */
export function splitTxt(value: string, size = 255): string[] {
  const out: string[] = [];
  for (let i = 0; i < value.length; i += size) out.push(value.slice(i, i + size));
  return out.length ? out : [""];
}

/**
 * The records to show in an onboarding wizard ("add these, then click Verify").
 * Names are given both relative to the zone (`name`) and fully-qualified (`fqdn`).
 */
export function generateRecords(cfg: MailDomainConfig): GeneratedRecords {
  const domain = normalizeDomain(cfg.domain);
  const ttl = cfg.ttl ?? 3600;
  const records: DnsRecord[] = [];
  const notes: string[] = [];
  const rec = (r: Omit<DnsRecord, "fqdn" | "ttl"> & { ttl?: number }): void => {
    const fqdn = r.name === "@" ? domain : `${r.name}.${domain}`;
    const full: DnsRecord = { ...r, fqdn, ttl: r.ttl ?? ttl };
    if (r.type === "TXT" && r.value.length > 255) full.chunks = splitTxt(r.value);
    records.push(full);
  };

  const mx = expectedMxHosts({ ...cfg, domain });
  for (const m of mx) {
    rec({ type: "MX", name: "@", value: m.host, priority: m.priority, purpose: `Delivers email for ${domain} to ${m.host}${mx.length > 1 ? ` (priority ${m.priority}; lower is tried first)` : ""}.`, required: true });
  }

  const spf = buildSpf(cfg);
  const spfParsed = parseSpf(spf);
  rec({ type: "TXT", name: "@", value: spf, purpose: "SPF: lists the servers allowed to send email as your domain.", required: true });
  if (spfParsed.lookupTerms > 10) notes.push(`The SPF record uses ${spfParsed.lookupTerms} DNS lookups before counting nested includes; the limit is 10. Remove includes or use ip4:/ip6: entries.`);
  if ((cfg.spfAll ?? "~all") === "~all") notes.push('SPF starts with "~all" (soft fail) while you onboard. Once all your sending services are listed, change it to "-all".');
  notes.push("A domain can only have one SPF record. If one already exists, merge these entries into it instead of adding a second.");

  if (cfg.dkim) {
    const sel = cfg.dkim.selector.trim().toLowerCase();
    rec({ type: "TXT", name: `${sel}._domainkey`, value: buildDkim(cfg.dkim.publicKey), purpose: "DKIM: the public key receivers use to check that your emails were really signed by you and not changed.", required: true });
  }

  const d = cfg.dmarc ?? {};
  const dmarc = buildDmarc(d);
  rec({ type: "TXT", name: "_dmarc", value: dmarc, purpose: "DMARC: tells receivers what to do with mail that fails SPF and DKIM, and where to send reports.", required: true });
  if ((d.policy ?? "none") === "none") notes.push('DMARC starts at "p=none" (monitor only). After 2–4 weeks of clean reports, move to "p=quarantine", then "p=reject".');
  for (const rd of externalReportDomains(domain, [...(d.rua ?? []), ...(d.ruf ?? [])].map((a) => (/^mailto:/i.test(a) ? a : `mailto:${a}`)))) {
    notes.push(`DMARC reports go to ${rd}, a different domain. Its owner must publish a TXT record "${domain}._report._dmarc.${rd}" with the value "v=DMARC1", or receivers won't send the reports.`);
  }

  let mtaStsPolicyFile: GeneratedRecords["mtaStsPolicyFile"];
  if (cfg.mtaSts) {
    const m = cfg.mtaSts;
    const mxList = (m.mx?.length ? m.mx : mx.map((x) => x.host)).map(normalizeDomain);
    const maxAge = m.maxAge ?? (m.mode === "enforce" ? 604800 : 86400);
    const body = buildMtaStsPolicy(m.mode, mxList, maxAge);
    const id = m.id ?? fnv1a(body) + body.length.toString(16);
    rec({ type: "TXT", name: "_mta-sts", value: `v=STSv1; id=${id}`, purpose: "MTA-STS: announces that senders must use an encrypted (TLS) connection to deliver to you. Change the id whenever the policy file changes.", required: false });
    if (m.policyHost) {
      rec({ type: "CNAME", name: "mta-sts", value: normalizeDomain(m.policyHost), purpose: `Points mta-sts.${domain} at the server that hosts your MTA-STS policy file.`, required: false });
    } else {
      notes.push(`Host the MTA-STS policy file at https://mta-sts.${domain}/.well-known/mta-sts.txt (HTTPS with a valid certificate, Content-Type text/plain).`);
    }
    mtaStsPolicyFile = { url: `https://mta-sts.${domain}/.well-known/mta-sts.txt`, body, contentType: "text/plain" };
    if (m.mode === "testing") notes.push('MTA-STS starts in "testing" mode. When TLS reports are clean, switch to "enforce".');
  }

  if (cfg.tlsRpt?.rua.length) {
    rec({ type: "TXT", name: "_smtp._tls", value: buildTlsRpt(cfg.tlsRpt.rua), purpose: "TLS-RPT: other mail servers send you a daily report when encrypted delivery to you fails.", required: false });
  }

  return { records, ...(mtaStsPolicyFile ? { mtaStsPolicyFile } : {}), notes };
}

/** Render records as BIND zone-file lines (for a "copy all" button or a zone import). Pure. */
export function toZoneFile(records: DnsRecord[]): string {
  const q = (v: string) => (v.length > 255 ? splitTxt(v) : [v]).map((s) => `"${s.replace(/(["\\])/g, "\\$1")}"`).join(" ");
  return records
    .map((r) => {
      const name = `${r.fqdn}.`;
      if (r.type === "MX") return `${name}\t${r.ttl}\tIN\tMX\t${r.priority ?? 10} ${r.value}.`;
      if (r.type === "CNAME") return `${name}\t${r.ttl}\tIN\tCNAME\t${r.value}.`;
      return `${name}\t${r.ttl}\tIN\tTXT\t${q(r.value)}`;
    })
    .join("\n");
}
