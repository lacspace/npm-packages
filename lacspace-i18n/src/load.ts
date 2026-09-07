/**
 * Locale-directory loader. Understands two common layouts:
 *
 *   locales/en.json  locales/ne.json        → flat: file basename = locale code
 *   locales/en/common.json  locales/en/…     → namespaced: dir = locale, file =
 *                                              namespace (keys become `ns:key`)
 *
 * Every file is parsed and flattened to dotted keys. A locale's `flat` map is
 * the merge of all its files, with namespaced keys prefixed `<namespace>:`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { flatten } from "./flatten.js";
import type { FlatMap } from "./flatten.js";
import { formatFromPath, parseByFormat } from "./readers.js";
import type { FileFormat } from "./readers.js";

/** One physical locale file after parsing + flattening. */
export interface LocaleFile {
  /** Locale code, e.g. `en`. */
  locale: string;
  /** Namespace (basename) for the namespaced layout, else `null`. */
  namespace: string | null;
  /** Absolute or given path to the file. */
  path: string;
  format: FileFormat;
  /** Flattened, UNprefixed keys of just this file. */
  data: FlatMap;
}

/** A locale = all its files merged into one prefixed flat map. */
export interface LoadedLocale {
  code: string;
  files: LocaleFile[];
  /** Merged flat map; namespaced keys carry a `<namespace>:` prefix. */
  flat: FlatMap;
}

/** Result of scanning a locale directory. */
export interface LoadResult {
  dir: string;
  locales: LoadedLocale[];
  layout: "flat" | "namespaced" | "mixed" | "empty";
}

/** Prefix a file's keys with its namespace, if any. */
export function prefixKey(namespace: string | null, key: string): string {
  return namespace ? `${namespace}:${key}` : key;
}

/**
 * Load every supported locale file under `dir`. Pure parsing beyond the `fs`
 * reads — throws if `dir` is missing or holds no readable locale file.
 */
export function loadLocales(dir: string): LoadResult {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    throw new Error(`cannot read locale directory: ${dir}`);
  }

  const files: LocaleFile[] = [];
  let sawFlat = false;
  let sawNamespaced = false;

  for (const entry of entries.sort()) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      const locale = entry;
      let inner: string[];
      try {
        inner = readdirSync(full);
      } catch {
        continue;
      }
      for (const f of inner.sort()) {
        const fmt = formatFromPath(f);
        if (!fmt) continue;
        const path = join(full, f);
        try {
          if (!statSync(path).isFile()) continue;
        } catch {
          continue;
        }
        files.push(readOne(path, locale, basename(f, extname(f)), fmt));
        sawNamespaced = true;
      }
    } else if (st.isFile()) {
      const fmt = formatFromPath(entry);
      if (!fmt) continue;
      files.push(readOne(full, basename(entry, extname(entry)), null, fmt));
      sawFlat = true;
    }
  }

  const byLocale = new Map<string, LocaleFile[]>();
  for (const f of files) {
    const list = byLocale.get(f.locale) ?? [];
    list.push(f);
    byLocale.set(f.locale, list);
  }

  const locales: LoadedLocale[] = [];
  for (const [code, group] of [...byLocale.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const flat: FlatMap = {};
    for (const file of group) {
      for (const [k, v] of Object.entries(file.data)) flat[prefixKey(file.namespace, k)] = v;
    }
    locales.push({ code, files: group, flat });
  }

  if (locales.length === 0) throw new Error(`no JSON/YAML/.properties locale files found in ${dir}`);

  const layout: LoadResult["layout"] =
    sawFlat && sawNamespaced ? "mixed" : sawNamespaced ? "namespaced" : sawFlat ? "flat" : "empty";

  return { dir, locales, layout };
}

function readOne(path: string, locale: string, namespace: string | null, format: FileFormat): LocaleFile {
  const text = readFileSync(path, "utf8");
  const parsed = parseByFormat(text, format);
  return { locale, namespace, path, format, data: flatten(parsed) };
}
