# House rules for @lacspace/components

Every component in this library follows these. They exist so that 100+ components written by different hands still feel like one library. Read `src/button.tsx`, `src/input.tsx` and `src/styles/00-base.css` first — they are the reference implementations.

## Non-negotiables

1. **Zero runtime dependencies.** React is a peer dependency. Nothing else, ever. No clsx, no framer-motion, no radix, no date library (use `@lacspace/datetime` only if the package already declares it).
2. **Server-render safe.** No `window`, `document`, `navigator` or `matchMedia` at module scope or during render. Touch the DOM only inside `useEffect` / event handlers / ref callbacks.
3. **Strict TypeScript.** The repo builds with `noUncheckedIndexedAccess`. Index an array and you get `T | undefined` — handle it. No `any`, no non-null `!` unless the line above it proves the bound.
4. **Every component is typed, exported and documented.** A TSDoc block on the component and on each non-obvious prop. Say *why*, not just what.

## The shape of a component

```tsx
export interface ThingProps extends HTMLAttributes<HTMLDivElement> {
  /** What it does and when you'd change it. */
  variant?: "solid" | "soft";
}

export const Thing = forwardRef<HTMLDivElement, ThingProps>(function Thing(
  { variant = "solid", className, ...rest },
  ref,
) {
  return (
    <div {...rest} ref={ref} className={classes("lac-thing", className)} data-variant={variant} />
  );
});
```

- **`forwardRef` always**, with a named render function (it shows in React DevTools).
- **Spread `...rest` first**, then your own props — so a caller can never be locked out of an attribute you forgot.
- **`classes("lac-thing", className)`** from `./util.js`. The caller's className lands last, so their rules win at equal specificity. Never `!important`.
- **Variants live in `data-*` attributes**, not in class names. `data-variant`, `data-size`, `data-tone`, `data-state`. CSS targets `.lac-thing[data-variant="soft"]`. This keeps class names stable and makes state inspectable in devtools.
- **Falsy data attributes must be `undefined`**, not `false` — `data-loading={loading || undefined}` — otherwise React renders `data-loading="false"` and the CSS matches it.
- **Controlled and uncontrolled both.** Use `useControllable(value, defaultValue, onChange)` from `./util.js`. Never force the caller into one mode.

## Styling

- Add one file: `src/styles/NN-family.css` (pick the next free number). Never edit another family's file — several of these are written in parallel.
- **Only `--lac-*` variables.** No raw hex, no px font sizes, no hardcoded shadows. If you need a value that does not exist, add the token to `00-base.css` under the right group and define it for light *and* dark.
- Class names are `lac-<family>` and `lac-<family>-<part>`. Flat, no nesting deeper than one level.
- Never set `outline: none` without replacing the focus ring. The base sheet already gives every focusable element a ring; leave it alone.
- Animations must respect the reduced-motion block in `00-base.css` — do not add `animation` to an element that would be unreadable when it is disabled.

## Accessibility is part of the work, not a follow-up

- Interactive things are `<button>` or `<a>`. If you must use a div, it needs `role`, `tabIndex={0}` and keyboard handlers for Enter and Space.
- Icon-only controls take a required `label` prop and render `aria-label`.
- Anything that expands sets `aria-expanded` and `aria-controls`.
- Modals and drawers trap focus, return focus to the trigger on close, close on Escape, and mark the rest of the page `aria-hidden`.
- Lists of options use real roles: `role="listbox"` + `role="option"` + `aria-selected`, with Up/Down/Home/End/Escape handled.
- Generate ids with `useStableId()` so server and client markup match.

## Tests

- One `src/<family>.test.tsx` per family, using `vitest`. There is no DOM environment configured here, so **test the pure logic you extracted**, not the rendering: value clamping, keyboard index maths, option filtering, date grids, chart scales, formatters.
- Put that logic in plain exported functions so it can be tested and reused. A component whose behaviour is only reachable by clicking is a component nobody can test.
- Every test name states the behaviour, not the function: `it("keeps the selected index inside the list when wrapping")`.

## Exports

Add your components and their prop types to `src/index.tsx`, grouped by family with a comment. Types are exported with `export type`.

## What "customizable" means here

A user must be able to do all four without forking:

1. **Restyle** — redefine `--lac-*` variables in their own CSS.
2. **Extend** — pass `className` and `style` to any component and win.
3. **Compose** — use the parts (`CardHeader`, `CardBody`) rather than a single monolithic prop soup.
4. **Control** — drive any stateful component from outside via `value`/`onChange`.

If a component cannot do all four, it is not finished.
