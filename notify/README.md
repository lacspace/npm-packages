# @lacspace/notify

**Beautiful in-app toast notifications — zero dependencies, works in any framework.**

A framework-agnostic store, a drop-in **vanilla DOM renderer**, and a **React**
binding (`<Toaster/>` + `useToast()`). Promise toasts, actions, six positions,
auto-dismiss, fully accessible. React is optional — the core has no dependencies.

```bash
npm i @lacspace/notify
```

---

## Vanilla / any framework

```ts
import { toast, mount } from "@lacspace/notify";

mount({ position: "top-right" }); // call once

toast.success("Saved!");
toast.error("Something broke", { title: "Upload failed" });
toast.info("Heads up", { action: { label: "Undo", onClick: () => restore() } });
```

## React

```tsx
import { Toaster, toast } from "@lacspace/notify/react";

function App() {
  return (
    <>
      <YourApp />
      <Toaster position="bottom-right" />
    </>
  );
}

// anywhere
toast.success("Profile updated");
```

`useToast()` gives you the live list if you want to render your own UI:

```tsx
const { toasts, toast } = useToast();
```

## Promise toasts

One call handles loading → success/error and resolves/rejects with the promise:

```ts
await toast.promise(saveProfile(data), {
  loading: "Saving…",
  success: (user) => `Saved ${user.name}`,
  error: (err) => `Failed: ${String(err)}`,
});
```

---

## API

Every notifier (the default `toast`, or one from `createNotifier(options)`) has:

| Method | |
| --- | --- |
| `success / error / info / warning / loading / notify(message, input?)` | Show a toast; returns its id. |
| `promise(promise, { loading, success, error })` | Loading → success/error tied to a promise. |
| `update(id, patch)` | Patch an existing toast. |
| `dismiss(id)` / `dismissAll()` | Remove. |
| `getToasts()` / `subscribe(cb)` | Read state / listen (also powers `useToast`). |

`ToastInput`: `{ type?, title?, duration?, action?, data?, id? }` — `duration: 0`
makes a toast sticky. `createNotifier({ max, defaultDuration })` for a custom instance.

**Positions:** `top-left`, `top-center`, `top-right`, `bottom-left`, `bottom-center`, `bottom-right`.

## License

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE).
