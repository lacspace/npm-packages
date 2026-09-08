/**
 * @lacspace/theme — pure, framework-agnostic theming core (React-free, DOM-free).
 *
 * Everything in this module is pure logic: theme resolution (light / dark /
 * system), CSS-variable + stylesheet generation, WCAG contrast helpers,
 * `prefers-color-scheme` media-query / selector builders, and a small,
 * dependency-free theme controller with **injectable** storage (so it never
 * touches a real `localStorage`).
 *
 * The React `ThemeProvider` / `useTheme` in `index.ts` are thin wrappers over
 * these functions, which means the interesting behaviour can be unit-tested
 * directly under a Node environment — no jsdom, no DOM, no renderer.
 *
 * @packageDocumentation
 */

/**
 * The concrete OS colour scheme, resolved from `prefers-color-scheme`.
 *
 * @public
 */
export type SystemColorScheme = "light" | "dark";

/**
 * A minimal Web-Storage-like interface. Any object exposing `getItem` and
 * `setItem` works — real `localStorage`, `sessionStorage`, an in-memory shim
 * from {@link createMemoryStorage}, or your own store. Injecting this keeps the
 * persistence layer testable without ever reading a browser storage.
 *
 * @public
 */
export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/**
 * Options for {@link resolveTheme}.
 *
 * @public
 */
export interface ResolveThemeOptions {
  /** The known OS scheme; used when `theme` is the system value. */
  systemTheme?: SystemColorScheme;
  /**
   * Whether the system theme should resolve against the OS.
   * @defaultValue `true`
   */
  enableSystem?: boolean;
  /**
   * The theme name that means "follow the OS".
   * @defaultValue `"system"`
   */
  systemName?: string;
  /**
   * Value returned for a system theme when the OS scheme is not yet known.
   * @defaultValue `"light"`
   */
  fallback?: string;
}

/**
 * Resolve a theme setting to the concrete theme that should be applied.
 *
 * When `theme` is the system value (default `"system"`) and `enableSystem` is
 * on, it resolves to the known `systemTheme` (or `fallback` if that is not yet
 * known). Any other theme resolves to itself. Pure and side-effect free.
 *
 * @example
 * ```ts
 * resolveTheme("system", { systemTheme: "dark" }); // "dark"
 * resolveTheme("system", {}); // "light"  (OS unknown → fallback)
 * resolveTheme("sepia"); // "sepia"
 * ```
 *
 * @public
 */
export function resolveTheme(theme: string, options: ResolveThemeOptions = {}): string {
  const {
    systemTheme,
    enableSystem = true,
    systemName = "system",
    fallback = "light",
  } = options;
  if (theme === systemName && enableSystem) return systemTheme ?? fallback;
  return theme;
}

/**
 * Return the opposite of `"light"` / `"dark"`. Anything else is returned
 * unchanged (a custom theme has no canonical opposite).
 *
 * @public
 */
export function toggleTheme(resolved: string): string {
  if (resolved === "dark") return "light";
  if (resolved === "light") return "dark";
  return resolved;
}

/**
 * Cycle to the next theme in `themes`, wrapping around at the end. If `current`
 * is not in the list, the first theme is returned.
 *
 * @public
 */
export function cycleTheme(current: string, themes: readonly string[]): string {
  if (themes.length === 0) return current;
  const i = themes.indexOf(current);
  if (i === -1) return themes[0] as string;
  return themes[(i + 1) % themes.length] as string;
}

/**
 * Whether `theme` is one of the configured `themes`.
 *
 * @public
 */
export function isValidTheme(theme: string, themes: readonly string[]): boolean {
  return themes.indexOf(theme) !== -1;
}

/**
 * Map a `MediaQueryList.matches` boolean (for `(prefers-color-scheme: dark)`)
 * to the concrete OS scheme.
 *
 * @public
 */
export function systemThemeFromMatches(matches: boolean): SystemColorScheme {
  return matches ? "dark" : "light";
}

/**
 * Build a `prefers-color-scheme` media-query string.
 *
 * @example
 * ```ts
 * prefersColorSchemeQuery();        // "(prefers-color-scheme: dark)"
 * prefersColorSchemeQuery("light"); // "(prefers-color-scheme: light)"
 * ```
 *
 * @public
 */
export function prefersColorSchemeQuery(scheme: SystemColorScheme = "dark"): string {
  return `(prefers-color-scheme: ${scheme})`;
}

/**
 * How a theme is written to an element — mirrors the provider's `attribute`.
 *
 * @public
 */
export type ThemeAttributeSelector = "class" | `data-${string}`;

