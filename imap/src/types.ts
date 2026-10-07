import type { ConnectionOptions } from "node:tls";

/** Username + password (LOGIN, or AUTHENTICATE PLAIN when LOGIN is disabled). */
export interface PasswordAuth {
  user: string;
  pass: string;
}

/** OAuth 2.0 bearer token (AUTHENTICATE XOAUTH2, or OAUTHBEARER when that is all the server offers). */
export interface TokenAuth {
  user: string;
  accessToken: string;
}

export interface ImapLogger {
  debug(msg: string): void;
}

export interface ImapClientOptions {
  host: string;
  /** Defaults to 993 when `secure`, else 143. */
  port?: number;
  /** Implicit TLS from the first byte (port 993). Default `true`. */
  secure?: boolean;
  /**
   * Only when `secure: false`. `true` (default) upgrades when the server advertises STARTTLS,
   * `"required"` fails the connection when it cannot upgrade, `false` never upgrades.
   */
  starttls?: boolean | "required";
  auth: PasswordAuth | TokenAuth;
  /** Connect + greeting timeout and per-command inactivity timeout. Default 30000 ms. */
  timeoutMs?: number;
  /** Close the socket after this long with no traffic at all. Off by default. */
  socketTimeoutMs?: number;
  /** Extra TLS options. `servername` defaults to `host`. Certificate verification stays ON unless you turn it off here. */
  tls?: ConnectionOptions;
  /** Protocol trace. LOGIN/AUTHENTICATE lines and literal contents are always redacted. */
  logger?: ImapLogger;
  /** Sent with the ID command (RFC 2971) after login when the server supports it. */
  clientId?: Record<string, string>;
}

export type SpecialUse =
  | "\\Inbox"
  | "\\Sent"
  | "\\Drafts"
  | "\\Trash"
  | "\\Junk"
  | "\\Archive"
  | "\\All"
  | "\\Flagged";

export interface Mailbox {
  /** Decoded UTF-8 path, e.g. `INBOX/Отправленные`. */
  path: string;
  /** Path exactly as the server sent it (modified UTF-7). Use `path` with this library's methods. */
  rawPath: string;
  /** Last path segment, decoded. */
  name: string;
  /** Hierarchy delimiter, `null` for a flat namespace. */
  delimiter: string | null;
  flags: string[];
  specialUse?: SpecialUse;
  subscribed?: boolean;
}

export interface SelectedMailbox {
  path: string;
  exists: number;
  recent: number;
  /** Sequence number of the first unseen message ([UNSEEN n] from SELECT) — NOT a count. Use `status()` for the count. */
  unseen?: number;
  uidValidity: number;
  uidNext: number;
  highestModseq?: bigint;
  flags: string[];
  permanentFlags: string[];
  readOnly: boolean;
}

export type StatusItem = "MESSAGES" | "UNSEEN" | "UIDNEXT" | "UIDVALIDITY" | "RECENT" | "HIGHESTMODSEQ";

export interface MailboxStatus {
  messages: number;
  unseen: number;
  uidNext: number;
  uidValidity: number;
  recent: number;
  highestModseq?: bigint;
}

export interface SearchCriteria {
  all?: boolean;
  seen?: boolean;
  unseen?: boolean;
  flagged?: boolean;
  unflagged?: boolean;
  answered?: boolean;
  deleted?: boolean;
  draft?: boolean;
  /** Internal date on or after (date part only, UTC). */
  since?: Date;
  before?: Date;
  on?: Date;
  /** Date: header on or after. */
  sentSince?: Date;
  sentBefore?: Date;
  sentOn?: Date;
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body?: string;
  text?: string;
  header?: [string, string][];
  uid?: string | number[];
  larger?: number;
  smaller?: number;
  keyword?: string;
  unkeyword?: string;
  or?: [SearchCriteria, SearchCriteria];
  not?: SearchCriteria;
  /** CONDSTORE: messages with mod-sequence >= n. */
  modseq?: bigint | number;
}

