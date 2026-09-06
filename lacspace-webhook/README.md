# lacspace-webhook

**A local webhook receiver, inspector and replayer.** Capture incoming webhooks on your machine, pretty-print and save them, **verify signatures** (GitHub / Stripe / generic HMAC), **forward** them to your app on localhost, and **replay** any captured request as many times as you like. **Zero dependencies** — just `node:http` and `node:crypto`.

```bash
npx lacspace-webhook listen --port 4000 --save hooks.ndjson
```

> **Local-only.** It binds to your machine. To receive webhooks from a public service (GitHub, Stripe, …), pair it with a tunnel like [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) or [ngrok](https://ngrok.com/) and point that tunnel at the port above.

## Install

```bash
npm i -g lacspace-webhook     # then: lacspace-webhook listen
# or, no install:
npx lacspace-webhook listen
```

## What it does

- **listen** — start an HTTP server that accepts **any** method/path. Every request is captured (method, path, query, headers, raw body), the body is parsed by content-type (JSON / form / text) and printed as a readable block. Optionally save to NDJSON, verify a signature, or forward to your app.
- **verify signatures** — HMAC-SHA256, timing-safe, for **GitHub**, **Stripe**, and a **generic** scheme.
- **forward** — proxy each request to a local URL and relay that response back to the caller (great for debugging your real handler while still seeing the payload).
- **replay** — re-send captured requests to any target. Replay one, or all in order, with an optional delay.
- **list** — summarize a capture file.

## Usage

### Capture & inspect

```bash
# Print every incoming request; save each as one NDJSON line
npx lacspace-webhook listen --port 4000 --save hooks.ndjson
```

```
◆ lacspace-webhook — listening
  ▶ http://localhost:4000
  ▤ saving → /abs/path/hooks.ndjson

── #1 ──
POST /hooks/github · 1.2 KB · 10:38:55 PM
  headers
    content-type: application/json
    x-hub-signature-256: sha256=…
  body (json)
    { "action": "opened", … }
```

### Verify a signature

```bash
# GitHub
npx lacspace-webhook listen --secret "$GITHUB_WEBHOOK_SECRET" --verify github
# Stripe
npx lacspace-webhook listen --secret "$STRIPE_SIGNING_SECRET" --verify stripe
# Generic HMAC-SHA256 in a custom header
npx lacspace-webhook listen --secret whatever --verify hmac-sha256 --header X-Signature
```

Each request prints `✔ signature verified` or `✗ signature failed — <reason>`.

### Forward to your app

```bash
# See the payload here AND let your real handler run
npx lacspace-webhook listen --forward http://localhost:3000/api/webhook
```

### Replay captured requests

```bash
npx lacspace-webhook replay hooks.ndjson --to http://localhost:3000
npx lacspace-webhook replay hooks.ndjson --to http://localhost:3000 --index 2
npx lacspace-webhook replay hooks.ndjson --to http://localhost:3000 --delay 250
```

### List a capture file

```bash
npx lacspace-webhook list hooks.ndjson
```

## Library usage

Everything the CLI does is available as a typed API.

```ts
import { createReceiver, verifySignature, replayRequests, parseCaptureFile } from "lacspace-webhook";
import { readFileSync } from "node:fs";

// 1) Run a receiver
const { server, close } = createReceiver({
  secret: process.env.GITHUB_WEBHOOK_SECRET,
  verify: "github",
  onRequest: (rec, v) => console.log(rec.method, rec.path, v?.ok ? "✔" : "✗"),
});
server.listen(4000, () => console.log("http://localhost:4000"));

// 2) Verify a signature yourself
const result = verifySignature("stripe", {
  rawBody,               // the EXACT raw body string/Buffer
  headers,               // the incoming headers
  secret: process.env.STRIPE_SIGNING_SECRET!,
});
if (!result.ok) throw new Error(result.reason);

// 3) Replay a capture file
const records = parseCaptureFile(readFileSync("hooks.ndjson", "utf8"));
const statuses = await replayRequests(records, { to: "http://localhost:3000", delay: 200 });
```

CommonJS works too: `const { createReceiver } = require("lacspace-webhook");`

### Public API

| Export | Signature |
| --- | --- |
| `createReceiver(opts)` | `(opts?: ReceiverOptions) => { server: http.Server; close(): Promise<void> }` |
| `verifySignature(scheme, args)` | `("github"\|"stripe"\|"hmac-sha256", { rawBody, headers, secret, header? }) => { ok: boolean; reason?: string }` |
| `replayRequests(records, opts)` | `(CapturedRequest[], { to: string; delay?: number }) => Promise<{ status: number }[]>` |
| `parseCaptureLine(line)` | `(string) => CapturedRequest` |
| `parseCaptureFile(text)` | `(string) => CapturedRequest[]` |
| `serializeCapture(record)` | `(CapturedRequest) => string` |
| `parseBody(raw, contentType?)` | `(string, string?) => { kind: "json"\|"form"\|"text"\|"empty"; data: unknown }` |
| `toRecord(req, rawBody)` | `(http.IncomingMessage, Buffer) => CapturedRequest` |
| `formatCapture(record, verify?)` | pretty-printed terminal block |
| Types | `CapturedRequest`, `ReceiverOptions`, `SignatureScheme`, `VerifyArgs`, `VerifyResult`, `ReplayOptions`, `ReplayResult`, `ParsedBody` |

## Options

### `listen`

| Flag | Meaning |
| --- | --- |
| `--port <n>` | Port to listen on (default `4000`) |
| `--path <path>` | Only accept this exact path (default: any path) |
| `--save <file>` | Append each request to an NDJSON file |
| `--forward <url>` | Proxy requests to a local URL and relay its response |
| `--status <n>` | Response status when not forwarding (default `200`) |
| `--body <text>` | Response body when not forwarding (default `{"ok":true}`) |
| `--secret <key>` | Secret used to verify signatures |
| `--verify <scheme>` | `github` \| `stripe` \| `hmac-sha256` |
| `--header <name>` | Signature header for `hmac-sha256` (default `X-Signature`) |

### `replay`

| Flag | Meaning |
| --- | --- |
| `--to <url>` | **Required.** Target base URL; the captured path is appended |
| `-i, --index <n>` | Replay only record #n (default: all, in order) |
| `--delay <ms>` | Wait between requests |

### General

| Flag | Meaning |
| --- | --- |
| `-h, --help` | Show help |
| `-v, --version` | Print version |

## How it works

`listen` starts a `node:http` server that reads the full raw body of every request before anything else — signatures must be checked against the **exact bytes**, so the raw body is preserved verbatim and only *parsed* for display. Signature verification is HMAC-SHA256 via `node:crypto` with a constant-time (`timingSafeEqual`) comparison:

- **github** — `X-Hub-Signature-256: sha256=<hmac>` over the raw body.
- **stripe** — `Stripe-Signature: t=<ts>,v1=<hmac>` where the signed payload is `"{t}.{rawBody}"`.
- **hmac-sha256** — hex HMAC-SHA256 of the raw body in a configurable header.

Captured requests are stored as **NDJSON** (one JSON object per line), so a capture file is easy to grep, diff, and re-feed into `replay`.

## Limitations

- **Local-only** — it does not expose itself to the internet. Use a tunnel for public delivery.
- Bodies are held in memory and stored as UTF-8 text (default cap 5 MB); it is built for typical JSON/form webhooks, not large binary uploads.
- Stripe verification checks the HMAC only; it does not enforce a timestamp-tolerance window (replay-protection is up to you).
- `replay` uses the global `fetch` (Node ≥ 20) and reports each response's status code.

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE).
