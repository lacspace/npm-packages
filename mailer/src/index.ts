/**
 * @lacspace/mailer
 * A tiny SMTP client for backends — send email with one line of setup.
 *
 * Implements SMTP (+ STARTTLS, AUTH LOGIN/PLAIN, MIME with attachments) directly
 * over Node's built-in `net` / `tls` / `crypto` — so it has ZERO npm
 * dependencies. Ships provider presets (Hostinger, Gmail, Outlook, Zoho …).
 *
 * Node.js only (needs TCP sockets) · zero dependencies · fully typed.
 */

import net from "node:net";
import tls from "node:tls";
import { randomBytes } from "node:crypto";
import { hostname } from "node:os";

export interface SmtpConfig {
  host: string;
  port: number;
  /** true = implicit TLS (port 465). false = plain then STARTTLS upgrade (port 587). */
  secure?: boolean;
  /** Skip the STARTTLS upgrade on a non-secure connection (for local dev servers like MailHog). Insecure — do not use in production. */
  ignoreTLS?: boolean;
  auth?: { user: string; pass: string };
  authMethod?: "LOGIN" | "PLAIN";
  /** Default From used when a message omits `from`. */
  from?: string | Address;
  /** Socket timeout in ms (default 20000). */
  timeout?: number;
  tls?: { rejectUnauthorized?: boolean; servername?: string };
  /** Log the SMTP conversation to console. */
  debug?: boolean;
}

export interface Address {
  name?: string;
  address: string;
}

export type AddressInput = string | Address | (string | Address)[];

export interface Attachment {
  filename: string;
  /** String content, or a Buffer. Binary is base64-encoded automatically. */
  content: string | Buffer;
  contentType?: string;
  /** For string content: how to interpret it. Default "utf8". */
  encoding?: "utf8" | "base64";
}

export interface Mail {
  from?: string | Address;
  to: AddressInput;
  cc?: AddressInput;
  bcc?: AddressInput;
  replyTo?: string | Address;
  subject: string;
  text?: string;
  html?: string;
  attachments?: Attachment[];
  headers?: Record<string, string>;
}

export interface SendResult {
  messageId: string;
  accepted: string[];
  response: string;
}

export class SmtpError extends Error {
  constructor(
    message: string,
    public code?: number,
    public response?: string,
  ) {
    super(message);
    this.name = "SmtpError";
  }
}

/* ------------------------------ security ------------------------------ */

/**
 * Reject any value containing a CR or LF character. Prevents SMTP command and
 * MIME header injection (CRLF injection) via untrusted addresses, headers,
 * subjects, or attachment filenames.
 */
function assertNoCRLF(value: string, label: string): string {
  if (/[\r\n]/.test(value)) {
    throw new SmtpError(`${label} must not contain CR or LF characters`);
  }
  return value;
}

/* ------------------------------ addresses ------------------------------ */

function toAddress(input: string | Address): Address {
  const a: Address = typeof input === "string" ? parseAddress(input) : input;
  assertNoCRLF(a.address, "email address");
  if (a.name !== undefined) assertNoCRLF(a.name, "address name");
  return a;
}

function parseAddress(input: string): Address {
  const m = input.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1]!.replace(/^"|"$/g, ""), address: m[2]!.trim() };
  return { address: input.trim() };
}

function toList(input?: AddressInput): Address[] {
  if (!input) return [];
  return (Array.isArray(input) ? input : [input]).map(toAddress);
}

