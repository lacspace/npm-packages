/** Base class for every error this package throws. */
export class ImapError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "ImapError";
    if (code !== undefined) this.code = code;
  }
}

/** Socket, TLS or timeout failure. `code` is e.g. ETIMEDOUT, ECONNREFUSED, EBYE, ESTARTTLS, CERT_HAS_EXPIRED. */
export class ImapNetworkError extends ImapError {
  declare code: string;
  constructor(message: string, code: string) {
    super(message, code);
    this.name = "ImapNetworkError";
  }
}

/** The server said something we could not make sense of. */
export class ImapProtocolError extends ImapError {
  response: string;
  constructor(message: string, response: string) {
    super(message, "EPROTOCOL");
    this.name = "ImapProtocolError";
    this.response = response;
  }
}

/** Tagged NO / BAD. `responseCode` is the bracketed code, e.g. TRYCREATE, NONEXISTENT, OVERQUOTA. */
export class ImapCommandError extends ImapError {
  command: string;
  status: "NO" | "BAD";
  responseCode?: string;
  responseText: string;
  constructor(command: string, status: "NO" | "BAD", responseText: string, responseCode?: string) {
    super(`${command} failed: ${status}${responseCode ? ` [${responseCode}]` : ""} ${responseText}`.trim(), responseCode ?? status);
    this.name = "ImapCommandError";
    this.command = command;
    this.status = status;
    this.responseText = responseText;
    if (responseCode !== undefined) this.responseCode = responseCode;
  }
}

/** Login / AUTHENTICATE rejected (e.g. [AUTHENTICATIONFAILED]), or no usable mechanism. */
export class ImapAuthError extends ImapError {
  responseCode?: string;
  responseText?: string;
  constructor(message: string, responseCode?: string, responseText?: string) {
    super(message, responseCode ?? "EAUTH");
    this.name = "ImapAuthError";
    if (responseCode !== undefined) this.responseCode = responseCode;
    if (responseText !== undefined) this.responseText = responseText;
  }
}
