/**
 * The in-memory database store. A "db" is a plain object whose top-level keys
 * are collection names and whose values are arrays of records (json-server
 * shape): `{ "users": [...], "posts": [...] }`. Mutations happen in memory; an
 * optional `onChange` hook lets the CLI persist the whole db back to disk.
 */
import { randomUUID } from "node:crypto";

/** A single record. Records are expected to carry an id under {@link Store.idKey}. */
export type Record_ = Record<string, unknown>;

/** The raw db shape: collection name → array of records. */
export type Db = Record<string, Record_[]>;

/** Options for constructing a {@link Store}. */
export interface StoreOptions {
  /** The primary-key field (default `"id"`). */
  idKey?: string;
  /** Called after every successful mutation with the full db snapshot. */
  onChange?: (db: Db) => void;
}

/**
 * A tiny CRUD store over an in-memory db. Only top-level array collections are
 * treated as REST resources; non-array top-level keys are exposed read-only via
 * {@link Store.singular} (json-server treats those as "singular" resources).
 */
export class Store {
  readonly idKey: string;
  private db: Db;
  private readonly rawRoot: Record<string, unknown>;
  private readonly onChange: ((db: Db) => void) | undefined;
  /** A deep clone of the collections as first seen, for {@link Store.reset}. */
  private readonly initial: Db;

  constructor(root: Record<string, unknown>, opts: StoreOptions = {}) {
    this.idKey = opts.idKey ?? "id";
    this.onChange = opts.onChange;
    this.rawRoot = root;
    this.db = {};
    for (const [key, value] of Object.entries(root)) {
      if (Array.isArray(value)) this.db[key] = value as Record_[];
    }
    this.initial = cloneDb(this.db);
  }

  /**
   * Restore every collection to its original state (the data the store was
   * constructed with), discarding all mutations made this session. Fires
   * `onChange` once so a `--write` target is rewritten too.
   */
  reset(): void {
    this.db = cloneDb(this.initial);
    this.emit();
  }

  /** Names of the array collections (the REST resources). */
  collections(): string[] {
    return Object.keys(this.db);
  }

  /** True if `name` is a known array collection. */
  has(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.db, name);
  }

  /** A non-array top-level value, if any (read-only "singular" resource). */
  singular(name: string): unknown {
    const v = this.rawRoot[name];
    return Array.isArray(v) ? undefined : v;
  }

  /** The whole collection array (live reference). */
  list(name: string): Record_[] {
    return this.db[name] ?? [];
  }

  /** Find one record by id (string-compared, so `1` matches `"1"`). */
  get(name: string, id: string): Record_ | undefined {
    return this.list(name).find((r) => String(r[this.idKey]) === String(id));
  }

  /** Insert a record, assigning an id if none was supplied. Returns the stored record. */
  create(name: string, input: Record_): Record_ {
    const col = this.db[name] ?? (this.db[name] = []);
    const record: Record_ = { ...input };
    if (record[this.idKey] === undefined || record[this.idKey] === null || record[this.idKey] === "") {
      record[this.idKey] = this.nextId(col);
    }
    col.push(record);
    this.emit();
    return record;
  }

  /** Replace a record wholesale (PUT). Keeps the id. Returns the record or undefined. */
  replace(name: string, id: string, input: Record_): Record_ | undefined {
    const col = this.db[name];
    if (!col) return undefined;
    const idx = col.findIndex((r) => String(r[this.idKey]) === String(id));
    if (idx === -1) return undefined;
    const existing = col[idx]!;
    const record: Record_ = { ...input, [this.idKey]: existing[this.idKey] };
    col[idx] = record;
    this.emit();
    return record;
  }

  /** Shallow-merge fields into a record (PATCH). Returns the record or undefined. */
  patch(name: string, id: string, input: Record_): Record_ | undefined {
    const col = this.db[name];
    if (!col) return undefined;
    const idx = col.findIndex((r) => String(r[this.idKey]) === String(id));
    if (idx === -1) return undefined;
    const merged: Record_ = { ...col[idx], ...input, [this.idKey]: col[idx]![this.idKey] };
    col[idx] = merged;
    this.emit();
    return merged;
  }

  /** Delete a record by id. Returns true if something was removed. */
  remove(name: string, id: string): boolean {
    const col = this.db[name];
    if (!col) return false;
    const idx = col.findIndex((r) => String(r[this.idKey]) === String(id));
    if (idx === -1) return false;
    col.splice(idx, 1);
    this.emit();
    return true;
  }

  /** A snapshot suitable for writing back to disk (array collections only). */
  snapshot(): Db {
    const out: Db = {};
    for (const [k, v] of Object.entries(this.db)) out[k] = v;
    return out;
  }

  private nextId(col: Record_[]): number | string {
    // All-numeric ids → incrementing integer; otherwise a short uuid.
    let max = 0;
    let allNumeric = true;
    for (const r of col) {
      const v = r[this.idKey];
      const n = typeof v === "number" ? v : Number(v);
      if (v === undefined || Number.isNaN(n)) {
        allNumeric = false;
        break;
      }
      if (n > max) max = n;
    }
    return allNumeric ? max + 1 : randomUUID().slice(0, 8);
  }

  private emit(): void {
    if (this.onChange) {
      try {
        this.onChange(this.snapshot());
      } catch {
        /* persistence is best-effort; never break a request over it */
      }
    }
  }
}

/** Deep-clone a db of JSON records (structuredClone with a JSON fallback). */
function cloneDb(db: Db): Db {
  try {
    return structuredClone(db);
  } catch {
    return JSON.parse(JSON.stringify(db)) as Db;
  }
}
