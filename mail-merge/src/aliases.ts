/** Lower-case a column or variable name and drop spaces, underscores and hyphens. */
export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_\-]+/g, "");
}

/** Built-in column aliases. The key is the canonical name; matching uses `normalizeKey`. */
export const BUILTIN_ALIASES: Readonly<Record<string, readonly string[]>> = {
  firstName: ["first name", "first_name", "firstname", "fname", "given name"],
  lastName: ["last name", "last_name", "lastname", "surname", "family name", "lname"],
  name: ["name", "full name", "fullname"],
  company: ["company", "organisation", "organization", "org"],
  email: ["email", "e-mail", "email address", "e-mail address", "mail"],
  phone: ["phone", "phone number", "telephone", "mobile"],
  city: ["city", "town"],
  country: ["country"],
  title: ["title", "job title"],
};

export interface AliasGroup {
  canonical: string;
  keys: string[]; // normalized, canonical first
}

/** Build alias groups from the built-ins plus optional extra aliases (merged into matching groups). */
export function buildAliasGroups(extra?: Record<string, string[]>): AliasGroup[] {
  const groups: AliasGroup[] = [];
  const add = (canonical: string, aliases: readonly string[]): void => {
    const c = normalizeKey(canonical);
    let g = groups.find((x) => x.keys[0] === c || x.keys.includes(c));
    if (!g) {
      g = { canonical, keys: [c] };
      groups.push(g);
    }
    for (const a of aliases) {
      const n = normalizeKey(a);
      if (n && !g.keys.includes(n)) g.keys.push(n);
    }
  };
  for (const [k, v] of Object.entries(BUILTIN_ALIASES)) add(k, v);
  if (extra) for (const [k, v] of Object.entries(extra)) add(k, Array.isArray(v) ? v : []);
  return groups;
}

export const DEFAULT_GROUPS: AliasGroup[] = buildAliasGroups();

/** Find the alias group a name belongs to, if any. */
export function groupOf(name: string, groups: AliasGroup[] = DEFAULT_GROUPS): AliasGroup | undefined {
  const n = normalizeKey(name);
  return groups.find((g) => g.keys.includes(n));
}

/** Look a variable up in a normalized map: exact normalized key first, then through its alias group. */
export function resolveKey(
  lookup: Map<string, string>,
  name: string,
  groups: AliasGroup[] = DEFAULT_GROUPS,
): string | undefined {
  const n = normalizeKey(name);
  const direct = lookup.get(n);
  if (direct !== undefined) return direct;
  const g = groups.find((x) => x.keys.includes(n));
  if (!g) return undefined;
  for (const k of g.keys) {
    const v = lookup.get(k);
    if (v !== undefined) return v;
  }
  return undefined;
}

/** Turn any value into the string a template will see. null/undefined → "", Date → ISO. */
export function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString();
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
  if (typeof v === "object") {
    try {
      return JSON.stringify(v) ?? "";
    } catch {
      return String(v);
    }
  }
  return String(v);
}

/** Build a normalized lookup map. Earlier keys win within one source; later sources override. */
export function buildLookup(...sources: Array<Record<string, unknown> | undefined>): Map<string, string> {
  const map = new Map<string, string>();
  sources.forEach((src, i) => {
    if (!src) return;
    for (const [k, v] of Object.entries(src)) {
      const n = normalizeKey(k);
      if (i === 0 && map.has(n)) continue;
      map.set(n, stringifyValue(v));
    }
  });
  return map;
}
