/**
 * @lacspace/mfa
 * Orchestrate multi-factor auth — combine password, TOTP and passkeys into
 * 2FA / 3FA step-up flows with NIST-style assurance levels.
 *
 * This is the conductor, not the crypto: pair it with @lacspace/password,
 * @lacspace/otp and @lacspace/webauthn to verify each factor.
 *
 * Zero dependencies (bar @lacspace/otp) · isomorphic · fully typed.
 */

import { verifyTotp, verifyBackupCode } from "@lacspace/otp";
import { verify as verifyPassword } from "@lacspace/password";

/** The three NIST factor categories. */
export type FactorType = "knowledge" | "possession" | "inherence";

export interface Factor {
  /** Your identifier for this factor, e.g. "password", "totp", "passkey-1". */
  id: string;
  type: FactorType;
}

/** Authenticator Assurance Levels (NIST SP 800-63B, simplified). */
export const AAL = { AAL1: 1, AAL2: 2, AAL3: 3 } as const;
export type AalLevel = 1 | 2 | 3;

/**
 * Assurance level for a set of verified factor types:
 * - AAL1: a single factor (usually knowledge)
 * - AAL2: two distinct factor types
 * - AAL3: two+ types including a hardware-bound inherence/possession (e.g. passkey)
 */
export function assuranceLevel(types: FactorType[]): AalLevel {
  const distinct = new Set(types);
  if (distinct.size >= 2 && distinct.has("inherence")) return 3;
  if (distinct.size >= 2) return 2;
  return 1;
}

export interface MfaPolicy {
  /** Minimum number of distinct factors that must be verified. Default 2. */
  minFactors?: number;
  /** Minimum assurance level required. */
  minAAL?: AalLevel;
  /** Factor types that must all be present. */
  requiredTypes?: FactorType[];
}

export interface MfaConfig {
  /** Factors the user has registered. */
  factors: Factor[];
  policy?: MfaPolicy;
  /** If set, a verified factor "expires" after this many ms (step-up windows). */
  factorTtlMs?: number;
}

export interface MfaState {
  satisfied: boolean;
  verifiedFactors: string[];
  aal: AalLevel;
  /** How many more distinct factors are needed. */
  needFactors: number;
  /** Factor types still required by the policy. */
  needTypes: FactorType[];
}

interface VerifiedEntry {
  type: FactorType;
  at: number;
}

/** Serialized form of a session — persist across requests (signed cookie / store). */
export interface MfaSessionData {
  verified: { id: string; type: FactorType; at: number }[];
}

/** A step-up session tracking which factors a user has cleared. */
export class MfaSession {
  private verified = new Map<string, VerifiedEntry>();
  private readonly policy: Required<MfaPolicy>;
  private readonly ttl?: number;

  constructor(private config: MfaConfig) {
    this.policy = {
      minFactors: config.policy?.minFactors ?? 2,
      minAAL: config.policy?.minAAL ?? 1,
      requiredTypes: config.policy?.requiredTypes ?? [],
    };
    this.ttl = config.factorTtlMs;
  }

  private now(): number {
    return Date.now();
  }

  /** Live entries, dropping any that have passed the factor TTL. */
  private live(): Map<string, VerifiedEntry> {
    if (!this.ttl) return this.verified;
    const cutoff = this.now() - this.ttl;
    const out = new Map<string, VerifiedEntry>();
    for (const [id, e] of this.verified) if (e.at >= cutoff) out.set(id, e);
    return out;
  }

  /** Mark a registered factor as verified. Returns the updated state. */
  markVerified(factorId: string): MfaState {
    const factor = this.config.factors.find((f) => f.id === factorId);
    if (!factor) throw new Error(`unknown factor "${factorId}"`);
    this.verified.set(factor.id, { type: factor.type, at: this.now() });
    return this.state();
  }

  get verifiedFactors(): string[] {
    return [...this.live().keys()];
  }

  get aal(): AalLevel {
    return assuranceLevel([...this.live().values()].map((e) => e.type));
  }

  state(): MfaState {
    const live = this.live();
    const types = [...live.values()].map((e) => e.type);
    const presentTypes = new Set(types);
    const needTypes = this.policy.requiredTypes.filter((t) => !presentTypes.has(t));
    const needFactors = Math.max(0, this.policy.minFactors - live.size);
    const aal = assuranceLevel(types);
    return {
      satisfied: needFactors === 0 && needTypes.length === 0 && aal >= this.policy.minAAL,
      verifiedFactors: [...live.keys()],
      aal,
      needFactors,
      needTypes,
    };
  }

  get satisfied(): boolean {
    return this.state().satisfied;
  }

  /** Serialize the verified factors (persist this between requests). */
  toJSON(): MfaSessionData {
    return { verified: [...this.verified].map(([id, e]) => ({ id, type: e.type, at: e.at })) };
  }

  /** Restore a session from {@link toJSON} output plus the user's factor config. */
  static fromJSON(config: MfaConfig, data: MfaSessionData): MfaSession {
    const s = new MfaSession(config);
    for (const e of data.verified) s.verified.set(e.id, { type: e.type, at: e.at });
    return s;
  }
}

export function mfaSession(config: MfaConfig): MfaSession {
  return new MfaSession(config);
}

/* ------------------------------ factor verifiers ------------------------------ */

/** Verify a TOTP factor (thin wrapper over @lacspace/otp). Returns true if valid. */
export async function verifyTotpFactor(
  token: string,
  secret: string,
  opts?: { window?: number; digits?: number; period?: number },
): Promise<boolean> {
  return (await verifyTotp(token, secret, opts)) !== null;
}

/** Verify a knowledge factor: a password against its stored hash (@lacspace/password). */
export async function verifyPasswordFactor(password: string, storedHash: string): Promise<boolean> {
  return verifyPassword(password, storedHash);
}

/**
 * Verify a recovery/backup code against stored hashes (@lacspace/otp).
 * Returns the matched index (remove/mark it used) or -1. Treat as a possession factor.
 */
export async function verifyBackupCodeFactor(code: string, hashes: string[]): Promise<number> {
  return verifyBackupCode(code, hashes);
}

/**
 * Verify a passkey factor. Pass the boolean result of your
 * `@lacspace/webauthn` `verifyAuthentication(...)` call — this normalizes it as
 * an `inherence`/`possession` factor for the session. Kept decoupled so you own
 * the WebAuthn ceremony (challenge store, credential lookup).
 */
export function verifyPasskeyFactor(webauthnVerified: boolean): boolean {
  return webauthnVerified === true;
}
