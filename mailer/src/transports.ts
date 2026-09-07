/**
 * Non-network {@link Transport} implementations for tests, previews and dev.
 * Both satisfy the exact same interface as {@link Mailer}, so any code that
 * takes a `Transport` can be handed one of these with no real SMTP server.
 */

import { randomBytes } from "node:crypto";

import type { Mail, SendResult, Transport } from "./index";

import { toAddress, toList } from "./address";
import { buildMime } from "./mime";

/** A message captured by {@link MemoryTransport}. */
export interface CapturedMessage {
  mail: Mail;
  /** The rendered MIME string, exactly as an SMTP client would transmit it. */
  mime: string;
  result: SendResult;
}

function envelope(mail: Mail): { messageId: string; accepted: string[]; from: string; mime: string } {
  const from = toAddress(mail.from ?? "");
  const recipients = [...toList(mail.to), ...toList(mail.cc), ...toList(mail.bcc)].map((a) => a.address);
  const messageId = `<${randomBytes(16).toString("hex")}@${from.address.split("@")[1] ?? "localhost"}>`;
  const mime = buildMime(mail, from, messageId);
  return { messageId, accepted: recipients, from: from.address, mime };
}

/**
 * A `Transport` that records every message in memory instead of sending it.
 * Ideal for unit tests and email previews.
 *
 * ```ts
 * const t = createMemoryTransport();
 * await t.send({ from: "a@x.com", to: "b@y.com", subject: "hi", text: "yo" });
 * expect(t.messages).toHaveLength(1);
 * ```
 */
export class MemoryTransport implements Transport {
  /** All messages captured so far, in send order. */
  readonly messages: CapturedMessage[] = [];

  async send(mail: Mail): Promise<SendResult> {
    const { messageId, accepted, mime } = envelope(mail);
    const result: SendResult = { messageId, accepted, response: "250 Message queued (memory)" };
    this.messages.push({ mail, mime, result });
    return result;
  }

  async verify(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    /* nothing to close */
  }

  /** Convenience for tests: the most recently captured message (or undefined). */
  get last(): CapturedMessage | undefined {
    return this.messages[this.messages.length - 1];
  }

  /** Drop all captured messages. */
  reset(): void {
    this.messages.length = 0;
  }
}

/**
 * A `Transport` that serialises each message to a JSON envelope (returned as
 * the `response`) instead of sending it — handy for logging pipelines or
 * handing a message to an external HTTP email API.
 */
export class JsonTransport implements Transport {
  constructor(private readonly onMessage?: (json: string, mail: Mail) => void) {}

  async send(mail: Mail): Promise<SendResult> {
    const { messageId, accepted, from, mime } = envelope(mail);
    const json = JSON.stringify({
      messageId,
      from,
      to: toList(mail.to).map((a) => a.address),
      cc: toList(mail.cc).map((a) => a.address),
      bcc: toList(mail.bcc).map((a) => a.address),
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      headers: mail.headers,
      mime,
    });
    this.onMessage?.(json, mail);
    return { messageId, accepted, response: json };
  }

  async verify(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    /* nothing to close */
  }
}

/** Create a {@link MemoryTransport} that captures messages for tests/previews. */
export function createMemoryTransport(): MemoryTransport {
  return new MemoryTransport();
}

/** Create a {@link JsonTransport} that serialises each message to JSON. */
export function createJsonTransport(onMessage?: (json: string, mail: Mail) => void): JsonTransport {
  return new JsonTransport(onMessage);
}