function formatAddress(a: Address): string {
  if (!a.name) return a.address;
  const needsQuote = /[",;<>@]/.test(a.name);
  const name = needsQuote ? `"${a.name.replace(/"/g, '\\"')}"` : a.name;
  return /[^\x20-\x7e]/.test(a.name) ? `${encodeWord(a.name)} <${a.address}>` : `${name} <${a.address}>`;
}

/* ------------------------------ encoding ------------------------------ */

function encodeWord(str: string): string {
  return `=?UTF-8?B?${Buffer.from(str, "utf8").toString("base64")}?=`;
}

function encodeHeader(value: string): string {
  return /[^\x20-\x7e]/.test(value) ? encodeWord(value) : value;
}

function wrap76(b64: string): string {
  return b64.replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

function rfc2822Date(d: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const pad = (n: number) => (n < 10 ? "0" + n : String(n));
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  return `${days[d.getDay()]}, ${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
}

/* ------------------------------ MIME build ------------------------------ */

function buildMime(mail: Mail, from: Address, messageId: string): string {
  const to = toList(mail.to);
  const cc = toList(mail.cc);
  const headers: string[] = [];

  headers.push(`From: ${formatAddress(from)}`);
  headers.push(`To: ${to.map(formatAddress).join(", ")}`);
  if (cc.length) headers.push(`Cc: ${cc.map(formatAddress).join(", ")}`);
  if (mail.replyTo) headers.push(`Reply-To: ${formatAddress(toAddress(mail.replyTo))}`);
  headers.push(`Subject: ${encodeHeader(assertNoCRLF(mail.subject, "subject"))}`);
  headers.push(`Date: ${rfc2822Date(new Date())}`);
  headers.push(`Message-ID: ${messageId}`);
  headers.push(`MIME-Version: 1.0`);
  for (const [k, v] of Object.entries(mail.headers ?? {}))
    headers.push(`${assertNoCRLF(k, "header name")}: ${assertNoCRLF(v, "header value")}`);

  const textPart = mail.text
    ? `Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(
        Buffer.from(mail.text, "utf8").toString("base64"),
      )}`
    : null;
  const htmlPart = mail.html
    ? `Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(
        Buffer.from(mail.html, "utf8").toString("base64"),
      )}`
    : null;

  const boundary = (tag: string) => `----=_${tag}_${randomBytes(12).toString("hex")}`;

  function bodyBlock(): string {
    if (textPart && htmlPart) {
      const b = boundary("alt");
      return (
        `Content-Type: multipart/alternative; boundary="${b}"\r\n\r\n` +
        `--${b}\r\n${textPart}\r\n--${b}\r\n${htmlPart}\r\n--${b}--`
      );
    }
    return htmlPart ?? textPart ?? `Content-Type: text/plain; charset=UTF-8\r\n\r\n`;
  }

  if (mail.attachments && mail.attachments.length) {
    const b = boundary("mix");
    const parts: string[] = [`--${b}\r\n${bodyBlock()}`];
    for (const att of mail.attachments) {
      assertNoCRLF(att.filename, "attachment filename");
      const buf = Buffer.isBuffer(att.content)
        ? att.content
        : Buffer.from(att.content, att.encoding ?? "utf8");
      const type = assertNoCRLF(att.contentType ?? "application/octet-stream", "attachment content type");
      parts.push(
        `--${b}\r\nContent-Type: ${type}; name="${att.filename}"\r\n` +
          `Content-Transfer-Encoding: base64\r\n` +
          `Content-Disposition: attachment; filename="${att.filename}"\r\n\r\n` +
          wrap76(buf.toString("base64")),
      );
    }
    return (
      headers.join("\r\n") +
      `\r\nContent-Type: multipart/mixed; boundary="${b}"\r\n\r\n` +
      parts.join("\r\n") +
      `\r\n--${b}--`
    );
  }

  return headers.join("\r\n") + "\r\n" + bodyBlock();
}

function dotStuff(message: string): string {
  return message.replace(/^\./gm, "..");
}

/* ------------------------------ SMTP client ------------------------------ */

export class Mailer {
  private socket: net.Socket | tls.TLSSocket | null = null;
  private buffer = "";
  private pending: {
    resolve: (r: { code: number; text: string }) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private readonly timeout: number;

  constructor(public readonly config: SmtpConfig) {
    this.timeout = config.timeout ?? 20000;
  }

  /** Open the connection, greet, upgrade to TLS if needed, and authenticate. */
  private async connect(): Promise<void> {
    const { host, port, secure } = this.config;
    const servername = this.config.tls?.servername ?? host;
    const rejectUnauthorized = this.config.tls?.rejectUnauthorized ?? true;

    this.socket = secure
      ? tls.connect({ host, port, servername, rejectUnauthorized })
      : net.connect({ host, port });
    this.attach(this.socket);

    await this.waitConnect(this.socket);
    await this.expect(220);
    await this.ehlo(servername);

    if (!secure && !this.config.ignoreTLS) {
      await this.command("STARTTLS", 220);
      const upgraded = tls.connect({ socket: this.socket, servername, rejectUnauthorized });
      this.socket = upgraded;
      this.buffer = "";
      this.attach(upgraded);
      await this.waitSecure(upgraded);
      await this.ehlo(servername);
    }

    if (this.config.auth) await this.authenticate();
  }

  private ehlo(name: string): Promise<{ code: number; text: string }> {
    return this.command(`EHLO ${name}`, 250).catch(() => this.command(`HELO ${name}`, 250));
  }

  private async authenticate(): Promise<void> {
    const { user, pass } = this.config.auth!;
    const method = this.config.authMethod ?? "LOGIN";
    if (method === "PLAIN") {
      const token = Buffer.from(`\0${user}\0${pass}`, "utf8").toString("base64");
      await this.command(`AUTH PLAIN ${token}`, 235);
    } else {
      await this.command("AUTH LOGIN", 334);
      await this.command(Buffer.from(user, "utf8").toString("base64"), 334);
      await this.command(Buffer.from(pass, "utf8").toString("base64"), 235);
    }
  }

  /** Verify that the server accepts the connection and credentials. */
  async verify(): Promise<boolean> {
    try {
      await this.connect();
      await this.quit();
      return true;
    } catch (e) {
      await this.close();
      throw e;
    }
  }

  /** Send a message. Opens a fresh connection, sends, and closes. */
  async send(mail: Mail): Promise<SendResult> {
    const from = toAddress(mail.from ?? this.config.from ?? "");
    if (!from.address) throw new SmtpError("missing `from` address");
    const recipients = [...toList(mail.to), ...toList(mail.cc), ...toList(mail.bcc)];
    if (!recipients.length) throw new SmtpError("no recipients");

    const messageId = `<${randomBytes(16).toString("hex")}@${from.address.split("@")[1] ?? hostname()}>`;

    try {
      await this.connect();
      await this.command(`MAIL FROM:<${from.address}>`, 250);
      const accepted: string[] = [];
      for (const r of recipients) {
        // 250 = accepted; 251 = user not local, will forward. Both are success.
        await this.command(`RCPT TO:<${r.address}>`, [250, 251]);
        accepted.push(r.address);
      }
      await this.command("DATA", 354);
      const message = dotStuff(buildMime(mail, from, messageId));
      const final = await this.command(`${message}\r\n.`, 250);
      await this.quit();
      return { messageId, accepted, response: final.text };
    } catch (e) {
      await this.close();
      throw e;
    }
  }

  private async quit(): Promise<void> {
    try {
      await this.command("QUIT", 221);
    } catch {
      /* server may just drop the connection */
    }
    await this.close();
  }

  async close(): Promise<void> {
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending = null;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  /* --------------------------- socket plumbing --------------------------- */

  private attach(socket: net.Socket | tls.TLSSocket): void {
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      this.drain();
    });
    socket.on("error", (err) => {
      if (this.pending) {
        clearTimeout(this.pending.timer);
        this.pending.reject(err);
        this.pending = null;
      }
    });
    socket.on("close", () => {
      if (this.pending) {
        clearTimeout(this.pending.timer);
        this.pending.reject(new SmtpError("connection closed unexpectedly"));
        this.pending = null;
      }
    });
  }

  private waitConnect(socket: net.Socket): Promise<void> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new SmtpError("connect timeout")), this.timeout);
      socket.once("connect", () => {
        clearTimeout(t);
        resolve();
      });
      socket.once("error", (e) => {
        clearTimeout(t);
        reject(e);
      });
    });
  }

  private waitSecure(socket: tls.TLSSocket): Promise<void> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new SmtpError("TLS handshake timeout")), this.timeout);
      socket.once("secureConnect", () => {
        clearTimeout(t);
        resolve();
      });
      socket.once("error", (e) => {
        clearTimeout(t);
        reject(e);
      });
    });
  }

  private drain(): void {
    if (!this.pending) return;
    const lines = this.buffer.split("\r\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (/^\d{3} /.test(line)) {
        const complete = lines.slice(0, i + 1);
        const code = parseInt(line.slice(0, 3), 10);
        this.buffer = lines.slice(i + 1).join("\r\n");
        const p = this.pending;
        this.pending = null;
        clearTimeout(p!.timer);
        p!.resolve({ code, text: complete.join("\n") });
        return;
      }
    }
  }

  private readResponse(): Promise<{ code: number; text: string }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new SmtpError("SMTP response timeout"));
      }, this.timeout);
      this.pending = { resolve, reject, timer };
      this.drain();
    });
  }

  private expect(code: number): Promise<{ code: number; text: string }> {
    return this.readResponse().then((r) => {
      if (r.code !== code) throw new SmtpError(`expected ${code}, got ${r.code}`, r.code, r.text);
      return r;
    });
  }

  private async command(
    cmd: string,
    expectCode: number | number[],
  ): Promise<{ code: number; text: string }> {
    if (!this.socket) throw new SmtpError("not connected");
    if (this.config.debug) {
      const shown = /^(.{0,60})/.exec(cmd.replace(/\r\n/g, "\\n"))?.[1] ?? "";
      // eslint-disable-next-line no-console
      console.log("C:", shown + (cmd.length > 60 ? "…" : ""));
    }
    this.socket.write(cmd + "\r\n");
    const r = await this.readResponse();
    if (this.config.debug) console.log("S:", r.text.replace(/\n/g, " ")); // eslint-disable-line no-console
    const accepted = Array.isArray(expectCode) ? expectCode : [expectCode];
    if (!accepted.includes(r.code)) {
      throw new SmtpError(`SMTP ${cmd.split(/\s/)[0]} failed: ${r.code}`, r.code, r.text);
    }
    return r;
  }
}

export function createMailer(config: SmtpConfig): Mailer {
  return new Mailer(config);
}

/**
 * Build a config from `SMTP_*` environment variables — ideal for backends.
 * Reads SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM.
 */
export function mailerFromEnv(env: Record<string, string | undefined> = process.env): SmtpConfig {
  const port = Number(env.SMTP_PORT ?? 587);
  return {
    host: env.SMTP_HOST ?? "",
    port,
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465,
    auth:
      env.SMTP_USER || env.SMTP_PASS
        ? { user: env.SMTP_USER ?? "", pass: env.SMTP_PASS ?? "" }
        : undefined,
    from: env.SMTP_FROM,
  };
}

/* ------------------------------ presets ------------------------------ */

type PresetAuth = { user: string; pass: string; from?: string | Address };

function preset(host: string, port: number, secure: boolean) {
  return (a: PresetAuth): SmtpConfig => ({
    host,
    port,
    secure,
    auth: { user: a.user, pass: a.pass },
    from: a.from ?? a.user,
  });
}

/** One-line configs for popular SMTP providers. */
export const presets = {
  /** Hostinger business email — smtp.hostinger.com:465 (implicit TLS). */
  hostinger: preset("smtp.hostinger.com", 465, true),
  /** Gmail / Google Workspace — use an App Password, not your login password. */
  gmail: preset("smtp.gmail.com", 465, true),
  /** Outlook.com / Microsoft 365 — smtp.office365.com:587 (STARTTLS). */
  outlook: preset("smtp.office365.com", 587, false),
  office365: preset("smtp.office365.com", 587, false),
  /** Zoho Mail — smtp.zoho.com:465. */
  zoho: preset("smtp.zoho.com", 465, true),
  /** Brevo (Sendinblue) — smtp-relay.brevo.com:587. */
  brevo: preset("smtp-relay.brevo.com", 587, false),
  /** SMTP2GO — mail.smtp2go.com:587. */
  smtp2go: preset("mail.smtp2go.com", 587, false),
  /** Mailgun SMTP — smtp.mailgun.org:587. */
  mailgun: preset("smtp.mailgun.org", 587, false),
  /** Any host — you supply host/port/secure yourself. */
  custom: (c: SmtpConfig): SmtpConfig => c,
};
