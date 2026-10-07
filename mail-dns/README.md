# @lacspace/mail-dns

Generate and verify a domain's **email DNS records**: MX, SPF, DKIM, DMARC, MTA-STS, TLS-RPT and BIMI. It is built for a domain onboarding wizard ("add these records, then click Verify"):
- `generateRecords()` gives the exact records to add;
- `checkDomain()` looks them up, scores the domain from 0 to 100 and explains every failure in plain English.

It has no dependencies. Parsers and generators are pure and run anywhere. Lookups use one of:
- your own resolver;
- Node's `dns/promises`, loaded lazily;
- DNS-over-HTTPS, for edge runtimes.

```ts
import { generateRecords, checkDomain, explain } from "@lacspace/mail-dns";

const setup = {
  domain: "acme.com",
  mailHost: "mx1.mail.lacspace.com",
  spfInclude: ["_spf.mail.lacspace.com"],
  dkim: { selector: "lac1", publicKey: "MIIBIjANBgkq..." },   // base64, PEM, or a full v=DKIM1 value
  dmarc: { policy: "none", rua: ["dmarc@acme.com"] },
  mtaSts: { mode: "testing", policyHost: "mta-sts.mail.lacspace.com" },
  tlsRpt: { rua: ["tls@acme.com"] },
};

const { records, mtaStsPolicyFile, notes } = generateRecords(setup);
// [{ type: "MX",  name: "@", fqdn: "acme.com", value: "mx1.mail.lacspace.com", priority: 10, ttl: 3600, required: true, purpose: "Delivers email for acme.com to ..." },
//  { type: "TXT", name: "@", value: "v=spf1 include:_spf.mail.lacspace.com ~all", ... },
//  { type: "TXT", name: "lac1._domainkey", value: "v=DKIM1; k=rsa; p=MIIB...", chunks: [/* ≤255-char strings */] },
//  { type: "TXT", name: "_dmarc", value: "v=DMARC1; p=none; rua=mailto:dmarc@acme.com" },
//  { type: "TXT", name: "_mta-sts", value: "v=STSv1; id=1f3a9c..." }, { type: "CNAME", name: "mta-sts", ... },
//  { type: "TXT", name: "_smtp._tls", value: "v=TLSRPTv1; rua=mailto:tls@acme.com" }]

const report = await checkDomain("acme.com", { expect: setup });
report.ok;      // true when MX, SPF, DKIM and DMARC all work
report.score;   // 0–100
report.fixes;   // ["Add an MX record at @ pointing to mx1.mail.lacspace.com with priority 10.", ...]
explain(report.checks.spf);
// Allowed senders (SPF): Broken: this needs fixing.
// - Your SPF record has 12 DNS lookups; the limit is 10, so receivers will treat it as broken. ...
```

## Onboarding wizard

```ts
// 1. Show the records. Each row has name, value, a copy button and a plain-English `purpose`.
const { records, mtaStsPolicyFile, notes } = generateRecords(setup);
render(records.filter((r) => r.required), records.filter((r) => !r.required), notes);
// Serve mtaStsPolicyFile.body at mtaStsPolicyFile.url as text/plain.
// toZoneFile(records) gives a BIND snippet for "copy all" or a zone import.

// 2. "Verify": poll until green, giving DNS time to propagate.
async function verify() {
  for (let i = 0; i < 20; i++) {
    const r = await checkDomain(setup.domain, { expect: setup, timeoutMs: 4000 });
    showTicks({
      mx: r.checks.mx.status,             // "pass" | "warn" | "fail" | "missing" | "error"
      spf: r.checks.spf.status,
      dkim: r.checks.dkim[0]!.status,     // the expected selector comes first
      dmarc: r.checks.dmarc.status,
    });
    showFixes(r.fixes);                    // errors first, then warnings
    if (r.ok) return r;
    await new Promise((res) => setTimeout(res, 30_000));
  }
}
```

The fixes are written for a non-technical founder, and when you pass `expect` they include the exact value to add. A domain that already has mail elsewhere gets told about leftover MX hosts and duplicate SPF records. If a DNS panel appended the domain twice (`_dmarc.acme.com.acme.com`), the fix says so.

