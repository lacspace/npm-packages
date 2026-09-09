# @lacspace/logger

A tiny **structured logger** for Node and the browser — leveled JSON logging, child loggers, field redaction and pluggable transports. Zero dependencies, isomorphic, TypeScript-first.

A log below the active level costs almost nothing: the record object is never even built.

```bash
npm i @lacspace/logger
```

## Quick start

```ts
import { createLogger } from "@lacspace/logger";

const log = createLogger({
  level: "info",
  bindings: { service: "api" },   // added to every line
});

log.info("server started", { port: 3000 });
// {"level":"info","time":1700000000000,"msg":"server started","service":"api","port":3000}

const reqLog = log.child({ reqId: "abc123" });
reqLog.warn("slow query", { ms: 1200 });
// {"level":"warn",...,"service":"api","reqId":"abc123","ms":1200}
```

## Levels

`trace · debug · info · warn · error · fatal` (plus `"silent"`). Set the threshold at
creation or flip it live:

```ts
log.level = "debug";           // now debug+ is emitted
log.isLevelEnabled("trace");   // false
```

## Child loggers

`log.child(bindings)` returns a logger that merges extra fields into every record and
shares the parent's transports — perfect for per-request or per-job context.

## Redaction

Keep secrets out of your logs. Paths support dotted keys and a single-segment wildcard,
and redaction never mutates the object you passed in:

```ts
const log = createLogger({ redact: ["password", "user.token", "*.secret"] });
log.info("login", { password: "hunter2", user: { name: "a", token: "t" } });
// password + user.token become "[redacted]"; the original object is untouched
```

## Transports

A transport is just `(record) => void`. Ship the built-ins or write your own.

```ts
import { createLogger, jsonConsole, prettyConsole, memory } from "@lacspace/logger";

// JSON per line (default) — clean for log aggregators
createLogger({ transports: [jsonConsole()] });

// Human-readable, for local dev
createLogger({ transports: [prettyConsole({ colors: true })] });

// Capture in memory — great for tests or an in-app buffer
const buf = memory();
const log = createLogger({ transports: [buf.transport] });
log.info("hi");
buf.objects(); // [{ level: "info", time, msg: "hi" }]
```

`jsonConsole` and `prettyConsole` route `error`/`fatal` to `console.error`,
`warn` to `console.warn`, and everything else to `console.log`, so severity survives
in any terminal. Errors passed as fields are auto-serialised to `{ name, message, stack }`.

## API

| Export | What |
|---|---|
| `createLogger(options?)` | Build a `Logger`. |
| `Logger` | `.trace/.debug/.info/.warn/.error/.fatal(msg, fields?)`, `.log(level, msg, fields?)`, `.child(bindings)`, `.level` (get/set), `.isLevelEnabled(level)` |
| `jsonConsole({ out?, isoTime? })` | JSON-per-line transport. |
| `prettyConsole({ out?, colors? })` | Human-readable transport. |
| `memory()` | In-memory capture: `{ transport, records, objects(), clear() }`. |
| `serializeError(err)` | Error → `{ name, message, stack }`. |
| `toObject(record)` | Flatten a record to `{ level, time, msg, ...fields }`. |
| `LEVELS` | `{ trace: 10, …, fatal: 60 }` numeric severities. |

Options: `level`, `bindings`, `transports`, `now` (clock override for tests), `redact`, `redactText`.

## Why

- **Zero dependencies** — nothing to audit, tiny install.
- **Isomorphic** — identical API in Node, the browser, edge runtimes and workers.
- **Fast** — level check happens before any object is built.
- **Structured by default** — JSON that a log pipeline can actually parse.

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE). Part of the [@lacspace](https://developer.lacspace.com) developer platform.
