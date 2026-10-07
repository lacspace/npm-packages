export {
  parseAuthenticationResults,
  type Verdict,
  type AuthResults,
  type AuthInputObject,
  type ParseAuthOptions,
} from "./authResults";
export {
  assessRisk,
  RISK_THRESHOLDS,
  SIGNAL_WEIGHTS,
  type MailAddress,
  type RiskMessage,
  type RiskOptions,
  type RiskSignal,
  type RiskLevel,
  type RiskAssessment,
} from "./risk";
export {
  receivingServer,
  inferAuthservIds,
  type ReceivingServer,
  type ReceivingServerOptions,
} from "./receiving";
export {
  lookalikeOf,
  skeleton,
  registrableDomain,
  decodePunycode,
  toUnicodeDomain,
  isFreeMail,
  FREE_MAIL_DOMAINS,
  editDistance,
  hasMixedScript,
  isWholeScriptConfusable,
} from "./domain";
