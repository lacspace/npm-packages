/**
 * @lacspace/ui
 * A tiny, dependency-free React kit that makes a page feel *alive* — scroll
 * reveals, count-ups, gradient text, tilt cards, marquees, a typewriter and a
 * ⌘K command palette. No animation library, no CSS import, no config.
 *
 * Every component is a client component, respects `prefers-reduced-motion`,
 * and takes a `className` so it drops straight into Tailwind projects.
 *
 * React is a peer dependency — nothing else.
 */
"use client";

import {
  createElement,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";

/* ------------------------------------------------------------------ *
 * Utilities
 * ------------------------------------------------------------------ */

/** Join class names, dropping falsy values. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** `true` when the user asked for reduced motion. SSR-safe. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/** Observe an element and report when it scrolls into view. */
export function useInView<T extends Element = HTMLDivElement>(
  options: { threshold?: number; once?: boolean; rootMargin?: string } = {},
): [React.RefObject<T | null>, boolean] {
  const { threshold = 0.15, once = true, rootMargin = "0px 0px -10% 0px" } = options;
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) io.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { threshold, rootMargin },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [threshold, once, rootMargin]);

  return [ref, inView];
}

/* ------------------------------------------------------------------ *
 * <Reveal> — fade + slide in on scroll
 * ------------------------------------------------------------------ */

export interface RevealProps {
  children: ReactNode;
  /** Element to render. Default `"div"`. */
  as?: ElementType;
  /** Seconds to wait before animating in. */
  delay?: number;
  /** Pixels to travel upward while fading in. Default 16. */
  y?: number;
  /** Transition duration in seconds. Default 0.6. */
  duration?: number;
  className?: string;
  style?: CSSProperties;
}

export function Reveal({ children, as = "div", delay = 0, y = 16, duration = 0.6, className, style }: RevealProps): ReactNode {
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLElement>();
  const shown = inView || reduced;
  const merged: CSSProperties = {
    opacity: shown ? 1 : 0,
    transform: shown ? "none" : `translateY(${y}px)`,
    transition: reduced ? undefined : `opacity ${duration}s ease, transform ${duration}s cubic-bezier(0.22,1,0.36,1)`,
    transitionDelay: reduced ? undefined : `${delay}s`,
    willChange: "opacity, transform",
    ...style,
  };
  return createElement(as, { ref, className, style: merged }, children);
}

/* ------------------------------------------------------------------ *
 * <Counter> — count up when it enters view
 * ------------------------------------------------------------------ */

export interface CounterProps {
  value: number;
  /** Animation length in seconds. Default 1.6. */
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Group thousands with commas. Default true. */
  separator?: boolean;
  className?: string;
  as?: ElementType;
}

export function Counter({
  value,
  duration = 1.6,
  decimals = 0,
  prefix = "",
  suffix = "",
  separator = true,
  className,
  as = "span",
}: CounterProps): ReactNode {
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLElement>();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    let start = 0;
    const step = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setDisplay(value * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, value, duration]);

  const num = display.toFixed(decimals);
  const [int, frac] = num.split(".");
  const grouped = separator ? int!.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : int;
  const text = `${prefix}${grouped}${frac ? "." + frac : ""}${suffix}`;
  return createElement(as, { ref, className }, text);
}

/* ------------------------------------------------------------------ *
 * <GradientText>
 * ------------------------------------------------------------------ */

export interface GradientTextProps {
  children: ReactNode;
  from?: string;
  to?: string;
  /** Gradient angle in degrees. Default 135. */
  angle?: number;
  /** Animate the gradient position. */
  animate?: boolean;
  className?: string;
  as?: ElementType;
  style?: CSSProperties;
}

export function GradientText({
  children,
  from = "#22d3ee",
  to = "#6366f1",
  angle = 135,
  animate = false,
  className,
  as = "span",
  style,
}: GradientTextProps): ReactNode {
  const s: CSSProperties = {
    backgroundImage: `linear-gradient(${angle}deg, ${from}, ${to})`,
    backgroundSize: animate ? "200% 200%" : undefined,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    WebkitTextFillColor: "transparent",
    animation: animate ? "lac-gradient-pan 6s ease infinite" : undefined,
    ...style,
  };
  return createElement(
    Fragment,
    null,
    animate ? createElement("style", null, GRADIENT_KEYFRAMES) : null,
    createElement(as, { className, style: s }, children),
  );
}

