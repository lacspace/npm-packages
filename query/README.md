# @lacspace/query

**Tiny data fetching for React — a shared cache, request de-duplication, stale-while-revalidate, focus/reconnect revalidation, polling, and mutations. `useQuery` + `useMutation` in ~2KB. Zero dependencies, SSR-safe, fully typed. An SWR-lite.**

## Install

```bash
npm i @lacspace/query
```

React `>=18` is a peer dependency. There are no other dependencies.

## Usage

### `useQuery` — the basics

```tsx
import { useQuery } from "@lacspace/query";

function Profile() {
  const { data, error, isLoading } = useQuery(
    "/api/me",
    (url) => fetch(url as string).then((r) => r.json())
  );

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p>Something went wrong.</p>;
  return <h1>Hi, {data.name}</h1>;
}
```

Any two components using the same key **share** the cache, **de-dupe** in-flight
requests, and re-render **together**.

### Array keys

Keys can be arrays — they're serialized to a stable string (object properties are
sorted, so key order never matters). The original key is handed to your fetcher:

```tsx
const { data } = useQuery(
  ["user", id, { include: "posts" }],
  ([, uid]) => fetch(`/api/users/${uid}?include=posts`).then((r) => r.json()),
  { staleTime: 30_000, refetchInterval: 60_000 }
);
```

### Disabling a query

A `null` or `false` key (or `enabled: false`) turns the query off — handy for
dependent queries. Hooks are still called unconditionally, so this is rules-safe:

```tsx
const { data: user } = useQuery(session ? ["user", session.id] : null, fetchUser);
```

### `useMutation` + updating the cache

Use `setQueryData` for optimistic edits, or `mutate` to revalidate a key. Both work
from anywhere — inside or outside React.

```tsx
import { useMutation, setQueryData, mutate } from "@lacspace/query";

function AddTodo() {
  const { mutate: addTodo, isPending } = useMutation(
    (title: string) =>
      fetch("/api/todos", { method: "POST", body: title }).then((r) => r.json()),
    {
      // optimistic append, then confirm with a background revalidation
      onSuccess: (todo) => {
        setQueryData<Todo[]>("todos", (prev) => [...(prev ?? []), todo]);
        void mutate("todos"); // refetch to reconcile
      },
    }
  );

  return (
    <button disabled={isPending} onClick={() => addTodo("New task")}>
      Add
    </button>
  );
}
```

### Prefetch on hover / route change

```tsx
import { prefetchQuery } from "@lacspace/query";

<Link
  href={`/users/${id}`}
  onMouseEnter={() => prefetchQuery(["user", id], fetchUser)}
/>;
```

## API

| Export | Description |
| --- | --- |
| `useQuery(key, fetcher, options?)` | Subscribe to a key; fetch with dedup, SWR, focus/reconnect/poll revalidation. Returns `{ data, error, isLoading, isFetching, isSuccess, isError, refetch }`. |
| `useMutation(fn, options?)` | Run an async mutation. Returns `{ mutate, mutateAsync, data, error, isPending, isSuccess, isError, reset }`. |
| `mutate(key, data?, options?)` | Global update/revalidate (like SWR's `mutate`). Omit `data` to revalidate; pass `data` to set optimistically then revalidate unless `revalidate: false`. |
| `prefetchQuery(key, fetcher)` | Fetch and populate the cache ahead of render. |
| `getQueryData(key)` | Read cached data without subscribing. |
| `setQueryData(key, data)` | Write cached data (value or updater); all subscribers re-render. |
| `clearQueryCache()` | Reset/remove all cached entries (e.g. on logout). |

**`useQuery` options:** `enabled`, `staleTime` (ms, default `0`), `refetchOnWindowFocus`
(default `true`), `refetchOnReconnect` (default `true`), `refetchInterval`,
`initialData`, `keepPreviousData`, `onSuccess`, `onError`.

**`useMutation` options:** `onSuccess`, `onError`, `onSettled`.

### Keys

```ts
type QueryKey = string | readonly unknown[];
```

Arrays are serialized with sorted object keys, so `["u", { a: 1, b: 2 }]` and
`["u", { b: 2, a: 1 }]` are the same cache entry.

## Why it's tiny

- **One module-level cache** (`Map`) with a per-entry pub/sub — no context provider,
  no boilerplate. Components on the same key share data and re-render as one.
- **De-duplication** by storing the in-flight promise on the entry and reusing it.
- **Stale-while-revalidate**: cached data shows instantly while a background refetch runs.
- **`useSyncExternalStore`** with a server snapshot for tear-free, SSR-safe reads —
  no `window` is touched during render; focus/reconnect listeners attach only in
  client effects.
- **Latest-ref closures** keep fetchers/options fresh without re-subscribing, and an
  `isMounted` guard prevents post-unmount callbacks.
- **Zero dependencies**, dual ESM + CJS, and fully typed.

## Licensing

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/query` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/query
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

