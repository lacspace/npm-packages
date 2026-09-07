/**
 * A tiny, ergonomic JSON-Schema builder.
 *
 * It is *not* a validator — it just produces a plain JSON Schema object you can
 * hand to {@link defineTool} when you don't already have one from
 * `@lacspace/validate`, Zod, or an OpenAPI doc.
 *
 * ```ts
 * const params = jsonSchema.object({
 *   city: jsonSchema.string("City name, e.g. \"Kathmandu\""),
 *   units: jsonSchema.enum(["metric", "imperial"]).optional(),
 * });
 * // → { type: "object", properties: { ... }, required: ["city"], additionalProperties: false }
 * ```
 */

/** A permissive JSON Schema object shape (Draft-07 flavoured). */
export interface JSONSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema | JSONSchema[];
  enum?: (string | number | boolean | null)[];
  additionalProperties?: boolean | JSONSchema;
  [keyword: string]: unknown;
}

/**
 * A schema node carrying both the plain JSON Schema (`.schema` /
 * `.toJsonSchema()`) and a phantom TypeScript type `T` used to infer a tool's
 * argument type. `.optional()` widens `T` to include `undefined` and marks the
 * property non-required inside an `object`.
 */
export class SchemaNode<T = unknown> {
  /** Phantom type — never populated at runtime. */
  declare readonly _type: T;
  constructor(
    public readonly schema: JSONSchema,
    /** Whether this node is optional inside a parent object. */
    public readonly isOptional: boolean = false,
  ) {}

  /** Mark this property optional (drops it from the parent's `required`). */
  optional(): SchemaNode<T | undefined> {
    return new SchemaNode<T | undefined>(this.schema, true);
  }

  /** Attach / override the `description` shown to the model. */
  describe(description: string): SchemaNode<T> {
    return new SchemaNode<T>({ ...this.schema, description }, this.isOptional);
  }

  /** Duck-typed hook read by `defineTool`. */
  toJsonSchema(): JSONSchema {
    return this.schema;
  }
}

type NodeType<N> = N extends SchemaNode<infer T> ? T : never;
type ObjectShape = Record<string, SchemaNode<any>>;

type OptionalKeys<S extends ObjectShape> = {
  [K in keyof S]: undefined extends NodeType<S[K]> ? K : never;
}[keyof S];
type RequiredKeys<S extends ObjectShape> = Exclude<keyof S, OptionalKeys<S>>;

/** Flattens an intersection into a single readable object type. */
type Pretty<T> = { [K in keyof T]: T[K] } & {};

/** Object type inferred from an object shape (required + optional keys). */
export type ObjectType<S extends ObjectShape> = Pretty<
  { [K in RequiredKeys<S>]: NodeType<S[K]> } & {
    [K in OptionalKeys<S>]?: NodeType<S[K]>;
  }
>;

function withDescription(schema: JSONSchema, description?: string): JSONSchema {
  return description ? { ...schema, description } : schema;
}

/** The ergonomic builder. Every method returns a plain-schema-carrying node. */
export const jsonSchema = {
  string(description?: string): SchemaNode<string> {
    return new SchemaNode<string>(withDescription({ type: "string" }, description));
  },
  number(description?: string): SchemaNode<number> {
    return new SchemaNode<number>(withDescription({ type: "number" }, description));
  },
  integer(description?: string): SchemaNode<number> {
    return new SchemaNode<number>(withDescription({ type: "integer" }, description));
  },
  boolean(description?: string): SchemaNode<boolean> {
    return new SchemaNode<boolean>(withDescription({ type: "boolean" }, description));
  },
  /** A string/number enum. `as const` on the array gives you a literal union. */
  enum<const V extends readonly (string | number)[]>(
    values: V,
    description?: string,
  ): SchemaNode<V[number]> {
    const allStrings = values.every((x) => typeof x === "string");
    const base: JSONSchema = { enum: [...values] as JSONSchema["enum"] };
    if (allStrings) base.type = "string";
    else if (values.every((x) => typeof x === "number")) base.type = "number";
    return new SchemaNode<V[number]>(withDescription(base, description));
  },
  /** An array whose items match `inner`. */
  array<N extends SchemaNode<any>>(
    inner: N,
    description?: string,
  ): SchemaNode<NodeType<N>[]> {
    return new SchemaNode<NodeType<N>[]>(
      withDescription({ type: "array", items: inner.schema }, description),
    );
  },
  /** An object with typed properties. Optional nodes are dropped from `required`. */
  object<S extends ObjectShape>(
    shape: S,
    description?: string,
  ): SchemaNode<ObjectType<S>> {
    const properties: Record<string, JSONSchema> = {};
    const required: string[] = [];
    for (const [key, node] of Object.entries(shape)) {
      properties[key] = node.schema;
      if (!node.isOptional) required.push(key);
    }
    const schema: JSONSchema = {
      type: "object",
      properties,
      additionalProperties: false,
    };
    if (required.length) schema.required = required;
    return new SchemaNode<ObjectType<S>>(withDescription(schema, description));
  },
};
