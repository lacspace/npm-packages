/**
 * @lacspace/courier
 *
 * Courier / last-mile delivery toolkit for multi-vendor commerce. Three things
 * every delivery integration re-implements — done once, correctly:
 *
 *   1. **A canonical delivery state machine** — one vocabulary of statuses
 *      (`pending → confirmed → picked_up → in_transit → out_for_delivery →
 *      delivered`, plus `returned / cancelled / failed / on_hold`) with a
 *      guarded `transition()` that refuses illegal jumps.
 *   2. **A Pathao (Nepal) adapter** — the Pathao "Aladdin" Merchant API v1:
 *      token issue + auto-refresh, order creation, price/city/zone/area lookups.
 *   3. **Inbound webhooks** — verify a webhook's shared-secret / HMAC signature
 *      (timing-safe, over Web Crypto) and normalize a carrier's event name into
 *      a canonical `DeliveryStatus` so Confirmed → Delivered stops being a
 *      manual admin click.
 *
 * Built on global `fetch` and Web Crypto (`globalThis.crypto.subtle`) — no Node
 * built-ins, no dependencies. Isomorphic: Node 18+, edge runtimes and browsers.
 */

/* ------------------------------------------------------------------ *
 * Canonical delivery status + state machine
 * ------------------------------------------------------------------ */

/** The one delivery vocabulary every carrier is normalized into. */
export type DeliveryStatus =
  | "pending"
  | "confirmed"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "returned"
  | "cancelled"
  | "failed"
  | "on_hold";

/**
 * Allowed forward transitions for each status. Terminal states map to `[]`.
 * The set is deliberately permissive on the unhappy paths (returns, holds,
 * failures) but forbids skipping or reversing the happy path.
 */
export const DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["picked_up", "cancelled", "on_hold"],
  picked_up: ["in_transit", "returned", "on_hold"],
  in_transit: ["out_for_delivery", "returned", "failed", "on_hold"],
  out_for_delivery: ["delivered", "failed", "returned"],
  on_hold: ["in_transit", "cancelled", "returned"],
  delivered: [],
  returned: [],
  cancelled: [],
  failed: [],
};

/** `true` if `to` is a legal next state from `from`. */
export function canTransition(from: DeliveryStatus, to: DeliveryStatus): boolean {
  return DELIVERY_TRANSITIONS[from].includes(to);
}

/** `true` if `s` is a terminal state with no further transitions. */
export function isTerminal(s: DeliveryStatus): boolean {
  return DELIVERY_TRANSITIONS[s].length === 0;
}

/** Error thrown by every part of this toolkit; carries an optional `code`/`status`. */
export class CourierError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, opts?: { code?: string; status?: number }) {
    super(message);
    this.name = "CourierError";
    this.code = opts?.code;
    this.status = opts?.status;
  }
}

/**
 * Return a shallow copy of `order` with its `status` advanced to `to`.
 * Throws `CourierError` (code `illegal_transition`) if the move is not allowed.
 */
export function transition<T extends { status: DeliveryStatus }>(order: T, to: DeliveryStatus): T {
  if (!canTransition(order.status, to)) {
    throw new CourierError(
      `Illegal delivery transition: ${order.status} → ${to}`,
      { code: "illegal_transition" },
    );
  }
  return { ...order, status: to };
}

/* ------------------------------------------------------------------ *
 * Generic courier adapter interface
 * ------------------------------------------------------------------ */

/** A carrier-agnostic view of one shipment. */
export interface CourierShipment {
  trackingId: string;
  status: DeliveryStatus;
  carrier: string;
  /** The raw carrier response, kept for auditing / debugging. */
  raw?: unknown;
}

/** Generic order input; a reasonable superset across carriers. */
export interface CreateOrderInput {
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  /** Carrier location ids (Pathao uses numeric city/zone/area). */
  cityId?: number;
  zoneId?: number;
  areaId?: number;
  /** Cash-on-delivery amount to collect (0 for prepaid). */
  amountToCollect: number;
  itemQuantity: number;
  /** Weight in kilograms. */
  itemWeight: number;
  description: string;
  specialInstruction?: string;
  /** Optional merchant-side order id echoed back for reconciliation. */
  merchantOrderId?: string;
}

