/**
 * A fluent, typed builder for a MIME message. Accumulates recipients, headers,
 * body alternatives and attachments, then produces either a plain {@link Mail}
 * (to hand to `transport.send`) or a fully rendered MIME string (`toMime`).
 *
 * Pure and dependency-free — no network. Uses the same {@link buildMime}
 * renderer as the SMTP client, so what you preview is what gets sent.
 */

import { randomBytes } from "node:crypto";

import type { Address, AddressInput, Attachment, Mail } from "./index";

import { toAddress } from "./address";
import { htmlToText } from "./html";
import { buildMime } from "./mime";

/** Options for {@link MessageBuilder.toMime}. */
export interface RenderOptions {
  /** Message-ID to stamp (default: a random one @ the sender's domain). */
  messageId?: string;
}

/**
 * Fluent MIME message builder. Every method returns `this` for chaining.
 *
 * ```ts
 * const mail = createMessage()
 *   .from("Lacspace <no-reply@lacspace.com>")
 *   .to("customer@example.com")
 *   .subject("Welcome ✨")
 *   .html("<h1>Hi!</h1>")
 *   .autoText()            // derive the text/plain part from the HTML
 *   .build();
 * ```
 */
export class MessageBuilder {
  private mail: Mail = { to: [], subject: "" };
  private _autoText = false;

  constructor(init?: Partial<Mail>) {
    if (init) this.mail = { ...this.mail, ...init };
  }

  from(from: string | Address): this {
    this.mail.from = from;
    return this;
  }

  private add(field: "to" | "cc" | "bcc", value: AddressInput): this {
    const existing = this.mail[field];
    const list: (string | Address)[] = existing
      ? Array.isArray(existing)
        ? [...existing]
        : [existing]
      : [];
    for (const v of Array.isArray(value) ? value : [value]) list.push(v);
    this.mail[field] = list;
    return this;
  }

  to(value: AddressInput): this {
    return this.add("to", value);
  }
  cc(value: AddressInput): this {
    return this.add("cc", value);
  }
  bcc(value: AddressInput): this {
    return this.add("bcc", value);
  }
  replyTo(value: string | Address): this {
    this.mail.replyTo = value;
    return this;
  }

  subject(value: string): this {
    this.mail.subject = value;
    return this;
  }
  text(value: string): this {
    this.mail.text = value;
    return this;
  }
  html(value: string): this {
    this.mail.html = value;
    return this;
  }

  /** Set a custom header (repeatable). */
  header(name: string, value: string): this {
    this.mail.headers = { ...(this.mail.headers ?? {}), [name]: value };
    return this;
  }

  /** Add a file attachment. */
  attach(att: Attachment): this {
    this.mail.attachments = [...(this.mail.attachments ?? []), att];
    return this;
  }

  /**
   * Add an inline (embedded) image referenced from the HTML by `cid:<id>`.
   * Sets the attachment `cid` and defaults the disposition to inline.
   */
  inline(att: Attachment & { cid: string }): this {
    return this.attach({ ...att, contentDisposition: "inline" });
  }

  /**
   * On {@link build}, if only `html` was set, derive the `text/plain` part from
   * it via {@link htmlToText}. Good for deliverability and text-only clients.
   */
  autoText(enabled = true): this {
    this._autoText = enabled;
    return this;
  }

  /** Produce the accumulated {@link Mail} (a shallow copy). */
  build(): Mail {
    const mail: Mail = { ...this.mail };
    if (this._autoText && mail.html && !mail.text) mail.text = htmlToText(mail.html);
    return mail;
  }

  /** Render the full MIME string exactly as the SMTP client would send it. */
  toMime(opts: RenderOptions = {}): string {
    const mail = this.build();
    const from = toAddress(mail.from ?? "");
    if (!from.address) throw new Error("cannot render MIME without a `from` address");
    const messageId =
      opts.messageId ?? `<${randomBytes(16).toString("hex")}@${from.address.split("@")[1] ?? "localhost"}>`;
    return buildMime(mail, from, messageId);
  }
}

/** Create a new {@link MessageBuilder}, optionally seeded from a partial mail. */
export function createMessage(init?: Partial<Mail>): MessageBuilder {
  return new MessageBuilder(init);
}
