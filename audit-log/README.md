# @lacspace/audit-log

Structured audit-trail toolkit — record **who did what, when**, with before/after diffs, actor attribution and field-level redaction. Build tamper-evident activity logs for orders, users, settings and anything else you need to answer "who changed this?".

- **Zero runtime dependencies**
- **Isomorphic** — Node, edge runtimes and browsers
- **TypeScript-first**, strict types
- Random ids via `globalThis.crypto` with a `Math.random` fallback

> **New in 1.2.0** — query & filter a trail by actor/action/target/time-range, export to **NDJSON/JSON** (round-trips), **retention pruning** for hash chains with a verifiable checkpoint, an **injectable clock + id** on `createAuditor`, and an optional `actor.userAgent`. All additive — every existing export is unchanged.

```bash
npm install @lacspace/audit-log
```

## Quick start

```ts
import { createAuditor, diff, formatEvent } from "@lacspace/audit-log";

const auditor = createAuditor({
  sink: (e) => console.log(formatEvent(e)),
  redact: ["password", "token"],
});

const before = { status: "pending", note: "" };
const after = { status: "paid", note: "thanks" };

auditor.record({
  actor: { id: "alice", type: "user", ip: "203.0.113.7" },
  action: "updated",
  target: { type: "order", id: "42" },
  changes: diff(before, after),
});
// → alice updated order#42 (status: pending→paid, note: →thanks)
```

## API

### `auditEvent(input): AuditEvent`

Builds a complete event, filling a random `id` and current ISO `at` when omitted.

```ts
const e = auditEvent({ actor: { id: "alice" }, action: "login" });
// { id: "…", at: "2026-…Z", actor: { id: "alice" }, action: "login" }
```

### `diff(before, after): { field, from, to }[]`

Shallow diff — one entry per changed key, including **added** (`from: undefined`) and **removed** (`to: undefined`) keys.

```ts
diff({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 });
// [ { field: "b", from: 2, to: 3 }, { field: "c", from: undefined, to: 4 } ]
```

### `redactEvent(event, keys): AuditEvent`

Returns a copy with matching `changes[].from` / `changes[].to` values and `meta` fields replaced by `"[REDACTED]"`. Never mutates the original.

### `formatEvent(event): string`

Renders a human-readable one-liner, e.g. `"alice updated order#42 (status: pending→paid)"`.

### `createAuditor({ sink?, redact?, now?, id? }): { record(input) }`

Returns an auditor that builds each event, applies `redact` keys, forwards it to `sink`, and returns it. Pass `now: () => Date | string` to inject a clock (great for deterministic tests or a trusted server clock) and `id: () => string` to inject an id generator. A caller-supplied `id`/`at` on `record(...)` always wins over the injected ones.

```ts
let n = 0;
const auditor = createAuditor({
  now: () => new Date("2026-03-01T12:00:00Z"),
  id: () => `evt-${++n}`,
});
auditor.record({ actor: { id: "alice" }, action: "login" });
// { id: "evt-1", at: "2026-03-01T12:00:00.000Z", … }
```

## Query, filter & export

Filter a trail by actor / action / target / time-range (fields are ANDed; a list matches any of its values) and export to NDJSON or JSON. All synchronous, pure and isomorphic.

```ts
import { filterEvents, toNDJSON, parseNDJSON } from "@lacspace/audit-log";

const recent = filterEvents(events, {
  actor: ["alice", "bob"],
  action: "updated",
  targetType: "order",
  from: "2026-01-01T00:00:00Z",
  to: Date.now(),
});

const file = toNDJSON(recent);        // one compact JSON object per line
const back = parseNDJSON(file);       // round-trips (blank lines skipped)
```

| Function | Purpose |
| --- | --- |
| `filterEvents(events, query?)` | New array of events matching an `AuditQuery` (empty query = all). |
| `matchesQuery(event, query)` | Test a single event against a query. |
| `toNDJSON(records)` / `parseNDJSON(text)` | Newline-delimited JSON export / import (round-trips). |
| `toJSON(records, pretty?)` | JSON-array export (compact or indented). |

