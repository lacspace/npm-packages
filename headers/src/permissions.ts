/**
 * Typed Permissions-Policy builder.
 *
 * Permissions-Policy controls which browser features (camera, microphone,
 * geolocation, …) a document and its embedded frames may use.
 *
 *   permissionsPolicy({ camera: false, geolocation: "self", microphone: ["self", "https://meet.example.com"] })
 *   // => "camera=(), geolocation=(self), microphone=(self \"https://meet.example.com\")"
 */

/**
 * An allowlist for one Permissions-Policy feature:
 * - `false` / `"none"` / `[]` → `()` (feature disabled everywhere)
 * - `true`  / `"*"`           → `*`  (allowed in all contexts)
 * - `"self"`                  → `(self)`
 * - a single origin string    → `("https://…")`
 * - an array of tokens/origins → `(self "https://…")`
 */
export type PermissionsAllowlist = string[] | string | boolean;

/** Map of Permissions-Policy feature → allowlist. Keys may be camelCase or kebab-case. */
export type PermissionsPolicyDirectives = Record<string, PermissionsAllowlist>;

function serializeToken(token: string): string {
  if (token === "*" || token === "self" || token === "src") return token;
  if (/^".*"$/.test(token)) return token; // already quoted
  return `"${token}"`;
}

function serializeAllowlist(value: PermissionsAllowlist): string {
  if (value === false || value === "none") return "()";
  if (value === true || value === "*") return "*";
  const list = Array.isArray(value) ? value : [value];
  if (list.length === 0) return "()";
  return `(${list.map(serializeToken).join(" ")})`;
}

/** Build a `Permissions-Policy` header value from typed feature directives. */
export function permissionsPolicy(directives: PermissionsPolicyDirectives): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(directives)) {
    const name = key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
    parts.push(`${name}=${serializeAllowlist(value)}`);
  }
  return parts.join(", ");
}
