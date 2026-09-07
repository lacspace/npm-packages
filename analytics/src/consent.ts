/**
 * @lacspace/analytics — consent & Do-Not-Track helpers.
 *
 * A tiny, pure decision layer that says whether an event may be collected.
 * Isomorphic: DNT is read from the browser when present, and is simply absent
 * on the server (where you pass consent explicitly).
 */

/** The signals `shouldTrack` weighs to decide if an event may be collected. */
export interface ConsentContext {
  /** Has the user granted consent? `true`/`false`, or `undefined` if unknown. */
  consent?: boolean;
  /** Do-Not-Track is enabled for this environment. */
  dnt?: boolean;
  /** Whether an enabled DNT signal should block tracking. Default `true`. */
  respectDNT?: boolean;
  /** When consent is unknown (`undefined`), may we track? Default `false`. */
  defaultConsent?: boolean;
}

/**
 * Read the browser's Do-Not-Track signal. Returns `undefined` when it cannot be
 * determined (e.g. on the server, or when the browser exposes no signal).
 */
export function detectDNT(): boolean | undefined {
  const g = globalThis as unknown as {
    navigator?: Record<string, unknown>;
    doNotTrack?: unknown;
  };
  const nav = g.navigator;
  const raw =
    (nav && (nav["doNotTrack"] ?? nav["msDoNotTrack"])) ?? g.doNotTrack;
  if (raw === undefined || raw === null) return undefined;
  const v = String(raw).toLowerCase();
  if (v === "1" || v === "yes" || v === "true") return true;
  if (v === "0" || v === "no" || v === "false" || v === "unspecified") return false;
  return undefined;
}

/**
 * Pure predicate: may an event be collected under these signals?
 *
 * - An explicit `consent === false` always blocks.
 * - An enabled `dnt` blocks unless `respectDNT` is `false`.
 * - When `consent` is unknown, `defaultConsent` decides (default `false`).
 */
export function shouldTrack(ctx: ConsentContext = {}): boolean {
  const respectDNT = ctx.respectDNT ?? true;
  if (respectDNT && ctx.dnt === true) return false;
  if (ctx.consent === false) return false;
  if (ctx.consent === true) return true;
  return ctx.defaultConsent ?? false;
}
