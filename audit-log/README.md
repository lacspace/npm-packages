# @lacspace/audit-log

Structured audit-trail toolkit — record **who did what, when**, with before/after diffs, actor attribution and field-level redaction. Build tamper-evident activity logs for orders, users, settings and anything else you need to answer "who changed this?".

- **Zero runtime dependencies**
- **Isomorphic** — Node, edge runtimes and browsers
- **TypeScript-first**, strict types
- Random ids via `globalThis.crypto` with a `Math.random` fallback

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

### `createAuditor({ sink?, redact? }): { record(input) }`

Returns an auditor that builds each event, applies `redact` keys, forwards it to `sink`, and returns it.

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
  actor: { id: string; type?: string; ip?: string };
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

`@lacspace/audit-log` is part of **63+ zero-dependency, isomorphic TypeScript packages**. Explore the ecosystem:

- 🗂️ **All packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
