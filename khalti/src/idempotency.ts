/**
 * Idempotency helper — a stable, unique `purchase_order_id` generator.
 *
 * A good `purchase_order_id` is unique per payment attempt and safe to log/URL.
 * This uses a CSPRNG (Web Crypto `getRandomValues`, present in Node 20+, edge
 * and browsers — the same runtime the rest of the package targets) for the
 * random suffix, with no dependencies.
 */

const HEX = "0123456789abcdef";

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (!cryptoObj || typeof cryptoObj.getRandomValues !== "function") {
    throw new Error(
      "@lacspace/khalti: Web Crypto (globalThis.crypto.getRandomValues) is unavailable in this runtime.",
    );
  }
  cryptoObj.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i] as number;
    out += HEX[(b >> 4) & 0x0f]! + HEX[b & 0x0f]!;
  }
  return out;
}

export interface GenerateOrderIdOptions {
  /** Prefix for readability/grouping, e.g. `"order"`. Default: `"order"`. */
  prefix?: string;
  /**
   * Include a base-36 timestamp segment for rough sortability. Default: `true`.
   */
  timestamp?: boolean;
  /** Number of random bytes (→ 2 hex chars each). Default: `8` (16 hex chars). */
  bytes?: number;
}

/**
 * Generate a unique, CSPRNG-backed `purchase_order_id`. Format (defaults):
 * `order-<base36 time>-<16 hex>`. Segments are joined with `-`.
 *
 * @example
 * const id = generateOrderId();               // "order-lk3n2p-9f1c0a7b3d5e2f18"
 * const id2 = generateOrderId({ prefix: "inv", timestamp: false }); // "inv-4a2b..."
 */
export function generateOrderId(opts: GenerateOrderIdOptions = {}): string {
  const prefix = opts.prefix ?? "order";
  const bytes = opts.bytes ?? 8;
  const parts: string[] = [];
  if (prefix) parts.push(prefix);
  if (opts.timestamp ?? true) parts.push(Date.now().toString(36));
  parts.push(randomHex(bytes));
  return parts.join("-");
}
