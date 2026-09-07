/**
 * Allowlist / denylist for lockout keys.
 *
 * Pure, synchronous, storage-agnostic checks that sit in front of the lockout
 * logic: allowlisted keys are trusted infrastructure (health-checkers, office
 * IPs, service accounts) that must NEVER be locked; denylisted keys are known-bad
 * (leaked credentials, abusive IPs) that are ALWAYS treated as locked. Exact-match
 * sets plus optional predicate matchers for ranges/patterns — no runtime deps.
 */

/** How a key was classified by the lists. */
export type ListDecision = "allow" | "deny" | "none";

export interface KeyListsOptions {
  /** Keys that are always allowed (never locked). */
  allow?: Iterable<string>;
  /** Keys that are always denied (treated as locked). */
  deny?: Iterable<string>;
  /** Optional predicate for allow (e.g. CIDR/prefix/pattern matches). */
  allowMatch?: (key: string) => boolean;
  /** Optional predicate for deny. */
  denyMatch?: (key: string) => boolean;
  /**
   * When a key matches BOTH lists, who wins. Default `"allow"` — an explicit
   * trust decision overrides a broad deny rule (e.g. an allowlisted office IP
   * that also falls inside a denied range).
   */
  conflict?: "allow" | "deny";
}

/**
 * A pair of key lists with pure `isAllowed` / `isDenied` / `decide` checks.
 * Holds no lock state — combine it with {@link Lockout} in your auth flow:
 * short-circuit to "allowed" for allowlisted keys and to "locked" for denylisted
 * keys before you ever touch the store.
 */
export class KeyLists {
  private allow: Set<string>;
  private deny: Set<string>;
  private allowMatch?: (key: string) => boolean;
  private denyMatch?: (key: string) => boolean;
  private conflict: "allow" | "deny";

  constructor(opts: KeyListsOptions = {}) {
    this.allow = new Set(opts.allow ?? []);
    this.deny = new Set(opts.deny ?? []);
    this.allowMatch = opts.allowMatch;
    this.denyMatch = opts.denyMatch;
    this.conflict = opts.conflict ?? "allow";
  }

  /** True if the key is on the allowlist (exact or predicate). */
  isAllowed(key: string): boolean {
    return this.allow.has(key) || (this.allowMatch?.(key) ?? false);
  }

  /** True if the key is on the denylist (exact or predicate). */
  isDenied(key: string): boolean {
    return this.deny.has(key) || (this.denyMatch?.(key) ?? false);
  }

  /**
   * Classify a key. On a both-lists conflict the configured `conflict` winner is
   * returned (default `"allow"`).
   */
  decide(key: string): ListDecision {
    const allowed = this.isAllowed(key);
    const denied = this.isDenied(key);
    if (allowed && denied) return this.conflict;
    if (allowed) return "allow";
    if (denied) return "deny";
    return "none";
  }

  /** Add a key to the allowlist (chainable). */
  addAllow(key: string): this {
    this.allow.add(key);
    return this;
  }

  /** Add a key to the denylist (chainable). */
  addDeny(key: string): this {
    this.deny.add(key);
    return this;
  }
}

export function keyLists(opts?: KeyListsOptions): KeyLists {
  return new KeyLists(opts);
}
