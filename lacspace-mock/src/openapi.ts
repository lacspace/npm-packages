/**
 * Spin a mock straight from an OpenAPI 3 document. For every operation in
 * `paths` we synthesise a custom {@link RouteConfig} whose response body is an
 * *example* generated from the operation's response schema — resolving `$ref`s
 * into `components.schemas`, honouring any `example`/`examples`/`default`/`enum`
 * and merging `allOf`. Path templating (`/users/{id}`) is converted to the
 * engine's `:param` form. Zero dependencies — this is a plain object walk.
 */
import type { RouteConfig } from "./server.js";
import type { Schema } from "./validate.js";

/** The (loosely-typed) OpenAPI document. Only the parts we read are named. */
export interface OpenApiDoc {
  openapi?: string;
  paths?: Record<string, Record<string, unknown>>;
  components?: { schemas?: Record<string, unknown> };
  [k: string]: unknown;
}

/** Options for {@link mockFromOpenApi}. */
export interface OpenApiOptions {
  /** Preferred response status to mock per operation (default: first 2xx, else `default`). */
  preferStatus?: number;
}

/** The result of importing an OpenAPI doc. */
export interface OpenApiImport {
  /** One route per operation, ready to hand to `createEngine({ routes })`. */
  routes: RouteConfig[];
  /** A body `Schema` per operation (method + path), for optional validation. */
  requestSchemas: { method: string; path: string; schema: Schema }[];
}

const METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];

/** Convert `/users/{id}/posts/{postId}` → `/users/:id/posts/:postId`. */
export function openApiPathToPattern(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ":$1");
}

/** Build a `MockConfig`-ready set of routes + request schemas from an OpenAPI 3 doc. */
export function mockFromOpenApi(doc: OpenApiDoc, opts: OpenApiOptions = {}): OpenApiImport {
  const routes: RouteConfig[] = [];
  const requestSchemas: OpenApiImport["requestSchemas"] = [];
  const schemas = (doc.components?.schemas ?? {}) as Record<string, unknown>;
  const paths = doc.paths ?? {};

  for (const [rawPath, item] of Object.entries(paths)) {
    if (!item || typeof item !== "object") continue;
    const pattern = openApiPathToPattern(rawPath);
    for (const method of METHODS) {
      const op = (item as Record<string, unknown>)[method];
      if (!op || typeof op !== "object") continue;
      const operation = op as Record<string, unknown>;

      const { status, schema } = pickResponse(operation, schemas, opts.preferStatus);
      const route: RouteConfig = { method: method.toUpperCase(), path: pattern, status };
      if (schema !== undefined) {
        const example = exampleFromSchema(schema, schemas, new Set(), 0);
        if (example !== undefined) route.body = example;
      }
      routes.push(route);

      const reqSchema = requestBodySchema(operation, schemas);
      if (reqSchema) requestSchemas.push({ method: method.toUpperCase(), path: pattern, schema: reqSchema });
    }
  }

  return { routes, requestSchemas };
}

