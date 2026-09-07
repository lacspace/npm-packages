/**
 * lacspace-mock — a keyless, zero-dependency local mock API server. Stand up a
 * realistic REST (and a minimal GraphQL) backend from a plain JSON "db" file or
 * a small config, so a frontend can develop with no real backend. Auto-generates
 * json-server-style CRUD routes, supports custom templated routes, and can
 * simulate latency and random errors — all on `node:http`, no dependencies.
 *
 * ```ts
 * import { start, createEngine } from "lacspace-mock";
 *
 * // 1. Run a real server from an in-memory db:
 * const srv = await start({
 *   db: { users: [{ id: 1, name: "Ava", role: "admin" }] },
 *   port: 4000,
 * });
 * // GET http://127.0.0.1:4000/users?role=admin  → [{ id: 1, ... }]
 * await srv.close();
 *
 * // 2. Or drive the pure engine in a test — no port needed:
 * const engine = createEngine({ db: { posts: [{ id: 1, title: "hi" }] } });
 * const res = await engine.handle({ method: "GET", url: "/posts/1" });
 * res.status; // 200
 * JSON.parse(res.body); // { id: 1, title: "hi" }
 * ```
 *
 * REST query support (list endpoints): `?_page&_limit`, `?_sort&_order`,
 * field filters (`?role=admin`), operators (`?age_gte=18&age_lte=30`,
 * `?name_like=al`, `?field_ne=x`) and full-text `?q=`. Custom routes are matched
 * before CRUD and can template their body with `{{params.id}}`, `{{query.x}}`,
 * `{{body.field}}`, `{{repeat n}}…{{/repeat}}` and a seeded faker
 * (`{{fake.name}}`, `{{fake.email}}`, `{{fake.uuid}}`, `{{fake.int 1 100}}`).
 * The GraphQL endpoint (`POST /graphql`) resolves a small pragmatic subset over
 * the db collections — see {@link resolveGraphQL}.
 */

export {
  createEngine,
  createHandler,
  createServer,
  start,
} from "./server.js";
export type {
  MockConfig,
  HandlerOptions,
  RouteConfig,
  MockRequest,
  MockResponse,
  Engine,
  RunningServer,
  MountedRoute,
} from "./server.js";

export { Store } from "./db.js";
export type { Db, Record_, StoreOptions } from "./db.js";

export { runQuery, parseQueryString } from "./query.js";
export type { Query, QueryResult } from "./query.js";

export { matchPath, methodMatches } from "./router.js";
export type { MatchResult } from "./router.js";

export { render, renderValue } from "./template.js";
export type { TemplateContext } from "./template.js";

export { createFaker, resolveFake, mulberry32, hashSeed } from "./faker.js";
export type { Faker } from "./faker.js";

export { resolveGraphQL, parseQuery } from "./graphql.js";
export type { GraphQLResult, Field } from "./graphql.js";

export { loadConfig, loadDb, readJson } from "./config.js";
export type { FileConfig } from "./config.js";
