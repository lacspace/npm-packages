/**
 * The mock-server engine. `createEngine(config)` returns a pure, port-free
 * `handle(req)` that maps a request description to a response description — this
 * is what the tests drive directly. `createHandler`/`createServer`/`start` wrap
 * it into a real `node:http` server. Route precedence: custom routes first,
 * then `/graphql`, then db CRUD, then 404.
 */
import { createServer as httpCreateServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse, RequestListener } from "node:http";
import { Store } from "./db.js";
import type { Db, Record_, StoreOptions } from "./db.js";
import { runQuery, parseQueryString } from "./query.js";
import type { Query } from "./query.js";
import { matchPath, methodMatches } from "./router.js";
import { render, renderValue } from "./template.js";
import type { TemplateContext } from "./template.js";
import { createFaker } from "./faker.js";
import { resolveGraphQL } from "./graphql.js";

/** A single custom route definition (from `mock.config.json` or code). */
export interface RouteConfig {
  /** HTTP method, or `*`/`ANY` for any (default: any). */
  method?: string;
  /** Path pattern with `:params` and a trailing `*` wildcard. */
  path: string;
  /** Response status (default 200). */
  status?: number;
  /** Extra response headers. */
  headers?: Record<string, string>;
  /** Per-route delay in ms, or a `[min, max]` jitter range. */
  delay?: number | [number, number];
  /** A static response body (string sent as-is; object serialized to JSON). */
  body?: unknown;
  /** A dynamic response body: a template string or a JSON value with `{{tokens}}`. */
  bodyTemplate?: unknown;
}

/** A minimal request description — the pure engine's input. */
export interface MockRequest {
  method: string;
  /** Full request URL/path including query string, e.g. `/users?_page=2`. */
  url: string;
  headers?: Record<string, string | string[] | undefined>;
  /** Raw request body (already read). */
  body?: string;
}

/** A minimal response description — the pure engine's output. */
export interface MockResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

/** Configuration for the engine / server. */
export interface MockConfig {
  /** The db object (json-server shape). Optional if only custom routes are used. */
  db?: Record<string, unknown> | Db;
  /** Custom routes, matched before db CRUD. */
  routes?: RouteConfig[];
  /** Enable CORS headers (default true). */
  cors?: boolean;
  /** Global delay before every response: ms or `[min,max]` jitter (default 0). */
  delay?: number | [number, number];
  /** Probability (0..1) that any response is replaced with a 500 (chaos). */
  errorRate?: number;
  /** The primary-key field for CRUD (default `"id"`). */
  idKey?: string;
  /** Seed for the fake-data generator, so `{{fake.*}}` output is stable. */
  seed?: string;
  /** Called after a db mutation with the full snapshot (used for `--write`). */
  onChange?: (db: Db) => void;
  /** Injectable RNG (0..1) for the error-rate/jitter roll — for deterministic tests. */
  rng?: () => number;
  /** Injectable sleep — tests pass a no-op that records the requested ms. */
  sleep?: (ms: number) => Promise<void>;
}

/** A mounted route summary (for the startup banner). */
export interface MountedRoute {
  method: string;
  path: string;
  kind: "custom" | "crud" | "graphql";
}

/** The engine handle returned by {@link createEngine}. */
export interface Engine {
  /** Resolve a request to a response — pure, no sockets. */
  handle: (req: MockRequest) => Promise<MockResponse>;
  /** The underlying store (undefined if no db was configured). */
  store: Store | undefined;
  /** The compiled custom routes. */
  routes: RouteConfig[];
  /** Every mounted route, for logging/banner. */
  mounted: () => MountedRoute[];
}

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization",
  "access-control-max-age": "86400",
};

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function pickDelay(delay: number | [number, number] | undefined, rng: () => number): number {
  if (delay === undefined) return 0;
  if (Array.isArray(delay)) {
    const [min, max] = delay;
    if (max <= min) return Math.max(0, min);
    return Math.floor(rng() * (max - min + 1)) + min;
  }
  return Math.max(0, delay);
}

function json(status: number, value: unknown, extra: Record<string, string> = {}): MockResponse {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
    body: typeof value === "string" ? value : JSON.stringify(value),
  };
}

