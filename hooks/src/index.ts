import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DependencyList,
  type EffectCallback,
  type RefObject,
} from "react";

const isBrowser = typeof window !== "undefined";

/* -------------------------------------------------------------------------- */
/*  Lifecycle & effect helpers                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `useLayoutEffect` on the client, `useEffect` on the server. Prevents the
 * "useLayoutEffect does nothing on the server" warning during SSR.
 *
 * @example
 * useIsomorphicLayoutEffect(() => { el.current?.focus(); }, []);
 */
export const useIsomorphicLayoutEffect = isBrowser ? useLayoutEffect : useEffect;

/**
 * Returns a stable getter that reports whether the component is still mounted.
 * Useful to guard async state updates.
 *
 * @example
 * const isMounted = useIsMounted();
 * fetchData().then((d) => { if (isMounted()) setData(d); });
 */
export function useIsMounted(): () => boolean {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return useCallback(() => mounted.current, []);
}

/**
 * Runs an effect exactly once, on mount.
 *
 * @example
 * useMountEffect(() => console.log("mounted"));
 */
export function useMountEffect(effect: EffectCallback): void {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, []);
}

/**
 * Like `useEffect`, but skips the first (mount) run and only fires on updates.
 *
 * @example
 * useUpdateEffect(() => console.log("value changed", value), [value]);
 */
export function useUpdateEffect(effect: EffectCallback, deps?: DependencyList): void {
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    return effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Returns the value from the previous render (`undefined` on first render).
 *
 * @example
 * const prevCount = usePrevious(count);
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

/* -------------------------------------------------------------------------- */
/*  Storage                                                                     */
/* -------------------------------------------------------------------------- */

type SetValue<T> = (value: T | ((prev: T) => T)) => void;

function useStorage<T>(
  storageArea: "localStorage" | "sessionStorage",
  key: string,
  initialValue: T,
): [T, SetValue<T>, () => void] {
  const readValue = useCallback((): T => {
    if (!isBrowser) return initialValue;
    try {
      const raw = window[storageArea].getItem(key);
      return raw === null ? initialValue : (JSON.parse(raw) as T);
    } catch {
      return initialValue;
    }
  }, [initialValue, key, storageArea]);

  const [storedValue, setStoredValue] = useState<T>(initialValue);

  // Hydrate from storage after mount (keeps server & first client render in sync).
  useEffect(() => {
    setStoredValue(readValue());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setValue = useCallback<SetValue<T>>(
    (value) => {
      setStoredValue((prev) => {
        const next = value instanceof Function ? value(prev) : value;
        if (isBrowser) {
          try {
            window[storageArea].setItem(key, JSON.stringify(next));
            window.dispatchEvent(
              new StorageEvent("storage", { key, newValue: JSON.stringify(next) }),
            );
          } catch {
            /* ignore write errors (quota, private mode, etc.) */
          }
        }
        return next;
      });
    },
    [key, storageArea],
  );

  const remove = useCallback(() => {
    if (isBrowser) {
      try {
        window[storageArea].removeItem(key);
        window.dispatchEvent(new StorageEvent("storage", { key, newValue: null }));
      } catch {
        /* ignore */
      }
    }
    setStoredValue(initialValue);
  }, [initialValue, key, storageArea]);

  // Sync across tabs / other hook instances.
  useEffect(() => {
    if (!isBrowser) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== key) return;
      setStoredValue(readValue());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, readValue]);

  return [storedValue, setValue, remove];
}

/**
 * Persistent state backed by `localStorage`, JSON-serialized and SSR-safe.
 * Returns the initial value on the server, hydrates on mount, syncs across tabs,
 * and `remove()` clears the key.
 *
 * @example
 * const [theme, setTheme, clearTheme] = useLocalStorage("theme", "light");
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, SetValue<T>, () => void] {
  return useStorage("localStorage", key, initialValue);
}

/**
 * Same contract as {@link useLocalStorage}, backed by `sessionStorage`.
 *
 * @example
 * const [draft, setDraft, clearDraft] = useSessionStorage("draft", "");
 */
export function useSessionStorage<T>(
  key: string,
  initialValue: T,
): [T, SetValue<T>, () => void] {
  return useStorage("sessionStorage", key, initialValue);
}

/* -------------------------------------------------------------------------- */
/*  Timing: debounce / throttle / interval / timeout                           */
/* -------------------------------------------------------------------------- */

/**
 * Returns a debounced copy of `value` that only updates after `delayMs` of quiet.
 *
 * @example
 * const debounced = useDebounce(query, 300);
 */
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Returns a debounced callback. The returned function is stable and carries a
 * `.cancel()` method to drop any pending invocation.
 *
 * @example
 * const save = useDebouncedCallback((v: string) => api.save(v), 500);
 */
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs: number,
): ((...args: A) => void) & { cancel: () => void } {
  const fnRef = useRef(fn);
  useIsomorphicLayoutEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timeout.current !== null) {
      clearTimeout(timeout.current);
      timeout.current = null;
    }
  }, []);

  useEffect(() => cancel, [cancel]);

  const debounced = useCallback(
    (...args: A) => {
      if (timeout.current !== null) clearTimeout(timeout.current);
      timeout.current = setTimeout(() => {
        timeout.current = null;
        fnRef.current(...args);
      }, delayMs);
    },
    [delayMs],
  ) as ((...args: A) => void) & { cancel: () => void };

  debounced.cancel = cancel;
  return debounced;
}

