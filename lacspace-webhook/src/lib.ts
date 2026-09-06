/**
 * lacspace-webhook — a local webhook receiver, inspector and replayer.
 *
 * Capture incoming webhooks on a local HTTP server, pretty-print and save them,
 * verify GitHub / Stripe / generic HMAC signatures, forward to a local URL, and
 * replay any captured request. Zero runtime dependencies (`node:http`, `node:crypto`).
 *
 * ```ts
 * import { createReceiver, verifySignature } from "lacspace-webhook";
 *
 * const { server, close } = createReceiver({
 *   secret: process.env.WEBHOOK_SECRET,
 *   verify: "github",
 *   onRequest: (rec, v) => console.log(rec.method, rec.path, v?.ok),
 * });
 * server.listen(4000, () => console.log("listening on http://localhost:4000"));
 * // …later: await close();
 * ```
 *
 * This is a local-only tool: it binds to your machine. To receive webhooks from
 * a public service, pair it with a tunnel (cloudflared, ngrok, …).
 */
export { createReceiver, toRecord } from "./receiver.js";
export type { ReceiverOptions, Receiver } from "./receiver.js";

export { verifySignature } from "./verify.js";
export type { SignatureScheme, VerifyArgs, VerifyResult } from "./verify.js";

export { replayRequests, resolveTarget, buildHeaders } from "./replay.js";
export type { ReplayOptions, ReplayResult } from "./replay.js";

export { serializeCapture, parseCaptureLine, parseCaptureFile, parseBody, parseQuery } from "./capture.js";
export type { CapturedRequest, ParsedBody, ParsedBodyKind } from "./capture.js";

export { formatCapture, summaryLine, humanBytes } from "./format.js";