function parseBody(raw: string | undefined): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Create the pure engine. */
export function createEngine(config: MockConfig = {}): Engine {
  const cors = config.cors !== false;
  const rng = config.rng ?? Math.random;
  const sleep = config.sleep ?? realSleep;
  const errorRate = config.errorRate ?? 0;
  const routes = config.routes ?? [];
  const seed = config.seed ?? "lacspace-mock";

  let store: Store | undefined;
  if (config.db) {
    const opts: StoreOptions = {};
    if (config.idKey) opts.idKey = config.idKey;
    if (config.onChange) opts.onChange = config.onChange;
    store = new Store(config.db as Record<string, unknown>, opts);
  }

  function corsHeaders(): Record<string, string> {
    return cors ? { ...CORS_HEADERS } : {};
  }

  function resolveRoute(route: RouteConfig, ctx: TemplateContext): MockResponse {
    const status = route.status ?? 200;
    const headers: Record<string, string> = { ...corsHeaders(), ...(route.headers ?? {}) };
    let body: string;
    let ct = headers["content-type"] ?? "application/json; charset=utf-8";

    if (route.bodyTemplate !== undefined) {
      if (typeof route.bodyTemplate === "string") {
        const rendered = render(route.bodyTemplate, ctx);
        try {
          body = JSON.stringify(JSON.parse(rendered));
          ct = "application/json; charset=utf-8";
        } catch {
          body = rendered;
          if (!headers["content-type"]) ct = "text/plain; charset=utf-8";
        }
      } else {
        body = JSON.stringify(renderValue(route.bodyTemplate, ctx));
        ct = "application/json; charset=utf-8";
      }
    } else if (route.body !== undefined) {
      if (typeof route.body === "string") {
        body = route.body;
        if (!headers["content-type"]) ct = "text/plain; charset=utf-8";
      } else {
        body = JSON.stringify(route.body);
        ct = "application/json; charset=utf-8";
      }
    } else {
      body = "";
    }

    headers["content-type"] = ct;
    return { status, headers, body };
  }

  async function handle(req: MockRequest): Promise<MockResponse> {
    const method = (req.method || "GET").toUpperCase();
    const rawUrl = req.url || "/";
    const qIdx = rawUrl.indexOf("?");
    const path = qIdx === -1 ? rawUrl : rawUrl.slice(0, qIdx);
    const search = qIdx === -1 ? "" : rawUrl.slice(qIdx);
    const query: Query = parseQueryString(search);

    // CORS preflight — answer before anything else.
    if (method === "OPTIONS" && cors) {
      return { status: 204, headers: { ...corsHeaders() }, body: "" };
    }

    // Chaos: randomly fail.
    if (errorRate > 0 && rng() < errorRate) {
      await sleep(pickDelay(config.delay, rng));
      return json(500, { error: "injected server error (chaos)", chaos: true }, corsHeaders());
    }

    // Global delay.
    await sleep(pickDelay(config.delay, rng));

    // 1. Custom routes (highest precedence).
    for (const route of routes) {
      if (!methodMatches(route.method, method)) continue;
      const m = matchPath(route.path, path);
      if (!m) continue;
      const faker = createFaker(`${seed}|${method} ${path}${search}`);
      const ctx: TemplateContext = {
        params: m.params,
        query: flattenQuery(query),
        body: parseBody(req.body),
        faker,
      };
      await sleep(pickDelay(route.delay, rng));
      return resolveRoute(route, ctx);
    }

    // 2. GraphQL.
    if (path === "/graphql" && method === "POST") {
      if (!store) return json(400, { errors: [{ message: "no db configured for GraphQL" }] }, corsHeaders());
      const parsed = parseBody(req.body);
      const q = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
      const queryStr = typeof q["query"] === "string" ? (q["query"] as string) : "";
      if (!queryStr) return json(400, { errors: [{ message: "missing 'query' in request body" }] }, corsHeaders());
      const variables = (q["variables"] && typeof q["variables"] === "object" ? q["variables"] : {}) as Record<string, unknown>;
      const result = resolveGraphQL(store, queryStr, variables);
      return json(200, result, corsHeaders());
    }

    // 3. DB CRUD.
    if (store) {
      const crud = await handleCrud(store, method, path, query, req.body, corsHeaders());
      if (crud) return crud;
    }

    return json(404, { error: "not found", path }, corsHeaders());
  }

  return {
    handle,
    store,
    routes,
    mounted: () => mountedRoutes(routes, store),
  };
}

function flattenQuery(query: Query): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) out[k] = Array.isArray(v) ? (v[0] ?? "") : v;
  return out;
}

