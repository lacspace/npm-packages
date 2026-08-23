"use client";

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

/**
 * A theme name. Usually `"light"`, `"dark"`, or `"system"`, but any custom
 * string (e.g. `"sepia"`, `"solarized"`) is allowed.
 *
 * @public
 */
export type Theme = string;

/**
 * How the resolved theme is written to `<html>`:
 * - `"class"` — toggles a class name (e.g. `<html class="dark">`).
 * - `` `data-${string}` `` — sets a data attribute (e.g. `data-theme="dark"`).
 *
 * @public
 */
export type ThemeAttribute = "class" | `data-${string}`;

/**
 * Props for {@link ThemeProvider}.
 *
 * @public
 */
export interface ThemeProviderProps {
  /** Your application tree. */
  children: ReactNode;
  /**
   * Theme used until one is read from storage (and on the server).
   * @defaultValue `"system"`
   */
  defaultTheme?: string;
  /**
   * `localStorage` key used to persist the chosen theme.
   * @defaultValue `"theme"`
   */
  storageKey?: string;
  /**
   * The set of selectable themes. Class names for these are cleared from
   * `<html>` before the active one is applied.
   * @defaultValue `["light", "dark"]`
   */
  themes?: string[];
  /**
   * Whether to toggle a class or set a data attribute on `<html>`.
   * @defaultValue `"class"`
   */
  attribute?: ThemeAttribute;
  /**
   * When `true`, `theme === "system"` follows the OS `prefers-color-scheme`.
   * @defaultValue `true`
   */
  enableSystem?: boolean;
  /**
   * Briefly disable all CSS transitions while switching themes, avoiding a
   * cross-fade of every element on the page.
   * @defaultValue `false`
   */
  disableTransitionOnChange?: boolean;
  /** Optional CSP `nonce` applied to the transient transition-blocking style. */
  nonce?: string;
}

/**
 * The value returned by {@link useTheme}.
 *
 * @public
 */
export interface UseThemeReturn {
  /** The current theme setting, e.g. `"light"`, `"dark"` or `"system"`. */
  theme: string;
  /** Set (and persist) the theme. Pass `"system"` to follow the OS. */
  setTheme: (theme: string) => void;
  /**
   * The theme actually applied to the page. When {@link UseThemeReturn.theme}
   * is `"system"`, this is the resolved `"light"` / `"dark"`.
   */
  resolvedTheme: string;
  /** The OS color scheme, once known on the client; `undefined` on the server. */
  systemTheme: "light" | "dark" | undefined;
  /** The configured list of selectable themes. */
  themes: string[];
}

const MEDIA = "(prefers-color-scheme: dark)";

const ThemeContext = createContext<UseThemeReturn | undefined>(undefined);

/** Read the current OS color scheme; returns `"light"` when unavailable. */
function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia(MEDIA).matches ? "dark" : "light";
}

/**
 * Inject a stylesheet that kills every transition, returning a cleanup that
 * removes it after a forced reflow. Prevents the whole page from animating
 * when the theme flips.
 */
function disableTransitions(nonce?: string): () => void {
  const style = document.createElement("style");
  if (nonce) style.setAttribute("nonce", nonce);
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}",
    ),
  );
  document.head.appendChild(style);
  return () => {
    // Force a reflow so the "no transition" rule is flushed before removal.
    void window.getComputedStyle(document.body).transition;
    setTimeout(() => {
      if (style.parentNode) style.parentNode.removeChild(style);
    }, 1);
  };
}

/** Write the resolved theme to `<html>` as a class or data attribute. */
function applyTheme(
  resolved: string,
  attribute: ThemeAttribute,
  themes: string[],
  disableTransitionOnChange: boolean,
  nonce?: string,
): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const enable = disableTransitionOnChange ? disableTransitions(nonce) : undefined;
  if (attribute === "class") {
    for (const name of themes) root.classList.remove(name);
    root.classList.add(resolved);
  } else {
    root.setAttribute(attribute, resolved);
  }
  if (enable) enable();
}

/**
 * SSR-safe theme provider. Renders `children` unchanged on the server, then on
 * the client hydrates the chosen theme from storage (falling back to
 * `defaultTheme`), resolves `"system"` against the OS, applies it to `<html>`,
 * and keeps it in sync with the OS and across tabs.
 *
 * Pair it with {@link getThemeScript} in your document `<head>` to eliminate the
 * flash of the wrong theme before hydration.
 *
 * @example
 * ```tsx
 * import { ThemeProvider } from "@lacspace/theme";
 *
 * export default function App({ children }) {
 *   return <ThemeProvider defaultTheme="system">{children}</ThemeProvider>;
 * }
 * ```
 *
 * @public
 */
