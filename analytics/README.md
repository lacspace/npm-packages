# @lacspace/analytics

Event tracking for Lacspace platforms, built on [`@lacspace/api`](https://www.npmjs.com/package/@lacspace/api). Send events immediately, or queue and flush them in a single batch.

Isomorphic, dual **ESM + CJS**, fully typed.

## Install

```bash
npm install @lacspace/analytics
```

## Usage

```ts
import { LacspaceAnalytics } from "@lacspace/analytics";

const analytics = new LacspaceAnalytics({ baseURL: "https://api.lacspace.com/api" });

// Fire immediately
await analytics.track("product_viewed", { id: "abc-123" });

// Or queue and flush in one batch
analytics.queueEvent("scroll", { depth: 0.5 });
analytics.queueEvent("add_to_cart", { id: "abc-123" });
await analytics.flush();
```

## License

MIT © Lacspace