function asObj(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

/** Choose which response to mock and return its (deref-able) schema + status. */
function pickResponse(
  operation: Record<string, unknown>,
  schemas: Record<string, unknown>,
  prefer: number | undefined,
): { status: number; schema: unknown } {
  const responses = asObj(operation["responses"]) ?? {};
  const codes = Object.keys(responses);

  let chosen: string | undefined;
  if (prefer !== undefined && responses[String(prefer)]) chosen = String(prefer);
  if (!chosen) chosen = codes.find((c) => /^2\d\d$/.test(c));
  if (!chosen && responses["default"]) chosen = "default";
  if (!chosen) chosen = codes[0];

  const status = chosen && /^\d+$/.test(chosen) ? Number(chosen) : 200;
  if (!chosen) return { status, schema: undefined };

  const resp = asObj(responses[chosen]);
  const content = asObj(resp?.["content"]);
  const media = content?.["application/json"] ?? (content ? Object.values(content)[0] : undefined);
  const mediaObj = asObj(media);
  // An explicit example wins outright.
  if (mediaObj && mediaObj["example"] !== undefined) {
    return { status, schema: { example: mediaObj["example"] } };
  }
  return { status, schema: mediaObj?.["schema"] };
}

/** The request-body schema of an operation (application/json), deref'd on use. */
function requestBodySchema(operation: Record<string, unknown>, schemas: Record<string, unknown>): Schema | undefined {
  const rb = asObj(operation["requestBody"]);
  const content = asObj(rb?.["content"]);
  const media = content?.["application/json"] ?? (content ? Object.values(content)[0] : undefined);
  const schema = asObj(media)?.["schema"];
  if (!schema) return undefined;
  return derefToSchema(schema, schemas, new Set());
}

function refName(ref: string): string {
  const i = ref.lastIndexOf("/");
  return i === -1 ? ref : ref.slice(i + 1);
}

/**
 * Generate a representative example value for a resolved schema node. Guards
 * against `$ref` cycles with a `seen` set and a depth cap.
 */
export function exampleFromSchema(
  node: unknown,
  schemas: Record<string, unknown>,
  seen: Set<string>,
  depth: number,
): unknown {
  const obj = asObj(node);
  if (!obj || depth > 8) return obj ? {} : node;

  // $ref → resolve (cycle-guarded).
  if (typeof obj["$ref"] === "string") {
    const name = refName(obj["$ref"] as string);
    if (seen.has(name)) return {};
    const next = new Set(seen);
    next.add(name);
    return exampleFromSchema(schemas[name], schemas, next, depth + 1);
  }

  if (obj["example"] !== undefined) return obj["example"];
  if (obj["default"] !== undefined) return obj["default"];
  if (Array.isArray(obj["enum"]) && (obj["enum"] as unknown[]).length) return (obj["enum"] as unknown[])[0];

  if (Array.isArray(obj["allOf"])) {
    const merged: Record<string, unknown> = {};
    for (const part of obj["allOf"] as unknown[]) {
      const ex = exampleFromSchema(part, schemas, seen, depth + 1);
      if (ex && typeof ex === "object" && !Array.isArray(ex)) Object.assign(merged, ex);
    }
    return merged;
  }
  if (Array.isArray(obj["oneOf"]) && (obj["oneOf"] as unknown[]).length) {
    return exampleFromSchema((obj["oneOf"] as unknown[])[0], schemas, seen, depth + 1);
  }
  if (Array.isArray(obj["anyOf"]) && (obj["anyOf"] as unknown[]).length) {
    return exampleFromSchema((obj["anyOf"] as unknown[])[0], schemas, seen, depth + 1);
  }

  const type = obj["type"];
  if (type === "object" || obj["properties"]) {
    const out: Record<string, unknown> = {};
    const props = asObj(obj["properties"]) ?? {};
    for (const [key, sub] of Object.entries(props)) {
      out[key] = exampleFromSchema(sub, schemas, seen, depth + 1);
    }
    return out;
  }
  if (type === "array") {
    const items = obj["items"];
    return items ? [exampleFromSchema(items, schemas, seen, depth + 1)] : [];
  }
  if (type === "string") return exampleForString(obj);
  if (type === "integer") return 0;
  if (type === "number") return 0;
  if (type === "boolean") return true;
  if (type === "null") return null;

  return {};
}

function exampleForString(obj: Record<string, unknown>): string {
  switch (obj["format"]) {
    case "date-time": return "2020-01-01T00:00:00Z";
    case "date": return "2020-01-01";
    case "email": return "user@example.com";
    case "uuid": return "00000000-0000-4000-8000-000000000000";
    case "uri":
    case "url": return "https://example.com";
    default: return "string";
  }
}

/** Convert an OpenAPI schema (with `$ref`s) into a validator {@link Schema}. */
export function derefToSchema(node: unknown, schemas: Record<string, unknown>, seen: Set<string>): Schema {
  const obj = asObj(node);
  if (!obj) return {};
  if (typeof obj["$ref"] === "string") {
    const name = refName(obj["$ref"] as string);
    if (seen.has(name)) return {};
    const next = new Set(seen);
    next.add(name);
    return derefToSchema(schemas[name], schemas, next);
  }
  const out: Schema = {};
  const copy = ["type", "required", "enum", "minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems", "pattern", "nullable", "additionalProperties"] as const;
  for (const k of copy) if (obj[k] !== undefined) (out as Record<string, unknown>)[k] = obj[k];
  const props = asObj(obj["properties"]);
  if (props) {
    out.properties = {};
    for (const [key, sub] of Object.entries(props)) out.properties[key] = derefToSchema(sub, schemas, seen);
  }
  if (obj["items"]) out.items = derefToSchema(obj["items"], schemas, seen);
  return out;
}
