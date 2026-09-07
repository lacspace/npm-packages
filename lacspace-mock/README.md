# lacspace-mock

**Stand up a keyless local mock REST + GraphQL API from a JSON db, an OpenAPI spec, or a small config — stateful CRUD, request validation, latency & chaos injection, a record-and-replay proxy, filtering, templated routes, CORS. Zero dependencies.**

Point your frontend at a realistic backend before the real one exists. Drop a
`db.json`, run one command, and you get json-server-style CRUD for every
collection — pagination, sorting, filters, operators, full-text search — plus
custom templated routes, a minimal GraphQL endpoint, and knobs to simulate slow
or flaky networks. Runs on `node:http`. No API key, no account, no telemetry,
nothing leaves your machine.

```bash
npx lacspace-mock --db db.json
# ◆ lacspace-mock — serving  ▶ http://127.0.0.1:4000
curl localhost:4000/users?role=admin
```

### New in 0.2.0

- **Mock straight from an OpenAPI 3 spec** — `--openapi openapi.json` (or `mockFromOpenApi(doc)`) generates a route per operation with example responses built from your component schemas.
- **Request validation** — validate incoming bodies / query / path params against a small JSON-Schema subset and return `400` with details (per-route `validate`, or per-collection `schemas`).
- **Latency + chaos injection, upgraded** — the chaos rate can now inject a *pool* of statuses (`--error-statuses 429,503`), not just `500`; the decision is seedable/deterministic for tests.
- **Record & replay proxy** — `--proxy <url> --record` forwards unknown routes to a real upstream and saves the responses to a cassette; `--replay` serves them back offline. Network sits behind an injectable `fetch`.
- **Stateful CRUD + reset** — mutations persist across a session (they already did); the engine now exposes `engine.reset()` / `Store.reset()` to snap the db back to its original state.
- **New pure, tested building blocks** exported: `validate`, `mockFromOpenApi`, `createProxy`, `rollChaos`, `resolveDelay`.

## Why it exists

- **Free & keyless** — no signup, no cloud, no rate limits.
- **Zero dependencies** — pure Node built-ins; nothing to audit, installs in a blink.
- **Local & private** — binds to `127.0.0.1` by default; no request ever leaves your machine.
- **Library + CLI** — the same engine you run on the terminal is importable and
  unit-testable **without binding a port**.

## Quick start

Create a `db.json` (json-server shape — top-level keys are collections):

```json
{
  "users": [
    { "id": 1, "name": "Ava", "role": "admin", "age": 30 },
    { "id": 2, "name": "Ben", "role": "user", "age": 22 }
  ],
  "posts": [{ "id": 1, "title": "Hello", "userId": 1 }]
}
```

```bash
npx lacspace-mock --db db.json --port 4000
```

You now have, for every collection:

| Method | Route | What |
| --- | --- | --- |
| `GET` | `/users` | list (with query params below) |
| `GET` | `/users/:id` | one (404 if missing) |
| `POST` | `/users` | create — assigns an id, returns `201` + `Location` |
| `PUT` | `/users/:id` | replace |
| `PATCH` | `/users/:id` | merge |
| `DELETE` | `/users/:id` | remove |
| `POST` | `/graphql` | minimal GraphQL over the collections |

## List query params

```bash
curl "localhost:4000/users?role=admin"              # exact field filter
curl "localhost:4000/users?age_gte=18&age_lte=30"   # operators: _gt _gte _lt _lte _ne
curl "localhost:4000/users?name_like=av"            # case-insensitive regex/substring
curl "localhost:4000/users?q=admin"                 # full-text across all fields
curl "localhost:4000/users?_sort=age,name&_order=desc,asc"
curl "localhost:4000/users?_page=2&_limit=10"       # pagination (X-Total-Count header)
curl "localhost:4000/users?_start=10&_end=20"       # slice
```

List responses carry an `X-Total-Count` header with the pre-pagination total.

## Custom routes (a `mock.config.json`)

For anything that isn't plain CRUD, describe routes in a config file. Because
the tool is zero-dependency, the config is plain **JSON** (no code execution):

```json
{
  "db": "db.json",
  "cors": true,
  "routes": [
    { "method": "GET", "path": "/health", "status": 200, "body": { "ok": true } },
    {
      "method": "POST",
      "path": "/login",
      "status": 201,
      "headers": { "x-demo": "1" },
      "delay": [50, 200],
      "bodyTemplate": "{\"user\":\"{{body.email}}\",\"token\":\"{{fake.uuid}}\"}"
    },
    {
      "method": "GET",
      "path": "/feed",
      "bodyTemplate": "[{{repeat 3}}{\"id\":{{index1}},\"name\":\"{{fake.name}}\",\"email\":\"{{fake.email}}\"}{{/repeat}}]"
    }
  ]
}
```

```bash
npx lacspace-mock --config mock.config.json
```

Custom routes are matched **before** db CRUD (so `/users` in the config shadows
the auto route). Paths support `:params` and a trailing `*` wildcard.

### Template tokens (for `bodyTemplate`)

