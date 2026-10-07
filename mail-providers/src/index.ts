/**
 * @lacspace/mail-providers — IMAP/SMTP presets and MX-based provider detection.
 * No DNS calls (bring your own MX lookup). Zero dependencies, isomorphic.
 */

export { PRESETS, PROVIDER_KEYS, isProviderKey, presetFor } from "./presets";
export type { ProviderKey, ProviderPreset, ServerSettings, SendLimits } from "./presets";
export {
  MX_HINTS,
  DOMAIN_HINTS,
  normalizeMx,
  providerFromMx,
  providerFromMxHost,
  providerFromDomain,
  domainOf,
  serverCandidates,
} from "./detect";
export type { MxInput, CandidateServer, ServerCandidate, CandidateOptions } from "./detect";
