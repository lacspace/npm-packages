/**
 * The notifier layer — turn detected changes into a nice message per channel and
 * deliver them. Formatters are pure and unit-tested; the senders do network I/O
 * (never throw, they return success). Supports webhook, Slack, Discord, Telegram
 * and e-mail (a tiny dependency-free SMTP client over node:net / node:tls).
 */
import { connect as netConnect } from "node:net";
import { connect as tlsConnect } from "node:tls";
import type { CheckResult, NotifyChannel, SmtpConfig } from "./types.js";

const emoji = (r: CheckResult): string =>
  r.error ? "⚠️" : r.type === "feed" ? "📰" : r.type === "availability" || r.type === "status" ? "🚦" : "🔔";

/** A one-line, plain-text description of a single change. Pure. */
export function changeSummary(r: CheckResult): string {
  if (r.error) return `${r.label}: error — ${r.error}`;
  if (r.type === "feed") {
    const n = r.added?.length ?? 0;
    const sample = (r.added ?? []).slice(0, 3).join(", ");
    return `${r.label}: ${n} new item${n === 1 ? "" : "s"}${sample ? ` (${sample})` : ""}`;
  }
  if (r.before !== undefined || r.after !== undefined) {
    return `${r.label}: ${r.before ?? "∅"} → ${r.after ?? "∅"}`;
  }
  return `${r.label} changed`;
}

const title = (changes: CheckResult[]): string => {
  const errs = changes.filter((c) => c.error).length;
  const chg = changes.length - errs;
  const bits: string[] = [];
  if (chg) bits.push(`${chg} change${chg === 1 ? "" : "s"}`);
  if (errs) bits.push(`${errs} error${errs === 1 ? "" : "s"}`);
  return `lacspace-monitor — ${bits.join(" · ") || "no changes"}`;
};

/** Plain-text digest (webhook fallbacks, e-mail body). Pure. */
export function formatText(changes: CheckResult[]): string {
  return [title(changes), ...changes.map((c) => `• ${changeSummary(c)}  ${c.url}`)].join("\n");
}

/** A Slack incoming-webhook payload. Pure. */
export function formatSlack(changes: CheckResult[]): { text: string; blocks: unknown[] } {
  const blocks: unknown[] = [
    { type: "header", text: { type: "plain_text", text: title(changes), emoji: true } },
    ...changes.map((c) => ({
      type: "section",
      text: { type: "mrkdwn", text: `${emoji(c)} *${c.label}*\n${changeSummary(c)}\n<${c.url}|${c.url}>` },
    })),
  ];
  return { text: formatText(changes), blocks };
}

/** A Discord webhook payload with embeds. Pure. */
export function formatDiscord(changes: CheckResult[]): { content: string; embeds: unknown[] } {
  return {
    content: title(changes),
    embeds: changes.slice(0, 10).map((c) => ({
      title: c.label,
      url: c.url,
      description: changeSummary(c),
      color: c.error ? 0xef4444 : 0x8b5cf6,
    })),
  };
}

/** A Telegram sendMessage text body (Markdown). Pure. */
export function formatTelegram(changes: CheckResult[]): string {
  return [`*${title(changes)}*`, ...changes.map((c) => `${emoji(c)} ${changeSummary(c)}\n${c.url}`)].join("\n\n");
}

/** An e-mail subject + text/html body. Pure. */
export function formatEmail(changes: CheckResult[]): { subject: string; text: string; html: string } {
  const subject = title(changes);
  const text = formatText(changes);
  const rows = changes
    .map((c) => `<li><strong>${escapeHtml(c.label)}</strong> — ${escapeHtml(changeSummary(c))}<br><a href="${escapeHtml(c.url)}">${escapeHtml(c.url)}</a></li>`)
    .join("");
  const html = `<h2>${escapeHtml(subject)}</h2><ul>${rows}</ul><p style="color:#888;font-size:12px">Sent by lacspace-monitor</p>`;
  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
}

// ── senders (network; never throw) ───────────────────────────────────────────

async function post(url: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return res.ok;
  } catch {
    return false;
  }
}

/** POST a raw `{ tool, at, changes }` payload to a webhook. Never throws. */
export function sendWebhookPayload(url: string, changes: CheckResult[]): Promise<boolean> {
  return post(url, { tool: "lacspace-monitor", at: new Date().toISOString(), changes });
}

/** POST a Slack message. Never throws. */
export function sendSlack(url: string, changes: CheckResult[]): Promise<boolean> {
  return post(url, formatSlack(changes));
}

/** POST a Discord message. Never throws. */
export function sendDiscord(url: string, changes: CheckResult[]): Promise<boolean> {
  return post(url, formatDiscord(changes));
}

/** Send a Telegram message via the Bot API. Never throws. */
export async function sendTelegram(botToken: string, chatId: string, changes: CheckResult[]): Promise<boolean> {
  return post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    chat_id: chatId,
    text: formatTelegram(changes),
    parse_mode: "Markdown",
    disable_web_page_preview: true,
  });
}

/** Send an e-mail alert over SMTP. Never throws. */
export async function sendEmail(smtp: SmtpConfig, to: string, changes: CheckResult[]): Promise<boolean> {
  const { subject, text, html } = formatEmail(changes);
  const from = smtp.from ?? smtp.user ?? "monitor@localhost";
  try {
    await smtpSend(smtp, { from, to, subject, text, html });
    return true;
  } catch {
    return false;
  }
}

/**
 * Deliver a set of changes to every channel. Returns per-channel success.
 * Never throws.
 */
