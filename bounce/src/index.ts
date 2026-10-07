/**
 * @lacspace/bounce — classify bounces (RFC 3464 DSN and plain-text vendor
 * bounces), spam complaints (RFC 5965 ARF) and auto-replies (RFC 3834).
 * Zero dependencies, isomorphic.
 */

export { parseBounce } from "./parse";
export type {
  BounceInput,
  BounceKind,
  BounceRecipient,
  BounceReport,
  DsnAction,
  StructuredMessage,
} from "./parse";
export { classifyStatus, categoryFromText, findEnhancedStatus, findBasicCode } from "./status";
export type { BounceCategory, StatusClassification } from "./status";
export { isBounce, isBounceSender, isAutoReply, extractAddress } from "./detect";
export type { HeaderInput } from "./mime";
