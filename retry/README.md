<div align="center">

# @lacspace/retry

**Resilience for flaky calls — retry with exponential backoff & jitter, timeouts, and a circuit breaker.**

[![npm version](https://img.shields.io/npm/v/@lacspace/retry?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/retry)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/retry?label=minzip)](https://bundlephobia.com/package/@lacspace/retry)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/retry)
[![license](https://img.shields.io/npm/l/@lacspace/retry?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Networks fail, APIs rate-limit, databases hiccup. The three tools you reach for — **retry**, **timeout** and **circuit breaker** — in one tiny, dependency-free, isomorphic package. Wrap any fetch / DB / queue call.

- 🔁 `retry()` — exponential backoff + full jitter, `shouldRetry`, `onRetry`, AbortSignal
- ⏱️ `withTimeout()` — reject slow calls (and cancel them via AbortSignal)
- 🔌 `CircuitBreaker` — fail fast while a dependency is down, then recover
- 📈 `backoff()` — the delay formula, exposed

## Install

```bash
npm install @lacspace/retry      # or pnpm add / yarn add / bun add
```

## Retry

```ts
import { retry } from "@lacspace/retry";

const data = await retry(() => fetch(url).then((r) => r.json()), {
  retries: 4,
  minDelay: 300,
  shouldRetry: (err) => isTransient(err),   // don't retry 4xx
  onRetry: (err, attempt, delay) => log.warn(`retry ${attempt} in ${delay}ms`),
});
```

## Timeout

```ts
import { withTimeout, retryWithTimeout } from "@lacspace/retry";

await withTimeout((signal) => fetch(url, { signal }), 5000);       // TimeoutError after 5s
await retryWithTimeout((signal) => fetch(url, { signal }), 5000, { retries: 3 });
```

## Circuit breaker

```ts
import { CircuitBreaker } from "@lacspace/retry";

const breaker = new CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 30_000 });

await breaker.run(() => callFlakyService());
// after 5 straight failures the circuit "opens" and fails fast (CircuitOpenError)
// for 30s, then allows a trial call before closing again.
```

## API

| Export | Description |
| --- | --- |
| `retry(fn, opts)` | retry with backoff + jitter |
| `withTimeout(fn, ms)` · `retryWithTimeout(fn, ms, opts)` | per-call timeout |
| `backoff(attempt, opts)` | compute the delay |
| `CircuitBreaker` | fail-fast breaker with half-open recovery |
| `TimeoutError` · `CircuitOpenError` | typed errors |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial**, **Client-specific** and **Private** packages under separate terms — see the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

---

<div align="center">

**Part of the Lacspace ecosystem — zero-dependency, isomorphic TypeScript packages.**

[All packages ↗](https://lacspace.com/packages) · [npm org ↗](https://www.npmjs.com/org/lacspace) · [Licence Centre ↗](https://lacspace.com/licenses) · [GitHub ↗](https://github.com/lacspace/npm-packages)

</div>

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