export function ThemeProvider(props: ThemeProviderProps): ReactElement {
  const {
    children,
    defaultTheme = "system",
    storageKey = "theme",
    themes = ["light", "dark"],
    attribute = "class",
    enableSystem = true,
    disableTransitionOnChange = false,
    nonce,
  } = props;

  const [theme, setThemeState] = useState<string>(defaultTheme);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark" | undefined>(
    undefined,
  );

  // Stable primitive so array-identity changes don't re-fire effects/memos.
  const themesKey = themes.join(",");

  // Hydrate from storage + learn the OS scheme once, after mount.
  useEffect(() => {
    setSystemTheme(getSystemTheme());
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(storageKey);
    } catch {
      /* storage may be unavailable (private mode, SSR-mismatch) */
    }
    if (stored) setThemeState(stored);
  }, [storageKey]);

  const resolvedTheme = useMemo<string>(() => {
    if (theme === "system" && enableSystem) return systemTheme ?? "light";
    return theme;
  }, [theme, systemTheme, enableSystem]);

  // Apply the resolved theme to <html>. Only runs on the client, so the server
  // markup is never mutated during render.
  useEffect(() => {
    // Wait until we know the OS scheme before applying a "system" theme.
    if (theme === "system" && enableSystem && systemTheme === undefined) return;
    applyTheme(resolvedTheme, attribute, themes, disableTransitionOnChange, nonce);
    // themesKey stands in for the (otherwise unstable) themes array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    resolvedTheme,
    attribute,
    themesKey,
    disableTransitionOnChange,
    nonce,
    theme,
    enableSystem,
    systemTheme,
  ]);

  // Follow live OS color-scheme changes while in system mode.
  useEffect(() => {
    if (!enableSystem) return;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mql = window.matchMedia(MEDIA);
    const onChange = (e: MediaQueryListEvent) =>
      setSystemTheme(e.matches ? "dark" : "light");
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [enableSystem]);

  // Keep multiple tabs in sync.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      setThemeState(e.newValue ?? defaultTheme);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [storageKey, defaultTheme]);

  const setTheme = useCallback(
    (next: string) => {
      setThemeState(next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        /* ignore write failures */
      }
    },
    [storageKey],
  );

  const value = useMemo<UseThemeReturn>(
    () => ({ theme, setTheme, resolvedTheme, systemTheme, themes }),
    // themesKey stands in for the themes array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, setTheme, resolvedTheme, systemTheme, themesKey],
  );

  return createElement(ThemeContext.Provider, { value }, children);
}

/**
 * Access and change the current theme. Must be called inside a
 * {@link ThemeProvider}; throws a clear error otherwise.
 *
 * @example
 * ```tsx
 * import { useTheme } from "@lacspace/theme";
 *
 * function ThemeToggle() {
 *   const { resolvedTheme, setTheme } = useTheme();
 *   return (
 *     <button
 *       onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
 *     >
 *       {resolvedTheme === "dark" ? "🌙" : "☀️"}
 *     </button>
 *   );
 * }
 * ```
 *
 * @public
 */
export function useTheme(): UseThemeReturn {
  const ctx = useContext(ThemeContext);
  if (ctx === undefined) {
    throw new Error(
      "useTheme must be used within a <ThemeProvider>. Wrap your app (or the relevant subtree) in <ThemeProvider> from @lacspace/theme.",
    );
  }
  return ctx;
}

/**
 * Options for {@link getThemeScript}. These must mirror the matching
 * {@link ThemeProvider} props so the pre-hydration paint agrees with React.
 *
 * @public
 */
export interface ThemeScriptOptions {
  /** @defaultValue `"theme"` */
  storageKey?: string;
  /** @defaultValue `"system"` */
  defaultTheme?: string;
  /** @defaultValue `"class"` */
  attribute?: string;
  /** @defaultValue `["light", "dark"]` */
  themes?: string[];
  /** @defaultValue `true` */
  enableSystem?: boolean;
}

/**
 * Build a self-contained, dependency-free IIFE string that reads the stored
 * theme (and the OS preference) and applies it to `<html>` **before first
 * paint** — eliminating the flash of the wrong theme. Inject it as early as
 * possible in `<head>`.
 *
 * The script has no external references and is wrapped in `try/catch`, so it is
 * safe to run before your bundle loads and cannot break the page.
 *
 * @example
 * ```tsx
 * // Next.js App Router — app/layout.tsx
 * import { getThemeScript } from "@lacspace/theme";
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html suppressHydrationWarning>
 *       <head>
 *         <script dangerouslySetInnerHTML={{ __html: getThemeScript() }} />
 *       </head>
 *       <body>{children}</body>
 *     </html>
 *   );
 * }
 * ```
 *
 * @public
 */
export function getThemeScript(options: ThemeScriptOptions = {}): string {
  const {
    storageKey = "theme",
    defaultTheme = "system",
    attribute = "class",
    themes = ["light", "dark"],
    enableSystem = true,
  } = options;
  const cfg = JSON.stringify({
    storageKey,
    defaultTheme,
    attribute,
    themes,
    enableSystem,
  });
  return `(function(){try{var o=${cfg};var d=document.documentElement;var t=null;try{t=localStorage.getItem(o.storageKey)}catch(e){}if(!t){t=o.defaultTheme}var r=t;if(t==="system"){r=(o.enableSystem&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light"}if(o.attribute==="class"){var a=o.themes||[];for(var i=0;i<a.length;i++){d.classList.remove(a[i])}d.classList.add(r)}else{d.setAttribute(o.attribute,r)}}catch(e){}})();`;
}
