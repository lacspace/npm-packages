/**
 * Carrier detection, tracking-number validation, tracking-URL building and a
 * generic carrier-status normalizer.
 *
 * Every part here is **pure** — no network, no dependencies. Format detection
 * uses per-carrier patterns, and where a carrier defines a check digit
 * (UPS, DHL Express air-waybill mod-7, USPS IMpb mod-10, the UPU S10 mod-11) it
 * is verified so a shape-only match can be told apart from a genuine number.
 *
 * Carrier status strings/codes are normalized into the package's canonical
 * `DeliveryStatus` vocabulary — the same one the state machine and the Pathao
 * webhook parser already speak.
 */
import { CourierError, type DeliveryStatus } from "./index";

/** Carriers this module can detect and/or build a tracking URL for. */
export type Carrier =
  | "ups"
  | "fedex"
  | "usps"
  | "dhl"
  | "canada_post"
  | "royal_mail"
  | "australia_post"
  | "pathao";

/** One carrier whose format a tracking number matched. */
export interface CarrierMatch {
  carrier: Carrier;
  /**
   * `true`/`false` when the carrier has a check digit we verify, `null` when it
   * has none we can check (format-only match).
   */
  checkDigitValid: boolean | null;
}

/** The result of inspecting a tracking number. */
export interface TrackingNumberInfo {
  /** The tracking number exactly as passed in. */
  input: string;
  /** Upper-cased, with spaces and hyphens stripped. */
  normalized: string;
  /** `true` when at least one carrier format matched without a failing check digit. */
  valid: boolean;
  /** Best-guess carrier (a check-digit-verified match is preferred). */
  carrier?: Carrier;
  /** Every carrier whose format matched, best guess first. */
  candidates: CarrierMatch[];
}

/* ------------------------------------------------------------------ *
 * Check-digit algorithms
 * ------------------------------------------------------------------ */

/** UPS character value: digits as-is, letters cycle `A=2 … I=0 … Z=7`. */
function upsCharValue(ch: string): number {
  const c = ch.charCodeAt(0);
  if (c >= 48 && c <= 57) return c - 48;
  return (c - 63) % 10;
}

/** Validate the check digit of the 16 chars that follow a UPS `1Z` prefix. */
function upsCheckDigitValid(body16: string): boolean {
  if (body16.length !== 16) return false;
  const last = body16[15]!;
  if (last < "0" || last > "9") return false;
  const check = last.charCodeAt(0) - 48;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const v = upsCharValue(body16[i]!);
    sum += i % 2 === 0 ? v * 2 : v;
  }
  return (10 - (sum % 10)) % 10 === check;
}

/** DHL Express 10-digit air waybill: check digit = first 9 digits mod 7. */
function dhlMod7Valid(d10: string): boolean {
  const check = d10.charCodeAt(9) - 48;
  return Number(d10.slice(0, 9)) % 7 === check;
}

/** USPS IMpb / USS Code-128 mod-10 (weights 3,1 from the right, excl. check). */
function uspsMod10Valid(digits: string): boolean {
  const n = digits.length;
  const check = digits.charCodeAt(n - 1) - 48;
  let sum = 0;
  for (let i = n - 2, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) {
    sum += (digits.charCodeAt(i) - 48) * w;
  }
  return (10 - (sum % 10)) % 10 === check;
}

/** UPU S10 mod-11 check digit over the 9-digit serial (weights 8,6,4,2,3,5,9,7). */
function s10CheckValid(nine: string): boolean {
  const weights = [8, 6, 4, 2, 3, 5, 9, 7];
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += (nine.charCodeAt(i) - 48) * weights[i]!;
  let cd = 11 - (sum % 11);
  if (cd === 10) cd = 0;
  else if (cd === 11) cd = 5;
  return cd === nine.charCodeAt(8) - 48;
}

/** UPU S10 country-code suffix → carrier. */
const S10_COUNTRY_CARRIER: Record<string, Carrier> = {
  GB: "royal_mail",
  CA: "canada_post",
  AU: "australia_post",
  US: "usps",
  DE: "dhl",
  NL: "dhl",
};

const S10 = /^[A-Z]{2}\d{9}[A-Z]{2}$/;

/** Trim, upper-case and strip spaces/hyphens from a tracking number. */
function normalizeTn(s: string): string {
  return String(s).trim().toUpperCase().replace(/[\s-]+/g, "");
}

function matchCarriers(n: string): CarrierMatch[] {
  const out: CarrierMatch[] = [];
  if (/^1Z[0-9A-Z]{16}$/.test(n)) {
    out.push({ carrier: "ups", checkDigitValid: upsCheckDigitValid(n.slice(2)) });
  }
  if (/^\d{10}$/.test(n)) {
    out.push({ carrier: "dhl", checkDigitValid: dhlMod7Valid(n) });
  }
  if (S10.test(n)) {
    const carrier = S10_COUNTRY_CARRIER[n.slice(-2)];
    if (carrier) out.push({ carrier, checkDigitValid: s10CheckValid(n.slice(2, 11)) });
  }
  if (/^(\d{20}|\d{22}|\d{26}|\d{30})$/.test(n)) {
    out.push({ carrier: "usps", checkDigitValid: uspsMod10Valid(n) });
  }
  if (/^(\d{12}|\d{15}|\d{20}|\d{22})$/.test(n)) {
    out.push({ carrier: "fedex", checkDigitValid: null });
  }
  if (/^\d{16}$/.test(n)) {
    out.push({ carrier: "canada_post", checkDigitValid: null });
  }
  return out;
}