| Token | Resolves to |
| --- | --- |
| `{{params.id}}` | a captured path param |
| `{{query.page}}` | a query-string value |
| `{{body.email}}` | a field from the JSON request body (dot paths ok) |
| `{{fake.name}}` `{{fake.email}}` `{{fake.uuid}}` | seeded fake data |
| `{{fake.int 1 100}}` `{{fake.float 0 1 2}}` `{{fake.bool}}` `{{fake.word}}` `{{fake.city}}` `{{fake.company}}` `{{fake.phone}}` `{{fake.date}}` | more fakes |
| `{{repeat n}}…{{/repeat}}` | repeat the inner template `n` times |
| `{{index}}` / `{{index1}}` | the 0-/1-based counter inside a repeat block |

`bodyTemplate` may be a raw string (rendered, then JSON-parsed if it parses) or a
JSON object/array whose string leaves are each rendered. Fake data is seeded
(per endpoint) so it's **stable across restarts** — override with `--seed`.

## Mock from an OpenAPI 3 spec

Already have an OpenAPI/Swagger document? Turn it into a running mock — one route
per operation, with an **example response synthesised from your component
schemas** (respecting `example`/`enum`/`format`, resolving `$ref`s, merging
`allOf`):

```bash
npx lacspace-mock --openapi openapi.json
curl localhost:4000/products/1
# { "id": 0, "title": "Widget", "price": 0, "status": "active" }
```

From code, `mockFromOpenApi(doc)` returns `{ routes, requestSchemas }` you can
hand straight to `createEngine({ routes })`.

## Request validation

Reject malformed requests with a helpful `400` instead of silently accepting
them. Two ways — per **custom route** (body / query / params) or per **collection**
(CRUD writes), both using a small JSON-Schema subset (`type`, `required`,
`properties`, `items`, `enum`, `minimum`/`maximum`, `minLength`/`maxLength`,
`pattern`, `nullable`, `additionalProperties`):

```json
{
  "db": "db.json",
  "schemas": {
    "users": { "type": "object", "required": ["name"], "properties": { "name": { "type": "string", "minLength": 2 } } }
  },
  "routes": [
    {
      "method": "POST", "path": "/signup", "status": 201, "body": { "ok": true },
      "validate": { "body": { "type": "object", "required": ["email"], "properties": { "email": { "type": "string" } } } }
    }
  ]
}
```

```bash
curl -X POST localhost:4000/users -d '{"name":"X"}' -H content-type:application/json
# 400 {"error":"request validation failed","details":[{"path":"name","message":"must be at least 2 chars"}]}
```

## Simulating a real network

```bash
npx lacspace-mock --db db.json --delay 200            # 200ms on every response
npx lacspace-mock --db db.json --delay 50-400         # random jitter per request
npx lacspace-mock --db db.json --error-rate 0.1       # 10% of responses fail (chaos)
npx lacspace-mock --db db.json --error-rate 0.2 --error-statuses 429,503  # pick from a status pool
```

Per-route `delay` (fixed or `[min,max]`) is honoured too. The chaos decision is
pure and seedable — pass `rng` to `createEngine` for deterministic tests.

## Record & replay (proxy)

Forward routes you *haven't* mocked to a real upstream, record the responses, and
replay them offline afterwards — great for capturing a fixture set once and
developing against it on a plane:

```bash
# 1. Record: unknown routes hit the upstream and are saved to a cassette file.
npx lacspace-mock --db db.json --proxy https://api.example.com --record --recordings tape.json

# 2. Replay: serve only from the cassette — no network, deterministic.
npx lacspace-mock --proxy https://api.example.com --replay --recordings tape.json
```

Modes: `--record` (always hit upstream + save), `--replay` (offline; `504` on a
miss), default **auto** (replay a recording if present, else record). In code the
network is an **injectable `fetch`** (`createProxy({ target, fetch })`), so the
record→replay logic is unit-tested against a fake upstream — no sockets.

## Persisting changes & resetting

By default mutations live in memory but **persist for the life of the process** —
a `POST` then a `GET` reflects the change. Pass `--write` to also persist CRUD
changes back to the `--db` file:

```bash
npx lacspace-mock --db db.json --write
```

From the library, `engine.reset()` (or `store.reset()`) snaps every collection
back to the data it started with — handy between test cases:

```ts
const engine = createEngine({ db });
await engine.handle({ method: "POST", url: "/users", body: '{"name":"Ben"}' });
engine.reset(); // db is back to its original state
```

## Minimal GraphQL

`POST /graphql` resolves a small, pragmatic subset over the db collections:

```bash
curl -X POST localhost:4000/graphql -H content-type:application/json \
  -d '{"query":"{ users { id name } }"}'
# { "data": { "users": [ { "id": 1, "name": "Ava" }, … ] } }

curl -X POST localhost:4000/graphql -H content-type:application/json \
  -d '{"query":"{ users(id: 1) { name role } posts { title } }"}'
```