const GRADIENT_KEYFRAMES = `@keyframes lac-gradient-pan{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}`;

/* ------------------------------------------------------------------ *
 * <TiltCard> — subtle 3D tilt toward the cursor
 * ------------------------------------------------------------------ */

export interface TiltCardProps {
  children: ReactNode;
  /** Max tilt in degrees. Default 8. */
  max?: number;
  /** Scale on hover. Default 1.02. */
  scale?: number;
  className?: string;
  style?: CSSProperties;
}

export function TiltCard({ children, max = 8, scale = 1.02, className, style }: TiltCardProps): ReactNode {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [t, setT] = useState<string>("");

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (reduced) return;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      setT(`perspective(900px) rotateY(${px * max}deg) rotateX(${-py * max}deg) scale(${scale})`);
    },
    [max, scale, reduced],
  );
  const onLeave = useCallback(() => setT(""), []);

  const s: CSSProperties = {
    transform: t || "perspective(900px)",
    transition: "transform 0.25s ease",
    transformStyle: "preserve-3d",
    ...style,
  };
  return createElement("div", { ref, className, style: s, onMouseMove: onMove, onMouseLeave: onLeave }, children);
}

/* ------------------------------------------------------------------ *
 * <Marquee> — infinite horizontal scroll
 * ------------------------------------------------------------------ */

export interface MarqueeProps {
  children: ReactNode;
  /** Seconds for one full loop. Default 24. */
  speed?: number;
  reverse?: boolean;
  pauseOnHover?: boolean;
  /** Gap between the two copies, any CSS length. Default "3rem". */
  gap?: string;
  className?: string;
}

export function Marquee({ children, speed = 24, reverse = false, pauseOnHover = true, gap = "3rem", className }: MarqueeProps): ReactNode {
  const reduced = usePrefersReducedMotion();
  const id = useMemo(() => `lac-mq-${Math.round(1e9 * fauxRandom())}`, []);
  if (reduced) {
    return createElement(
      "div",
      { className, style: { display: "flex", gap, overflow: "hidden" } },
      children,
    );
  }
  const track: CSSProperties = {
    display: "flex",
    gap,
    width: "max-content",
    animation: `lac-marquee ${speed}s linear infinite ${reverse ? "reverse" : ""}`.trim(),
  };
  const css = `@keyframes lac-marquee{from{transform:translateX(0)}to{transform:translateX(calc(-50% - ${gap.includes("rem") ? `${parseFloat(gap) / 2}rem` : "0px"}))}}
.${id}:hover .lac-mq-track{animation-play-state:${pauseOnHover ? "paused" : "running"}}`;
  const group: CSSProperties = { display: "flex", gap, flexShrink: 0 };
  return createElement(
    "div",
    { className: cn(id, className), style: { overflow: "hidden", maxWidth: "100%" } },
    createElement("style", null, css),
    createElement(
      "div",
      { className: "lac-mq-track", style: track },
      createElement("div", { style: group }, children),
      createElement("div", { style: group, "aria-hidden": true }, children),
    ),
  );
}

/* deterministic-enough seed so SSR/CSR ids match closely; avoids Math.random hydration jank on the wrapper only */
let seed = 1;
function fauxRandom(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

/* ------------------------------------------------------------------ *
 * <Typewriter> — cycles through words
 * ------------------------------------------------------------------ */

export interface TypewriterProps {
  words: string[];
  /** Ms per typed character. Default 70. */
  typeSpeed?: number;
  /** Ms per deleted character. Default 40. */
  deleteSpeed?: number;
  /** Ms to hold a completed word. Default 1400. */
  hold?: number;
  className?: string;
  /** Show a blinking cursor. Default true. */
  cursor?: boolean;
}

export function Typewriter({ words, typeSpeed = 70, deleteSpeed = 40, hold = 1400, className, cursor = true }: TypewriterProps): ReactNode {
  const reduced = usePrefersReducedMotion();
  const [text, setText] = useState("");
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    if (reduced) {
      setText(words[0] ?? "");
      return;
    }
    if (words.length === 0) return;
    const current = words[wordIndex % words.length]!;
    let timeout: ReturnType<typeof setTimeout>;
    if (text === current) {
      timeout = setTimeout(() => setText(current.slice(0, -1)), hold);
    } else if (text.length < current.length && !isDeleting(text, current)) {
      timeout = setTimeout(() => setText(current.slice(0, text.length + 1)), typeSpeed);
    } else if (text.length > 0) {
      timeout = setTimeout(() => setText(text.slice(0, -1)), deleteSpeed);
    } else {
      setWordIndex((i) => (i + 1) % words.length);
      timeout = setTimeout(() => {}, typeSpeed);
    }
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, wordIndex, reduced]);

  return createElement(
    "span",
    { className },
    text,
    cursor ? createElement("span", { style: { animation: "lac-blink 1s step-end infinite" } }, "▍") : null,
    cursor ? createElement("style", null, `@keyframes lac-blink{50%{opacity:0}}`) : null,
  );
}