export async function notify(
  changes: CheckResult[],
  channels: NotifyChannel[],
): Promise<{ kind: NotifyChannel["kind"]; ok: boolean }[]> {
  if (!changes.length || !channels.length) return [];
  return Promise.all(
    channels.map(async (ch) => {
      let ok = false;
      if (ch.kind === "webhook") ok = await sendWebhookPayload(ch.url, changes);
      else if (ch.kind === "slack") ok = await sendSlack(ch.url, changes);
      else if (ch.kind === "discord") ok = await sendDiscord(ch.url, changes);
      else if (ch.kind === "telegram") ok = await sendTelegram(ch.botToken, ch.chatId, changes);
      else if (ch.kind === "email") ok = await sendEmail(ch.smtp, ch.to, changes);
      return { kind: ch.kind, ok };
    }),
  );
}

// ── minimal SMTP client (no dependencies) ────────────────────────────────────

interface Mail { from: string; to: string; subject: string; text: string; html: string }

/** A tiny SMTP sender supporting implicit TLS, STARTTLS and AUTH LOGIN. */
function smtpSend(cfg: SmtpConfig, mail: Mail): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const rcpts = mail.to.split(",").map((s) => s.trim()).filter(Boolean);
    let socket = cfg.secure
      ? tlsConnect({ host: cfg.host, port: cfg.port, servername: cfg.host })
      : netConnect({ host: cfg.host, port: cfg.port });

    let buffer = "";
    let done = false;
    const finish = (err?: Error): void => {
      if (done) return;
      done = true;
      try { socket.end(); } catch { /* ignore */ }
      err ? reject(err) : resolve();
    };
    const timer = setTimeout(() => finish(new Error("SMTP timeout")), 20000);
    timer.unref?.();

    const boundary = `=_lm_${Date.now().toString(36)}`;
    const body = [
      `From: ${mail.from}`,
      `To: ${mail.to}`,
      `Subject: ${mail.subject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      mail.text,
      `--${boundary}`,
      "Content-Type: text/html; charset=utf-8",
      "",
      mail.html,
      `--${boundary}--`,
      "",
    ].join("\r\n");

    const b64 = (s: string): string => Buffer.from(s, "utf8").toString("base64");

    // Drive the SMTP protocol imperatively, one reply code at a time.
    const write = (line: string): void => { socket.write(line + "\r\n"); };
    let stage: "greet" | "ehlo" | "starttls" | "ehlo2" | "auth-user" | "auth-pass" | "auth-done" | "mail" | "rcpt" | "data" | "body" | "quit" = "greet";
    let rcptIdx = 0;

    const onCode = (code: number): void => {
      switch (stage) {
        case "greet":
          if (code !== 220) return finish(new Error(`SMTP greet ${code}`));
          stage = cfg.secure ? "ehlo2" : "ehlo"; write("EHLO lacspace-monitor");
          break;
        case "ehlo":
          if (code >= 400) return finish(new Error(`EHLO ${code}`));
          stage = "starttls"; write("STARTTLS");
          break;
        case "starttls":
          if (code !== 220) return finish(new Error(`STARTTLS ${code}`));
          upgradeTls();
          break;
        case "ehlo2":
          if (code >= 400) return finish(new Error(`EHLO ${code}`));
          afterEhlo();
          break;
        case "auth-user":
          if (code !== 334) return finish(new Error(`AUTH ${code}`));
          stage = "auth-pass"; write(b64(cfg.user!));
          break;
        case "auth-pass":
          if (code !== 334) return finish(new Error(`AUTH user ${code}`));
          stage = "auth-done"; write(b64(cfg.pass!));
          break;
        case "auth-done":
          if (code >= 400) return finish(new Error(`AUTH failed ${code}`));
          startMail();
          break;
        case "mail":
          if (code >= 400) return finish(new Error(`MAIL FROM ${code}`));
          stage = "rcpt"; rcptIdx = 0; write(`RCPT TO:<${rcpts[rcptIdx]}>`);
          break;
        case "rcpt":
          if (code >= 400) return finish(new Error(`RCPT TO ${code}`));
          rcptIdx++;
          if (rcptIdx < rcpts.length) { write(`RCPT TO:<${rcpts[rcptIdx]}>`); }
          else { stage = "data"; write("DATA"); }
          break;
        case "data":
          if (code !== 354) return finish(new Error(`DATA ${code}`));
          stage = "body"; socket.write(body + "\r\n.\r\n");
          break;
        case "body":
          if (code >= 400) return finish(new Error(`message rejected ${code}`));
          stage = "quit"; write("QUIT"); finish();
          break;
        default:
          break;
      }
    };

    const afterEhlo = (): void => {
      if (cfg.user && cfg.pass) { stage = "auth-user"; write("AUTH LOGIN"); }
      else startMail();
    };
    const startMail = (): void => { stage = "mail"; write(`MAIL FROM:<${mail.from}>`); };

    const upgradeTls = (): void => {
      const upgraded = tlsConnect({ socket, host: cfg.host, servername: cfg.host }, () => {
        stage = "ehlo2"; write("EHLO lacspace-monitor");
      });
      upgraded.on("error", (e) => finish(e instanceof Error ? e : new Error(String(e))));
      attach(upgraded);
      socket = upgraded;
    };

    const handleData = (chunk: Buffer): void => {
      buffer += chunk.toString("utf8");
      let idx: number;
      while ((idx = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        // Multi-line replies: "250-..." continues, "250 ..." ends.
        if (/^\d{3}-/.test(line)) continue;
        const code = parseInt(line.slice(0, 3), 10);
        if (!Number.isNaN(code)) onCode(code);
      }
    };

    function attach(s: typeof socket): void {
      s.on("data", handleData);
      s.on("error", (e: Error) => finish(e));
      s.on("close", () => { if (!done) finish(new Error("SMTP connection closed")); });
    }
    attach(socket);
    socket.on("timeout", () => finish(new Error("SMTP socket timeout")));
  });
}