Supported: top-level fields named after a collection; a single `id` argument
(→ one object) or `limit`/`offset` (→ slice); flat + nested field selection;
`$variables`. **Not** supported: mutations, aliases, fragments, directives,
interfaces, introspection. It's for prototyping, not a spec-complete server.

## Library API

Everything the CLI does is importable. The pure `createEngine` handle is
port-free, so you can drive it straight from a test:

```ts
import { createEngine, start, runQuery } from "lacspace-mock";

// Pure engine — no socket:
const engine = createEngine({ db: { users: [{ id: 1, name: "Ava" }] } });
const res = await engine.handle({ method: "GET", url: "/users/1" });
res.status;            // 200
JSON.parse(res.body);  // { id: 1, name: "Ava" }

// Real server:
const srv = await start({ db: { users: [] }, port: 4000, host: "127.0.0.1" });
console.log(srv.url);  // http://127.0.0.1:4000
await srv.close();
```

| Export | Signature | Purpose |
| --- | --- | --- |
| `createEngine(config)` | `(MockConfig) => Engine` | pure, port-free request handler |
| `createHandler(config)` | `(HandlerOptions) => http.RequestListener` | Node request listener |
| `createServer(config)` | `(HandlerOptions) => http.Server` | an unstarted `http.Server` |
| `start(config)` | `(…) => Promise<RunningServer>` | listen; resolves `{ server, url, close }` |
| `runQuery(rows, query)` | `(Record[], Query) => { data, total }` | the filter/sort/paginate engine |
| `parseQueryString(s)` | `(string) => Query` | parse a query string (repeats → arrays) |
| `Store` | `class` | the in-memory CRUD store |
| `matchPath(pat, path)` | `(string, string) => MatchResult \| null` | path-param/wildcard matcher |
| `render(tpl, ctx)` | `(string, TemplateContext) => string` | the template layer |
| `createFaker(seed)` | `(string) => Faker` | the seeded fake-data generator |
| `resolveGraphQL(store, q, vars?)` | `(Store, string, obj?) => GraphQLResult` | the GraphQL resolver |
| `mockFromOpenApi(doc, opts?)` | `(OpenApiDoc) => { routes, requestSchemas }` | mock an OpenAPI 3 spec |
| `exampleFromSchema(node, schemas, seen, depth)` | `→ unknown` | synthesise an example from a schema |
| `validate(value, schema)` / `isValid(...)` | `→ ValidationError[]` / `boolean` | the JSON-Schema-subset validator |
| `createProxy(config)` | `(ProxyConfig) => Proxy` | record-and-replay proxy (injectable `fetch`) |
| `rollChaos(rate, statuses, rng)` | `→ { triggered, status }` | pure, seedable chaos decision |
| `resolveDelay(delay, rng)` | `→ number` | resolve a fixed/`[min,max]` delay |
| `engine.reset()` / `Store.reset()` | `() => void` | restore the db to its original state |
| `loadDb(file)` / `loadConfig(file)` / `loadOpenApi(file)` | file loaders | parse `db.json` / `mock.config.json` / OpenAPI spec |

## CLI reference

```
npx lacspace-mock --db db.json [options]
npx lacspace-mock --config mock.config.json [options]
npx lacspace-mock --openapi openapi.json [options]
npx lacspace-mock --proxy https://api.example.com --record [options]
npx lacspace-mock db.json                    # bare path = --db

-d, --db <file>          JSON db (json-server shape)
-c, --config <file>      mock.config.json (custom routes + db + options)
-o, --openapi <file>     Import routes + example responses from an OpenAPI 3 spec
-p, --port <n>           Port to listen on (default 4000)
    --host <addr>        Bind address (default 127.0.0.1 — local only)
    --delay <ms|a-b>     Delay every response by ms (or a random ms in [a,b])
-e, --error-rate <p>     Randomly fail p (0..1) of responses (chaos)
    --error-statuses <l> Comma list of chaos statuses to pick from (default 500)
    --proxy <url>        Forward unknown routes to an upstream (record & replay)
    --record             Proxy: hit upstream and save responses to --recordings
    --replay             Proxy: serve only from --recordings (offline)
    --recordings <file>  Cassette file for --proxy record/replay
    --no-cors            Disable the permissive CORS headers (on by default)
-w, --write              Persist CRUD mutations back to the --db file
    --seed <str>         Seed the {{fake.*}} generator (stable data)
-q, --quiet              Do not log each request
-h, --help               Show help
-v, --version            Print the version
```

Flags override values from `--config`. Data goes to stdout; the banner and the
request log go to stderr. Respects `NO_COLOR`.

## Limitations (honest)

- **CRUD is on top-level array collections only.** Non-array top-level keys are
  served read-only (json-server "singular" resources). No nested relational
  expansion (`_embed`/`_expand`).
- **GraphQL is a pragmatic subset**, not spec-complete (see above).
- **In-memory by default** — restart loses changes unless `--write`.
- **Not an auth/production server.** It binds to localhost, has no real auth, and
  isn't meant to face the internet. It's a dev/prototyping tool.
- Full-text `q` matches against the JSON-stringified record (keys included).

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE). Free to use; own-branded,
permissive terms.
