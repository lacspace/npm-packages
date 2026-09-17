/**
 * Splitting a result set into per-place or per-category files.
 *
 * A Google listing has an address, not a tidy "city" column, so a lead is
 * assigned to the first city (or area) you actually asked for whose name shows
 * up in its address. Anything that matches nothing lands in "other" rather than
 * being dropped — a sweep should never lose a lead to bookkeeping.
 */
import type { Lead } from "./types.js";

/** What to split a result set by. */
export type SplitKey = "city" | "area" | "type";

/** The split keys a user may pass. */
export const SPLIT_KEYS: readonly SplitKey[] = ["city", "area", "type"];

/** True when `name` appears in `address` as a whole word, case-insensitively. Pure. */
export function addressMentions(address: string | undefined, name: string): boolean {
  const hay = (address ?? "").toLowerCase();
  const needle = name.trim().toLowerCase();
  if (!hay || !needle) return false;
  const at = hay.indexOf(needle);
  if (at === -1) return false;
  const before = at === 0 ? "" : hay[at - 1]!;
  const after = hay[at + needle.length] ?? "";
  const boundary = (ch: string): boolean => ch === "" || !/[a-z0-9]/.test(ch);
  return boundary(before) && boundary(after);
}

/**
 * Group leads for `--split`. For "type" the lead's own category is the group;
 * for "city"/"area" it is the first requested place named in the address.
 * Groups come back largest-first, with "other" always last. Pure.
 */
export function groupLeads(
  leads: readonly Lead[],
  key: SplitKey,
  requested: readonly string[] = [],
): Map<string, Lead[]> {
  const places = requested.map((p) => p.trim()).filter(Boolean);
  const groupOf = (lead: Lead): string => {
    if (key === "type") return (lead.category ?? "").trim() || "other";
    const hit = places.find((p) => addressMentions(lead.address, p));
    return hit ?? "other";
  };

  const groups = new Map<string, Lead[]>();
  for (const lead of leads) {
    const g = groupOf(lead);
    const bucket = groups.get(g);
    if (bucket) bucket.push(lead);
    else groups.set(g, [lead]);
  }

  return new Map(
    [...groups].sort((a, b) => {
      if (a[0] === "other") return 1;
      if (b[0] === "other") return -1;
      return b[1].length - a[1].length;
    }),
  );
}

/** A filesystem-safe slug for a group name. Pure. */
export function groupSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "other";
}
