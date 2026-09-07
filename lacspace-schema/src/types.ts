/**
 * Shared JSON and JSON-Schema (draft-07 subset) type definitions used across
 * the inference, codegen, example and diff engines.
 */

/** Any value that can appear in a parsed JSON document. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/** The seven JSON Schema primitive type names. */
export type JsonSchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "object"
  | "array"
  | "null";

/**
 * A draft-07 JSON Schema. Only the keywords this tool reads or writes are
 * typed explicitly; the index signature keeps it permissive for round-tripping
 * arbitrary schemas.
 */
export interface JSONSchema {
  $schema?: string;
  $id?: string;
  $ref?: string;
  title?: string;
  description?: string;
  type?: JsonSchemaType | JsonSchemaType[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema | JSONSchema[];
  additionalProperties?: boolean | JSONSchema;
  enum?: JsonValue[];
  const?: JsonValue;
  format?: string;
  pattern?: string;
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  allOf?: JSONSchema[];
  definitions?: Record<string, JSONSchema>;
  $defs?: Record<string, JSONSchema>;
  examples?: JsonValue[];
  default?: JsonValue;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  /** OpenAPI 3.0-style nullable flag (treated as allowing `null`). */
  nullable?: boolean;
  [key: string]: unknown;
}
