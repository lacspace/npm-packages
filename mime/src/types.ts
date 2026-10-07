/** Public types for @lacspace/mime. */

import type { MailHeaders } from "./headers";

/** A mailbox. Groups (`Team: a@x, b@y;`) are flattened; `group` keeps the group's name. */
export interface Address {
  name: string;
  address: string;
  group?: string;
}

/**
 * One node of a MIME body tree, in the exact shape `@lacspace/imap` returns for
 * BODYSTRUCTURE. Part numbering follows IMAP (RFC 3501 §6.4.5):
 * - root single-part message → `"1"`; root multipart → `""` with children `"1"`, `"2"`…
 * - a multipart at `X` has children `X.1`, `X.2`…
 * - a message/rfc822 at `P`: its body is `childNode` — a multipart body gets
 *   partId `P` (children `P.1`…), a single-part body gets `P.1`.
 */
export interface BodyStructureNode {
  partId: string;
  /** lowercase: "text", "multipart", "image", "message"… */
  type: string;
  /** lowercase: "plain", "mixed"… */
  subtype: string;
  /** lowercase keys, RFC 2231 / 2047 decoded (charset, name, boundary…) */
  params: Record<string, string>;
  id?: string;
  description?: string;
  /** lowercase: "base64", "quoted-printable", "7bit"… */
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

/** A {@link BodyStructureNode} enriched with derived fields. */
export interface PartNode extends BodyStructureNode {
  /** `${type}/${subtype}` */
  contentType: string;
  /** From Content-Disposition filename, else Content-Type name. */
  filename?: string;
  /** A regular attachment (shown in the attachment list). */
  isAttachment: boolean;
  /** An inline resource (cid image inside multipart/related, or inline with Content-ID). */
  isInline: boolean;
  childNode?: PartNode;
  children?: PartNode[];
  /** Present on trees from {@link parseMime}: the part's own headers. */
  headers?: MailHeaders;
  /** Present on leaf parts from {@link parseMime}: transfer-decoded bytes. */
  content?: Uint8Array;
}

export interface Attachment {
  partId: string;
  filename: string;
  contentType: string;
  contentId?: string;
  disposition: "attachment" | "inline";
  /** Decoded size in bytes. */
  size: number;
  content: Uint8Array;
  charset?: string;
  /** For message/rfc822 attachments: the parsed inner message. */
  message?: ParsedMail;
}

export interface ListUnsubscribe {
  /** http(s) URLs. */
  urls: string[];
  mailto?: string;
  /** RFC 8058 one-click (List-Unsubscribe-Post: List-Unsubscribe=One-Click). */
  oneClick: boolean;
}

export interface ParsedMail {
  headers: MailHeaders;
  from: Address | null;
  sender: Address | null;
  replyTo: Address[];
  to: Address[];
  cc: Address[];
  bcc: Address[];
  subject: string;
  date: Date | null;
  messageId?: string;
  inReplyTo?: string;
  references: string[];
  text?: string;
  html?: string;
  attachments: Attachment[];
  inline: Attachment[];
  priority: "high" | "normal" | "low";
  listUnsubscribe?: ListUnsubscribe;
  /** The body tree (with `headers` and `content` on parts). */
  parts: PartNode;
  /** True when input exceeded `maxSize`, `maxDepth` or `maxParts` and was cut short. */
  truncated?: boolean;
}

export interface ParseOptions {
  /** Maximum multipart / message nesting depth (default 20). */
  maxDepth?: number;
  /** Maximum number of parts parsed (default 500). */
  maxParts?: number;
  /** Maximum input size in bytes; longer input is cut (default unlimited). */
  maxSize?: number;
}
