import type { Table, SerializeOptions } from "../types";
import { parseYaml, stringifyYaml } from "../yaml";
import { parseToml, stringifyToml } from "../toml";
import { tablesFromValue, jsonValueOf, plainRows } from "./json";
import type { JsonValue } from "../util";
import { safeSet } from "../util";

export function parseYamlTables(text: string): Table[] {
  return tablesFromValue(parseYaml(text));
}

export function parseTomlTables(text: string): Table[] {
  return tablesFromValue(parseToml(text));
}

export function serializeYaml(tables: Table[], opts: SerializeOptions): string {
  return stringifyYaml(jsonValueOf(tables, opts) as JsonValue);
}

/** TOML needs a top-level table: a single nameless table becomes `[[data]]`. */
export function serializeToml(tables: Table[], opts: SerializeOptions): string {
  const root: Record<string, JsonValue> = {};
  tables.forEach((t, i) => {
    const name = t.name ?? (tables.length === 1 ? (opts.tableName ?? "data") : `${opts.tableName ?? "table"}${i + 1}`);
    safeSet(root, name, plainRows(t.rows, opts));
  });
  return stringifyToml(root);
}
