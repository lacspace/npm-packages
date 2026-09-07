/**
 * Enrollment flow helpers — a tiny, pure state machine for registering a new
 * factor: `started → challenged → confirmed` (or `failed`). It produces the
 * {@link EnrollmentRecord} a server should persist, without prescribing HOW you
 * store it, and stays adapter-based: YOU generate the challenge material (a TOTP
 * secret, a WebAuthn creation challenge, recovery-code hashes) and YOU verify the
 * user's proof — these helpers only shepherd the steps and the shape of the data.
 */

import type { Factor, FactorType } from "./index";

/** The steps a factor enrollment moves through. */
export type EnrollmentStatus = "started" | "challenged" | "confirmed" | "failed";

/** A snapshot of an in-progress (or finished) enrollment. Serializable. */
export interface EnrollmentState<C = unknown> {
  factor: Factor;
  status: EnrollmentStatus;
  /** Challenge material shown to the user (e.g. a TOTP secret / QR, WebAuthn options). Opaque to this library. */
  challenge?: C;
  /** ms epoch the enrollment began. */
  startedAt: number;
  /** ms epoch of the last transition. */
  updatedAt: number;
}

/** The data a server should persist once a factor is confirmed. Storage is yours. */
export interface EnrollmentRecord {
  factorId: string;
  type: FactorType;
  /** Secret/credential material to persist (confirmed TOTP secret, credential id, recovery hashes…). */
  secret?: unknown;
  /** ms epoch the factor became active. */
  enrolledAt: number;
}

export interface EnrollmentClockOptions {
  /** Injectable clock (ms epoch). Defaults to `Date.now`. */
  now?: () => number;
}

export interface CompleteEnrollmentOptions extends EnrollmentClockOptions {
  /** Material to persist in the record. Defaults to the state's `challenge`. */
  secret?: unknown;
}

/** Start enrolling a factor. Returns a `started` state. */
export function beginEnrollment(factor: Factor, opts?: EnrollmentClockOptions): EnrollmentState {
  const t = (opts?.now ?? Date.now)();
  return { factor, status: "started", startedAt: t, updatedAt: t };
}

/**
 * Attach the challenge material you generated (e.g. a fresh TOTP secret) and move
 * the enrollment to `challenged`, ready for the user to prove possession.
 */
export function challengeEnrollment<C>(
  state: EnrollmentState,
  challenge: C,
  opts?: EnrollmentClockOptions,
): EnrollmentState<C> {
  if (state.status !== "started") {
    throw new Error(`cannot challenge enrollment in status "${state.status}"`);
  }
  return { ...state, status: "challenged", challenge, updatedAt: (opts?.now ?? Date.now)() };
}

/**
 * Confirm (or reject) a challenged enrollment. Pass the boolean result of
 * verifying the user's proof against the challenge (you own that check). On
 * success you get a `confirmed` state and the {@link EnrollmentRecord} to store;
 * on failure a `failed` state and no record.
 */
export function completeEnrollment(
  state: EnrollmentState,
  verified: boolean,
  opts?: CompleteEnrollmentOptions,
): { state: EnrollmentState; record?: EnrollmentRecord } {
  if (state.status !== "challenged") {
    throw new Error(`cannot complete enrollment in status "${state.status}"`);
  }
  const t = (opts?.now ?? Date.now)();
  if (!verified) {
    return { state: { ...state, status: "failed", updatedAt: t } };
  }
  const record: EnrollmentRecord = {
    factorId: state.factor.id,
    type: state.factor.type,
    secret: opts?.secret ?? state.challenge,
    enrolledAt: t,
  };
  return { state: { ...state, status: "confirmed", updatedAt: t }, record };
}
