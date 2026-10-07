/**
 * @lacspace/mail-dns
 * Generate and verify a domain's email DNS: MX, SPF, DKIM, DMARC, MTA-STS,
 * TLS-RPT and BIMI, with failures explained in plain English.
 *
 * Parsers and generators are pure and isomorphic. Lookups use an injectable
 * resolver, Node's `dns/promises` (loaded lazily), or DNS-over-HTTPS.
 * Zero dependencies.
 */
export type {
  Check, CheckKind, CheckOptions, CheckStatus, DmarcPolicy, DnsRecord, DnsResolver, DomainReport, FetchLike,
  GeneratedRecords, MailDomainConfig, MxHost, Problem, RecordType, Severity, SpfAll,
} from "./types.js";

export { generateRecords, toZoneFile, splitTxt } from "./generate.js";
export { checkDomain, scoreChecks, primaryDkim, SCORE_WEIGHTS, STATUS_CREDIT } from "./check.js";
export { explain, explainReport, CHECK_LABELS, STATUS_TEXT } from "./explain.js";

export {
  parseSpf, findSpfRecords, buildSpf, countSpfLookups, evaluateSpf,
  type ParsedSpf, type SpfTerm, type SpfQualifier, type SpfMechanism, type SpfNode, type SpfLookupReport, type SpfResult, type SpfEvaluation, type SpfDnsOptions,
} from "./spf.js";
export { parseDmarc, isDmarcRecord, buildDmarc, externalReportDomains, type ParsedDmarc } from "./dmarc.js";
export {
  parseDkimKey, normalizeDkimPublicKey, buildDkim, base64ToBytes, rsaModulusBits, COMMON_DKIM_SELECTORS, type ParsedDkimKey,
} from "./dkim.js";
export { isNullMx, expectedMxHosts } from "./mx.js";
export {
  parseMtaStsTxt, parseMtaStsPolicy, mxMatchesPattern, uncoveredMx, buildMtaStsPolicy, parseTlsRpt, buildTlsRpt, parseBimi,
  type ParsedMtaStsTxt, type MtaStsPolicy, type ParsedTlsRpt, type ParsedBimi,
} from "./policy.js";
export { PROVIDERS, detectProviders, providerMx, providerDkimSelectors, type MailProvider, type DetectedProvider, type Verification } from "./providers.js";
export { nodeResolver, dohResolver, parseDohAnswer, parseTxtData, pickResolver } from "./resolver.js";
export { cidrMatch, parseIp4, parseIp6, ipFamily } from "./ip.js";
