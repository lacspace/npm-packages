/**
 * lacspace-schema — a keyless, zero-dependency schema & type codegen toolkit.
 *
 * Infer a draft-07 JSON Schema from data, generate TypeScript types from JSON
 * or from a JSON Schema, build a realistic example instance from a schema, and
 * diff two schemas for breaking changes. Pure and offline — no network, no
 * telemetry.
 *
 * ```ts
 * import { inferSchema, jsonToTs, schemaToTs, schemaToExample } from "lacspace-schema";
 *
 * const schema = inferSchema([
 *   { id: 1, email: "a@x.com", role: "admin" },
 *   { id: 2, email: "b@x.com", role: "user", nickname: "bee" },
 * ], { enumThreshold: 4 });
 * // draft-07 schema: `id`/`email`/`role` required, `nickname` optional,
 * // `email` gets format:"email", `role` becomes an enum.
 *
 * jsonToTs([{ id: 1, tags: ["a"] }], { name: "Post" });
 * // interface Post { id: number; tags: string[]; }
 *
 * schemaToTs(schema, { name: "User", enum: true });
 * schemaToExample(schema); // a sample object satisfying the schema
 * ```
 */
export { inferSchema, inferNode } from "./infer.js";
export type { InferOptions } from "./infer.js";
export { schemaToTs, jsonToTs } from "./schema2ts.js";
export type { TsOptions } from "./schema2ts.js";
export { schemaToExample } from "./example.js";
export type { ExampleOptions } from "./example.js";
export { diffSchemas } from "./diff.js";
export type { DiffResult, DiffEntry, DiffKind } from "./diff.js";
export type { JsonValue, JSONSchema, JsonSchemaType } from "./types.js";