## Checks

| Check | What is verified |
|---|---|
| **MX** | Records present. Each host resolves (A/AAAA). Hosts are not IP literals and not CNAMEs. Priorities are in range. Detects a null MX (`0 .`). Lists expected hosts that are missing and leftover hosts. Warns when another host has a lower priority. |
| **SPF** | Exactly one `v=spf1` record. Full syntax check. DNS lookups counted **recursively** against the 10-lookup limit, following include/redirect, with cycle detection and a void-lookup limit of 2. Flags `+all`/`?all`, `ptr`, a missing `all`, terms after `all`, very wide CIDRs, and missing expected includes/IPs. |
| **DKIM** | Tries the expected selector, your `dkimSelectors`, and the common and provider selectors. Parses the key, reads the exact RSA size from the DER, and flags revoked `p=`, `t=y` testing, sha1-only and key mismatch. Revoked spare selectors (normal during rotation) are reported but never count as working. |
| **DMARC** | Exactly one record at `_dmarc`, all tags validated. Suggests moving on from `p=none` (quarantine, then reject), plus pct < 100, `sp=none` and missing `rua`. External report addresses are checked for the `<domain>._report._dmarc.<rua-domain>` authorization. Spots a record published at `@` or under a doubled name. |
| **MTA-STS** | `_mta-sts` TXT (`v=STSv1; id=`). Fetches `https://mta-sts.<domain>/.well-known/mta-sts.txt` without following redirects, then checks the content type, the policy fields and that every MX host is covered by a policy `mx:` pattern. A host missing from an **enforce** policy is an error. Also flags testing mode and a short `max_age`. |
| **TLS-RPT** | `_smtp._tls` TXT `v=TLSRPTv1` with a valid `rua` (mailto: or https:). |
| **BIMI** | `default._bimi`, reported when present or when `{ bimi: true }`: SVG logo, VMC, and a DMARC policy of quarantine/reject at 100%. |

## Scoring

| Check | Points | | Status | Credit |
|---|---|---|---|---|
| MX | 25 | | pass | 100% |
| SPF | 25 | | warn | 50% |
| DKIM (expected selector, else best live one) | 20 | | fail / missing / error | 0 |
| DMARC | 20 | | | |
| MTA-STS | 5 | | | |
| TLS-RPT | 5 | | | |

- **Status rules:**
  - an `error` problem makes a check `fail`;
  - a `warning` makes it `warn`;
  - `info` notes never lower the score.
- **What "pass" requires:** MTA-STS has to be in enforce mode and DMARC has to be at quarantine or reject, so a new domain on `p=none` with no MTA-STS typically scores 80.
- **`ok`:** MX, SPF, DKIM and DMARC all work, plus MTA-STS and TLS-RPT when they are in `expect`.
- **Exports:** `SCORE_WEIGHTS`, `STATUS_CREDIT` and `scoreChecks()` are exported so a UI can show the rubric.

## Provider presets

```ts
import { PROVIDERS, detectProviders, providerMx } from "@lacspace/mail-dns";
report.providers;                         // ["hostinger"]: "Detected: Hostinger"
providerMx("microsoft365", "acme.co.uk"); // [{ host: "acme-co-uk.mail.protection.outlook.com", priority: 0 }]
```

Each preset records where its values were checked (`verified.spf / mx / dkim`, on 2026-10-07):
- `docs`: the provider's documentation;
- `dns`: live DNS;
- `unverified`: neither.