/** The minimum every carrier adapter implements. */
export interface CourierAdapter {
  name: string;
  createOrder(input: CreateOrderInput): Promise<CourierShipment>;
  track(trackingId: string): Promise<CourierShipment>;
}

/* ------------------------------------------------------------------ *
 * Web Crypto + hex helpers (isomorphic, zero-dependency)
 * ------------------------------------------------------------------ */

const enc = new TextEncoder();

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new CourierError(
      "@lacspace/courier: Web Crypto (globalThis.crypto.subtle) is unavailable in this runtime.",
      { code: "no_web_crypto" },
    );
  }
  return subtle;
}

/** Lowercase hex string of raw bytes. */
function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i]!.toString(16).padStart(2, "0");
  return out;
}

/** HMAC-SHA256 over `message` with `secret`, returned as lowercase hex. */
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const subtle = getSubtle();
  const key = await subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await subtle.sign("HMAC", key, enc.encode(message));
  return toHex(new Uint8Array(sig));
}

/**
 * Constant-time comparison of two strings. Accumulates the difference over the
 * maximum length so it never early-returns on a length or character mismatch.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const n = Math.max(ab.length, bb.length);
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/* ------------------------------------------------------------------ *
 * Generic webhook signature verification
 * ------------------------------------------------------------------ */

/**
 * Verify an inbound webhook's `HMAC-SHA256` hex signature over the *raw*
 * request body string. Timing-safe; never throws on a bad signature.
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const expected = await hmacSha256Hex(secret, payload);
  return timingSafeEqual(expected, signature.trim().toLowerCase());
}

/* ------------------------------------------------------------------ *
 * Pathao "Aladdin" Merchant API v1 adapter
 * ------------------------------------------------------------------ */

/**
 * Configuration for the Pathao adapter.
 *
 * `baseUrl` defaults to production `https://api-hermes.pathao.com`. For the
 * Pathao sandbox use `https://courier-api-sandbox.pathao.com`.
 */
export interface PathaoConfig {
  baseUrl?: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  storeId: number;
  /** Inject a `fetch` implementation (defaults to global `fetch`). */
  fetch?: typeof fetch;
}

/** Production base URL for the Pathao Merchant API. */
export const PATHAO_PROD_BASE_URL = "https://api-hermes.pathao.com";
/** Sandbox base URL for the Pathao Merchant API. */
export const PATHAO_SANDBOX_BASE_URL = "https://courier-api-sandbox.pathao.com";

export interface PathaoPriceInput {
  itemType?: number;
  deliveryType?: number;
  itemWeight: number;
  recipientCity: number;
  recipientZone: number;
  storeId?: number;
}

/** The extra Pathao-specific methods surfaced beyond the generic adapter. */
export interface PathaoAdapter extends CourierAdapter {
  issueToken(): Promise<string>;
  priceCalculation(input: PathaoPriceInput): Promise<Record<string, unknown>>;
  cities(): Promise<Record<string, unknown>>;
  zones(cityId: number): Promise<Record<string, unknown>>;
  areas(zoneId: number): Promise<Record<string, unknown>>;
}

interface TokenState {
  accessToken: string;
  /** Absolute epoch ms at which the token should be considered expired. */
  expiresAt: number;
}

/** Refresh the token this many ms before it actually expires. */
const TOKEN_SKEW_MS = 60_000;

/**
 * Create a Pathao Merchant API v1 adapter. Handles token issue + auto-refresh
 * and maps the generic `CreateOrderInput` onto Pathao's order body.
 */
