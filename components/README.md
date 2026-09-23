<div align="center">

# @lacspace/components

**96 React components. No runtime dependencies, no Tailwind, no CSS-in-JS.**

[![npm version](https://img.shields.io/npm/v/@lacspace/components?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/components)
[![install size](https://packagephobia.com/badge?p=@lacspace/components)](https://packagephobia.com/result?p=@lacspace/components)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/components?label=minzip)](https://bundlephobia.com/package/@lacspace/components)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/components)
[![license](https://img.shields.io/npm/l/@lacspace/components?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Buttons, fields, selects, sliders, comboboxes, modals, drawers, popovers, toasts, tabs, menus, avatars, timelines, trees and 80 more — **every value is a CSS variable you can redefine, every variant is a `data-*` attribute you can target**. React is the only peer dependency. Server-render safe, accessible by construction, and it pairs with [`@lacspace/charts`](https://www.npmjs.com/package/@lacspace/charts), [`@lacspace/table`](https://www.npmjs.com/package/@lacspace/table) and [`@lacspace/date`](https://www.npmjs.com/package/@lacspace/date), which share the same tokens.

## Install

```bash
npm i @lacspace/components
```

```tsx
import "@lacspace/components/styles.css";
import { Button, Card, CardBody, Field, Input } from "@lacspace/components";

export function SignIn() {
  return (
    <Card>
      <CardBody>
        <Field label="Email" hint="We never share it.">
          {({ id, describedBy }) => (
            <Input id={id} aria-describedby={describedBy} type="email" placeholder="you@company.com" />
          )}
        </Field>
        <Button full>Continue</Button>
      </CardBody>
    </Card>
  );
}
```

The package ships `"use client"`, so you can import it straight into a Server Component.

**Browse all 96 rendered live, with a theme editor: [developer.lacspace.com/components](https://developer.lacspace.com/components)**

## Why this one

- **Zero runtime dependencies.** No clsx, no floating-ui, no framer-motion, no date library. Your lockfile gains one line, and your bundle gains only the components you import.
- **One plain stylesheet.** Import it once. Nothing to configure, no build plugin, no `content` globs to keep in sync, and it works the same in Next.js, Vite, Remix, Astro or a plain `<script>` page.
- **Restyled by variables, not by forking.** Every colour, radius, spacing, shadow, control height, font and duration is a `--lac-*` variable. Change the accent in one line and all 96 components follow, dialogs included.
- **Light and dark, done properly.** Tokens are defined for the OS preference *and* for an explicit `data-theme` attribute, so a theme toggle wins in both directions instead of fighting the system setting.
- **Accessible by construction.** Real roles and keyboard behaviour, focus rings that never shift layout, focus traps that return focus where they found it, and icon-only controls that will not compile without a label.
- **Server-render safe.** Nothing touches `window`, `document` or `matchMedia` during render, and ids come from a stable generator, so server and client markup match.
- **The logic is exported too.** Pagination ranges, slider snapping, password scoring, option filtering, roving focus maths — plain functions with no React and no DOM, so you can reuse or test them on their own.

## Theming

Override any variable in your own CSS. These are the ones most people touch:

```css
:root {
  --lac-accent: #7c3aed;
  --lac-accent-hover: #6d31d0;
  --lac-radius: 14px;
  --lac-font: "Inter", system-ui, sans-serif;
  --lac-control-h-md: 42px;
}
```

Scope them to restyle one region instead of the whole app — this is also how you preview a theme:

```css
.marketing-section {
  --lac-accent: #0f766e;
  --lac-radius-pill: 6px;
}
```

### The tokens

| Group | Variables |
| --- | --- |
| Brand | `--lac-accent`, `--lac-accent-hover`, `--lac-accent-active`, `--lac-accent-soft`, `--lac-accent-fg`, `--lac-accent-ring` |
| Intent | `--lac-success`, `--lac-warning`, `--lac-danger`, `--lac-info` — each with a `-soft` companion |
| Surfaces | `--lac-bg`, `--lac-bg-subtle`, `--lac-bg-muted`, `--lac-surface`, `--lac-surface-raised`, `--lac-overlay` |
| Lines | `--lac-border`, `--lac-border-strong`, `--lac-border-focus`, `--lac-ring-width` |
| Text | `--lac-fg`, `--lac-fg-muted`, `--lac-fg-faint`, `--lac-fg-on-accent` |
| Shape & depth | `--lac-radius-sm`, `--lac-radius`, `--lac-radius-lg`, `--lac-radius-xl`, `--lac-radius-pill`, `--lac-shadow-sm`, `--lac-shadow`, `--lac-shadow-lg` |
| Type | `--lac-font`, `--lac-font-mono`, `--lac-text-xs` … `--lac-text-xl`, `--lac-leading` |
| Space | `--lac-space-1` … `--lac-space-6` |
| Controls | `--lac-control-h-sm`, `--lac-control-h-md`, `--lac-control-h-lg` |
| Motion | `--lac-duration`, `--lac-ease` |
| Layers | `--lac-z-popover`, `--lac-z-modal`, `--lac-z-toast` |

The full list with its values sits at the top of the shipped `styles.css`.

### Dark mode

Three states are defined, which is what makes a theme toggle behave:

```css
:root { /* light */ }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* dark */ } }
:root[data-theme="dark"] { /* dark */ }
```

So: no attribute follows the OS; `data-theme="dark"` forces dark even on a light OS; `data-theme="light"` forces light even on a dark one. You only have to set the attribute.

### If you cannot import CSS

Some setups — a CDN page, a sandbox, a widget dropped into somebody else's app — have no CSS pipeline. Render the stylesheet instead:

```tsx
import { LacspaceStyles } from "@lacspace/components";

<LacspaceStyles />; // injects once, no-op if it is already there
```

## Customizing a component

Four things work on every component. If one of them doesn't, that's a bug in the library, not in your code.

| You want to | Do this |
| --- | --- |
| Change how it looks everywhere | Redefine the `--lac-*` variables |
| Change one instance | Pass `className` or `style` — yours lands last and wins, no `!important` needed |
| Change its structure | Use the parts (`CardHeader`, `CardBody`, `CardFooter`) instead of one big prop |
| Drive it from outside | Pass `value` and `onChange` — everything stateful is controllable |

Variants live in `data-*` attributes rather than class names, so your CSS can target any state and devtools shows you the state without decoding class strings:

```css
.lac-btn[data-variant="solid"][data-loading] { opacity: 0.8; }
.lac-input[data-size="sm"][data-invalid] { border-style: dashed; }
```

Every component forwards its ref and spreads unknown props onto the underlying element, so no attribute is ever out of reach.

## The catalogue

### Actions

| Component | What it's for | Props you'll reach for |
| --- | --- | --- |
| `Button` | The button | `variant` (solid/soft/outline/ghost/link), `tone`, `size`, `full`, `loading`, `startIcon`, `endIcon` |
| `IconButton` | A square button holding one icon | `label` (**required** — an icon alone has no accessible name), `icon` |
| `ButtonGroup` | Joined buttons that share edges | — |

`loading` keeps the label in place and swaps the leading icon for a spinner, so the button never changes width mid-click.

### Forms

| Component | What it's for | Props you'll reach for |
| --- | --- | --- |
| `Field` | Label, control, hint and error, wired correctly | `label`, `hint`, `error`, `required` |
| `Input` | Text input with optional adornments | `size`, `invalid`, `startAdornment`, `endAdornment` |
| `Textarea` | Multi-line input | `invalid` |
| `Select` | Native select, styled | `options`, `placeholder`, `size`, `invalid` |
| `Checkbox` | Checkbox with label | `label`, `indeterminate` |
| `Radio` | Radio with label | `label` |
| `Switch` | On/off, announced as on/off | `checked`, `onChange`, `label` |
| `Slider` | One thumb or a range | `min`, `max`, `step`, `range`, `marks`, `tooltip`, `formatValue` |
| `NumberInput` | Numbers with steppers | `min`, `max`, `step`, `precision`, `thousands`, `clampOnBlur` |
| `PinInput` | OTP / verification codes | `length`, `type`, `mask`, `onComplete` |
| `Combobox` | Type to filter, pick one | `options`, `filter`, `allowFreeText`, `emptyMessage` |
| `MultiSelect` | Pick several, shown as chips | `options`, `max`, `filter` |
| `SearchInput` | Debounced search box | `onSearch`, `debounceMs`, `clearable` |
| `PasswordInput` | Reveal toggle and strength meter | `strength`, `scorer`, `showSuggestions` |
| `FileDrop` | Drag-and-drop or browse | `accept`, `multiple`, `maxSize`, `maxFiles`, `onReject` |
| `ColorInput` | Swatch, hex field and presets | `presets` |
| `RadioGroup` / `CheckboxGroup` | A labelled set from data | `options`, `orientation`, `max` |
| `ToggleGroup` | Segmented control | `items`, `type` (single/multiple), `allowDeselect` |
| `Fieldset` | Group with a legend | `legend`, `hint`, `error` |

`Field` takes render-prop children and hands you the ids already correct — the part hand-rolled forms usually get wrong:

```tsx
<Field label="Password" hint="At least 12 characters." error={errors.password}>
  {({ id, describedBy, invalid }) => (
    <PasswordInput id={id} aria-describedby={describedBy} invalid={invalid} />
  )}
</Field>
```

`Select` is deliberately the native element: on a phone that opens the platform picker, which beats any custom listbox for reliability. When you need filtering or multi-select, reach for `Combobox` or `MultiSelect`.

### Overlays

| Component | What it's for | Props you'll reach for |
| --- | --- | --- |
| `Modal` | Dialog with title, body and footer | `open`, `onOpenChange`, `size`, `title`, `description`, `footer`, `initialFocusRef`, `container` |
| `ConfirmDialog` | "Are you sure?", done properly | `message`, `tone`, `confirmLabel`, `onConfirm` |
| `Drawer` | Panel from any edge | `side`, `size`, plus everything `Modal` takes |
| `Popover` | Anchored panel | `trigger`, `placement`, `gap`, `container` |
| `Tooltip` | Hover/focus hint | `content`, `placement`, `delay` |
| `Toast` + `ToastProvider` + `useToast` | Queued notifications | `maxVisible`, `position`, `duration` |
| `Backdrop` | The dim layer on its own | `blur` |

Return a promise from `ConfirmDialog`'s `onConfirm` and the button shows a spinner, blocks further clicks and **keeps the dialog open if the promise rejects** — so a failed delete never looks like a successful one.

```tsx
const { toast } = useToast();
toast({ title: "Project deleted", tone: "success" });
```

`maxVisible` on `ToastProvider` is a queue, not a cap: extra toasts wait for a slot rather than being dropped, their timers do not start until they are on screen, and hovering the stack pauses every countdown.

### Navigation

| Component | What it's for | Props you'll reach for |
| --- | --- | --- |
| `Tabs` + `TabList` + `Tab` + `TabPanel` | Tabbed panels | `value`, `onChange`, `activation` (automatic/manual), `orientation`, `variant` |
| `Accordion` + `AccordionItem` | Collapsible sections | `multiple`, `collapsible`, `headingLevel` |
| `Breadcrumbs` | Trail that collapses when long | `items`, `maxItems`, `itemsBeforeCollapse`, `separator` |
| `Pagination` | Page numbers with ellipses | `totalPages`, `page`, `onChange`, `siblings`, `pageSize`, `pageSizeOptions` |
| `Stepper` | Progress through a flow | `steps`, `active`, `orientation`, `clickable` |
| `DropdownMenu` | Menu with keyboard typeahead | `items`, `trigger`, `align`, `placement` |
| `NavList` + `NavSection` + `NavItem` | Sidebar navigation | `active`, `icon`, `badge` |
| `Toolbar` + `ToolbarGroup` + `ToolbarSeparator` | One tab stop, arrow keys inside | `label`, `orientation`, `loop` |

`headingLevel` on `Accordion` exists because an accordion in a page usually needs to be an `<h3>`, not the `<h2>` a library picked for you.

### Data display

| Component | What it's for | Props you'll reach for |
| --- | --- | --- |
| `Avatar` / `AvatarGroup` | Photo, initials or icon | `name`, `src`, `size`, `shape`, `status`, `max`, `total` |
| `Stat` | A metric with its change | `label`, `value`, `delta`, `invertDelta`, `comparison`, `sparkline` |
| `Timeline` + `TimelineItem` | Events in order | `layout`, `title`, `time`, `tone`, `pending` |
| `DescriptionList` | Label/value pairs | `items`, `layout`, `divided`, `labelWidth` |
| `EmptyState` | Nothing here yet | `icon`, `title`, `description`, `action` |
| `Tag` / `TagInput` | Chips, and typing new ones | `onRemove`, `separators`, `validate`, `max`, `onReject` |
| `Rating` | Stars, half-steps allowed | `max`, `allowHalf`, `readOnly`, `allowClear` |
| `Kbd` | Keyboard shortcuts | `keys`, `separator` |
| `Code` / `Snippet` | Inline code, and a copy button | `code`, `multiline`, `prompt`, `onCopy` |
| `Divider` | A rule, optionally labelled | `orientation`, `label`, `variant` |
| `Tree` | Expandable hierarchy | `nodes`, `expandedIds`, `onSelect`, `indent` |
| `MetricBar` | Share-of-total bars | `items`, `max`, `format`, `showShare` |

`invertDelta` on `Stat` is for metrics where down is good — churn, cost, latency — so the arrow and the colour stop lying about them.

### Feedback

| Component | What it's for | Props you'll reach for |
| --- | --- | --- |
| `Spinner` | Indeterminate wait | `size`, `label` |
| `Skeleton` | Loading placeholder | `width`, `height`, `circle`, `lines` |
| `Progress` | Determinate bar | `value`, `min`, `max`, `tone`, `thickness` |
| `ProgressRing` | Determinate ring | `value`, `size`, `thickness`, `showValue` |
| `Alert` | A message block | `tone`, `title`, `icon`, `action` |
| `Badge` | Small status pill | `tone`, `variant`, `dot` |

`Alert` with the `danger` tone is announced immediately by assistive tech; quieter tones stay polite.

### Surfaces, layout and type

| Component | What it's for | Props you'll reach for |
| --- | --- | --- |
| `Card` + `CardHeader` / `Body` / `Footer` / `Title` / `Description` | Bordered surface, composed | `interactive` |
| `Panel` | Card that can collapse | `title`, `actions`, `footer`, `collapsible`, `open` |
| `Stack` / `HStack` / `VStack` | Flex row or column | `direction`, `gap`, `align`, `justify`, `wrap`, `divider` |
| `Grid` + `GridItem` | CSS grid | `columns`, `minColWidth`, `gap`, `span`, `colStart` |
| `Container` | Centred max-width page body | `size`, `gutter` |
| `Section` | Titled page section | `title`, `description`, `actions`, `level` |
| `Center` / `Spacer` | Centring, and space | `minHeight`, `axis`, `size`, `line` |
| `AspectRatio` | Reserve the space before it loads | `ratio`, `rounded` |
| `ScrollArea` | Scroll box with edge shadows | `axis`, `maxHeight`, `shadows`, `thin` |
| `Sticky` | Sticks while scrolling | `top`, `bottom`, `surface` |
| `Text` / `Heading` | Type, on the scale | `size`, `tone`, `weight`, `truncate`, `lines`, `level`, `balance` |
| `Prose` | Readable long-form block | `size`, `measure` |
| `Blockquote` | Quote with attribution | `attribution`, `meta`, `variant` |
| `Highlight` | Mark search terms in text | `text`, `query`, `caseSensitive` |
| `Truncate` | Shorten in the middle | `text`, `max`, `ellipsis` |

`direction`, `gap` and `columns` take a breakpoint map — `{ base: 1, md: 2, lg: 4 }` or `{ base: "column", md: "row" }` — and it costs no JavaScript: the values become CSS variables read by media queries in the stylesheet.

`gap` takes `1`–`6` from the space scale, or any CSS length.

## Controlled or uncontrolled — both, always

Every stateful component works either way. Pass `value`/`checked` and it is yours to drive; pass `defaultValue`/`defaultChecked` (or nothing) and it keeps its own state and reports changes.

```tsx
<Switch defaultChecked onChange={(on) => save(on)} />          {/* it remembers */}
<Switch checked={on} onChange={setOn} />                        {/* you remember */}
```

The hook behind it, `useControllable`, is exported if you want the same behaviour in your own components.

## Portals

`Modal`, `Drawer`, `Popover`, `Tooltip` and the toast stack render into `document.body` by default. Pass `container` to portal somewhere else — a themed wrapper, a shadow root, a preview pane — and the overlay inherits that subtree's variables instead of the page's:

```tsx
<Modal open={open} onOpenChange={setOpen} container={themedRef.current} title="Settings" />
```

## Accessibility

- Interactive things are real `<button>` and `<a>` elements.
- Modals and drawers trap focus, close on Escape, return focus to whatever opened them, and mark the rest of the page `aria-hidden`.
- Listboxes, menus, tabs, toolbars and trees handle Up/Down/Home/End/Escape and typeahead, with roving `tabIndex` so a list is one tab stop rather than fifty.
- Every focusable element gets a focus ring that draws outside the box, so focus never nudges the layout.
- `IconButton`, `Tree`, `Toolbar` and friends require a `label`, because an icon or a bare container has no accessible name.
- Animations respect `prefers-reduced-motion`.

## Server rendering

Nothing touches the DOM during render, so components can be imported into a Server Component and appear in the first HTML response. Ids come from `useStableId()`, so the server and client markup match and React never re-writes the tree on hydration.

In the Next.js App Router, import the stylesheet once in your root layout:

```tsx
import "@lacspace/components/styles.css";
```

## The logic, without the components

The behaviour is extracted into plain functions, so it can be tested without a DOM and reused without React:

| Function | What it does |
| --- | --- |
| `paginationRange` | Page numbers with ellipses, given totals and siblings |
| `snapToStep`, `clamp`, `percent` | Slider and progress maths |
| `scorePassword` | Password strength, 0–4, with suggestions |
| `filterOptions`, `defaultComboboxFilter` | Option matching for comboboxes |
| `rovingIndex`, `nextFocusIndex`, `typeaheadMatch` | Keyboard navigation maths |
| `collapseBreadcrumbs`, `deriveStepStates` | Trail collapsing and step states |
| `initials`, `colorIndexFor` | Avatar fallbacks, stable per name |
| `splitTagInput`, `mergeTags`, `validateFiles` | Tag and file input rules |
| `positionFloating` | Placement with flipping, used by popovers and tooltips |
| `truncateMiddle`, `splitHighlight` | Text shortening and search marking |

All of them are exported from the package root.

## Requirements

React 18 or 19, as a peer dependency. TypeScript types are included. Ships dual ESM + CJS. No build step, no plugin, no config.

## The rest of the kit

```bash
npm i @lacspace/charts @lacspace/table @lacspace/date
```

Charts, data tables and date pickers are separate packages so you only pay for what you use. They read the same `--lac-*` tokens, so they match out of the box.

## Licence

Lacspace Free Licence v1.0 — use it, ship it, modify it, commercially. See [`LICENSE`](https://github.com/lacspace/npm-packages/blob/main/LICENSE).
