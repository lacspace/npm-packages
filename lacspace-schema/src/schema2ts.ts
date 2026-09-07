/**
 * Generate TypeScript type declarations from a draft-07 JSON Schema, or —
 * via the inference engine — directly from JSON samples.
 *
 * The walker turns object schemas into named `interface`s (nested objects are
 * extracted and named from their key, array-item objects from the singularized
 * key), unions into `a | b`, enums into string-literal unions or real TS
 * `enum`s, and resolves local `$ref`s to `#/definitions|$defs` (cycles safe).
 */
import type { JsonValue, JSONSchema } from "./types.js";
import { inferSchema } from "./infer.js";
import type { InferOptions } from "./infer.js";
import { resolveRef, refName } from "./refs.js";
import {
  isValidIdentifier,
  pascalCase,
  propKey,
  singularize,
  tsLiteral,
} from "./util.js";

/** Options controlling TypeScript codegen. */
export interface TsOptions {
  /** Name for the root type (default `"Root"`). */
  name?: string;
  /** Prefix every property with `readonly`. */
  readonly?: boolean;
  /** Emit `/** ... *\/` comments with example/description info. */
  jsdoc?: boolean;
  /** Emit real TS `enum`s for string enums instead of literal unions. */
  enum?: boolean;
  /** Indent width in spaces (default 2). */
  indent?: number;
  /** Prefix `export` on declarations (default true). */
  exported?: boolean;
}

interface Decl {
  name: string;
  code: string;
}

function resolveRefTarget(root: JSONSchema, ref: string): { key: string; schema: JSONSchema } | null {
  const schema = resolveRef(root, ref);
  if (!schema || ref === "#") return null;
  return { key: refName(ref), schema };
}

class TsGen {
  private decls: Decl[] = [];
  private used = new Set<string>();
  private indent: number;
  private exportKw: string;
  // memo: schema object identity -> emitted type name (dedupe + cycle safety)
  private memo = new Map<JSONSchema, string>();
  // $ref path -> assigned TS name
  private refNames = new Map<string, string>();

  constructor(private root: JSONSchema, private opts: TsOptions) {
    this.indent = opts.indent ?? 2;
    this.exportKw = opts.exported === false ? "" : "export ";
  }

  private uniqueName(hint: string): string {
    let base = pascalCase(hint || "Type");
    if (!this.used.has(base)) {
      this.used.add(base);
      return base;
    }
    let i = 2;
    while (this.used.has(base + i)) i++;
    const name = base + i;
    this.used.add(name);
    return name;
  }

  generate(): string {
    const rootName = pascalCase(this.opts.name || (this.root.title as string) || "Root");
    this.used.add(rootName);
    const expr = this.typeFor(this.root, rootName, rootName);
    // If the root resolved to a standalone interface/enum with that exact
    // name, it is already in decls. Otherwise emit a type alias.
    if (!this.decls.some((d) => d.name === rootName)) {
      this.decls.unshift({
        name: rootName,
        code: `${this.exportKw}type ${rootName} = ${expr};`,
      });
    }
    return this.decls.map((d) => d.code).join("\n\n") + "\n";
  }

  /** Return a TS type expression for `schema`, extracting named decls. */
  private typeFor(schema: JSONSchema, nameHint: string, forceName?: string): string {
    if (!schema || typeof schema !== "object") return "unknown";

    if (typeof schema.$ref === "string") {
      return this.typeForRef(schema.$ref);
    }
    if (this.memo.has(schema)) return this.memo.get(schema)!;

    if (schema.const !== undefined) return tsLiteral(schema.const);

    if (Array.isArray(schema.enum)) {
      return this.enumType(schema.enum, nameHint);
    }

    if (Array.isArray(schema.anyOf)) return this.unionType(schema.anyOf, nameHint, " | ");
    if (Array.isArray(schema.oneOf)) return this.unionType(schema.oneOf, nameHint, " | ");
    if (Array.isArray(schema.allOf)) return this.unionType(schema.allOf, nameHint, " & ");

    const type = schema.type;
    if (Array.isArray(type)) {
      const parts = type.map((t) => this.typeFor({ ...schema, type: t }, nameHint));
      return dedupeUnion(parts);
    }

    switch (type) {
      case "object":
        return this.objectType(schema, nameHint, forceName);
      case "array":
        return this.arrayType(schema, nameHint);
      case "string":
        return "string";
      case "integer":
      case "number":
        return "number";
      case "boolean":
        return "boolean";
      case "null":
        return "null";
      default:
        // No explicit type: infer intent from shape.
        if (schema.properties) return this.objectType(schema, nameHint, forceName);
        if (schema.items) return this.arrayType(schema, nameHint);
        return "unknown";
    }
  }

  private typeForRef(ref: string): string {
    if (ref === "#") return pascalCase(this.opts.name || "Root");
    const existing = this.refNames.get(ref);
    if (existing) return existing;
    const target = resolveRefTarget(this.root, ref);
    if (!target) return "unknown";
    const name = this.uniqueName(target.key);
    this.refNames.set(ref, name);
    // Emit the referenced type body under its reserved name (cycle-safe: the
    // name is already registered, so a self-ref returns it without recursing).
    this.emitNamed(target.schema, name);
    return name;
  }

  /** Emit a top-level declaration for `schema` under an exact `name`. */
  private emitNamed(schema: JSONSchema, name: string): void {
    if (typeof schema.$ref === "string") {
      const alias = this.typeForRef(schema.$ref);
      this.decls.push({ name, code: `${this.exportKw}type ${name} = ${alias};` });
      return;
    }
    if (Array.isArray(schema.enum)) {
      const t = this.enumType(schema.enum, name, name);
      if (!this.decls.some((d) => d.name === name)) {
        this.decls.push({ name, code: `${this.exportKw}type ${name} = ${t};` });
      }
      return;
    }
    const type = schema.type;
    const isObject = type === "object" || (!type && schema.properties);
    if (isObject) {
      this.emitInterface(schema, name);
      return;
    }
    const expr = this.typeFor(schema, name);
    this.decls.push({ name, code: `${this.exportKw}type ${name} = ${expr};` });
  }