| Provider | SPF include | MX | DKIM selectors |
|---|---|---|---|
| Hostinger | `_spf.mail.hostinger.com` (docs+dns) | `mx1.hostinger.com` 5, `mx2.hostinger.com` 10 (dns) | `hostingermail-a/-b/-c`, CNAMEs (dns) |
| Google Workspace | `_spf.google.com` (docs+dns) | `smtp.google.com` 1 (docs+dns) | `google` (unverified) |
| Microsoft 365 | `spf.protection.outlook.com` (docs+dns) | `<domain-dashed>.mail.protection.outlook.com` 0 (docs) | `selector1`, `selector2` (docs) |
| Zoho Mail | `zohomail.com` (docs+dns) | `mx.zoho.com` 10 / `mx2` 20 / `mx3` 50 (docs+dns) | admin-chosen, e.g. `zoho` (docs) |
| GoDaddy | `secureserver.net` (dns) | `smtp.secureserver.net` 0, `mailstore1.secureserver.net` 10 (dns) | (unverified) |
| Amazon SES | `amazonses.com` (docs+dns) | `inbound-smtp.<region>.amazonaws.com` (docs+dns) | random-token CNAMEs (cannot be guessed) |
| SendGrid | `sendgrid.net` (docs+dns) | — | `s1`, `s2` (docs) |
| Mailgun | `mailgun.org` (docs+dns) | `mxa/mxb.mailgun.org` 10 (docs+dns) | per domain (unverified) |
| Brevo | `spf.brevo.com` (dns) | — | `brevo1`, `brevo2` (unverified) |

## DNS sources

```ts
checkDomain("acme.com");                                             // node:dns/promises (lazy import)
checkDomain("acme.com", { doh: "https://cloudflare-dns.com/dns-query" }); // DoH JSON, for edge/workers
checkDomain("acme.com", { doh: "https://dns.google/resolve", fetch });
checkDomain("acme.com", { resolver: myResolver });                    // { resolveTxt, resolveMx, resolve4?, resolve6?, resolveCname? }
```

- **Shared lookups:** within one `checkDomain` call, lookups are cached and de-duplicated.
- **Timeouts:** each lookup has its own timeout (`timeoutMs`, default 5000).
- **Failures:** a failed lookup becomes `status: "error"` and never throws.
- **The MTA-STS policy:** it is fetched with the injected `fetch`, or `globalThis.fetch`.

## Other exports

- **SPF:**
  - `parseSpf`, `findSpfRecords`, `buildSpf`;
  - `countSpfLookups(domain, { record? })`, which can check a record before it is published;
  - `evaluateSpf(ip, domain)`, which returns pass/fail/softfail/neutral/none/permerror/temperror. It covers ip4/ip6 CIDR, a, mx, include, redirect and all.
- **DMARC:** `parseDmarc`, `buildDmarc`, `externalReportDomains`.
- **DKIM:**
  - `parseDkimKey`, `normalizeDkimPublicKey`, `buildDkim`;
  - `rsaModulusBits`, `base64ToBytes`;
  - `COMMON_DKIM_SELECTORS`.
- **MTA-STS / TLS-RPT / BIMI:**
  - `parseMtaStsTxt`, `parseMtaStsPolicy`, `buildMtaStsPolicy`, `mxMatchesPattern`, `uncoveredMx`;
  - `parseTlsRpt`, `buildTlsRpt`, `parseBimi`.
- **DNS:** `nodeResolver`, `dohResolver`, `parseDohAnswer`, `parseTxtData`.
- **IP:** `cidrMatch`, `parseIp4`, `parseIp6`.
- **Text:** `explain(check)`, `explainReport(report)`, `CHECK_LABELS`.

## Limitations

- **DKIM selectors:** there is no way to list them, so only known names are tried. Pass `dkimSelectors` (or `expect.dkim`) for custom or rotating ones. Gmail's own consumer key, for example, uses an undisclosed dated selector.
- **`evaluateSpf`:** it skips `exists`, `ptr` and macro domains, treating them as no-match with a note. It also does not apply the void-lookup limit while evaluating; `countSpfLookups` reports that limit.
- **Organisational domain:** for DMARC report authorization this is a heuristic (the last two labels, three for `co.uk`-style suffixes), not the full Public Suffix List.
- **`p=none` age:** it cannot be known from DNS, so the advice is to move on once reports look clean.
- **MTA-STS certificates:** the HTTPS certificate is validated only by your runtime's `fetch`, with no separate certificate check.
- **Not covered:** DNSSEC, DANE/TLSA, ARC, and SMTP-level checks such as STARTTLS or open relay.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0): free for personal and commercial use.
