/**
 * Generate [Zod](https://zod.dev) schema source from a draft-07 JSON Schema, or
 * — via the inference engine — directly from JSON samples. Handles objects
 * (required vs `.optional()`), arrays/tuples, enums, `const` literals, string
 * `format`s (`.email()`, `.uuid()`, `.url()`, `.datetime()`, …),
 * `min`/`max`/length constraints, `additionalProperties` (`z.record`),
 * nullability, `anyOf`/`oneOf` unions and local `$ref`s (factored into named
 * consts). Pure and dependency-free (no `node:` imports) — the generated code
 * imports `zod`, but this generator does not.
 */
import type { JsonValue, JSONSchema } from "./types.js";
import { inferSchema } from "./infer.js";
import type { InferOptions } from "./infer.js";
import { resolveRef, refName } from "./refs.js";
import { pascalCase, isValidIdentifier } from "./util.js";

/** Options controlling Zod codegen. */
export interface ZodOptions {
  /** Name for the root schema const (default `"Schema"`). */
  name?: string;
  /** Prefix `export` on the emitted consts (default true). */
  exported?: boolean;
  /** Emit the `import { z } from "zod";` line (default true). */
  includeImport?: boolean;
  /** Also emit `export type X = z.infer<typeof X>;` aliases (default true). */
  includeInfer?: boolean;
}

interface Decl {
  name: string;
  code: string;
}

const FORMAT_METHOD: Record<string, string> = {
  email: ".email()",
  uuid: ".uuid()",
  uri: ".url()",
  url: ".url()",
  "date-time": ".datetime()",
  ipv4: ".ip({ version: \"v4\" })",
  ipv6: ".ip({ version: \"v6\" })",
};

class ZodGen {
  private decls: Decl[] = [];
  private used = new Set<string>();
  private refNames = new Map<string, string>();
  private exportKw: string;

  constructor(private root: JSONSchema, private opts: ZodOptions) {
    this.exportKw = opts.exported === false ? "" : "export ";
  }

  private uniqueName(hint: string): string {
    const base = pascalCase(hint || "Schema");
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
    const rootName = pascalCase(this.opts.name || (this.root.title as string) || "Schema");
    this.used.add(rootName);
    const expr = this.exprFor(this.root, rootName);
    if (!this.decls.some((d) => d.name === rootName)) {
      this.decls.push({ name: rootName, code: `${this.exportKw}const ${rootName} = ${expr};` });
    }
    const parts: string[] = [];
    if (this.opts.includeImport !== false) parts.push(`import { z } from "zod";`);
    const body: string[] = [];
    for (const d of this.decls) {
      body.push(d.code);
      if (this.opts.includeInfer !== false) {
        body.push(`${this.exportKw}type ${d.name} = z.infer<typeof ${d.name}>;`);
      }
    }
    parts.push(body.join("\n\n"));
    return parts.join("\n\n") + "\n";
  }

  private exprFor(schema: JSONSchema, nameHint: string): string {
    if (!schema || typeof schema !== "object") return "z.unknown()";

    if (typeof schema.$ref === "string") return this.refExpr(schema.$ref);

    if (schema.const !== undefined) return `z.literal(${JSON.stringify(schema.const)})`;

    if (Array.isArray(schema.enum)) return this.enumExpr(schema.enum);

    if (Array.isArray(schema.anyOf)) return this.unionExpr(schema.anyOf, nameHint);
    if (Array.isArray(schema.oneOf)) return this.unionExpr(schema.oneOf, nameHint);
    if (Array.isArray(schema.allOf) && schema.allOf.length) {
      return schema.allOf
        .map((s, i) => this.exprFor(s, `${nameHint}${i + 1}`))
        .reduce((acc, cur) => `${acc}.and(${cur})`);
    }

    const t = schema.type;
    if (Array.isArray(t)) {
      const nonNull = t.filter((x) => x !== "null");
      const nullable = t.includes("null");
      const parts = nonNull.map((x) => this.exprFor({ ...schema, type: x }, nameHint));
      let expr = parts.length === 1 ? parts[0]! : `z.union([${parts.join(", ")}])`;
      if (nullable) expr += ".nullable()";
      return expr;
    }

    let expr = this.baseExpr(schema, t, nameHint);
    if (schema.nullable === true) expr += ".nullable()";
    return expr;
  }

