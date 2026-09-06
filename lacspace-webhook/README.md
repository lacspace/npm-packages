# lacspace-webhook

**A local webhook receiver, inspector and replayer.** Capture incoming webhooks on your machine, watch them arrive **live in a web dashboard**, pretty-print and save them, **verify signatures** (GitHub / Stripe / Shopify / Slack / Svix / HMAC / SHA-1, with **auto-detect**), **mock** custom responses with rules, **fan-out forward** them to your app(s) on localhost, **export/import as curl**, and **replay** any captured request with filters, transforms and CI assertions. **Zero dependencies** — just `node:http`, `node:crypto` and the global `fetch`.

```bash
npx lacspace-webhook listen --ui --save hooks.ndjson
```

> **Local-only.** It binds to your machine. To receive webhooks from a public service (GitHub, Stripe, …), pair it with a tunnel like [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) or [ngrok](https://ngrok.com/) and point that tunnel at the port above.

## Install

```bash
npm i -g lacspace-webhook     # then: lacspace-webhook listen
# or, no install:
npx lacspace-webhook listen
```

## What it does

- **listen** — start an HTTP server that accepts **any** method/path. Every request is captured (method, path, query, headers, raw body), the body is parsed by content-type (JSON / form / text) and printed as a readable block. Optionally open a live web UI, save to NDJSON, verify a signature, mock responses, or forward to your app(s).
- **live inspector** (`--ui`) — a self-contained, zero-dependency dashboard at `/__inspector` that streams captured requests **live** over Server-Sent Events, with a details view, pretty JSON, and a signature badge. A local, offline [webhook.site](https://webhook.site).
- **verify signatures** — timing-safe HMAC for **GitHub**, **Stripe**, **Shopify**, **Slack**, **Svix** (Resend/Clerk), a **generic HMAC-SHA256**, legacy **SHA-1**, plus **`auto`** which infers the scheme from the headers.
- **mock responses** (`--rules`) — match on method/path/body/headers/query and return a custom **status, headers, body and delay** so the receiver can stand in for a real endpoint.
- **fan-out forward** — deliver each webhook to **several** local endpoints at once, with per-target reporting and **retries**.
- **replay** — re-send captured requests to any target, with **filters**, **header overrides**, **body rewrites**, and CI **assertions**.
- **curl** — export any captured request as a runnable `curl` command, or import one back into a record (`fromCurl`).
- **list** — summarize a capture file.

## Usage

### Capture & inspect (live UI)

```bash
# Print every incoming request, save each as one NDJSON line, and open a live dashboard
npx lacspace-webhook listen --port 4000 --ui --save hooks.ndjson
#   ◆ http://localhost:4000/__inspector   ← open this in a browser
```

The dashboard updates in real time as webhooks arrive — click any request to inspect its headers, query, pretty-printed body and signature status. It ships as a single HTML page with no external assets.

### Verify a signature

```bash
npx lacspace-webhook listen --secret "$GITHUB_WEBHOOK_SECRET"  --verify github
npx lacspace-webhook listen --secret "$STRIPE_SIGNING_SECRET"  --verify stripe
npx lacspace-webhook listen --secret "$SHOPIFY_API_SECRET"     --verify shopify
npx lacspace-webhook listen --secret "$SLACK_SIGNING_SECRET"   --verify slack
npx lacspace-webhook listen --secret "whsec_…"                 --verify svix
npx lacspace-webhook listen --secret whatever --verify hmac-sha256 --header X-Signature
# Don't know / mixed sources? Let it detect the scheme from the headers:
npx lacspace-webhook listen --secret "$SECRET" --verify auto
```

Each request prints `✔ signature verified` or `✗ signature failed — <reason>` (and, for `auto`, the scheme it used).

### Mock responses (stand in for a real endpoint)

Create `rules.json` — the first matching rule wins and overrides forwarding/defaults:

```json
{
  "rules": [
    {
      "name": "charge ok",
      "match": { "method": "POST", "path": "/pay", "bodyContains": "charge" },
      "response": { "status": 201, "json": { "paid": true }, "headers": { "x-mock": "1" }, "delay": 150 }
    },
    { "name": "everything else", "response": { "status": 202, "body": "queued" } }
  ]
}
```

```bash
npx lacspace-webhook listen --rules rules.json
```

`match` fields (all optional, AND-combined): `method`, `path` (exact, glob `*`, or `/regex/`), `pathPrefix`, `bodyContains`, `bodyRegex`, `header` (value exact or `"*"` = present), `query`. `response`: `status`, `headers`, `body` **or** `json`, `contentType`, `delay`.

### Fan-out forward (one webhook → many endpoints)

```bash
# Repeat the flag, or comma-list; the first successful response is relayed to the caller
npx lacspace-webhook listen --forward http://localhost:3000/api --forward http://localhost:3100/api
npx lacspace-webhook listen --forward "http://localhost:3000/api,http://localhost:3100/api" --retry 2
```

Each target's outcome is reported (`✔ … → 200` / `✗ … → fetch failed (2 attempts)`); `--retry <n>` retries a failed target with exponential backoff.

### Export / import as curl

```bash
npx lacspace-webhook list hooks.ndjson --curl              # a curl for every record
npx lacspace-webhook list hooks.ndjson --curl --index 0    # just record #0
npx lacspace-webhook list hooks.ndjson --curl --base https://staging.example.com
```

In the library, `fromCurl("curl -X POST … -d …")` builds a `CapturedRequest` you can replay or serialize.

### Replay captured requests (with filters, transforms & assertions)

```bash
npx lacspace-webhook replay hooks.ndjson --to http://localhost:3000
npx lacspace-webhook replay hooks.ndjson --to http://localhost:3000 --index 2 --delay 250

# Only POSTs to /webhook, with a header override and a body rewrite
npx lacspace-webhook replay hooks.ndjson --to http://localhost:3000 \
  --filter "method=POST,path=/webhook" --header "X-Env: staging" --rewrite "prod=>staging"

# CI test: fail (exit 1) unless the endpoint answers 200 containing "ok"
npx lacspace-webhook replay hooks.ndjson --to http://localhost:3000 \
  --expect-status 200 --expect-contains ok
```

### List a capture file

```bash
npx lacspace-webhook list hooks.ndjson
```

## Library usage

Everything the CLI does is available as a typed API.

```ts
import {
  createReceiver, verifySignature, replayRequests, parseCaptureFile,
  matchRule, toCurl, fromCurl, detectScheme,
} from "lacspace-webhook";
import { readFileSync } from "node:fs";

// 1) Run a receiver — fan-out forward, mock rules, live UI, auto-verify
const { server, close } = createReceiver({
  secret: process.env.WEBHOOK_SECRET,
  verify: "auto",
  ui: true,
  forward: ["http://localhost:3000/api", "http://localhost:3100/api"],
  forwardRetry: 2,
  rules: [{ match: { path: "/health" }, response: { status: 200, json: { ok: true } } }],
  onRequest: (rec, v) => console.log(rec.method, rec.path, v?.ok ? "✔" : "✗", v?.scheme),
});
server.listen(4000, () => console.log("http://localhost:4000/__inspector"));

// 2) Verify a signature yourself (auto-detect the scheme)
const result = verifySignature("auto", { rawBody, headers, secret: process.env.WEBHOOK_SECRET! });
if (!result.ok) throw new Error(result.reason);

// 3) Replay with a transform + assertions
const records = parseCaptureFile(readFileSync("hooks.ndjson", "utf8"));
const out = await replayRequests(records, {
  to: "http://localhost:3000",
  filter: { method: "POST" },
  rewrite: [{ find: "prod", replace: "staging" }],
  expectStatus: 200,
});
if (out.some((r) => r.ok === false)) process.exit(1);

// 4) curl round-trip
const curl = toCurl(records[0], { base: "http://localhost:3000" });
const rebuilt = fromCurl(curl);
```

CommonJS works too: `const { createReceiver } = require("lacspace-webhook");`

### Public API

| Export | Signature |
| --- | --- |
| `createReceiver(opts)` | `(opts?: ReceiverOptions) => { server: http.Server; close(): Promise<void> }` |
| `verifySignature(scheme, args)` | `(SignatureScheme, { rawBody, headers, secret, header? }) => { ok; reason?; scheme? }` |
| `detectScheme(headers, customHeader?)` | `(headers) => ConcreteScheme \| undefined` |
| `replayRequests(records, opts)` | `(CapturedRequest[], ReplayOptions) => Promise<ReplayResult[]>` |
| `matchRule(rule, record)` / `findRule(rules, record)` | rule matching |
| `resolveResponse(rule)` / `normalizeRules(input)` | build/validate mock responses |
| `toCurl(record, opts?)` | `(CapturedRequest, { base?, multiline?, skipHeaders? }) => string` |
| `fromCurl(cmd)` | `(string) => CapturedRequest` |
| `parseFilter(expr)` / `matchFilter(record, filter)` | replay filtering |
| `parseRewrite(spec)` / `applyReplayTransform(record, opts)` | replay body/header transforms |
| `normalizeForward(forward)` | `(string \| string[]) => string[]` |
| `inspectorHtml(meta)` / `sseFrame(event, data)` | the live-UI building blocks |
| `parseCaptureFile` / `parseCaptureLine` / `serializeCapture` / `parseBody` / `toRecord` / `formatCapture` | capture I/O + display |
| Types | `CapturedRequest`, `ReceiverOptions`, `ForwardResult`, `SignatureScheme`, `ConcreteScheme`, `VerifyArgs`, `VerifyResult`, `ReplayOptions`, `ReplayResult`, `ReplayFilter`, `Rewrite`, `Rule`, `RuleMatch`, `RuleResponse`, `RulesFile`, `ResolvedResponse`, `ToCurlOptions`, `UiEvent`, `ParsedBody` |

All new options are additive — existing signatures still hold (`verifySignature` results gained an optional `scheme`; `replayRequests` results are still `{ status }` unless you ask for assertions/retries).

## Options

### `listen`

| Flag | Meaning |
| --- | --- |
| `--port <n>` | Port to listen on (default `4000`) |
| `--path <path>` | Only accept this exact path (default: any path) |
| `--ui` | Serve the live web inspector at `/__inspector` (SSE stream at `/__inspector/events`) |
| `--save <file>` | Append each request to an NDJSON file |
| `--forward <url>` | Forward to a local URL. **Repeat** or comma-list for fan-out |
| `--retry <n>` | Retry a failed forward `n` times with exponential backoff |
| `--rules <file>` | JSON mock rules: match → custom status/headers/body/delay |
| `--status <n>` | Default response status when not forwarding/mocking (default `200`) |
| `--body <text>` | Default response body (default `{"ok":true}`) |
| `--delay <ms>` | Delay before the default/mock-default response |
| `--secret <key>` | Secret used to verify signatures |
| `--verify <scheme>` | `auto` \| `github` \| `stripe` \| `shopify` \| `slack` \| `svix` \| `hmac-sha256` \| `sha1` \| `paypal` |
| `--header <name>` | Signature header for `hmac-sha256`/`sha1` (default `X-Signature`) |

### `replay`

| Flag | Meaning |
| --- | --- |
| `--to <url>` | **Required.** Target base URL; the captured path is appended |
| `-i, --index <n>` | Replay only record #n (default: all, in order) |
| `--delay <ms>` | Wait between requests |
| `--filter <expr>` | Only replay matches, e.g. `"method=POST,path=/x"` (also `pathPrefix`, `body`) |
| `--header "K: V"` | Override/add a header (repeatable) |
| `--set-body <text>` | Replace the body of every request |
| `--rewrite "a=>b"` | Find/replace in the body (repeatable) |
| `--expect-status <n>` | CI assert: response status must equal `n` (exit `1` on any mismatch) |
| `--expect-contains <s>` | CI assert: response body must contain `s` |

### `list`

| Flag | Meaning |
| --- | --- |
| `--curl` | Print a ready-to-run `curl` for each record |
| `-i, --index <n>` | With `--curl`: only record #n |
| `--base <url>` | Base URL for the `curl` target (default `http://localhost:4000`) |

## How it works

`listen` starts a `node:http` server that reads the full raw body of every request before anything else — signatures must be checked against the **exact bytes**, so the raw body is preserved verbatim and only *parsed* for display. Signature verification uses `node:crypto` HMAC with a constant-time (`timingSafeEqual`) comparison:

- **github** — `X-Hub-Signature-256: sha256=<hmac>` (hex) over the raw body.
- **stripe** — `Stripe-Signature: t=<ts>,v1=<hmac>` (hex); signed payload `"{t}.{body}"`.
- **shopify** — `X-Shopify-Hmac-Sha256: <hmac>` (**base64**) over the raw body.
- **slack** — `X-Slack-Signature: v0=<hmac>` (hex); signed payload `"v0:{ts}:{body}"`.
- **svix** — `svix-id`/`svix-timestamp`/`svix-signature`; **base64 secret** (with `whsec_`), base64 HMAC over `"{id}.{ts}.{body}"` (also matches Resend/Clerk `webhook-*` headers).
- **hmac-sha256** — hex HMAC-SHA256 of the raw body in a configurable header (a `sha256=` prefix is tolerated).
- **sha1** — legacy hex HMAC-SHA1 in a configurable header (default `X-Hub-Signature`).
- **auto** — picks the scheme from whichever known signature header is present.

Captured requests are stored as **NDJSON** (one JSON object per line), so a capture file is easy to grep, diff, and re-feed into `replay`, `list --curl` or the library.

## Limitations

- **Local-only** — it does not expose itself to the internet. Use a tunnel for public delivery.
- **`paypal`** is intentionally **not verifiable offline** — PayPal signs webhooks with a rotating **X.509 certificate**, not a shared HMAC secret, so verification requires PayPal's `verify-webhook-signature` API. The scheme is accepted but always returns a clear "certificate-based" reason.
- Signature schemes verify the **HMAC only**; they do **not** enforce a timestamp-tolerance window (Stripe/Slack/Svix replay-protection is up to you — the timestamp is part of the signed payload, so a changed timestamp fails, but an old-but-valid one still passes).
- The live UI keeps captures in the browser tab only (cleared on reload / with **Clear**); use `--save` for durable storage. SSE is one-way (server → browser).
- Bodies are held in memory and stored as UTF-8 text (default cap 5 MB); built for typical JSON/form webhooks, not large binary uploads.
- `fromCurl` models the common flags (`-X`, `-H`, the `-d`/`--data` family, `--json`, `-b`, `-A`, `-e`, `--url`, positional URL); it is not a full `curl` parser.
- `replay`/forward use the global `fetch` (Node ≥ 20).

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE).