/**
 * Inspect a tracking number: normalize it, list every carrier whose format it
 * matches (verifying check digits where they exist) and pick a best-guess
 * carrier. Never throws.
 */
export function detectCarrier(trackingNumber: string): TrackingNumberInfo {
  const input = String(trackingNumber ?? "");
  const normalized = normalizeTn(input);
  const rank = (c: CarrierMatch) =>
    c.checkDigitValid === true ? 0 : c.checkDigitValid === null ? 1 : 2;
  const candidates = matchCarriers(normalized).sort((a, b) => rank(a) - rank(b));
  const best = candidates.find((c) => c.checkDigitValid !== false);
  return {
    input,
    normalized,
    valid: best !== undefined,
    carrier: best?.carrier,
    candidates,
  };
}

/**
 * `true` when a tracking number looks valid. With `carrier`, require a match
 * for that specific carrier whose check digit (if any) passes.
 */
export function isValidTrackingNumber(trackingNumber: string, carrier?: Carrier): boolean {
  const info = detectCarrier(trackingNumber);
  if (!carrier) return info.valid;
  return info.candidates.some((c) => c.carrier === carrier && c.checkDigitValid !== false);
}

/* ------------------------------------------------------------------ *
 * Public tracking-URL builder
 * ------------------------------------------------------------------ */

/** Public "track this parcel" URL template per carrier. */
export const CARRIER_TRACKING_URLS: Record<Carrier, (tn: string) => string> = {
  ups: (t) => `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(t)}`,
  fedex: (t) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(t)}`,
  usps: (t) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(t)}`,
  dhl: (t) => `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(t)}&brand=DHL`,
  canada_post: (t) =>
    `https://www.canadapost-postescanada.ca/track-reperage/en#/details/${encodeURIComponent(t)}`,
  royal_mail: (t) =>
    `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(t)}`,
  australia_post: (t) => `https://auspost.com.au/mypost/track/#/details/${encodeURIComponent(t)}`,
  pathao: (t) => `https://merchant.pathao.com/tracking?consignment_id=${encodeURIComponent(t)}`,
};

/**
 * Build the public tracking URL for a carrier + tracking number. Throws
 * `CourierError` for an unknown carrier (`unknown_carrier`) or an empty
 * tracking number (`invalid_tracking_number`).
 */
export function trackingUrl(carrier: Carrier, trackingNumber: string): string {
  const build = CARRIER_TRACKING_URLS[carrier];
  if (!build) {
    throw new CourierError(`No tracking URL template for carrier: ${carrier}`, {
      code: "unknown_carrier",
    });
  }
  const tn = String(trackingNumber ?? "").trim();
  if (!tn) {
    throw new CourierError("A tracking number is required to build a tracking URL.", {
      code: "invalid_tracking_number",
    });
  }
  return build(tn);
}

/* ------------------------------------------------------------------ *
 * Generic carrier-status normalization → canonical DeliveryStatus
 * ------------------------------------------------------------------ */

/** FedEx-style two-letter scan codes → canonical `DeliveryStatus`. */
export const FEDEX_STATUS_MAP: Record<string, DeliveryStatus> = {
  OC: "confirmed",
  PU: "picked_up",
  IT: "in_transit",
  AR: "in_transit",
  DP: "in_transit",
  AF: "in_transit",
  OD: "out_for_delivery",
  DL: "delivered",
  DE: "failed",
  SE: "failed",
  RS: "returned",
  HL: "on_hold",
  CA: "cancelled",
};

/**
 * Ordered keyword patterns tested against a lower-cased free-text status.
 * Order matters: unhappy-path phrases (return/cancel/exception) are matched
 * before the happy path so e.g. "delivery attempt failed" ≠ delivered.
 */
const STATUS_PATTERNS: Array<[RegExp, DeliveryStatus]> = [
  [/return|rts\b|to sender/, "returned"],
  [/cancel/, "cancelled"],
  [
    /exception|undeliverable|delivery attempt|attempted delivery|failed|failure|not delivered|refused|damaged|lost/,
    "failed",
  ],
  [/out for delivery|out-for-delivery|on vehicle|with (the )?courier|loaded for delivery/, "out_for_delivery"],
  [/delivered|delivery (complete|successful)|left with|handed to|signed for/, "delivered"],
  [/on hold|on-hold|\bheld\b|awaiting collection|held at/, "on_hold"],
  [/picked up|pick-up|pickup|collected|received by carrier/, "picked_up"],
  [/in ?transit|in-transit|arrived|departed|en route|processed through|sorting|sort facility|at (the )?facility|forwarded|in flight/, "in_transit"],
  [
    /label (created|printed)|shipment information (sent|received)|manifest|order (confirmed|placed|processed)|ready (to|for) (ship|dispatch)|pre-?transit|billing information received|awaiting (pickup|dispatch)/,
    "confirmed",
  ],
  [/pending|created|order received|new order/, "pending"],
];

/**
 * Map a carrier's status code or free-text string to a canonical
 * `DeliveryStatus`, or `undefined` if nothing matches. An exact FedEx-style
 * two-letter code is tried first, then keyword matching over the text.
 */
export function normalizeTrackingStatus(raw: string): DeliveryStatus | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const code = FEDEX_STATUS_MAP[trimmed.toUpperCase()];
  if (code) return code;
  const s = trimmed.toLowerCase();
  for (const [re, status] of STATUS_PATTERNS) if (re.test(s)) return status;
  return undefined;
}