/**
 * Build the CSS selector that targets a given theme, matching how the theme is
 * applied to `<html>`. With `"class"` you get `.dark`; with a data attribute you
 * get `[data-theme="dark"]`.
 *
 * @example
 * ```ts
 * themeSelector("dark");                 // ".dark"
 * themeSelector("dark", "data-theme");   // '[data-theme="dark"]'
 * ```
 *
 * @public
 */
export function themeSelector(
  theme: string,
  attribute: ThemeAttributeSelector = "class",
): string {
  if (attribute === "class") return `.${theme}`;
  return `[${attribute}="${theme}"]`;
}

/** Convert a `camelCase` / `PascalCase` token name to `kebab-case`. */
function kebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

/**
 * A flat map of design-token names to CSS values.
 *
 * @public
 */
export type TokenMap = Record<string, string | number>;

/**
 * Options for {@link cssVariables}, {@link renderCssVariables} and
 * {@link generateThemeCss}.
 *
 * @public
 */
export interface CssVariableOptions {
  /**
   * Prefix inserted after the leading `--`, e.g. `prefix: "app"` turns
   * `bgColor` into `--app-bg-color`.
   */
  prefix?: string;
}

/** Turn a token name into a CSS custom-property name (`--…`). */
function toVarName(name: string, prefix?: string): string {
  if (name.startsWith("--")) return name;
  const body = kebab(name);
  return prefix ? `--${kebab(prefix)}-${body}` : `--${body}`;
}

/**
 * Convert a token map into a map of CSS custom-property declarations. Token
 * names are kebab-cased and prefixed with `--` (plus an optional `prefix`);
 * names already starting with `--` are kept verbatim.
 *
 * @example
 * ```ts
 * cssVariables({ bgColor: "#fff", radius: 8 });
 * // { "--bg-color": "#fff", "--radius": "8" }
 * ```
 *
 * @public
 */
export function cssVariables(
  tokens: TokenMap,
  options: CssVariableOptions = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(tokens)) {
    out[toVarName(key, options.prefix)] = String(tokens[key]);
  }
  return out;
}

/**
 * Render a token map as CSS variable declarations (the inside of a rule block),
 * one `--name: value;` per line.
 *
 * @public
 */
export function renderCssVariables(
  tokens: TokenMap,
  options: CssVariableOptions & { indent?: string } = {},
): string {
  const { indent = "  ", ...varOpts } = options;
  const vars = cssVariables(tokens, varOpts);
  return Object.keys(vars)
    .map((name) => `${indent}${name}: ${vars[name]};`)
    .join("\n");
}

/**
 * Options for {@link generateThemeCss}.
 *
 * @public
 */
export interface GenerateThemeCssOptions extends CssVariableOptions {
  /**
   * How themes are applied — `"class"` emits `.dark { … }`, a data attribute
   * emits `[data-theme="dark"] { … }`.
   * @defaultValue `"class"`
   */
  attribute?: ThemeAttributeSelector;
  /**
   * The theme whose variables are emitted under `:root` (the base layer). Other
   * themes get their own selector block that overrides it.
   */
  defaultTheme?: string;
  /** Indent for declarations inside each block. @defaultValue `"  "` */
  indent?: string;
}

/**
 * Generate a full theme stylesheet from a map of theme → tokens. The
 * `defaultTheme` (if given) is emitted under `:root`; every other theme gets a
 * class or attribute selector block. Zero dependencies, no DOM.
 *
 * @example
 * ```ts
 * generateThemeCss(
 *   { light: { bg: "#fff" }, dark: { bg: "#000" } },
 *   { defaultTheme: "light", attribute: "data-theme" },
 * );
 * // :root { --bg: #fff; }
 * // [data-theme="light"] { --bg: #fff; }
 * // [data-theme="dark"] { --bg: #000; }
 * ```
 *
 * @public
 */
export function generateThemeCss(
  themes: Record<string, TokenMap>,
  options: GenerateThemeCssOptions = {},
): string {
  const { attribute = "class", defaultTheme, indent = "  ", prefix } = options;
  const varOpts = { prefix, indent };
  const blocks: string[] = [];
  if (defaultTheme && themes[defaultTheme]) {
    blocks.push(`:root {\n${renderCssVariables(themes[defaultTheme], varOpts)}\n}`);
  }
  for (const name of Object.keys(themes)) {
    const selector = themeSelector(name, attribute);
    blocks.push(`${selector} {\n${renderCssVariables(themes[name] as TokenMap, varOpts)}\n}`);
  }
  return blocks.join("\n\n");
}

/* ------------------------------------------------------------------ *
 * Colour + WCAG contrast helpers
 * ------------------------------------------------------------------ */

