/**
 * A hand-written path matcher for custom routes. Supports:
 *   /users/:id          — named param (single segment)
 *   /files/*            — trailing wildcard (captured as params["*"])
 *   /a/:b/c/*           — a mix
 * Matching is exact on static segments and case-sensitive on the path.
 */

/** Result of a successful match: the captured params (empty object if none). */
export interface MatchResult {
  params: Record<string, string>;
}

/** Split a path into non-empty segments (leading/trailing slashes ignored). */
function segments(path: string): string[] {
  return path.split("/").filter((s) => s.length > 0);
}

/**
 * Match a route `pattern` against a concrete `path`. Returns the captured
 * params, or `null` if the path does not match the pattern.
 */
export function matchPath(pattern: string, path: string): MatchResult | null {
  const pat = segments(pattern);
  const seg = segments(path);
  const params: Record<string, string> = {};

  for (let i = 0; i < pat.length; i++) {
    const p = pat[i]!;
    if (p === "*") {
      // Wildcard swallows the rest of the path (may be empty).
      params["*"] = seg.slice(i).map(decodeSafe).join("/");
      return { params };
    }
    const s = seg[i];
    if (s === undefined) return null;
    if (p.startsWith(":")) {
      params[p.slice(1)] = decodeSafe(s);
    } else if (p !== s) {
      return null;
    }
  }

  // No wildcard consumed the tail, so lengths must match exactly.
  if (seg.length !== pat.length) return null;
  return { params };
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** True if a configured route method matches a request method (`*`/`ANY` = any). */
export function methodMatches(routeMethod: string | undefined, reqMethod: string): boolean {
  if (!routeMethod) return true;
  const m = routeMethod.toUpperCase();
  if (m === "*" || m === "ANY" || m === "ALL") return true;
  return m === reqMethod.toUpperCase();
}
