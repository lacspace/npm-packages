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

import { verifyTotp } from "@lacspace/otp";

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

/** A step-up session tracking which factors a user has cleared. */
export class MfaSession {
  private verified = new Map<string, FactorType>();
  private readonly policy: Required<MfaPolicy>;

  constructor(private config: MfaConfig) {
    this.policy = {
      minFactors: config.policy?.minFactors ?? 2,
      minAAL: config.policy?.minAAL ?? 1,
      requiredTypes: config.policy?.requiredTypes ?? [],
    };
  }

  /** Mark a registered factor as verified. Returns the updated state. */
  markVerified(factorId: string): MfaState {
    const factor = this.config.factors.find((f) => f.id === factorId);
    if (!factor) throw new Error(`unknown factor "${factorId}"`);
    this.verified.set(factor.id, factor.type);
    return this.state();
  }

  get verifiedFactors(): string[] {
    return [...this.verified.keys()];
  }

  get aal(): AalLevel {
    return assuranceLevel([...this.verified.values()]);
  }

  state(): MfaState {
    const types = [...this.verified.values()];
    const presentTypes = new Set(types);
    const needTypes = this.policy.requiredTypes.filter((t) => !presentTypes.has(t));
    const needFactors = Math.max(0, this.policy.minFactors - this.verified.size);
    const aal = assuranceLevel(types);
    return {
      satisfied: needFactors === 0 && needTypes.length === 0 && aal >= this.policy.minAAL,
      verifiedFactors: this.verifiedFactors,
      aal,
      needFactors,
      needTypes,
    };
  }

  get satisfied(): boolean {
    return this.state().satisfied;
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