  private objectType(schema: JSONSchema, nameHint: string, forceName?: string): string {
    const props = schema.properties;
    const hasProps = props && Object.keys(props).length > 0;
    if (!hasProps) {
      const ap = schema.additionalProperties;
      if (ap && typeof ap === "object") {
        return `Record<string, ${this.typeFor(ap, singularize(nameHint) || "Value")}>`;
      }
      return "Record<string, unknown>";
    }
    const name = forceName ?? this.uniqueName(nameHint);
    this.memo.set(schema, name);
    this.emitInterface(schema, name);
    return name;
  }

  private emitInterface(schema: JSONSchema, name: string): void {
    if (this.decls.some((d) => d.name === name)) return;
    this.memo.set(schema, name);
    const props = (schema.properties ?? {}) as Record<string, JSONSchema>;
    const required = new Set(schema.required ?? []);
    const pad = " ".repeat(this.indent);
    const lines: string[] = [];

    for (const key of Object.keys(props)) {
      const propSchema = props[key]!;
      const optional = required.has(key) ? "" : "?";
      const ro = this.opts.readonly ? "readonly " : "";
      const t = this.typeFor(propSchema, pascalCase(key));
      if (this.opts.jsdoc) {
        const doc = jsdocFor(propSchema);
        if (doc) lines.push(...doc.map((l) => pad + l));
      }
      lines.push(`${pad}${ro}${propKey(key)}${optional}: ${t};`);
    }

    const ap = schema.additionalProperties;
    if (ap && typeof ap === "object") {
      const t = this.typeFor(ap, "Value");
      lines.push(`${pad}[key: string]: ${t};`);
    }

    // place the interface before already-registered dependencies for readable
    // top-down output where possible.
    this.decls.push({
      name,
      code: `${this.exportKw}interface ${name} {\n${lines.join("\n")}\n}`,
    });
  }

  private arrayType(schema: JSONSchema, nameHint: string): string {
    const items = schema.items;
    if (!items) return this.opts.readonly ? "readonly unknown[]" : "unknown[]";
    if (Array.isArray(items)) {
      const tuple = items.map((it, i) => this.typeFor(it, `${nameHint}${i}`));
      return `[${tuple.join(", ")}]`;
    }
    const inner = this.typeFor(items, singularize(nameHint) || "Item");
    const needsParens = /[|&]/.test(inner);
    const elem = needsParens ? `(${inner})` : inner;
    return this.opts.readonly ? `readonly ${elem}[]` : `${elem}[]`;
  }

  private enumType(values: JsonValue[], nameHint: string, forceName?: string): string {
    const allStrings = values.every((v) => typeof v === "string");
    if (this.opts.enum && allStrings && values.length > 0) {
      const name = forceName ?? this.uniqueName(nameHint);
      if (!this.decls.some((d) => d.name === name)) {
        const pad = " ".repeat(this.indent);
        const members = (values as string[])
          .map((v) => `${pad}${enumMemberName(v)} = ${JSON.stringify(v)},`)
          .join("\n");
        this.decls.push({
          name,
          code: `${this.exportKw}enum ${name} {\n${members}\n}`,
        });
      }
      return name;
    }
    return dedupeUnion(values.map((v) => tsLiteral(v)));
  }

  private unionType(schemas: JSONSchema[], nameHint: string, sep: string): string {
    const parts = schemas.map((s, i) =>
      this.typeFor(s, schemas.length > 1 ? `${nameHint}${i + 1}` : nameHint),
    );
    return dedupeUnion(parts, sep);
  }
}

function dedupeUnion(parts: string[], sep = " | "): string {
  const seen: string[] = [];
  for (const p of parts) if (!seen.includes(p)) seen.push(p);
  if (seen.length === 0) return "unknown";
  if (seen.length === 1) return seen[0]!;
  return seen.join(sep);
}

function enumMemberName(value: string): string {
  const name = pascalCase(value);
  return isValidIdentifier(name) ? name : JSON.stringify(value);
}

function jsdocFor(schema: JSONSchema): string[] | null {
  const bits: string[] = [];
  if (typeof schema.description === "string") bits.push(schema.description);
  if (Array.isArray(schema.examples) && schema.examples.length) {
    bits.push(`@example ${JSON.stringify(schema.examples[0])}`);
  }
  if (typeof schema.format === "string") bits.push(`@format ${schema.format}`);
  if (!bits.length) return null;
  if (bits.length === 1) return [`/** ${bits[0]} */`];
  return ["/**", ...bits.map((b) => ` * ${b}`), " */"];
}

/** Generate TypeScript type declarations from a draft-07 JSON Schema. */
export function schemaToTs(schema: JSONSchema, opts: TsOptions = {}): string {
  return new TsGen(schema, opts).generate();
}

/** Generate TypeScript type declarations directly from JSON samples. */
export function jsonToTs(
  samples: JsonValue[],
  opts: TsOptions & Pick<InferOptions, "enumThreshold" | "required"> = {},
): string {
  const inferOpts: InferOptions = {
    enumThreshold: opts.enumThreshold ?? 0,
    collectExamples: !!opts.jsdoc,
    declareDraft: false,
  };
  if (opts.required) inferOpts.required = opts.required;
  const schema = inferSchema(samples, inferOpts);
  return schemaToTs(schema, opts);
}
