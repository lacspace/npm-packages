/**
 * @lacspace/notify — core store.
 *
 * A tiny, framework-agnostic toast/notification store. No DOM, no React here —
 * just state + subscriptions, so it runs (and is tested) anywhere. The DOM
 * renderer lives in the package entry; the React binding lives in `/react`.
 */

export type ToastType = "success" | "error" | "info" | "warning" | "loading" | "default";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  /** Auto-dismiss after this many ms. `0` = sticky (stays until dismissed). */
  duration: number;
  createdAt: number;
  action?: ToastAction;
  data?: unknown;
}

export interface ToastInput {
  type?: ToastType;
  title?: string;
  duration?: number;
  action?: ToastAction;
  data?: unknown;
  /** Provide an id to update an existing toast instead of adding a new one. */
  id?: string;
}

export interface NotifierOptions {
  /** Max toasts kept at once; oldest is dropped past this. Default 5. */
  max?: number;
  /** Default auto-dismiss in ms. Default 4000. `loading` toasts default to sticky. */
  defaultDuration?: number;
}

export interface PromiseMessages<T> {
  loading: string;
  success: string | ((value: T) => string);
  error: string | ((error: unknown) => string);
}

export interface Notifier {
  notify(message: string, input?: ToastInput): string;
  success(message: string, input?: ToastInput): string;
  error(message: string, input?: ToastInput): string;
  info(message: string, input?: ToastInput): string;
  warning(message: string, input?: ToastInput): string;
  loading(message: string, input?: ToastInput): string;
  /** Show loading → success/error tied to a promise. Resolves/rejects with it. */
  promise<T>(promise: Promise<T>, messages: PromiseMessages<T>, input?: ToastInput): Promise<T>;
  /** Patch an existing toast (e.g. flip loading → success). */
  update(id: string, patch: Partial<Omit<Toast, "id" | "createdAt">>): void;
  dismiss(id: string): void;
  dismissAll(): void;
  getToasts(): Toast[];
  /** Subscribe to changes; returns an unsubscribe function. */
  subscribe(listener: (toasts: Toast[]) => void): () => void;
}

let counter = 0;
function genId(): string {
  counter += 1;
  return `t${Date.now().toString(36)}-${counter}`;
}

export function createNotifier(options: NotifierOptions = {}): Notifier {
  const max = options.max ?? 5;
  const defaultDuration = options.defaultDuration ?? 4000;

  let toasts: Toast[] = [];
  const listeners = new Set<(toasts: Toast[]) => void>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const emit = () => {
    const snapshot = toasts;
    for (const listener of listeners) listener(snapshot);
  };

  const clearTimer = (id: string) => {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
  };

  const scheduleDismiss = (id: string, duration: number) => {
    clearTimer(id);
    // Only schedule when timers exist (browser/node) and duration is positive.
    if (duration > 0 && typeof setTimeout !== "undefined") {
      timers.set(
        id,
        setTimeout(() => dismiss(id), duration),
      );
    }
  };

  function dismiss(id: string): void {
    clearTimer(id);
    const next = toasts.filter((t) => t.id !== id);
    if (next.length !== toasts.length) {
      toasts = next;
      emit();
    }
  }

  function dismissAll(): void {
    for (const t of toasts) clearTimer(t.id);
    if (toasts.length) {
      toasts = [];
      emit();
    }
  }

  function upsert(message: string, input: ToastInput = {}): string {
    const type = input.type ?? "default";
    const duration = input.duration ?? (type === "loading" ? 0 : defaultDuration);
    const id = input.id ?? genId();
    const existing = toasts.find((t) => t.id === id);

    if (existing) {
      const patched: Toast = { ...existing, ...input, message, type, duration };
      toasts = toasts.map((t) => (t.id === id ? patched : t));
    } else {
      const toast: Toast = {
        id,
        type,
        message,
        duration,
        createdAt: Date.now(),
        title: input.title,
        action: input.action,
        data: input.data,
      };
      // Newest first; trim the oldest beyond `max`.
      toasts = [toast, ...toasts].slice(0, max);
    }
    scheduleDismiss(id, duration);
    emit();
    return id;
  }

  function update(id: string, patch: Partial<Omit<Toast, "id" | "createdAt">>): void {
    const existing = toasts.find((t) => t.id === id);
    if (!existing) return;
    const patched: Toast = { ...existing, ...patch };
    toasts = toasts.map((t) => (t.id === id ? patched : t));
    scheduleDismiss(id, patched.duration);
    emit();
  }

  const resolve = <T>(value: string | ((arg: T) => string), arg: T): string =>
    typeof value === "function" ? (value as (a: T) => string)(arg) : value;

  return {
    notify: (message, input) => upsert(message, input),
    success: (message, input) => upsert(message, { ...input, type: "success" }),
    error: (message, input) => upsert(message, { ...input, type: "error" }),
    info: (message, input) => upsert(message, { ...input, type: "info" }),
    warning: (message, input) => upsert(message, { ...input, type: "warning" }),
    loading: (message, input) => upsert(message, { ...input, type: "loading" }),
    async promise(promise, messages, input) {
      const id = upsert(messages.loading, { ...input, type: "loading" });
      try {
        const value = await promise;
        update(id, { type: "success", message: resolve(messages.success, value), duration: defaultDuration });
        return value;
      } catch (err) {
        update(id, { type: "error", message: resolve(messages.error, err), duration: defaultDuration });
        throw err;
      }
    },
    update,
    dismiss,
    dismissAll,
    getToasts: () => toasts,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