/**
 * Returns a throttled copy of `value` that updates at most once per `ms`.
 *
 * @example
 * const throttled = useThrottle(scrollY, 100);
 */
export function useThrottle<T>(value: T, ms: number): T {
  const [throttled, setThrottled] = useState<T>(value);
  const lastRan = useRef<number>(isBrowser ? Date.now() : 0);

  useEffect(() => {
    const remaining = ms - (Date.now() - lastRan.current);
    if (remaining <= 0) {
      setThrottled(value);
      lastRan.current = Date.now();
      return;
    }
    const id = setTimeout(() => {
      setThrottled(value);
      lastRan.current = Date.now();
    }, remaining);
    return () => clearTimeout(id);
  }, [value, ms]);

  return throttled;
}

/**
 * Runs `callback` every `delayMs`. Pass `null` to pause. Uses a latest-ref so
 * the callback never goes stale.
 *
 * @example
 * useInterval(() => tick(), running ? 1000 : null);
 */
export function useInterval(callback: () => void, delayMs: number | null): void {
  const saved = useRef(callback);
  useIsomorphicLayoutEffect(() => {
    saved.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delayMs === null) return;
    const id = setInterval(() => saved.current(), delayMs);
    return () => clearInterval(id);
  }, [delayMs]);
}

/**
 * Runs `callback` once after `delayMs`. Pass `null` to cancel/disable.
 *
 * @example
 * useTimeout(() => setVisible(false), 3000);
 */
export function useTimeout(callback: () => void, delayMs: number | null): void {
  const saved = useRef(callback);
  useIsomorphicLayoutEffect(() => {
    saved.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delayMs === null) return;
    const id = setTimeout(() => saved.current(), delayMs);
    return () => clearTimeout(id);
  }, [delayMs]);
}

/* -------------------------------------------------------------------------- */
/*  Simple state helpers                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Boolean state with convenient controls.
 *
 * @example
 * const [on, { toggle, off }] = useToggle();
 */
export function useToggle(
  initial = false,
): [boolean, { toggle: () => void; on: () => void; off: () => void; set: (v: boolean) => void }] {
  const [value, setValue] = useState(initial);
  const toggle = useCallback(() => setValue((v) => !v), []);
  const on = useCallback(() => setValue(true), []);
  const off = useCallback(() => setValue(false), []);
  const set = useCallback((v: boolean) => setValue(v), []);
  return [value, { toggle, on, off, set }];
}

/**
 * Numeric counter with increment/decrement/set/reset controls.
 *
 * @example
 * const { count, inc, dec, reset } = useCounter(0);
 */
