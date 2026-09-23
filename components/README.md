# @lacspace/components

**A React component library with no dependencies.** Buttons, inputs, selects, modals, drawers, tabs, menus, toasts, sliders, comboboxes, avatars, timelines and 60+ more — every one themeable through CSS variables, accessible, and safe to render on the server.

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

## Why this one

- **Zero runtime dependencies.** React is the only peer. No clsx, no floating-ui, no animation library. It adds nothing to your bundle but the components you import.
- **No Tailwind, no CSS-in-JS.** One plain stylesheet. Import it once.
- **Restyled by variables, not by forking.** Every colour, radius, spacing, shadow, control height and duration is a `--lac-*` variable. Change the accent in one line and the whole library follows.
- **Light and dark, done properly.** Tokens are defined for the OS preference *and* for an explicit `data-theme` attribute, so a theme toggle wins in both directions.
- **Accessible by construction.** Real roles and keyboard behaviour, focus rings that never shift layout, focus traps that return focus where they found it, and icon-only controls that require a label.
- **Server-render safe.** Nothing touches `window` during render. Import it straight from a server component.

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

Scope them to restyle one region instead of the whole app:

```css
.marketing-section {
  --lac-accent: #0f766e;
  --lac-radius-pill: 6px;
}
```

The full token list is at the top of the shipped `styles.css`, grouped into brand and intent, surfaces and text, shape and depth, type, space and motion.

### If you cannot import CSS

Some setups (a CDN page, a sandbox, a widget dropped into someone else's app) have no CSS pipeline. Render the stylesheet instead:

```tsx
import { LacspaceStyles } from "@lacspace/components";

<LacspaceStyles />; // injects once, no-op if already present
```

## Customizing a component

Four things always work, on every component:

| You want to | Do this |
| --- | --- |
| Change how it looks everywhere | Redefine the `--lac-*` variables |
| Change one instance | Pass `className` or `style` — yours lands last and wins, no `!important` needed |
| Change its structure | Use the parts (`CardHeader`, `CardBody`, `CardFooter`) instead of one big prop |
| Drive it from outside | Pass `value` and `onChange` — everything stateful is controllable |

Variants are exposed as `data-*` attributes, so you can target any state from your own CSS:

```css
.lac-btn[data-variant="solid"][data-loading] { opacity: 0.8; }
```

## What's inside

**Actions** Button, IconButton, ButtonGroup

**Forms** Field, Label, Input, Textarea, Select, Checkbox, Radio, Switch, Slider, NumberInput, PinInput, Combobox, MultiSelect, SearchInput, PasswordInput, FileDrop, ColorInput, RadioGroup, CheckboxGroup, ToggleGroup, Fieldset

**Overlays** Modal, ConfirmDialog, Drawer, Popover, Tooltip, Toast with `useToast()`, Backdrop

**Navigation** Tabs, Accordion, Breadcrumbs, Pagination, Stepper, DropdownMenu, NavList, Toolbar

**Data display** Avatar, AvatarGroup, Stat, Timeline, DescriptionList, EmptyState, Tag, TagInput, Rating, Kbd, Code, Snippet, Divider, Tree, MetricBar

**Feedback** Spinner, Skeleton, Progress, ProgressRing, Alert, Badge

**Layout and type** Stack, HStack, VStack, Grid, GridItem, Container, Section, Spacer, Center, AspectRatio, ScrollArea, Sticky, Panel, Text, Heading, Prose, Blockquote, Highlight, Truncate

Charts, data tables and date pickers are separate packages so you only pay for what you use:

```bash
npm i @lacspace/charts @lacspace/table @lacspace/date
```

They share the same tokens, so they match out of the box.

## Browse them all

Live examples, props and copyable code: **[developer.lacspace.com/components](https://developer.lacspace.com/components)**

## Licence

Lacspace Free Licence v1.0 — use it, ship it, modify it. See `LICENSE`.
