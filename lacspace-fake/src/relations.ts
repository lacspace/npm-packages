/**
 * Relations / linked datasets (0.2.0). Generate several named entities at once
 * where one entity references another's ids (foreign keys), so the output is
 * referentially consistent: every FK value actually exists in the parent table.
 *
 * A relations schema is a JSON object mapping each entity name to `{ count, fields }`.
 * A field whose spec is `ref(<entity>.<field>)` is a foreign key: at generation
 * time it is drawn from the already-generated column of the referenced (earlier)
 * entity. Everything else is an ordinary generator/template/`unique(...)` spec.
 *
 * ```json
 * {
 *   "users":  { "count": 10, "fields": { "id": "unique(uuid)", "name": "fullName" } },
 *   "orders": { "count": 30, "fields": { "id": "autoincrement", "userId": "ref(users.id)", "total": "price(5..500)" } }
 * }
 * ```
 *
 * The whole dataset is drawn from one seeded RNG, so a fixed seed yields
 * byte-identical linked data every run.
 */
import { RNG } from "./prng.js";
import type { Locale } from "./data.js";
import type { GenContext } from "./generators.js";
import { compileFieldValue, dedupeKey } from "./schema.js";
import type { Spec, GenerateOptions } from "./schema.js";

export interface EntityInput {
  count?: number;
  fields: Record<string, unknown>;
}
/** A relations schema: entity name → its spec. */
export type RelationsInput = Record<string, EntityInput>;

interface CompiledField {
  key: string;
  /** Foreign-key reference, or… */
  ref?: { entity: string; field: string };
  /** …a normal value spec. */
  spec?: Spec;
  unique?: boolean;
}
export interface CompiledEntity {
  name: string;
  count: number;
  fields: CompiledField[];
}

export type Dataset = Record<string, Record<string, unknown>[]>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const REF_RE = /^ref\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\.\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)$/;

/**
 * Compile a relations schema into ordered, validated entities. Throws if an
 * entity is malformed or references an entity that wasn't declared earlier
 * (forward/unknown references would break referential integrity).
 */
export function parseRelations(input: unknown): CompiledEntity[] {
  if (!isRecord(input)) throw new Error("A relations schema must be an object mapping entity → { count, fields }");
  const names = Object.keys(input);
  if (names.length === 0) throw new Error("The relations schema has no entities");
  const declared = new Set<string>();
  const entities: CompiledEntity[] = [];
  for (const name of names) {
    const ent = input[name];
    if (!isRecord(ent) || !isRecord(ent["fields"])) {
      throw new Error(`Entity "${name}" needs a "fields" object (e.g. { "count": 10, "fields": { "id": "autoincrement" } })`);
    }
    const rawCount = ent["count"];
    const count = typeof rawCount === "number" ? Math.max(0, Math.floor(rawCount)) : 10;
    const fieldRec = ent["fields"] as Record<string, unknown>;
    const fields: CompiledField[] = [];
    for (const key of Object.keys(fieldRec)) {
      const raw = fieldRec[key];
      if (typeof raw === "string") {
        const m = REF_RE.exec(raw.trim());
        if (m) {
          const entity = m[1]!;
          const field = m[2]!;
          if (!declared.has(entity)) {
            throw new Error(`Entity "${name}" field "${key}" references "${entity}.${field}", but "${entity}" is not declared earlier — order entities parent-first.`);
          }
          fields.push({ key, ref: { entity, field } });
          continue;
        }
      }
      const { spec, unique } = compileFieldValue(raw);
      fields.push({ key, spec, unique });
    }
    entities.push({ name, count, fields });
    declared.add(name);
  }
  return entities;
}

const UNIQUE_MAX_TRIES = 10_000;

/**
 * Generate a linked dataset from compiled entities. Deterministic under `seed`.
 * Foreign keys are drawn from the parent's generated column, guaranteeing every
 * FK exists (or `null` when the parent produced zero rows).
 */
export function generateDataset(entities: CompiledEntity[], opts: GenerateOptions = {}): Dataset {
  const seed = opts.seed ?? Math.floor(Math.random() * 0xffffffff);
  const locale: Locale = opts.locale ?? "en";
  const rng = new RNG(seed);
  const out: Dataset = {};
  // entity → field → all generated values (the FK pool).
  const pools: Record<string, Record<string, unknown[]>> = {};

  for (const ent of entities) {
    const rows: Record<string, unknown>[] = [];
    const uniqueSeen = new Map<string, Set<string>>();
    for (const f of ent.fields) if (f.unique) uniqueSeen.set(f.key, new Set());

    for (let i = 0; i < ent.count; i++) {
      const row: Record<string, unknown> = {};
      const ctx: GenContext = { rng, locale, index: i, row };
      for (const f of ent.fields) {
        if (f.ref) {
          const pool = pools[f.ref.entity]?.[f.ref.field];
          if (!pool) throw new Error(`Reference "${f.ref.entity}.${f.ref.field}" has no such column`);
          row[f.key] = pool.length ? rng.pick(pool) : null;
          continue;
        }
        const spec = f.spec!;
        if (f.unique) {
          const seen = uniqueSeen.get(f.key)!;
          let val = spec(ctx);
          let tries = 0;
          while (seen.has(dedupeKey(val)) && tries < UNIQUE_MAX_TRIES) {
            val = spec(ctx);
            tries++;
          }
          if (seen.has(dedupeKey(val))) {
            throw new Error(`Could not generate a unique value for "${ent.name}.${f.key}" — use a higher-cardinality generator or fewer rows.`);
          }
          seen.add(dedupeKey(val));
          row[f.key] = val;
        } else {
          row[f.key] = spec(ctx);
        }
      }
      rows.push(row);
    }

    out[ent.name] = rows;
    const colPool: Record<string, unknown[]> = {};
    for (const f of ent.fields) colPool[f.key] = rows.map((r) => r[f.key]);
    pools[ent.name] = colPool;
  }
  return out;
}

/** Parse + generate in one call. */
export function generateRelations(input: unknown, opts: GenerateOptions = {}): Dataset {
  return generateDataset(parseRelations(input), opts);
}
