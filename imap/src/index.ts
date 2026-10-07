/**
 * @lacspace/imap — zero-dependency IMAP4rev1 client (RFC 3501 + common extensions)
 * over node:net / node:tls. Pairs with @lacspace/mime (parsing) and @lacspace/mailer (SMTP).
 */
export { ImapClient, createImapClient } from "./client.js";
export type { CommandResult } from "./client.js";
export { ImapError, ImapAuthError, ImapNetworkError, ImapProtocolError, ImapCommandError } from "./errors.js";
export { encodeModifiedUtf7, decodeModifiedUtf7 } from "./utf7.js";
export { parseImapResponse, ResponseFramer } from "./parser.js";
export type { ImapToken, ImapAtom, ImapQuoted, ImapLiteral, ImapList, ImapResponse, ImapResponseCode } from "./parser.js";
export { buildSearch, uidRange, sortUidsDesc, expandSequenceSet } from "./encode.js";
export type { BuiltSearch, CommandArg } from "./encode.js";
export { parseBodyStructure, parseEnvelope } from "./structures.js";
export { decodeWords } from "./rfc2047.js";
export { SPECIAL_USE_NAMES } from "./mailboxes.js";
export type * from "./types.js";