function isDeleting(text: string, current: string): boolean {
  // We're deleting only when text is a prefix of current AND we've just held full.
  return text.length === current.length ? false : !current.startsWith(text);
}

/* ------------------------------------------------------------------ *
 * <CommandPalette> — ⌘K / Ctrl-K quick actions
 * ------------------------------------------------------------------ */

export interface CommandItem {
  id: string;
  label: string;
  group?: string;
  shortcut?: string;
  keywords?: string;
  onSelect: () => void;
}

export interface CommandPaletteProps {
  items: CommandItem[];
  placeholder?: string;
  /** Control externally; omit to let ⌘K/Ctrl-K toggle it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Accent used for the active row. */
  accent?: string;
}

export function CommandPalette({
  items,
  placeholder = "Type a command or search…",
  open: controlled,
  onOpenChange,
  accent = "#6366f1",
}: CommandPaletteProps): ReactNode {
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlled ?? uncontrolled;
  const setOpen = useCallback(
    (v: boolean) => {
      onOpenChange?.(v);
      if (controlled === undefined) setUncontrolled(v);
    },
    [controlled, onOpenChange],
  );

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.label} ${i.group ?? ""} ${i.keywords ?? ""}`.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => setActive(0), [query, open]);

  if (!open) return null;

  const choose = (item: CommandItem | undefined) => {
    if (!item) return;
    item.onSelect();
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(filtered.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(filtered[active]);
    }
  };

  const overlay: CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    backdropFilter: "blur(4px)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingTop: "14vh",
    zIndex: 9999,
  };
  const panel: CSSProperties = {
    width: "min(560px, 92vw)",
    background: "#0f0f16",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "16px",
    boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
    overflow: "hidden",
  };
  const input: CSSProperties = {
    width: "100%",
    padding: "18px 20px",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
    color: "#fff",
    fontSize: "16px",
    outline: "none",
  };

  return createElement(
    "div",
    { style: overlay, onClick: () => setOpen(false) },
    createElement(
      "div",
      { style: panel, onClick: (e: React.MouseEvent) => e.stopPropagation() },
      createElement("input", {
        autoFocus: true,
        value: query,
        placeholder,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value),
        onKeyDown,
        style: input,
      }),
      createElement(
        "div",
        { style: { maxHeight: "320px", overflowY: "auto", padding: "8px" } },
        filtered.length === 0
          ? createElement("div", { style: { padding: "24px", textAlign: "center", opacity: 0.5 } }, "No results")
          : filtered.map((item, i) =>
              createElement(
                "div",
                {
                  key: item.id,
                  onMouseEnter: () => setActive(i),
                  onClick: () => choose(item),
                  style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 14px",
                    borderRadius: "10px",
                    cursor: "pointer",
                    background: i === active ? `${accent}22` : "transparent",
                    border: `1px solid ${i === active ? `${accent}55` : "transparent"}`,
                  },
                },
                createElement(
                  "span",
                  { style: { display: "flex", flexDirection: "column" } },
                  createElement("span", { style: { fontSize: "14px", fontWeight: 500 } }, item.label),
                  item.group ? createElement("span", { style: { fontSize: "12px", opacity: 0.5 } }, item.group) : null,
                ),
                item.shortcut
                  ? createElement(
                      "kbd",
                      {
                        style: {
                          fontSize: "11px",
                          opacity: 0.6,
                          border: "1px solid rgba(255,255,255,0.2)",
                          borderRadius: "6px",
                          padding: "2px 6px",
                        },
                      },
                      item.shortcut,
                    )
                  : null,
              ),
            ),
      ),
    ),
  );
}