export function createPathaoAdapter(config: PathaoConfig): PathaoAdapter {
  const baseUrl = (config.baseUrl ?? PATHAO_PROD_BASE_URL).replace(/\/+$/, "");
  const doFetch = config.fetch ?? globalThis.fetch;
  if (typeof doFetch !== "function") {
    throw new CourierError(
      "@lacspace/courier: global fetch is unavailable; pass config.fetch.",
      { code: "no_fetch" },
    );
  }

  let token: TokenState | null = null;

  async function readError(res: Response): Promise<string> {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      try {
        body = await res.text();
      } catch {
        body = undefined;
      }
    }
    if (body && typeof body === "object") {
      const rec = body as Record<string, unknown>;
      const msg = rec.message ?? rec.error ?? rec.errors;
      if (msg) return typeof msg === "string" ? msg : JSON.stringify(msg);
    }
    if (typeof body === "string" && body) return body;
    return res.statusText || `HTTP ${res.status}`;
  }

  async function issueToken(): Promise<string> {
    const res = await doFetch(`${baseUrl}/aladdin/api/v1/issue-token`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "password",
        username: config.username,
        password: config.password,
      }),
    });
    if (!res.ok) {
      throw new CourierError(`Pathao token request failed: ${await readError(res)}`, {
        code: "token_failed",
        status: res.status,
      });
    }
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      throw new CourierError("Pathao token response had no access_token.", {
        code: "token_failed",
        status: res.status,
      });
    }
    const ttlMs = (typeof data.expires_in === "number" ? data.expires_in : 3600) * 1000;
    token = { accessToken: data.access_token, expiresAt: Date.now() + ttlMs };
    return token.accessToken;
  }

  async function getToken(): Promise<string> {
    if (token && Date.now() < token.expiresAt - TOKEN_SKEW_MS) return token.accessToken;
    return issueToken();
  }

  async function authed<R = Record<string, unknown>>(
    path: string,
    init: { method: "GET" | "POST"; body?: unknown },
  ): Promise<R> {
    const bearer = await getToken();
    const res = await doFetch(`${baseUrl}${path}`, {
      method: init.method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!res.ok) {
      throw new CourierError(`Pathao ${init.method} ${path} failed: ${await readError(res)}`, {
        code: "request_failed",
        status: res.status,
      });
    }
    return (await res.json()) as R;
  }

  async function createOrder(input: CreateOrderInput): Promise<CourierShipment> {
    const body: Record<string, unknown> = {
      store_id: config.storeId,
      recipient_name: input.recipientName,
      recipient_phone: input.recipientPhone,
      recipient_address: input.recipientAddress,
      recipient_city: input.cityId,
      recipient_zone: input.zoneId,
      recipient_area: input.areaId,
      delivery_type: 48,
      item_type: 2,
      special_instruction: input.specialInstruction,
      item_quantity: input.itemQuantity,
      item_weight: input.itemWeight,
      amount_to_collect: input.amountToCollect,
      item_description: input.description,
    };
    if (input.merchantOrderId !== undefined) body.merchant_order_id = input.merchantOrderId;

    const data = await authed<{
      data?: { consignment_id?: string; order_status?: string; merchant_order_id?: string };
    }>("/aladdin/api/v1/orders", { method: "POST", body });

    const consignmentId = data.data?.consignment_id;
    if (!consignmentId) {
      throw new CourierError("Pathao order response had no consignment_id.", {
        code: "request_failed",
      });
    }
    return {
      trackingId: consignmentId,
      status: "confirmed",
      carrier: "pathao",
      raw: data,
    };
  }

  async function track(_trackingId: string): Promise<CourierShipment> {
    throw new CourierError(
      "Pathao reports delivery status via webhooks, not a public track endpoint; use verifyPathaoWebhook + parsePathaoWebhook.",
      { code: "unsupported" },
    );
  }

  return {
    name: "pathao",
    issueToken,
    createOrder,
    track,
    priceCalculation: (input: PathaoPriceInput) =>
      authed("/aladdin/api/v1/merchant/price-plan", {
        method: "POST",
        body: {
          store_id: input.storeId ?? config.storeId,
          item_type: input.itemType ?? 2,
          delivery_type: input.deliveryType ?? 48,
          item_weight: input.itemWeight,
          recipient_city: input.recipientCity,
          recipient_zone: input.recipientZone,
        },
      }),
    cities: () => authed("/aladdin/api/v1/city-list", { method: "GET" }),
    zones: (cityId: number) =>
      authed(`/aladdin/api/v1/cities/${cityId}/zone-list`, { method: "GET" }),
    areas: (zoneId: number) =>
      authed(`/aladdin/api/v1/zones/${zoneId}/area-list`, { method: "GET" }),
  };
}

