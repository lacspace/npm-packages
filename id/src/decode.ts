import { isUlid, ulidTime } from "./ulid";

/**
 * Unified timestamp extraction for the time-sortable id formats.
 * Works for ULID and UUID v7. Snowflake ids need their epoch to decode — use
 * `snowflakeTime(id, epoch)` for those.
 */

const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Extract the creation timestamp (ms since the Unix epoch) embedded in a
 * time-sortable id (ULID or UUID v7). Throws for other formats.
 */
export function decodeTime(id: string): number {
  if (typeof id === "string") {
    if (isUlid(id)) return ulidTime(id);
    if (UUID_V7_RE.test(id)) return parseInt(id.replace(/-/g, "").slice(0, 12), 16);
  }
  throw new Error("decodeTime: unsupported id (expected ULID or UUID v7).");
}