export function useCounter(initial = 0): {
  count: number;
  inc: (step?: number) => void;
  dec: (step?: number) => void;
  set: (n: number) => void;
  reset: () => void;
} {
  const [count, setCount] = useState(initial);
  const inc = useCallback((step = 1) => setCount((c) => c + step), []);
  const dec = useCallback((step = 1) => setCount((c) => c - step), []);
  const set = useCallback((n: number) => setCount(n), []);
  const reset = useCallback(() => setCount(initial), [initial]);
  return { count, inc, dec, set, reset };
}

/**
 * Open/close state, ideal for modals, drawers and menus.
 *
 * @example
 * const { isOpen, open, close } = useDisclosure();
 */
export function useDisclosure(initial = false): {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
} {
  const [isOpen, setOpen] = useState(initial);
  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  return { isOpen, open, close, toggle };
}

/* -------------------------------------------------------------------------- */
/*  Browser / DOM environment                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Tracks a CSS media query. SSR-safe: returns `false` on the server, then the
 * real match after mount.
 *
 * @example
 * const isDark = useMediaQuery("(prefers-color-scheme: dark)");
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (!isBrowser || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/**
 * Current viewport size. SSR-safe: returns `{ width: 0, height: 0 }` on server.
 *
 * @example
 * const { width } = useWindowSize();
 */
export function useWindowSize(): { width: number; height: number } {
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    if (!isBrowser) return;
    const onResize = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return size;
}

/**
 * Current window scroll position. SSR-safe: `{ x: 0, y: 0 }` on server.
 *
 * @example
 * const { y } = useScrollPosition();
 */
export function useScrollPosition(): { x: number; y: number } {
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (!isBrowser) return;
    const onScroll = () => setPos({ x: window.scrollX, y: window.scrollY });
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return pos;
}

/* -------------------------------------------------------------------------- */
/*  Event listener (overloaded)                                                */
/* -------------------------------------------------------------------------- */

/** Attach a `window` event listener. */
export function useEventListener<K extends keyof WindowEventMap>(
  type: K,
  handler: (event: WindowEventMap[K]) => void,
  element?: undefined,
  options?: boolean | AddEventListenerOptions,
): void;
/** Attach a `document` event listener. */
export function useEventListener<K extends keyof DocumentEventMap>(
  type: K,
  handler: (event: DocumentEventMap[K]) => void,
  element: RefObject<Document | null> | Document,
  options?: boolean | AddEventListenerOptions,
): void;
/** Attach an event listener to an element referenced by a ref. */
export function useEventListener<
  K extends keyof HTMLElementEventMap,
  T extends HTMLElement,
>(
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  element: RefObject<T | null> | T,
  options?: boolean | AddEventListenerOptions,
): void;
/**
 * Adds an event listener to `window` (default), `document`, or a ref/element,
 * using a latest-ref so the handler never goes stale.
 *
 * @example
 * useEventListener("keydown", (e) => e.key === "Escape" && close());
 */
export function useEventListener(
  type: string,
  handler: (event: Event) => void,
  element?: RefObject<EventTarget | null> | EventTarget,
  options?: boolean | AddEventListenerOptions,
): void {
  const savedHandler = useRef(handler);
  useIsomorphicLayoutEffect(() => {
    savedHandler.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!isBrowser) return;
    const target: EventTarget | null =
      element == null
        ? window
        : "current" in element
          ? element.current
          : element;
    if (target == null || typeof target.addEventListener !== "function") return;

    const listener = (event: Event) => savedHandler.current(event);
    target.addEventListener(type, listener, options);
    return () => target.removeEventListener(type, listener, options);
  }, [type, element, options]);
}

/* -------------------------------------------------------------------------- */
/*  Element interactions                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Calls `handler` when a pointer event occurs outside the referenced element.
 *
 * @example
 * useOnClickOutside(ref, () => setOpen(false));
 */
export function useOnClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  handler: (event: MouseEvent | TouchEvent) => void,
): void {
  const savedHandler = useRef(handler);
  useIsomorphicLayoutEffect(() => {
    savedHandler.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!isBrowser) return;
    const listener = (event: MouseEvent | TouchEvent) => {
      const el = ref.current;
      const target = event.target as Node | null;
      if (el == null || target == null || el.contains(target)) return;
      savedHandler.current(event);
    };
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener, { passive: true });
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref]);
}

