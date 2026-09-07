/**
 * Retention / pruning for tamper-evident hash chains.
 *
 * A sealed chain proves it has not been altered by re-linking every entry from
 * {@link GENESIS_HASH} at `seq` 0. That is exactly why you cannot simply delete
 * old entries and still call {@link verifyChain} on the result: the first
 * retained entry no longer starts at seq 0, and its `prevHash` no longer points
 * at the genesis anchor — {@link verifyChain} (correctly) reports the gap.
 *
 * {@link pruneChain} therefore returns the retained tail together with a
 * {@link ChainCheckpoint} — the `seq` and `prevHash` the retained segment
 * hangs from. Persist that checkpoint (it is a hash you should already have
 * anchored somewhere trusted) and verify the pruned tail with
 * {@link verifyChainSegment}. The dropped entries are gone for good; the
 * checkpoint is what still cryptographically ties the surviving tail to the
 * history that came before it.
 */

import { GENESIS_HASH, sealEvent } from "./index";
import type { AuditEvent, ChainVerification, SealedEntry } from "./index";
import type { TimeInput } from "./query";

/** The anchor a pruned chain segment hangs from. */
export interface ChainCheckpoint {
  /** `seq` of the first retained entry (0 when nothing was dropped). */
  seq: number;
  /** `prevHash` of the first retained entry — the hash of the last dropped entry, or {@link GENESIS_HASH}. */
  prevHash: string;
}

/** The result of {@link pruneChain}. */
export interface PrunedChain {
  /** The retained tail of the chain (a new array; the input is not mutated). */
  entries: SealedEntry[];
  /** The anchor to verify {@link entries} against, via {@link verifyChainSegment}. */
  checkpoint: ChainCheckpoint;
  /** How many entries were dropped from the front. */
  dropped: number;
}

/** Options for {@link pruneChain}. At least one bound should be given. */
export interface PruneOptions {
  /** Keep at most this many of the most recent entries. */
  keepLast?: number;
  /** Drop entries whose event `at` is strictly before this instant. */
  before?: TimeInput;
}

function toMs(t: TimeInput): number {
  if (t instanceof Date) return t.getTime();
  if (typeof t === "number") return t;
  return Date.parse(t);
}

/**
 * Compute how many leading entries to drop so that the retained tail satisfies
 * every supplied bound. Bounds are ANDed: the strictest (largest) cut wins.
 */
function cutIndex(chain: readonly SealedEntry[], opts: PruneOptions): number {
  let cut = 0;
  if (typeof opts.keepLast === "number") {
    cut = Math.max(cut, Math.max(0, chain.length - Math.max(0, Math.floor(opts.keepLast))));
  }
  if (opts.before !== undefined) {
    const cutoff = toMs(opts.before);
    let byTime = 0;
    while (byTime < chain.length && Date.parse((chain[byTime] as SealedEntry).event.at) < cutoff) {
      byTime++;
    }
    cut = Math.max(cut, byTime);
  }
  return Math.min(cut, chain.length);
}

/**
 * Prune old entries off the FRONT of a sealed chain, keeping the recent tail
 * and a {@link ChainCheckpoint} that lets you still verify what remains. Never
 * mutates the input. Read this module's docblock for the chain implications.
 */
export function pruneChain(chain: readonly SealedEntry[], opts: PruneOptions): PrunedChain {
  const cut = cutIndex(chain, opts);
  const entries = chain.slice(cut);
  const first = entries[0];
  const checkpoint: ChainCheckpoint = first
    ? { seq: first.seq, prevHash: first.prevHash }
    : {
        seq: chain.length,
        prevHash: chain.length > 0 ? (chain[chain.length - 1] as SealedEntry).hash : GENESIS_HASH,
      };
  return { entries, checkpoint, dropped: cut };
}

/** A throwaway event used only to carry `seq`/`hash` into {@link sealEvent}. */
const ANCHOR_EVENT: AuditEvent = { id: "", at: "", actor: { id: "" }, action: "" };

/**
 * Verify a pruned chain segment against the {@link ChainCheckpoint} it hangs
 * from — the same integrity check as {@link verifyChain}, but starting the
 * expected `seq` and `prevHash` from the checkpoint instead of the genesis
 * anchor. Re-seals every entry (via the public {@link sealEvent}) so a mutated
 * event, a forged hash, or a reordered/deleted entry is still caught.
 * `brokenAt` is the absolute `seq` of the first bad entry.
 *
 * A segment produced by {@link pruneChain} from a valid chain verifies here.
 */
export async function verifyChainSegment(
  chain: readonly SealedEntry[],
  checkpoint: ChainCheckpoint,
): Promise<ChainVerification> {
  const length = chain.length;
  if (length === 0) return { valid: true, length: 0 };

  // A synthetic predecessor so sealEvent(event, prev) yields the checkpoint's
  // seq/prevHash for the first entry. sealEvent only reads prev.seq + prev.hash.
  let prev: SealedEntry = {
    seq: checkpoint.seq - 1,
    event: ANCHOR_EVENT,
    prevHash: GENESIS_HASH,
    hash: checkpoint.prevHash,
  };

  for (let i = 0; i < length; i++) {
    const entry = chain[i] as SealedEntry;
    const expectedSeq = checkpoint.seq + i;
    if (entry.seq !== expectedSeq) {
      return { valid: false, length, brokenAt: expectedSeq, reason: `seq mismatch: expected ${expectedSeq}, got ${entry.seq}` };
    }
    const resealed = await sealEvent(entry.event, prev);
    if (entry.prevHash !== resealed.prevHash) {
      return { valid: false, length, brokenAt: entry.seq, reason: "prevHash does not match (wrong anchor, reordered or deleted)" };
    }
    if (entry.hash !== resealed.hash) {
      return { valid: false, length, brokenAt: entry.seq, reason: "hash mismatch — this entry was tampered with" };
    }
    prev = entry;
  }
  return { valid: true, length };
}
