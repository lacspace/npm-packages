/**
 * Local `$ref` (JSON Pointer) resolution shared by the codegen, example,
 * validation and Zod engines. Pure and dependency-free — resolves only local
 * `#/...` pointers (e.g. `#/definitions/X`, `#/$defs/X`,
 * `#/components/schemas/X`); remote/URL refs are out of scope.
 */
import type { JSONSchema } from "./types.js";

/** Decode a single JSON Pointer segment (`~1` -> `/`, `~0` -> `~`). */
function decodeSegment(seg: string): string {
  return decodeURIComponent(seg).replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * Resolve a local `#/...` JSON Pointer against `root`, returning the target
 * schema object or `null` when it does not point at one.
 */
export function resolveRef(root: JSONSchema, ref: string): JSONSchema | null {
  if (typeof ref !== "string" || !ref.startsWith("#")) return null;
  const path = ref.slice(1).replace(/^\//, "");
  if (path === "") return root;
  const segs = path.split("/").map(decodeSegment);
  let cur: unknown = root;
  for (const seg of segs) {
    if (cur == null || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur && typeof cur === "object" ? (cur as JSONSchema) : null;
}

/** The last, human-meaningful segment of a `$ref` — a good name hint. */
export function refName(ref: string): string {
  const segs = ref.split("/");
  const last = segs[segs.length - 1];
  return last ? decodeSegment(last) : "Ref";
}
