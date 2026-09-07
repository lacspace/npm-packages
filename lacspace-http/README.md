# lacspace-http

**A keyless, zero-dependency terminal API client + `.http` file runner** — a local Postman/httpie you drive from the shell. Fire off HTTP requests with a friendly CLI, or run a `.http`/`.rest` file of named requests with `{{variables}}`, response **capture & chaining** (grab a token from one response, reuse it in the next) and **assertions** — so a file doubles as an API test suite you can run in CI.

```bash
npx lacspace-http https://httpbin.org/get
# 200 OK · 214ms · 1.2 KB
# { "args": {}, "headers": { … }, "url": "https://httpbin.org/get" }
```

No API key. No account. No telemetry. Nothing leaves your machine except the requests you ask it to send. Built entirely on the global `fetch` and Node built-ins — the `.http` parser, the JSON-path evaluator and the assertion engine are all hand-written (no `eval`), so there are **zero runtime dependencies**.

## Install

```bash
# one-off, no install
npx lacspace-http https://httpbin.org/get

# or globally
npm i -g lacspace-http

# or as a library
npm i lacspace-http
```

## Two ways to use it

### 1. Ad-hoc requests

```bash
lacspace-http [METHOD] <url> [options]
```

The method defaults to `GET` (or `POST` when you supply a body).

```bash
# GET with a bearer token, show response headers
lacspace-http https://api.example.com/me -b "$TOKEN" -i

# POST JSON with the -j shorthand (k=v is a string, k:=v is raw JSON)
lacspace-http POST https://httpbin.org/post -j name=Ada -j admin:=true -j age:=30

# POST a urlencoded form
lacspace-http POST https://httpbin.org/post --form email=a@b.com --form plan=pro

# Basic auth + query params + a timeout
lacspace-http https://api.example.com/search -u user:pass -q q=cats -q page=2 --timeout 5000

# Save the body to a file (meta still prints to stderr)
lacspace-http https://example.com/data.json -o data.json

# Print the equivalent curl (credentials masked unless --show-secrets)
lacspace-http GET https://api.example.com/me -b "$TOKEN" --curl
# curl -H 'Authorization: Bearer ***' -L 'https://api.example.com/me'

# Machine-readable record for scripts / jq
lacspace-http https://httpbin.org/get --json | jq .status
```

Meta (status line, timing, size, headers) goes to **stderr**; the response body goes to **stdout**, so `| jq` and `> file` just work.

### 2. Run a `.http` / `.rest` file

The well-known REST-client format: requests separated by `###`, an optional `# @name`, a request line, headers, a blank line, then a body. lacspace-http adds `# @capture` and `# @assert` directives.

```http
# api.http
# @name login
POST {{host}}/login
Content-Type: application/json

{ "user": "ada", "pass": "{{password}}" }
# @capture token = body.$.access_token
# @assert status == 200
# @assert body.$.ok == true

###
# @name me
GET {{host}}/me
Authorization: Bearer {{token}}
# @assert status == 200
# @assert body.$.user == "ada"
# @assert header.content-type contains json
# @assert time < 800
```

```bash
lacspace-http run api.http --var host=http://localhost:3000 --var password=hunter2
```

```
◆ lacspace-http run  api.http

  ✓ login → 200 38ms
      captured token=TOK-42
      ✓ assert status == 200 (actual: 200)
      ✓ assert body.$.ok == true (actual: true)
  ✓ me → 200 3ms
      ✓ assert status == 200 (actual: 200)
      ✓ assert body.$.user == "ada" (actual: ada)
      ✓ assert header.content-type contains json (actual: application/json)
      ✓ assert time < 800 (actual: 3)
✓ 2 passed · 2 request(s)
```

`login` grabs `access_token` from the JSON body; `me` reuses it via `{{token}}`. Any failed assertion (or transport error) makes the whole run **exit non-zero** — drop `lacspace-http run api.http` into a CI step and it's a smoke test.

#### Variables

`{{name}}` is resolved, in order of precedence, from:

1. **captured** values (from an earlier `# @capture` in the same run),
2. CLI `--var k=v` (repeatable),
3. an env block from `--env-file` + `--env <name>`.

Env files can be VS Code REST-client style `http-client.env.json`:

```json
{
  "$shared": { "password": "hunter2" },
  "dev":  { "host": "http://localhost:3000" },
  "prod": { "host": "https://api.example.com" }
}
```

```bash
lacspace-http run api.http --env-file http-client.env.json --env dev
```

…or a plain `.env` file (`KEY=VALUE` lines). A few system variables are also available: `{{$timestamp}}`, `{{$isoTimestamp}}`, `{{$guid}}`, `{{$randomInt min max}}`, `{{$processEnv NAME}}`.

#### Assertions

| Form | Example |
| --- | --- |
| status code | `# @assert status == 200` |
| JSON body (json-path) | `# @assert body.$.data.items[0].id == 1` |
| response header | `# @assert header.content-type contains json` |
| request time (ms) | `# @assert time < 800` |
| existence / emptiness | `# @assert body.$.error empty` · `body.$.token exists` |
| regex | `# @assert header.location matches ^/v2/` |