export interface FetchQuery {
  envelope?: boolean;
  flags?: boolean;
  internalDate?: boolean;
  size?: boolean;
  bodyStructure?: boolean;
  /** `true` → whole header block; array → only those fields (HEADER.FIELDS). */
  headers?: string[] | true;
  /** Section specs: 'TEXT', 'HEADER', '1', '1.2', '1.MIME' … */
  bodyParts?: string[];
  /** Whole raw message (BODY[]). */
  source?: boolean;
  /** Default `true` → BODY.PEEK (does not set \Seen). */
  peek?: boolean;
  /** CONDSTORE: only messages changed since this mod-sequence. */
  changedSince?: bigint | number;
  /** Ask for MODSEQ (needs CONDSTORE). Implied by `changedSince`. */
  modseq?: boolean;
  /** Partial fetch of every `bodyParts` entry: `<0.N>`. */
  maxPartBytes?: number;
  /** Gmail X-GM-LABELS (only when X-GM-EXT-1 is advertised). */
  gmLabels?: boolean;
}

export interface Address {
  name: string;
  address: string;
}

export interface Envelope {
  date?: Date | null;
  subject?: string;
  from: Address[];
  sender: Address[];
  replyTo: Address[];
  to: Address[];
  cc: Address[];
  bcc: Address[];
  inReplyTo?: string;
  messageId?: string;
}

/** Shared contract with @lacspace/mime. */
export interface BodyStructureNode {
  /** "1", "1.2"; root single part = "1"; root multipart = "" with children "1", "2". */
  partId: string;
  /** lowercase */
  type: string;
  /** lowercase */
  subtype: string;
  /** lowercase keys, RFC 2231/2047 decoded */
  params: Record<string, string>;
  id?: string;
  description?: string;
  encoding?: string;
  size?: number;
  lines?: number;
  md5?: string;
  disposition?: { type: string; params: Record<string, string> };
  language?: string[];
  location?: string;
  envelope?: unknown;
  childNode?: BodyStructureNode;
  children?: BodyStructureNode[];
}

export interface FetchedMessage {
  seq: number;
  uid: number;
  flags?: string[];
  envelope?: Envelope;
  internalDate?: Date;
  size?: number;
  bodyStructure?: BodyStructureNode;
  /** Raw header bytes (BODY[HEADER] or BODY[HEADER.FIELDS (...)]). */
  headers?: Uint8Array;
  /** Keyed by section spec as requested ('1', '1.2', 'TEXT' …). */
  parts: Record<string, Uint8Array>;
  source?: Uint8Array;
  modseq?: bigint;
  /** Gmail labels (decoded), when requested with `gmLabels: true`. */
  labels?: string[];
}

export interface StoreResult extends Map<number, string[]> {
  /** CONDSTORE [MODIFIED …]: messages NOT updated because they changed after `unchangedSince`. */
  modified?: number[];
}

export interface CopyResult {
  uidValidity?: number;
  sourceUids?: number[];
  destUids?: number[];
}

export interface AppendResult {
  uid?: number;
  uidValidity?: number;
}

export interface QuotaResource {
  usage: number;
  limit: number;
}

export interface Quota {
  root: string;
  /** STORAGE is in KiB (RFC 2087). */
  resources: Record<string, QuotaResource> & { STORAGE?: QuotaResource; MESSAGE?: QuotaResource };
}

export type ImapEvent =
  | { type: "exists"; path: string | null; count: number; prevCount: number }
  | { type: "expunge"; path: string | null; seq: number }
  | { type: "fetch"; path: string | null; seq: number; uid?: number; flags?: string[]; modseq?: bigint }
  | { type: "recent"; path: string | null; count: number }
  | { type: "flags"; path: string | null; flags: string[] };

export interface IdleOptions {
  onEvent?: (e: ImapEvent) => void;
  signal?: AbortSignal;
  /** NOOP poll interval when the server lacks IDLE. Default 60000. */
  pollIntervalMs?: number;
  /** Re-issue IDLE this often (RFC 2177 says < 30 min). Default 29 min. */
  refreshMs?: number;
}