`AuditQuery`: `{ actor?, actorType?, action?, targetType?, targetId? }` (each a value or list), `{ from?, to? }` (inclusive time range as ISO / epoch-ms / `Date`), and `{ where?: (e) => boolean }` for anything else.

## Retention / pruning a hash chain

A sealed chain proves its integrity by re-linking from `GENESIS_HASH` at seq 0 — so you can't just delete old entries and re-`verifyChain` the rest. `pruneChain` drops the front and hands back the retained tail **plus a `checkpoint`** (the `seq` + `prevHash` it hangs from). Persist that checkpoint and verify the tail with `verifyChainSegment` — the dropped entries are gone, but the checkpoint still cryptographically ties the survivors to the history before them.

```ts
import { pruneChain, verifyChainSegment } from "@lacspace/audit-log";

const { entries, checkpoint, dropped } = pruneChain(chain, { keepLast: 1000 });
// or: pruneChain(chain, { before: "2026-01-01T00:00:00Z" })

await verifyChainSegment(entries, checkpoint); // { valid: true, length: … }
```

| Function | Purpose |
| --- | --- |
| `pruneChain(chain, { keepLast?, before? })` | Drop old front entries; returns `{ entries, checkpoint, dropped }`. |
| `verifyChainSegment(entries, checkpoint)` | Verify a pruned tail against its checkpoint (async; `brokenAt` is absolute seq). |

## Tamper-evident hash chain

Seal events into an append-only chain where each entry's `hash` is `SHA-256(seq : prevHash : canonicalJSON(event))` and links to the one before it. Any change to a past event — or any reorder, insertion or deletion — breaks the chain, and `verifyChain` tells you exactly where. Uses Web Crypto, so these functions are **async** (Node 20+, edge, modern browsers).

```ts
import { createSealedLog, verifyChain } from "@lacspace/audit-log";

const log = createSealedLog();
await log.append(auditEvent({ actor: { id: "alice" }, action: "login" }));
await log.append(auditEvent({ actor: { id: "alice" }, action: "delete", target: { type: "order", id: "42" } }));

await log.verify();        // { valid: true, length: 2 }
log.head();                // hash of the last entry — anchor it somewhere trusted

// If anyone edits a stored entry and you re-verify:
// { valid: false, length: 2, brokenAt: 0, reason: "hash mismatch — this entry was tampered with" }
```

Persist `log.entries()` however you like and reload with `createSealedLog(saved)` to keep appending. Prefer the pure functions? `createChain(events)`, `appendToChain(chain, event)`, `sealEvent(event, prev?)` and `verifyChain(chain)` all return/verify plain arrays.

| Function | Purpose |
| --- | --- |
| `sealEvent(event, prev?)` | Seal one event, linking it after `prev` (omit for the first). |
| `appendToChain(chain, event)` | Return a **new** chain with the event sealed and appended. |
| `createChain(events?)` | Build a sealed chain from a list of events. |
| `verifyChain(chain)` | Recompute + re-link every entry; report the first fault. |
| `createSealedLog(initial?)` | Stateful append-only log: `append` / `entries` / `head` / `verify`. |
| `GENESIS_HASH` | The `prevHash` anchor of a chain's first entry. |

## Types

```ts
interface AuditEvent {
  id: string;
  at: string; // ISO-8601
  actor: { id: string; type?: string; ip?: string; userAgent?: string };
  action: string;
  target?: { type: string; id: string };
  changes?: { field: string; from: unknown; to: unknown }[];
  meta?: Record<string, unknown>;
}

interface SealedEntry {
  seq: number;       // 0-based position
  event: AuditEvent;
  prevHash: string;  // links to the previous entry (GENESIS_HASH for the first)
  hash: string;      // SHA-256(seq : prevHash : canonicalJSON(event))
}

interface ChainVerification {
  valid: boolean;
  length: number;
  brokenAt?: number; // index of the first bad entry
  reason?: string;
}
```

---

## The Lacspace Developer Platform

`@lacspace/audit-log` is part of **80+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
