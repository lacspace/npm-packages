/**
 * @lacspace/webauthn — authenticator-data flag helpers.
 *
 * Pure, dependency-free readers for the WebAuthn `authenticatorData` flag byte
 * and the AAGUID. Surfaces passkey-sync awareness (backup eligible / backup
 * state) alongside the classic User-Present / User-Verified bits.
 *
 * Flag byte (per the WebAuthn spec):
 *   bit 0 (0x01) UP  — User Present
 *   bit 2 (0x04) UV  — User Verified
 *   bit 3 (0x08) BE  — Backup Eligible   (credential may be synced/backed up)
 *   bit 4 (0x10) BS  — Backup State      (credential is currently backed up)
 *   bit 6 (0x40) AT  — Attested credential data included
 *   bit 7 (0x80) ED  — Extension data included
 */

/** The decoded authenticator-data flag bits. */
export interface AuthenticatorFlagSet {
  /** UP (0x01) — a user was present (touched / gestured on the authenticator). */
  userPresent: boolean;
  /** UV (0x04) — the user was verified (biometric / PIN). */
  userVerified: boolean;
  /** BE (0x08) — the credential is eligible for backup / multi-device sync. */
  backupEligible: boolean;
  /** BS (0x10) — the credential is currently backed up / synced. */
  backupState: boolean;
  /** AT (0x40) — attested credential data is present (registration responses). */
  attestedCredentialData: boolean;
  /** ED (0x80) — extension data is present. */
  extensionData: boolean;
}

/** Decode the authenticator-data flag byte into named booleans. */
export function parseAuthenticatorFlags(flags: number): AuthenticatorFlagSet {
  return {
    userPresent: !!(flags & 0x01),
    userVerified: !!(flags & 0x04),
    backupEligible: !!(flags & 0x08),
    backupState: !!(flags & 0x10),
    attestedCredentialData: !!(flags & 0x40),
    extensionData: !!(flags & 0x80),
  };
}

/** Format a 16-byte AAGUID as the canonical `8-4-4-4-12` lowercase-hex string. */
export function formatAaguid(bytes: Uint8Array): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
