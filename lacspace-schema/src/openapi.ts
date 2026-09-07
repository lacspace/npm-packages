/**
 * Import and export OpenAPI 3 / Swagger 2 component schemas. `fromOpenApi`
 * pulls the named schemas out of `components.schemas` (OpenAPI 3) or
 * `definitions` (Swagger 2); `toOpenApi` wraps a map of named schemas back into
 * an OpenAPI `components` block (or a whole minimal document).
 *
 * Pure and dependency-free (no `node:` imports) so it runs in the browser
 * `/try` playground.
 */
import type { JsonValue, JSONSchema } from "./types.js";
import { isPlainObject, safeKeys, safeSet } from "./util.js";

/** The result of {@link fromOpenApi}: the doc version plus its named schemas. */
export interface OpenApiExtract {
  /** `"3"` for OpenAPI 3.x, `"2"` for Swagger 2.0, `"unknown"` otherwise. */
  version: "2" | "3" | "unknown";
  /** Component name -> schema (`$ref`s inside are left untouched). */
  schemas: Record<string, JSONSchema>;
}

/** Options for {@link toOpenApi}. */
export interface ToOpenApiOptions {
  /** Emit a full minimal document (`openapi`/`info`/`components`) not just the block. */
  full?: boolean;
  /** `info.title` for a full document (default `"API"`). */
  title?: string;
  /** `info.version` for a full document (default `"1.0.0"`). */
  version?: string;
}

/**
 * Extract the component schemas from an OpenAPI 3 or Swagger 2 document.
 * Returns an empty map (never throws) when the doc has no component schemas.
 */
export function fromOpenApi(doc: JsonValue): OpenApiExtract {
  const schemas: Record<string, JSONSchema> = {};
  if (!isPlainObject(doc)) return { version: "unknown", schemas };

  let version: OpenApiExtract["version"] = "unknown";
  let bucket: Record<string, JsonValue> | undefined;

  const components = doc["components"];
  if (isPlainObject(components) && isPlainObject(components["schemas"])) {
    version = "3";
    bucket = components["schemas"] as Record<string, JsonValue>;
  } else if (isPlainObject(doc["definitions"])) {
    version = "2";
    bucket = doc["definitions"] as Record<string, JsonValue>;
  }

  if (typeof doc["openapi"] === "string") version = version === "unknown" ? "3" : version;
  else if (typeof doc["swagger"] === "string") version = version === "unknown" ? "2" : version;

  if (bucket) {
    for (const key of safeKeys(bucket)) {
      const s = bucket[key];
      if (isPlainObject(s)) safeSet(schemas, key, s as JSONSchema);
    }
  }
  return { version, schemas };
}

/**
 * Wrap a map of named schemas into an OpenAPI `components.schemas` block, or a
 * full minimal document when `opts.full` is set.
 */
export function toOpenApi(
  schemas: Record<string, JSONSchema>,
  opts: ToOpenApiOptions = {},
): JSONSchema {
  const clean: Record<string, JSONSchema> = {};
  for (const key of safeKeys(schemas)) {
    // Strip the `$schema` draft declaration — it is not valid inside OpenAPI.
    const { $schema, ...rest } = schemas[key] as JSONSchema;
    void $schema;
    safeSet(clean, key, rest as JSONSchema);
  }
  const components = { schemas: clean };
  if (!opts.full) return { components } as unknown as JSONSchema;
  return {
    openapi: "3.0.3",
    info: { title: opts.title ?? "API", version: opts.version ?? "1.0.0" },
    paths: {},
    components,
  } as unknown as JSONSchema;
}