  private baseExpr(schema: JSONSchema, t: JsonValue | undefined, nameHint: string): string {
    switch (t) {
      case "string":
        return this.stringExpr(schema);
      case "integer": {
        let e = "z.number().int()";
        if (typeof schema.minimum === "number") e += `.min(${schema.minimum})`;
        if (typeof schema.maximum === "number") e += `.max(${schema.maximum})`;
        return e;
      }
      case "number": {
        let e = "z.number()";
        if (typeof schema.minimum === "number") e += `.min(${schema.minimum})`;
        if (typeof schema.maximum === "number") e += `.max(${schema.maximum})`;
        return e;
      }
      case "boolean":
        return "z.boolean()";
      case "null":
        return "z.null()";
      case "array":
        return this.arrayExpr(schema, nameHint);
      case "object":
        return this.objectExpr(schema, nameHint);
      default:
        if (schema.properties) return this.objectExpr(schema, nameHint);
        if (schema.items) return this.arrayExpr(schema, nameHint);
        return "z.unknown()";
    }
  }

  private stringExpr(schema: JSONSchema): string {
    let e = "z.string()";
    if (typeof schema.format === "string" && FORMAT_METHOD[schema.format]) {
      e += FORMAT_METHOD[schema.format];
    }
    if (typeof schema.minLength === "number") e += `.min(${schema.minLength})`;
    if (typeof schema.maxLength === "number") e += `.max(${schema.maxLength})`;
    if (typeof schema.pattern === "string") e += `.regex(new RegExp(${JSON.stringify(schema.pattern)}))`;
    return e;
  }

  private enumExpr(values: JsonValue[]): string {
    if (values.length && values.every((v) => typeof v === "string")) {
      return `z.enum([${(values as string[]).map((v) => JSON.stringify(v)).join(", ")}])`;
    }
    if (values.length === 1) return `z.literal(${JSON.stringify(values[0])})`;
    return `z.union([${values.map((v) => `z.literal(${JSON.stringify(v)})`).join(", ")}])`;
  }

  private unionExpr(schemas: JSONSchema[], nameHint: string): string {
    if (schemas.length === 1) return this.exprFor(schemas[0]!, nameHint);
    const parts = schemas.map((s, i) => this.exprFor(s, `${nameHint}${i + 1}`));
    return `z.union([${parts.join(", ")}])`;
  }

  private arrayExpr(schema: JSONSchema, nameHint: string): string {
    const items = schema.items;
    if (Array.isArray(items)) {
      return `z.tuple([${items.map((it, i) => this.exprFor(it, `${nameHint}${i}`)).join(", ")}])`;
    }
    const inner = items && typeof items === "object" ? this.exprFor(items, nameHint) : "z.unknown()";
    let e = `z.array(${inner})`;
    if (typeof schema.minItems === "number") e += `.min(${schema.minItems})`;
    if (typeof schema.maxItems === "number") e += `.max(${schema.maxItems})`;
    return e;
  }

  private objectExpr(schema: JSONSchema, nameHint: string): string {
    const props = (schema.properties ?? {}) as Record<string, JSONSchema>;
    const keys = Object.keys(props);
    if (keys.length === 0) {
      const ap = schema.additionalProperties;
      if (ap && typeof ap === "object") return `z.record(${this.exprFor(ap, nameHint)})`;
      return "z.record(z.unknown())";
    }
    const required = new Set(schema.required ?? []);
    const lines = keys.map((key) => {
      let inner = this.exprFor(props[key]!, pascalCase(key));
      if (!required.has(key)) inner += ".optional()";
      const k = isValidIdentifier(key) ? key : JSON.stringify(key);
      return `  ${k}: ${inner},`;
    });
    let e = `z.object({\n${lines.join("\n")}\n})`;
    if (schema.additionalProperties === false) e += ".strict()";
    return e;
  }

  private refExpr(ref: string): string {
    const existing = this.refNames.get(ref);
    if (existing) return existing;
    const target = resolveRef(this.root, ref);
    if (!target || ref === "#") return "z.unknown()";
    const name = this.uniqueName(refName(ref));
    this.refNames.set(ref, name);
    // Reserve then emit (cycle-safe: a self-ref returns the reserved name via
    // z.lazy at the reference site).
    const expr = this.exprFor(target, name);
    this.decls.push({ name, code: `${this.exportKw}const ${name} = ${expr};` });
    return name;
  }
}

/** Generate Zod schema source from a draft-07 JSON Schema. */
export function schemaToZod(schema: JSONSchema, opts: ZodOptions = {}): string {
  return new ZodGen(schema, opts).generate();
}

/** Generate Zod schema source directly from JSON samples. */
export function jsonToZod(
  samples: JsonValue[],
  opts: ZodOptions & Pick<InferOptions, "enumThreshold" | "required"> = {},
): string {
  const inferOpts: InferOptions = { enumThreshold: opts.enumThreshold ?? 0, declareDraft: false };
  if (opts.required) inferOpts.required = opts.required;
  const schema = inferSchema(samples, inferOpts);
  return schemaToZod(schema, opts);
}
