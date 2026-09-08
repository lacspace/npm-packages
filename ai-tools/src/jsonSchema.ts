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

  /** Merge extra JSON-Schema keywords, keeping the phantom type and optionality. */
  private with(extra: JSONSchema): SchemaNode<T> {
    return new SchemaNode<T>({ ...this.schema, ...extra }, this.isOptional);
  }

  /**
   * A lower bound: `minLength` for a string, `minItems` for an array, else
   * `minimum` for a number/integer. (Enforced by `validateStrict` / `strict: true`.)
   */
  min(n: number): SchemaNode<T> {
    if (this.schema.type === "string") return this.with({ minLength: n });
    if (this.schema.type === "array") return this.with({ minItems: n });
    return this.with({ minimum: n });
  }

  /**
   * An upper bound: `maxLength` for a string, `maxItems` for an array, else
   * `maximum` for a number/integer. (Enforced by `validateStrict` / `strict: true`.)
   */
  max(n: number): SchemaNode<T> {
    if (this.schema.type === "string") return this.with({ maxLength: n });
    if (this.schema.type === "array") return this.with({ maxItems: n });
    return this.with({ maximum: n });
  }

  /** Attach a `pattern` (a string source, or a `RegExp` whose source is used). */
  pattern(pattern: string | RegExp): SchemaNode<T> {
    return this.with({ pattern: typeof pattern === "string" ? pattern : pattern.source });
  }

  /** Attach a `format` hint (e.g. `"email"`, `"uri"`, `"uuid"`, `"date-time"`). */
  format(format: string): SchemaNode<T> {
    return this.with({ format });
  }

  /** Attach a `default` value shown to the model. */
  default(value: T): SchemaNode<T> {
    return this.with({ default: value as unknown as JSONSchema["default"] });
  }

  /** Widen this node to also accept `null` (adds `"null"` to `type`). */
  nullable(): SchemaNode<T | null> {
    const t = this.schema.type;
    const types = Array.isArray(t) ? t.slice() : t ? [t] : [];
    if (!types.includes("null")) types.push("null");
    return new SchemaNode<T | null>({ ...this.schema, type: types }, this.isOptional);
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
  /** The `null` type. */
  null(description?: string): SchemaNode<null> {
    return new SchemaNode<null>(withDescription({ type: "null" }, description));
  },
  /** Any value — an empty schema `{}` (no constraints). */
  any(description?: string): SchemaNode<any> {
    return new SchemaNode<any>(withDescription({}, description));
  },
  /** A single constant value (`{ const: value }`), typed as the literal. */
  literal<const V extends string | number | boolean | null>(
    value: V,
    description?: string,
  ): SchemaNode<V> {
    const base: JSONSchema = { const: value };
    const t = value === null ? "null" : typeof value;
    if (t === "string" || t === "number" || t === "boolean" || t === "null") base.type = t;
    return new SchemaNode<V>(withDescription(base, description));
  },
  /** An object used as a string-keyed map whose values match `value`. */
  record<N extends SchemaNode<any>>(
    value: N,
    description?: string,
  ): SchemaNode<Record<string, NodeType<N>>> {
    return new SchemaNode<Record<string, NodeType<N>>>(
      withDescription(
        { type: "object", additionalProperties: value.schema },
        description,
      ),
    );
  },
  /** Matches at least one of the given schemas (`anyOf`). */
  anyOf<N extends SchemaNode<any>>(
    nodes: readonly N[],
    description?: string,
  ): SchemaNode<NodeType<N>> {
    return new SchemaNode<NodeType<N>>(
      withDescription({ anyOf: nodes.map((n) => n.schema) }, description),
    );
  },
  /** Matches exactly one of the given schemas (`oneOf`). */
  oneOf<N extends SchemaNode<any>>(
    nodes: readonly N[],
    description?: string,
  ): SchemaNode<NodeType<N>> {
    return new SchemaNode<NodeType<N>>(
      withDescription({ oneOf: nodes.map((n) => n.schema) }, description),
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
