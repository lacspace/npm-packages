export type OAuthErrorCode =
  | "state_mismatch"
  | "provider_error"
  | "token_request_failed"
  | "id_token_invalid"
  | "nonce_mismatch"
  | "discovery_failed"
  | "userinfo_failed"
  | "revocation_failed"
  | "unsupported"
  | "invalid_callback";

export class OAuthError extends Error {
  /** The provider's `error` value for `provider_error`, e.g. "access_denied". */
  public providerError?: string;
  public description?: string;
  public status?: number;
  constructor(message: string, public code: OAuthErrorCode, extra: { providerError?: string; description?: string; status?: number; cause?: unknown } = {}) {
    super(message);
    this.name = "OAuthError";
    if (extra.cause !== undefined) (this as { cause?: unknown }).cause = extra.cause;
    if (extra.providerError) this.providerError = extra.providerError;
    if (extra.description) this.description = extra.description;
    if (extra.status !== undefined) this.status = extra.status;
  }
}