async function handleCrud(
  store: Store,
  method: string,
  path: string,
  query: Query,
  rawBody: string | undefined,
  cors: Record<string, string>,
): Promise<MockResponse | null> {
  const parts = path.split("/").filter((s) => s.length > 0).map(decodeURIComponentSafe);
  if (parts.length === 0 || parts.length > 2) return null;

  const name = parts[0]!;

  // Singular (non-array) resource: read-only.
  if (!store.has(name)) {
    const singular = store.singular(name);
    if (singular !== undefined && parts.length === 1) {
      if (method === "GET") return json(200, singular, cors);
      return json(405, { error: "singular resource is read-only", resource: name }, cors);
    }
    return null; // unknown top-level → let caller 404
  }

  // /collection
  if (parts.length === 1) {
    if (method === "GET") {
      const { data, total } = runQuery(store.list(name), query);
      return json(200, data, { ...cors, "x-total-count": String(total) });
    }
    if (method === "POST") {
      const parsed = parseBody(rawBody);
      if (parsed === undefined || typeof parsed !== "object" || Array.isArray(parsed)) {
        return json(400, { error: "POST body must be a JSON object" }, cors);
      }
      const created = store.create(name, parsed as Record_);
      return json(201, created, { ...cors, location: `/${name}/${String(created[store.idKey])}` });
    }
    return json(405, { error: `method ${method} not allowed on a collection` }, cors);
  }

  // /collection/:id
  const id = parts[1]!;
  const existing = store.get(name, id);

  if (method === "GET") {
    return existing ? json(200, existing, cors) : json(404, { error: "not found", resource: name, id }, cors);
  }
  if (method === "DELETE") {
    const ok = store.remove(name, id);
    return ok ? json(200, {}, cors) : json(404, { error: "not found", resource: name, id }, cors);
  }
  if (method === "PUT" || method === "PATCH") {
    const parsed = parseBody(rawBody);
    if (parsed === undefined || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json(400, { error: `${method} body must be a JSON object` }, cors);
    }
    const updated =
      method === "PUT"
        ? store.replace(name, id, parsed as Record_)
        : store.patch(name, id, parsed as Record_);
    return updated ? json(200, updated, cors) : json(404, { error: "not found", resource: name, id }, cors);
  }
  return json(405, { error: `method ${method} not allowed on a resource` }, cors);
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function mountedRoutes(routes: RouteConfig[], store: Store | undefined): MountedRoute[] {
  const out: MountedRoute[] = [];
  for (const r of routes) out.push({ method: (r.method ?? "ANY").toUpperCase(), path: r.path, kind: "custom" });
  if (store) {
    for (const name of store.collections()) {
      out.push({ method: "GET|POST", path: `/${name}`, kind: "crud" });
      out.push({ method: "GET|PUT|PATCH|DELETE", path: `/${name}/:id`, kind: "crud" });
    }
    out.push({ method: "POST", path: "/graphql", kind: "graphql" });
  }
  return out;
}

// ── Node http wiring ────────────────────────────────────────────────────────

const DEFAULT_MAX_BODY = 5 * 1024 * 1024;

/** Options for the Node-http wrappers (extends the engine config). */
export interface HandlerOptions extends MockConfig {
  /** Max request body bytes before a 413 (default 5 MB). */
  maxBodyBytes?: number;
  /** Called once per request with a log line's fields. */
  logger?: (info: { method: string; path: string; status: number; ms: number }) => void;
}

function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/**
 * Build a Node `http` request listener from a config. Reads the body (capped),
 * calls the engine, writes the response and logs. This is the value you pass to
 * `http.createServer(...)`.
 */
export function createHandler(config: HandlerOptions = {}): RequestListener {
  const engine = createEngine(config);
  const maxBody = config.maxBodyBytes ?? DEFAULT_MAX_BODY;

  return (req: IncomingMessage, res: ServerResponse): void => {
    const startedAt = Date.now();
    const method = (req.method ?? "GET").toUpperCase();
    const url = req.url ?? "/";
    const pathOnly = url.split("?")[0] ?? "/";

    void (async () => {
      let response: MockResponse;
      try {
        const body = await readBody(req, maxBody);
        response = await engine.handle({ method, url, headers: req.headers, body });
      } catch (err) {
        const msg = (err as Error).message;
        const status = msg === "body too large" ? 413 : 500;
        response = {
          status,
          headers: { "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({ error: msg }),
        };
      }
      res.writeHead(response.status, response.headers);
      res.end(response.body);
      config.logger?.({ method, path: pathOnly, status: response.status, ms: Date.now() - startedAt });
    })();
  };
}

/** Create (but do not start) a Node `http.Server` wired to the engine. */
export function createServer(config: HandlerOptions = {}): Server {
  return httpCreateServer(createHandler(config));
}

/** A running server handle. */
export interface RunningServer {
  server: Server;
  url: string;
  port: number;
  host: string;
  close: () => Promise<void>;
}

/** Start a server listening on host:port (default 127.0.0.1:4000). Resolves once bound. */
export function start(
  config: HandlerOptions & { port?: number; host?: string } = {},
): Promise<RunningServer> {
  const port = config.port ?? 4000;
  const host = config.host ?? "127.0.0.1";
  const server = createServer(config);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const boundPort = typeof addr === "object" && addr ? addr.port : port;
      resolve({
        server,
        url: `http://${host}:${boundPort}`,
        port: boundPort,
        host,
        close: () => new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res()))),
      });
    });
  });
}
