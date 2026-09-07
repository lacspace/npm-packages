import { describe, it, expect } from "vitest";
import {
  auditEvent,
  createChain,
  verifyChain,
  pruneChain,
  verifyChainSegment,
  GENESIS_HASH,
  type AuditEvent,
  type SealedEntry,
} from "./index";

const at = (d: string) => `2026-02-${d}T00:00:00.000Z`;
const ev = (action: string, when: string): AuditEvent =>
  auditEvent({ actor: { id: "alice" }, action, at: when });

async function chainOf5() {
  return createChain([
    ev("a", at("01")),
    ev("b", at("02")),
    ev("c", at("03")),
    ev("d", at("04")),
    ev("e", at("05")),
  ]);
}

describe("pruneChain", () => {
  it("keeps the last N entries and reports how many were dropped", async () => {
    const chain = await chainOf5();
    const { entries, dropped, checkpoint } = pruneChain(chain, { keepLast: 2 });
    expect(entries.map((e) => e.event.action)).toEqual(["d", "e"]);
    expect(dropped).toBe(3);
    expect(checkpoint.seq).toBe(3);
    expect(checkpoint.prevHash).toBe(chain[2]!.hash);
  });

  it("does not mutate the input chain", async () => {
    const chain = await chainOf5();
    const snapshot = JSON.stringify(chain);
    pruneChain(chain, { keepLast: 1 });
    expect(JSON.stringify(chain)).toBe(snapshot);
  });

  it("keepLast >= length drops nothing and anchors at genesis", async () => {
    const chain = await chainOf5();
    const { entries, dropped, checkpoint } = pruneChain(chain, { keepLast: 10 });
    expect(entries).toHaveLength(5);
    expect(dropped).toBe(0);
    expect(checkpoint).toEqual({ seq: 0, prevHash: GENESIS_HASH });
  });

  it("prunes entries strictly before a time cutoff", async () => {
    const chain = await chainOf5();
    const { entries, dropped } = pruneChain(chain, { before: at("03") });
    expect(entries.map((e) => e.event.action)).toEqual(["c", "d", "e"]);
    expect(dropped).toBe(2);
  });

  it("applies the strictest of multiple bounds", async () => {
    const chain = await chainOf5();
    // before(04) would drop 3; keepLast:1 would drop 4 → the larger cut wins
    const { dropped, entries } = pruneChain(chain, { before: at("04"), keepLast: 1 });
    expect(dropped).toBe(4);
    expect(entries.map((e) => e.event.action)).toEqual(["e"]);
  });
});

describe("verifyChainSegment", () => {
  it("verifies a pruned tail against its checkpoint", async () => {
    const chain = await chainOf5();
    const pruned = pruneChain(chain, { keepLast: 2 });
    const v = await verifyChainSegment(pruned.entries, pruned.checkpoint);
    expect(v).toEqual({ valid: true, length: 2 });
  });

  it("plain verifyChain (correctly) rejects a pruned segment — documents the implication", async () => {
    const chain = await chainOf5();
    const pruned = pruneChain(chain, { keepLast: 2 });
    const v = await verifyChain(pruned.entries);
    expect(v.valid).toBe(false);
    expect(v.brokenAt).toBe(0); // seq no longer starts at 0
  });

  it("detects a tampered event inside a pruned segment", async () => {
    const chain = await chainOf5();
    const pruned = pruneChain(chain, { keepLast: 3 });
    const tampered: SealedEntry[] = pruned.entries.map((e, i) =>
      i === 1 ? { ...e, event: { ...e.event, action: "forged" } } : e,
    );
    const v = await verifyChainSegment(tampered, pruned.checkpoint);
    expect(v.valid).toBe(false);
    expect(v.brokenAt).toBe(pruned.checkpoint.seq + 1); // absolute seq
    expect(v.reason).toMatch(/hash mismatch/i);
  });

  it("detects a wrong checkpoint anchor", async () => {
    const chain = await chainOf5();
    const pruned = pruneChain(chain, { keepLast: 2 });
    const v = await verifyChainSegment(pruned.entries, { seq: pruned.checkpoint.seq, prevHash: "0".repeat(64) });
    expect(v.valid).toBe(false);
    expect(v.brokenAt).toBe(pruned.checkpoint.seq);
    expect(v.reason).toMatch(/prevHash|anchor/i);
  });

  it("an empty segment is valid; a no-op prune segment matches verifyChain", async () => {
    expect(await verifyChainSegment([], { seq: 0, prevHash: GENESIS_HASH })).toEqual({ valid: true, length: 0 });
    const chain = await chainOf5();
    const pruned = pruneChain(chain, { keepLast: 99 });
    const v = await verifyChainSegment(pruned.entries, pruned.checkpoint);
    expect(v.valid).toBe(true);
    expect(v.length).toBe(5);
  });
});