/**
 * Tracks hover state of an element. Returns a ref to attach and the boolean.
 *
 * @example
 * const [ref, hovered] = useHover<HTMLButtonElement>();
 */
export function useHover<T extends HTMLElement>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (node == null) return;
    const onEnter = () => setHovered(true);
    const onLeave = () => setHovered(false);
    node.addEventListener("mouseenter", onEnter);
    node.addEventListener("mouseleave", onLeave);
    return () => {
      node.removeEventListener("mouseenter", onEnter);
      node.removeEventListener("mouseleave", onLeave);
    };
    // `ref` is a stable object and the node is read from `ref.current` (attached
    // before effects run), so subscribe once on mount instead of every render.
  }, []);

  return [ref, hovered];
}

/**
 * Observes an element's intersection with the viewport. Returns the ref to
 * attach, a boolean `isIntersecting`, and the raw entry.
 *
 * @example
 * const [ref, visible] = useIntersectionObserver<HTMLDivElement>({ threshold: 0.5 });
 */
export function useIntersectionObserver<T extends Element>(
  options?: IntersectionObserverInit,
): [RefObject<T | null>, boolean, IntersectionObserverEntry | null] {
  const ref = useRef<T | null>(null);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);

  const { root, rootMargin, threshold } = options ?? {};

  useEffect(() => {
    const node = ref.current;
    if (!isBrowser || typeof IntersectionObserver !== "function" || node == null) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first) setEntry(first);
      },
      { root, rootMargin, threshold },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, rootMargin, JSON.stringify(threshold)]);

  return [ref, entry?.isIntersecting ?? false, entry];
}

/**
 * Returns `true` while the given key is pressed.
 *
 * @example
 * const shiftHeld = useKeyPress("Shift");
 */
export function useKeyPress(targetKey: string): boolean {
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    if (!isBrowser) return;
    const down = (e: KeyboardEvent) => {
      if (e.key === targetKey) setPressed(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === targetKey) setPressed(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [targetKey]);

  return pressed;
}

/* -------------------------------------------------------------------------- */
/*  Misc utilities                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Copies text to the clipboard. Returns the last-copied value and an async
 * `copy` function resolving to a success boolean. Falls back to `execCommand`.
 *
 * @example
 * const [copied, copy] = useCopyToClipboard();
 * await copy("hello");
 */
export function useCopyToClipboard(): [string | null, (text: string) => Promise<boolean>] {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = useCallback(async (text: string): Promise<boolean> => {
    if (!isBrowser) return false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
        setCopied(text);
        return true;
      }
    } catch {
      /* fall through to legacy path */
    }
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "absolute";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      if (ok) {
        setCopied(text);
        return true;
      }
    } catch {
      /* ignore */
    }
    setCopied(null);
    return false;
  }, []);

  return [copied, copy];
}

/**
 * Sets `document.title` while mounted (no-op on the server).
 *
 * @example
 * useDocumentTitle(`Inbox (${unread})`);
 */
export function useDocumentTitle(title: string): void {
  useIsomorphicLayoutEffect(() => {
    if (!isBrowser) return;
    document.title = title;
  }, [title]);
}

/**
 * Tracks the browser's online/offline status. SSR-safe: `true` on the server.
 *
 * @example
 * const online = useOnlineStatus();
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (!isBrowser) return;
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}

/**
 * Returns `true` after `ms` of no user activity (mouse, keyboard, touch, scroll).
 *
 * @example
 * const idle = useIdle(60_000);
 */
export function useIdle(ms: number): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!isBrowser) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), ms);
    };
    const events: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
      "wheel",
    ];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [ms]);

  return idle;
}

/**
 * Locks `document.body` scrolling while `locked` is true, restoring the prior
 * overflow on cleanup.
 *
 * @example
 * useLockBodyScroll(isModalOpen);
 */
export function useLockBodyScroll(locked = true): void {
  useIsomorphicLayoutEffect(() => {
    if (!isBrowser || !locked) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [locked]);
}
