/**
 * Loading a mock server from JSON files. A `db.json` is the json-server-style
 * data file; a `mock.config.json` describes routes and server options and may
 * reference a db file (or inline the db). Everything here is plain JSON parsing
 * — zero dependencies, no code execution.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import type { RouteConfig, MockConfig } from "./server.js";
import type { Db } from "./db.js";
import type { Schema } from "./validate.js";
import type { ProxyConfig } from "./proxy.js";
import { mockFromOpenApi } from "./openapi.js";
import type { OpenApiDoc } from "./openapi.js";

/** The on-disk shape of a `mock.config.json`. */
export interface FileConfig {
  /** A db file path (relative to the config) or an inline db object. */
  db?: string | Record<string, unknown>;
  routes?: RouteConfig[];
  port?: number;
  host?: string;
  cors?: boolean;
  delay?: number | [number, number];
  errorRate?: number;
  /** The pool of statuses chaos may inject (default `[500]`). */
  errorStatuses?: number[];
  /** Per-collection request-body schemas for CRUD validation. */
  schemas?: Record<string, Schema>;
  /** Record-and-replay passthrough proxy (`fetch` is not JSON-loadable). */
  proxy?: Omit<ProxyConfig, "fetch" | "onRecord">;
  /** An OpenAPI 3 spec file (relative to the config) to import routes from. */
  openapi?: string;
  idKey?: string;
  seed?: string;
}

/** Load an OpenAPI 3 spec file and turn it into engine routes + request schemas. */
export function loadOpenApi(file: string): { routes: RouteConfig[]; schemas: Record<string, Schema> } {
  const doc = readJson(resolve(file)) as OpenApiDoc;
  if (!doc || typeof doc !== "object") throw new Error(`OpenAPI spec must be a JSON object: ${file}`);
  const { routes } = mockFromOpenApi(doc);
  return { routes, schemas: {} };
}

/** Read + parse a JSON file, with a helpful error message on failure. */
export function readJson(file: string): unknown {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    throw new Error(`cannot read file: ${file} (${(err as Error).message})`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`invalid JSON in ${file}: ${(err as Error).message}`);
  }
}

/** Load a db file and validate it is an object of collections. */
export function loadDb(file: string): Db {
  const data = readJson(resolve(file));
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`db file must be a JSON object of collections: ${file}`);
  }
  return data as Db;
}

/**
 * Load a `mock.config.json` into a {@link MockConfig}, resolving a referenced
 * db file relative to the config's own directory.
 */
export function loadConfig(file: string): { config: MockConfig; port?: number; host?: string } {
  const abs = resolve(file);
  const raw = readJson(abs) as FileConfig;
  const base = dirname(abs);

  let db: Record<string, unknown> | undefined;
  if (typeof raw.db === "string") {
    db = loadDb(resolve(base, raw.db));
  } else if (raw.db && typeof raw.db === "object") {
    db = raw.db;
  }

  const config: MockConfig = {};
  if (db) config.db = db;
  // Import OpenAPI routes first so explicit `routes` can still override them.
  let routes: RouteConfig[] = [];
  if (typeof raw.openapi === "string") {
    routes = loadOpenApi(resolve(base, raw.openapi)).routes;
  }
  if (raw.routes) routes = [...raw.routes, ...routes];
  if (routes.length) config.routes = routes;
  if (raw.cors !== undefined) config.cors = raw.cors;
  if (raw.delay !== undefined) config.delay = raw.delay;
  if (raw.errorRate !== undefined) config.errorRate = raw.errorRate;
  if (raw.errorStatuses !== undefined) config.errorStatuses = raw.errorStatuses;
  if (raw.schemas !== undefined) config.schemas = raw.schemas;
  if (raw.proxy !== undefined) config.proxy = raw.proxy;
  if (raw.idKey !== undefined) config.idKey = raw.idKey;
  if (raw.seed !== undefined) config.seed = raw.seed;

  const out: { config: MockConfig; port?: number; host?: string } = { config };
  if (raw.port !== undefined) out.port = raw.port;
  if (raw.host !== undefined) out.host = raw.host;
  return out;
}
