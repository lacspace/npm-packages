/** Shared types for @lacspace/mail-dns. */

/**
 * An injectable DNS resolver. The shape matches `node:dns/promises`, so you can
 * pass that module (or a `new Resolver()` from it) straight in. A missing name
 * should reject with `code: "ENOTFOUND"` / `"ENODATA"` or resolve to `[]`.
 */
export interface DnsResolver {
  resolveTxt(name: string): Promise<string[][]>;
  resolveMx(name: string): Promise<{ exchange: string; priority: number }[]>;
  resolve4?(name: string): Promise<string[]>;
  resolve6?(name: string): Promise<string[]>;
  resolveCname?(name: string): Promise<string[]>;
}

/** A `fetch`-compatible function (global fetch, undici, a test fake). */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; signal?: unknown; redirect?: "follow" | "manual" | "error" },
) => Promise<{
  ok: boolean;
  status: number;
  redirected?: boolean;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json?(): Promise<unknown>;
}>;

export type CheckStatus = "pass" | "warn" | "fail" | "missing" | "error";
export type CheckKind = "mx" | "spf" | "dkim" | "dmarc" | "mtaSts" | "tlsRpt" | "bimi";
export type Severity = "error" | "warning" | "info";

/** One thing wrong (or worth knowing) about a record. `message` is plain English. */
export interface Problem {
  code: string;
  message: string;
  severity: Severity;
}

/** The result of checking one kind of record. */
export interface Check {
  kind: CheckKind;
  status: CheckStatus;
  /** What is published right now (raw record text, or a list for MX). */
  found?: string | string[];
  /** What we expected, when `expect` was given. */
  expected?: string;
  problems: Problem[];
  /** DKIM only: the selector this check is about. */
  selector?: string;
  /** Machine-readable extras (lookup counts, parsed policy, ...). */
  details?: Record<string, unknown>;
}

export type SpfAll = "-all" | "~all";
export type DmarcPolicy = "none" | "quarantine" | "reject";

export interface MxHost {
  host: string;
  priority: number;
}

export interface MailDomainConfig {
  domain: string;
  /** Your inbound mail host, e.g. `mx1.mail.lacspace.com`. Used as the MX when `mxHosts` is not given. */
  mailHost: string;
  mxHosts?: MxHost[];
  spfInclude?: string[];
  spfIp4?: string[];
  spfIp6?: string[];
  /** Default `~all` while you onboard; move to `-all` once everything sends correctly. */
  spfAll?: SpfAll;
  dkim?: { selector: string; publicKey: string };
  dmarc?: {
    policy?: DmarcPolicy;
    rua?: string[];
    ruf?: string[];
    pct?: number;
    adkim?: "r" | "s";
    aspf?: "r" | "s";
    sp?: DmarcPolicy;
  };
  mtaSts?: {
    mode: "testing" | "enforce" | "none";
    mx?: string[];
    maxAge?: number;
    /** Policy id; default is a hash of the policy body, so it only changes when the policy does. */
    id?: string;
    /** Host that serves `https://mta-sts.<domain>`; adds a CNAME record for it. */
    policyHost?: string;
  };
  tlsRpt?: { rua: string[] };
  /** Default TTL for generated records (seconds). Default 3600. */
  ttl?: number;
}

export type RecordType = "MX" | "TXT" | "CNAME";

export interface DnsRecord {
  type: RecordType;
  /** Host name relative to the zone: `@`, `_dmarc`, `s1._domainkey`, ... */
  name: string;
  /** Fully-qualified name, without the trailing dot. */
  fqdn: string;
  value: string;
  /** TXT values over 255 characters, split into DNS-safe strings (some panels want them separately). */
  chunks?: string[];
  priority?: number;
  ttl: number;
  /** What the record does, in plain English. */
  purpose: string;
  required: boolean;
}

export interface GeneratedRecords {
  records: DnsRecord[];
  mtaStsPolicyFile?: { url: string; body: string; contentType: "text/plain" };
  /** Extra setup notes (external report addresses, hosting the policy file, ...). */
  notes: string[];
}

export interface CheckOptions {
  /** What the domain should have (same shape as `generateRecords` input; `domain` is optional here). */
  expect?: Partial<MailDomainConfig>;
  resolver?: DnsResolver;
  /** DNS-over-HTTPS JSON endpoint, for edge runtimes without `node:dns`. */
  doh?: string;
  /** Used for DoH and for fetching the MTA-STS policy. Defaults to `globalThis.fetch`. */
  fetch?: FetchLike;
  /** Per-lookup timeout. Default 5000 ms. */
  timeoutMs?: number;
  /** Extra DKIM selectors to try (the common ones are always tried). */
  dkimSelectors?: string[];
  /** Also check BIMI (`default._bimi`). It is reported anyway when a record exists. */
  bimi?: boolean;
}

export interface DomainReport {
  domain: string;
  /** True when MX, SPF, DKIM and DMARC are all working (pass or warn), plus anything you `expect`ed. */
  ok: boolean;
  score: number;
  checks: {
    mx: Check;
    spf: Check;
    dkim: Check[];
    dmarc: Check;
    mtaSts: Check;
    tlsRpt: Check;
    bimi?: Check;
  };
  /** What to do next, most important first, in plain English. */
  fixes: string[];
  /** Mail providers recognised from the records, e.g. `["hostinger"]`. */
  providers: string[];
}
