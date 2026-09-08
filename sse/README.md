# @lacspace/sse

**Real-time updates over Server-Sent Events — zero dependencies, no WebSocket server.**

SSE is the simplest way to push live data to the browser: one long-lived HTTP
response, plain text, and the browser reconnects on its own. This gives you a
**channel/room hub**, a **Web-standard stream** (Next.js / Deno / Bun / edge) *and*
a **Node/Express handler**, plus a typed **browser client** and a **React hook**.

```bash
npm i @lacspace/sse
```

Pairs with [`@lacspace/web-push`](https://developer.lacspace.com/packages/web-push):
push for when the user is away, SSE for when they're on the page.

---

## Server — one shared hub

```ts
import { SSEHub } from "@lacspace/sse";
export const hub = new SSEHub();
hub.startHeartbeat(); // keep proxies from dropping idle connections
```

### Next.js route handler (Web standard)

```ts
import { createSSEStream } from "@lacspace/sse";
import { hub } from "@/lib/hub";

export async function GET() {
  const { response, client } = createSSEStream({ onClose: () => hub.remove(client) });
  hub.add(client, ["room:general"]);
  return response;
}
```

### Express

```ts
import { sseHandler } from "@lacspace/sse";
app.get("/events", (req, res) => {
  const client = sseHandler(res, { onClose: () => hub.remove(client) });
  hub.add(client, ["room:general"]);
});
```

### Push a message from anywhere

```ts
hub.publish("room:general", { event: "message", data: { user: "Ada", text: "hi" } });
hub.broadcast({ event: "notice", data: "Server restarting in 5 min" });
```

## Browser

```ts
import { connectSSE } from "@lacspace/sse/client";

const conn = connectSSE("/events", {
  onEvent: {
    message: (m) => appendChat(m),
    notice: (n) => toast(n),
  },
});
// conn.close() when done
```

## React

```tsx
import { useSSE } from "@lacspace/sse/react";

function Live() {
  const { data, status } = useSSE("/events", {
    onEvent: { message: (m) => setMessages((prev) => [...prev, m]) },
  });
  return <span>{status === "open" ? "🟢 live" : "…"}</span>;
}
```

---

## API

**Server:** `SSEHub` (`add`/`remove`/`join`/`leave`/`publish`/`broadcast`/`size`/`startHeartbeat`),
`createSSEStream()` (Web `Response`), `sseHandler(res)` (Node/Express), `formatSSE(message)`.

**`SSEMessage`:** `{ data, event?, id?, retry? }` — `data` is JSON-stringified unless it's a string.

**Browser (`/client`):** `connectSSE(url, options)`, `isSSESupported()`.
**React (`/react`):** `useSSE(url, options)` → `{ data, status }`.

## When to use SSE vs WebSockets

SSE is server→client only, over plain HTTP, with built-in reconnect — perfect for
notifications, live feeds, progress and dashboards. If you need high-rate
*client→server* messaging (chat typing, multiplayer input), reach for WebSockets.

## License

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE).