Operators: `==` `!=` `<` `<=` `>` `>=` `contains` `matches` `exists` `empty`. The `body.<path>` and `header.<name>` grammar is the same one `# @capture <name> = <source>` uses.

## CLI reference

| Flag | Description |
| --- | --- |
| `-H, --header "K: V"` | Add a request header (repeatable) |
| `-q, --query k=v` | Add a query-string param (repeatable) |
| `-d, --data <str>` | Raw request body (`@file` reads a file, `@-` reads stdin) |
| `--json '<obj>'` | JSON body from a literal object/array (+ `content-type`) |
| `-j k=v` | JSON body shorthand (`k:=v` for a raw JSON value) |
| `--form k=v` | urlencoded form field (repeatable) |
| `-b, --bearer <token>` | `Authorization: Bearer <token>` |
| `-u, --user user:pass` | HTTP Basic auth |
| `--timeout <ms>` | Abort after *ms* (default `30000`) |
| `--no-redirect` | Do not follow redirects |
| `--max-redirects N` | Follow at most *N* redirects (default `5`) |
| `--max-size <n>` | Cap the response body read, e.g. `10mb` (default 10 MB) |
| `-i, --include` | Show response headers |
| `-v, --verbose` | Show the request line, headers and body too |
| `-o, --out <file>` | Write the response body to a file |
| `--curl` | Print the equivalent `curl` command (secrets masked) |
| `--show-secrets` | Do not mask credentials in `--curl` / `--verbose` |
| `--fail` | Exit non-zero on a non-2xx response |
| `--json` | Emit a machine record `{ status, headers, timeMs, body }` |
| `--env <name>` | (run) Select an env block from a JSON env file |
| `--env-file <path>` | (run) Load vars from a `.json` (needs `--env`) or `.env` file |
| `--var k=v` | (run) Set/override a variable (repeatable) |
| `--name <req>` | (run) Run only the request with this `# @name` |
| `-h, --help` | Show help |
| `--version` | Print the version |

`NO_COLOR` is respected. Coloured JSON is only emitted when stdout is a TTY, so piping stays clean.

## Library API

Everything the CLI does is exposed as a typed, dual ESM/CJS library.

```ts
import {
  assembleRequest, sendRequest, toCurl, runHttpFile,
  parseHttpFile, evalPath, runAssertion,
} from "lacspace-http";
```

| Export | Signature |
| --- | --- |
| `assembleRequest(url, opts?)` | `(string, AssembleOptions) => RequestSpec` — build a request from friendly options |
| `sendRequest(spec, opts?)` | `(RequestSpec, SendOptions) => Promise<ResponseRecord>` — send it (redirects, timeout, size cap) |
| `toCurl(spec, opts?)` | `(RequestSpec, CurlOptions) => string` — the equivalent curl (secrets masked by default) |
| `runHttpFile(source, opts?)` | `(string, RunOptions) => Promise<RunResult>` — run a `.http` document |
| `parseHttpFile(source)` | `(string) => HttpFileRequest[]` — just parse, no I/O |
| `resolveVars(text, scope)` | `(string, VarScope) => { text, missing }` — expand `{{vars}}` |
| `parseEnvJson(json, env)` / `parseDotenv(text)` | env-file loaders |
| `evalPath(root, path)` / `parseJsonPath(path)` | the JSON-path evaluator |
| `parseAssertion` / `evalAssertion` / `runAssertion` | the assertion engine |
| `humanSize` / `statusColor` / `prettyJson` | output helpers |

`sendRequest` and `runHttpFile` accept a `fetchImpl` so you can inject a mock in tests — nothing here touches the network on its own.

## Security

lacspace-http is a **local developer tool you drive**, so it will happily reach any host you point it at — including `localhost`, which is the primary use case. It deliberately does **not** block private/internal addresses. It does, however:

- always apply a default **timeout** (30 s) so a hung server can't wedge your script;
- **cap the response body** read at 10 MB (`--max-size`) to avoid runaway memory;
- follow redirects **manually** and honour `--max-redirects`, and **flag cross-host redirects** rather than following them silently;
- **mask credentials** (`-b`/`-u`) in `--curl` and `--verbose` output unless you pass `--show-secrets`.

## Limitations

- HTTP(S) only — no HTTP/2 push, WebSockets, gRPC or multipart file uploads (yet).
- Cookies are not persisted across requests in a file run (send them explicitly via headers).
- The JSON-path dialect is deliberately small: keys, array indices (incl. negative) and quoted keys — no wildcards or filters.
- Bodies are read as UTF-8 text; binary responses are best saved with `-o`.
- `--data @file` reads the whole file into memory (no streaming uploads).

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE). Free to use, no attribution required.

Part of the [Lacspace](https://lacspace.com) developer tools — small, sharp, keyless CLIs. See more at [developer.lacspace.com/tools](https://developer.lacspace.com/tools).
