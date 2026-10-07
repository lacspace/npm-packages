export type ProviderKey = "hostinger" | "titan" | "godaddy" | "gmail" | "outlook" | "zoho" | "yahoo" | "icloud";

export interface ServerSettings {
  host: string;
  port: number;
  /** true = implicit TLS from the first byte (993 / 465). false = plain connect, then STARTTLS (587). */
  secure: boolean;
}

export interface SendLimits {
  /** Messages per hour, or "unknown". This package never guesses; set your own conservative limit. */
  perHour: number | "unknown";
  /** Messages per day, or "unknown". */
  perDay: number | "unknown";
  /** Where a number came from (a provider document URL). Present only when a number is present. */
  source?: string;
}

export interface ProviderPreset {
  key: ProviderKey;
  name: string;
  imap: ServerSettings;
  smtp: ServerSettings;
  limits: SendLimits;
  /** A short setup hint to show users, when there is one. */
  note?: string;
}

const UNKNOWN: SendLimits = Object.freeze({ perHour: "unknown", perDay: "unknown" }) as SendLimits;

const preset = (p: ProviderPreset): ProviderPreset => Object.freeze({
  ...p,
  imap: Object.freeze({ ...p.imap }),
  smtp: Object.freeze({ ...p.smtp }),
  limits: UNKNOWN,
}) as ProviderPreset;

/** IMAP/SMTP presets. Send limits are all "unknown" on purpose (see README). */
export const PRESETS: Readonly<Record<ProviderKey, ProviderPreset>> = Object.freeze({
  hostinger: preset({ key: "hostinger", name: "Hostinger", imap: { host: "imap.hostinger.com", port: 993, secure: true }, smtp: { host: "smtp.hostinger.com", port: 465, secure: true }, limits: UNKNOWN }),
  titan: preset({ key: "titan", name: "Titan (Hostinger / GoDaddy Pro)", imap: { host: "imap.titan.email", port: 993, secure: true }, smtp: { host: "smtp.titan.email", port: 465, secure: true }, limits: UNKNOWN }),
  godaddy: preset({ key: "godaddy", name: "GoDaddy Workspace", imap: { host: "imap.secureserver.net", port: 993, secure: true }, smtp: { host: "smtpout.secureserver.net", port: 465, secure: true }, limits: UNKNOWN }),
  gmail: preset({ key: "gmail", name: "Google Workspace / Gmail", imap: { host: "imap.gmail.com", port: 993, secure: true }, smtp: { host: "smtp.gmail.com", port: 465, secure: true }, limits: UNKNOWN, note: "Use an App Password (Google → Security → App passwords)." }),
  outlook: preset({ key: "outlook", name: "Microsoft 365 / Outlook", imap: { host: "outlook.office365.com", port: 993, secure: true }, smtp: { host: "smtp.office365.com", port: 587, secure: false }, limits: UNKNOWN, note: "Basic auth may be disabled by the tenant; an app password or OAuth is then required." }),
  zoho: preset({ key: "zoho", name: "Zoho Mail", imap: { host: "imap.zoho.com", port: 993, secure: true }, smtp: { host: "smtp.zoho.com", port: 465, secure: true }, limits: UNKNOWN }),
  yahoo: preset({ key: "yahoo", name: "Yahoo Mail", imap: { host: "imap.mail.yahoo.com", port: 993, secure: true }, smtp: { host: "smtp.mail.yahoo.com", port: 465, secure: true }, limits: UNKNOWN, note: "Requires an app password." }),
  icloud: preset({ key: "icloud", name: "iCloud Mail", imap: { host: "imap.mail.me.com", port: 993, secure: true }, smtp: { host: "smtp.mail.me.com", port: 587, secure: false }, limits: UNKNOWN, note: "Requires an app-specific password." }),
});

/** Every provider key, in preset order. */
export const PROVIDER_KEYS: readonly ProviderKey[] = Object.freeze(Object.keys(PRESETS) as ProviderKey[]);

/** True when `v` is a known provider key. */
export function isProviderKey(v: unknown): v is ProviderKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PRESETS, v);
}

/** The preset for a key, or null for anything unknown. */
export function presetFor(key: unknown): ProviderPreset | null {
  return isProviderKey(key) ? PRESETS[key] : null;
}
