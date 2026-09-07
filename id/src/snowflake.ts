import { getRandom } from "./random";

/**
 * Snowflake — a 64-bit, time-sortable numeric id (returned as a decimal string
 * so it survives JSON without precision loss). Layout, from the high bits:
 * 41-bit millisecond timestamp (relative to an epoch) · 10-bit machine id ·
 * 12-bit per-ms sequence. Injectable epoch / machine id / clock.
 */

/** Options for {@link snowflakeFactory}. */
export interface SnowflakeOptions {
  /** Custom epoch in ms (ids encode `now - epoch`). Default 2025-01-01T00:00:00Z. */
  epoch?: number;
  /** Machine / shard id, 0..1023. Default: a random 10-bit value. */
  machineId?: number;
  /** Injectable clock returning ms. Default `Date.now`. */
  now?: () => number;
}

/** Default epoch: 2025-01-01T00:00:00.000Z. */
export const SNOWFLAKE_DEFAULT_EPOCH = 1735689600000;

/**
 * Build a snowflake generator. The returned function yields monotonically
 * increasing ids: within one millisecond the 12-bit sequence increments, and if
 * it overflows the generator waits for the next millisecond.
 */
export function snowflakeFactory(options: SnowflakeOptions = {}): () => string {
  const epoch = options.epoch ?? SNOWFLAKE_DEFAULT_EPOCH;
  if (!Number.isInteger(epoch) || epoch < 0) {
    throw new Error("snowflake: `epoch` must be a non-negative integer (ms).");
  }
  let machine = options.machineId;
  if (machine === undefined) {
    const rb = getRandom(new Uint8Array(2));
    machine = ((rb[0]! << 8) | rb[1]!) & 0x3ff; // random 10-bit
  }
  if (!Number.isInteger(machine) || machine < 0 || machine > 1023) {
    throw new Error("snowflake: `machineId` must be an integer in [0, 1023].");
  }
  const machineBits = BigInt(machine) << 12n;
  const clock = options.now ?? Date.now;
  let lastTime = -1;
  let seq = 0;
  return function next(): string {
    let t = Math.floor(clock());
    if (t < lastTime) t = lastTime; // never emit a smaller timestamp
    if (t === lastTime) {
      seq = (seq + 1) & 0xfff;
      if (seq === 0) {
        // Sequence exhausted this ms → spin until the clock advances.
        do {
          t = Math.floor(clock());
        } while (t <= lastTime);
      }
    } else {
      seq = 0;
    }
    lastTime = t;
    const value = (BigInt(t - epoch) << 22n) | machineBits | BigInt(seq);
    return value.toString();
  };
}

let defaultFactory: (() => string) | null = null;

/** Generate a snowflake id using a shared default generator (random machine id). */
export function snowflake(): string {
  if (!defaultFactory) defaultFactory = snowflakeFactory();
  return defaultFactory();
}

/**
 * Extract the timestamp (ms since the Unix epoch) embedded in a snowflake id.
 * Pass the same `epoch` the id was generated with (defaults to
 * {@link SNOWFLAKE_DEFAULT_EPOCH}).
 */
export function snowflakeTime(id: string, epoch: number = SNOWFLAKE_DEFAULT_EPOCH): number {
  return Number((BigInt(id) >> 22n) + BigInt(epoch));
}

/** Is this a plausible 64-bit unsigned snowflake (a decimal string that fits)? */
export function isSnowflake(s: string): boolean {
  if (typeof s !== "string" || !/^\d{1,20}$/.test(s)) return false;
  try {
    const v = BigInt(s);
    return v >= 0n && v < 1n << 64n;
  } catch {
    return false;
  }
}
