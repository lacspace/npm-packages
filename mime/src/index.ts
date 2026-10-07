/**
 * @lacspace/mime — isomorphic RFC 5322 / 2045–2049 MIME parser + builder.
 * Zero dependencies; Node 18+, edge runtimes and browsers.
 */

export type {
  Address,
  Attachment,
  BodyStructureNode,
  ListUnsubscribe,
  ParsedMail,
  ParseOptions,
  PartNode,
} from "./types";
export type { AddressInput } from "./address";
export type { BuildAttachment, BuildMail } from "./build";

export { parseMime, parseDate, parseMessageIds } from "./parse";
export { MailHeaders, parseHeaders, parseHeaderParams } from "./headers";
export { parseAddressList, parseAddress, formatAddress, formatAddressList } from "./address";
export { decodeWords, encodeWord, encodeHeader, foldText, MimeError } from "./words";
export { parseBodyStructure, decodePart } from "./bodystructure";
export { findTextParts, listAttachments } from "./tree";
export { buildMime, wrap76, rfc2822Date, generateMessageId, guessContentType } from "./build";
export { replyHeaders, replySubject, forwardSubject } from "./reply";
export {
  decodeBase64,
  encodeBase64,
  decodeQuotedPrintable,
  encodeQuotedPrintable,
  decodeCharset,
  normalizeCharset,
} from "./bytes";