/** An RGB triple with 0–255 channels. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Parse a hex colour (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, with or without
 * the leading `#`) into an {@link Rgb} triple. Returns `null` for anything that
 * is not a valid hex colour. Alpha, if present, is ignored.
 *
 * @public
 */
export function parseHex(hex: string): Rgb | null {
  let h = hex.trim().replace(/^#/, "").toLowerCase();
  if (h.length === 3 || h.length === 4) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length !== 6 && h.length !== 8) return null;
  if (!/^[0-9a-f]+$/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b };
}

/** Clamp to the 0–255 integer channel range. */
function clampChannel(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Serialize an {@link Rgb} triple back to a `#rrggbb` string. */
export function rgbToHex({ r, g, b }: Rgb): string {
  const hex = (n: number) => clampChannel(n).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** sRGB channel → linear-light value, per WCAG. */
function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * The WCAG relative luminance of a colour, in `[0, 1]`. Accepts a hex string or
 * an {@link Rgb} triple; returns `0` for an unparseable hex string.
 *
 * @public
 */
export function relativeLuminance(color: string | Rgb): number {
  const rgb = typeof color === "string" ? parseHex(color) : color;
  if (!rgb) return 0;
  return (
    0.2126 * linearize(rgb.r) +
    0.7152 * linearize(rgb.g) +
    0.0722 * linearize(rgb.b)
  );
}

/**
 * The WCAG contrast ratio between two colours, from `1` (identical) to `21`
 * (black on white). Order-independent.
 *
 * @public
 */
export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Options for {@link meetsContrast}.
 *
 * @public
 */
export interface ContrastOptions {
  /** @defaultValue `"AA"` */
  level?: "AA" | "AAA";
  /** Large text is ≥18.66px bold or ≥24px. @defaultValue `"normal"` */
  size?: "normal" | "large";
}

/**
 * Whether the contrast between a foreground and background colour meets a WCAG
 * threshold. Thresholds: AA 4.5 (normal) / 3 (large); AAA 7 / 4.5.
 *
 * @public
 */
export function meetsContrast(
  foreground: string | Rgb,
  background: string | Rgb,
  options: ContrastOptions = {},
): boolean {
  const { level = "AA", size = "normal" } = options;
  const ratio = contrastRatio(foreground, background);
  const threshold =
    level === "AAA" ? (size === "large" ? 4.5 : 7) : size === "large" ? 3 : 4.5;
  return ratio >= threshold;
}

/**
 * Options for {@link bestContrastColor}.
 *
 * @public
 */
export interface BestContrastOptions {
  /** Dark candidate. @defaultValue `"#000000"` */
  dark?: string;
  /** Light candidate. @defaultValue `"#ffffff"` */
  light?: string;
}

/**
 * Pick whichever of two candidates (black / white by default) has the higher
 * contrast against `background` — the readable text colour for that surface.
 *
 * @public
 */
export function bestContrastColor(
  background: string | Rgb,
  options: BestContrastOptions = {},
): string {
  const { dark = "#000000", light = "#ffffff" } = options;
  return contrastRatio(dark, background) >= contrastRatio(light, background)
    ? dark
    : light;
}

/**
 * Linearly mix two hex colours. `weight` is how much of `b` to use (0 → all
 * `a`, 1 → all `b`). Returns a `#rrggbb` string; returns `a` unchanged if either
 * colour is unparseable.
 *
 * @public
 */
export function mixHex(a: string, b: string, weight = 0.5): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  const w = Math.max(0, Math.min(1, weight));
  return rgbToHex({
    r: ca.r + (cb.r - ca.r) * w,
    g: ca.g + (cb.g - ca.g) * w,
    b: ca.b + (cb.b - ca.b) * w,
  });
}

/**
 * Lighten a hex colour by mixing `amount` (0–1) of white into it.
 *
 * @public
 */
export function lighten(hex: string, amount: number): string {
  return mixHex(hex, "#ffffff", amount);
}

/**
 * Darken a hex colour by mixing `amount` (0–1) of black into it.
 *
 * @public
 */
export function darken(hex: string, amount: number): string {
  return mixHex(hex, "#000000", amount);
}

/* ------------------------------------------------------------------ *
 * Persistence (injectable storage) + a small theme controller
 * ------------------------------------------------------------------ */

/**
 * An in-memory {@link ThemeStorage}, useful for SSR, tests, or environments
 * without a browser storage. State lives in a `Map` and never escapes.
 *
 * @public
 */
export function createMemoryStorage(seed?: Record<string, string>): ThemeStorage {
  const map = new Map<string, string>(seed ? Object.entries(seed) : undefined);
  return {
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/**
 * Read the stored theme from an injected storage, never throwing. Returns
 * `fallback` (default `null`) when there is no value or the read fails.
 *
 * @public
 */
export function readStoredTheme(
  storage: ThemeStorage | undefined,
  key: string,
  fallback: string | null = null,
): string | null {
  if (!storage) return fallback;
  try {
    const v = storage.getItem(key);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Write the theme to an injected storage, never throwing. Returns whether the
 * write succeeded.
 *
 * @public
 */
export function writeStoredTheme(
  storage: ThemeStorage | undefined,
  key: string,
  value: string,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * A snapshot of {@link ThemeController} state.
 *
 * @public
 */
export interface ThemeState {
  /** The current setting (`"light"`, `"dark"`, `"system"`, …). */
  theme: string;
  /** The concrete theme applied, with `"system"` resolved. */
  resolvedTheme: string;
  /** The known OS scheme, or `undefined` until learned. */
  systemTheme: SystemColorScheme | undefined;
  /** The configured selectable themes. */
  themes: string[];
}

/**
 * Options for {@link createThemeController}.
 *
 * @public
 */
export interface ThemeControllerOptions {
  /** @defaultValue `"system"` */
  defaultTheme?: string;
  /** @defaultValue `["light", "dark"]` */
  themes?: string[];
  /** @defaultValue `true` */
  enableSystem?: boolean;
  /** The theme name meaning "follow the OS". @defaultValue `"system"` */
  systemName?: string;
  /** Injected storage; omit for a non-persisting controller. */
  storage?: ThemeStorage;
  /** @defaultValue `"theme"` */
  storageKey?: string;
  /** Learn the OS scheme up front (e.g. `() => matchMedia(q).matches ? "dark" : "light"`). */
  getSystemTheme?: () => SystemColorScheme;
}

/**
 * A framework-agnostic theme controller with subscriptions. It resolves
 * `"system"`, persists to an **injected** storage, and notifies listeners on
 * every change — the exact logic a UI binding (React, Vue, vanilla) needs,
 * with no DOM or storage side effects of its own.
 *
 * @public
 */
export interface ThemeController {
  /** Current immutable state snapshot. */
  getState(): ThemeState;
  /** Set (and persist) the theme. */
  setTheme(theme: string): void;
  /** Update the known OS scheme (e.g. from a media-query listener). */
  setSystemTheme(scheme: SystemColorScheme): void;
  /** Flip the resolved theme between light and dark. */
  toggle(): void;
  /** Advance to the next configured theme, wrapping. */
  cycle(): void;
  /** Subscribe to state changes; returns an unsubscribe function. */
  subscribe(listener: (state: ThemeState) => void): () => void;
}

/**
 * Create a {@link ThemeController}. Reads the initial theme from storage
 * (falling back to `defaultTheme`), optionally learns the OS scheme via
 * `getSystemTheme`, and keeps a resolved theme in sync. Pure aside from the
 * storage you inject.
 *
 * @example
 * ```ts
 * const c = createThemeController({ storage: createMemoryStorage() });
 * c.subscribe((s) => applyToHtml(s.resolvedTheme));
 * c.setTheme("dark");
 * ```
 *
 * @public
 */
export function createThemeController(
  options: ThemeControllerOptions = {},
): ThemeController {
  const {
    defaultTheme = "system",
    themes = ["light", "dark"],
    enableSystem = true,
    systemName = "system",
    storage,
    storageKey = "theme",
    getSystemTheme,
  } = options;

  let theme = readStoredTheme(storage, storageKey, defaultTheme) ?? defaultTheme;
  let systemTheme: SystemColorScheme | undefined = getSystemTheme?.();
  const listeners = new Set<(state: ThemeState) => void>();

  const state = (): ThemeState => ({
    theme,
    resolvedTheme: resolveTheme(theme, {
      systemTheme,
      enableSystem,
      systemName,
    }),
    systemTheme,
    themes: [...themes],
  });

  const emit = (): void => {
    const s = state();
    for (const l of listeners) l(s);
  };

  return {
    getState: state,
    setTheme(next) {
      if (next === theme) return;
      theme = next;
      writeStoredTheme(storage, storageKey, next);
      emit();
    },
    setSystemTheme(scheme) {
      if (scheme === systemTheme) return;
      systemTheme = scheme;
      emit();
    },
    toggle() {
      const resolved = resolveTheme(theme, { systemTheme, enableSystem, systemName });
      this.setTheme(toggleTheme(resolved));
    },
    cycle() {
      this.setTheme(cycleTheme(theme, themes));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