/* ------------------------------------------------------------------ *
 * Pathao inbound webhooks
 * ------------------------------------------------------------------ */

/**
 * Header Pathao requires the merchant endpoint to echo back (with HTTP 202)
 * to acknowledge a webhook, carrying the integration secret as its value.
 */
export const PATHAO_WEBHOOK_ACK_HEADER = "X-Pathao-Merchant-Webhook-Integration-Secret";

/** Maps Pathao webhook event names to canonical delivery statuses. */
export const PATHAO_STATUS_MAP: Record<string, DeliveryStatus> = {
  "order.created": "confirmed",
  "order.updated": "confirmed",
  "order.pickup-requested": "confirmed",
  "order.assigned-for-pickup": "confirmed",
  "order.picked": "picked_up",
  "order.pickup-failed": "failed",
  "order.at-the-sorting-hub": "in_transit",
  "order.in-transit": "in_transit",
  "order.received-at-last-mile-hub": "in_transit",
  "order.assigned-for-delivery": "out_for_delivery",
  "order.delivered": "delivered",
  "order.partial-delivery": "delivered",
  "order.delivery-failed": "failed",
  "order.on-hold": "on_hold",
  "order.returning": "returned",
  "order.return": "returned",
  "order.returned": "returned",
  "order.exchanged": "delivered",
  "order.paid": "delivered",
  "order.paid-return": "returned",
};

/** Map a Pathao event name to a canonical status, or `undefined` if unknown. */
export function normalizePathaoStatus(event: string): DeliveryStatus | undefined {
  return PATHAO_STATUS_MAP[event];
}

/** A parsed, normalized Pathao webhook event. */
export interface PathaoWebhookEvent {
  event: string;
  status: DeliveryStatus;
  consignmentId?: string;
  merchantOrderId?: string;
  raw: Record<string, unknown>;
}

/**
 * Parse a Pathao webhook body (raw JSON string or already-parsed object) into a
 * normalized `PathaoWebhookEvent`. Throws `CourierError` on invalid JSON, a
 * missing `event`, or an unrecognized event name.
 */
export function parsePathaoWebhook(body: string | Record<string, unknown>): PathaoWebhookEvent {
  let obj: Record<string, unknown>;
  if (typeof body === "string") {
    try {
      obj = JSON.parse(body) as Record<string, unknown>;
    } catch {
      throw new CourierError("Pathao webhook body is not valid JSON.", { code: "invalid_body" });
    }
  } else {
    obj = body;
  }

  const event = obj.event;
  if (typeof event !== "string" || !event) {
    throw new CourierError("Pathao webhook has no 'event' field.", { code: "invalid_body" });
  }

  const status = normalizePathaoStatus(event);
  if (!status) {
    throw new CourierError(`Unknown Pathao webhook event: ${event}`, { code: "unknown_event" });
  }

  const consignmentId = obj.consignment_id;
  const merchantOrderId = obj.merchant_order_id;

  return {
    event,
    status,
    consignmentId: typeof consignmentId === "string" ? consignmentId : undefined,
    merchantOrderId: typeof merchantOrderId === "string" ? merchantOrderId : undefined,
    raw: obj,
  };
}

/**
 * Verify a Pathao webhook's shared secret. Pathao's integration sends a secret
 * header (e.g. `X-PATHAO-Signature`) the merchant configures; this does a
 * timing-safe string compare of the received header against the expected value.
 *
 * A `null`/`undefined`/empty header always fails. On success the merchant
 * endpoint is also expected to echo `PATHAO_WEBHOOK_ACK_HEADER` with the secret
 * and respond `202 Accepted`.
 */
export function verifyPathaoWebhook(opts: {
  headerSecret: string | null | undefined;
  expectedSecret: string;
}): boolean {
  if (!opts.headerSecret) return false;
  return timingSafeEqual(opts.headerSecret, opts.expectedSecret);
}
