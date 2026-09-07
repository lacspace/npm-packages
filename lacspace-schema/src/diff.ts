/**
 * Compare two JSON Schemas and report structural changes — added / removed /
 * type-changed properties, newly-required and newly-optional fields, and enum
 * changes — flagging the ones that break backward compatibility for consumers.
 */
import type { JsonValue, JSONSchema } from "./types.js";
import { safeKeys } from "./util.js";

/** The kind of change a {@link DiffEntry} records. */
export type DiffKind =
  | "added"
  | "removed"
  | "type-changed"
  | "required-added"
  | "required-removed"
  | "enum-changed";

/** A single difference between two schemas. */
export interface DiffEntry {
  path: string;
  kind: DiffKind;
  detail: string;
  breaking: boolean;
}

/** The full comparison result. */
export interface DiffResult {
  changes: DiffEntry[];
  breaking: boolean;
}

function typeString(schema: JSONSchema): string {
  if (Array.isArray(schema.enum)) return "enum";
  if (Array.isArray(schema.anyOf)) return "anyOf";
  if (Array.isArray(schema.oneOf)) return "oneOf";
  const t = schema.type;
  if (Array.isArray(t)) return [...t].sort().join("|");
  if (typeof t === "string") return t;
  if (schema.properties) return "object";
  if (schema.items) return "array";
  return "any";
}

function enumSet(schema: JSONSchema): Set<string> | null {
  if (!Array.isArray(schema.enum)) return null;
  return new Set(schema.enum.map((v: JsonValue) => JSON.stringify(v)));
}

function join(base: string, key: string): string {
  return base ? `${base}.${key}` : key;
}

function compare(a: JSONSchema, b: JSONSchema, path: string, out: DiffEntry[]): void {
  const ta = typeString(a);
  const tb = typeString(b);
  if (ta !== tb) {
    out.push({
      path: path || "(root)",
      kind: "type-changed",
      detail: `type ${ta} -> ${tb}`,
      breaking: true,
    });
    // Different shapes: don't descend further at this path.
    return;
  }

  // enum value changes
  const ea = enumSet(a);
  const eb = enumSet(b);
  if (ea && eb) {
    const removed = [...ea].filter((v) => !eb.has(v));
    const added = [...eb].filter((v) => !ea.has(v));
    if (removed.length || added.length) {
      out.push({
        path: path || "(root)",
        kind: "enum-changed",
        detail: `${added.length ? "+[" + added.join(",") + "] " : ""}${removed.length ? "-[" + removed.join(",") + "]" : ""}`.trim(),
        breaking: removed.length > 0,
      });
    }
  }

  // object properties
  if (a.properties || b.properties) {
    const pa = (a.properties ?? {}) as Record<string, JSONSchema>;
    const pb = (b.properties ?? {}) as Record<string, JSONSchema>;
    const reqA = new Set(a.required ?? []);
    const reqB = new Set(b.required ?? []);
    const keys = new Set<string>([...safeKeys(pa), ...safeKeys(pb)]);
    for (const key of keys) {
      const p = join(path, key);
      const inA = key in pa;
      const inB = key in pb;
      if (inA && !inB) {
        out.push({ path: p, kind: "removed", detail: "property removed", breaking: true });
        continue;
      }
      if (!inA && inB) {
        out.push({
          path: p,
          kind: "added",
          detail: reqB.has(key) ? "required property added" : "optional property added",
          breaking: reqB.has(key),
        });
        continue;
      }
      // present in both: required transitions + recurse
      if (!reqA.has(key) && reqB.has(key)) {
        out.push({ path: p, kind: "required-added", detail: "became required", breaking: true });
      } else if (reqA.has(key) && !reqB.has(key)) {
        out.push({ path: p, kind: "required-removed", detail: "became optional", breaking: false });
      }
      compare(pa[key]!, pb[key]!, p, out);
    }
  }

  // array items
  if (a.items && b.items && !Array.isArray(a.items) && !Array.isArray(b.items)) {
    compare(a.items, b.items, join(path, "[]"), out);
  }
}

/** Compare two draft-07 JSON Schemas (`before` -> `after`). */
export function diffSchemas(before: JSONSchema, after: JSONSchema): DiffResult {
  const changes: DiffEntry[] = [];
  compare(before, after, "", changes);
  return { changes, breaking: changes.some((c) => c.breaking) };
}
