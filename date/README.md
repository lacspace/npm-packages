# @lacspace/date

### 1.1.0 — `ScheduleGrid` starts today when no `startDate` is given

It threw `Cannot read properties of undefined (reading 'getFullYear')`. A grid
with no start date now starts on the current day.

**React date and time pickers with no dependencies — and a date engine you can use on its own.** Calendar, date picker, range picker with presets, month and year pickers, time picker, date-time picker, week picker, a booking-style schedule grid and a self-updating "3 minutes ago". No moment, no date-fns, no dayjs, no Luxon.

```bash
npm i @lacspace/date
```

```tsx
import "@lacspace/date/styles.css";
import { DatePicker } from "@lacspace/date";

export function Booking() {
  return (
    <DatePicker
      format="dd/MM/yyyy"
      weekStartsOn={1}
      min={new Date()}
      disabledWeekdays={[0, 6]}
      onChange={(date) => console.log(date)}
    />
  );
}
```

## Why this one

- **Zero runtime dependencies.** React is the only peer — not even a date library. The engine is 600 lines of plain functions.
- **No locale table shipped.** Month and weekday names come from `Intl`, so every locale your runtime knows works, and the package stays small.
- **Nothing is mutated.** Every engine function returns a new `Date`. The one you passed in is the one you still have.
- **DST is handled.** Day arithmetic is calendar arithmetic, not `+86400000`, so adding a day across a transition lands on the next calendar day and differences between them come out whole.
- **Accessible by construction.** Real `role="grid"` semantics, every day a `<button>` carrying the full date in its `aria-label`, `aria-selected`, `aria-disabled` on blocked days, and the complete WAI-ARIA keyboard pattern.
- **Server-render safe.** Nothing touches `window` during render, and `RelativeTime` is hydration-safe by construction.
- **Themed by variables.** The same `--lac-*` tokens as [`@lacspace/components`](https://www.npmjs.com/package/@lacspace/components). Use both and they match with nothing to configure.

---

## Components

### `Calendar`

A month grid. Controlled or uncontrolled, one month or several.

```tsx
<Calendar
  defaultValue={new Date(2025, 1, 3)}
  weekStartsOn={1}          // Monday
  numberOfMonths={2}
  fixedWeeks                // always six rows, so the height never jumps
  showWeekNumbers
  min={new Date(2025, 0, 1)}
  max={new Date(2025, 11, 31)}
  disabledDates={holidays}
  disabledWeekdays={[0, 6]}
  isDateDisabled={(d) => soldOut.has(d.toDateString())}
  onChange={(date) => setDate(date)}
/>
```

**Keyboard:** ← → a day · ↑ ↓ a week · PageUp/PageDown a month · Shift+PageUp/PageDown a year · Home/End the ends of the week · Enter or Space selects · Tab leaves the grid (one tab stop, as a grid should have).

Blocked days keep their tab stop and are marked `aria-disabled`. A day a keyboard user cannot reach is a day nobody can explain to them.

| Prop | Default | What it does |
| --- | --- | --- |
| `value` / `defaultValue` / `onChange` | — | The selected day. Controlled or not. |
| `month` / `defaultMonth` / `onMonthChange` | — | The month on screen. Drive the arrows yourself if you want. |
| `weekStartsOn` | `0` | `0` Sunday, `1` Monday. |
| `locale` | runtime default | BCP-47 tag for names. |
| `numberOfMonths` | `1` | Months side by side. |
| `showOutsideDays` | `true` | The greyed padding days. |
| `fixedWeeks` | `false` | Always six rows. |
| `showWeekNumbers` | `false` | ISO week gutter. |
| `today` | read after mount | Pin "today" (tests, fixed clocks). |
| `clearOnReselect` | `false` | Clicking the selected day clears it. |
| `dayFlags` | — | Paint extra state on days. `WeekPicker` and the range picker are built on it. |
| `footer` | — | Rendered under the grid. |
| `renderDay` | — | Replace the cell contents; the button and its a11y stay ours. |

### `DatePicker`

Input plus popover calendar. Typing is a first-class path: text is parsed against `format`, and `31/02/2025` is rejected rather than quietly becoming 3 March.

```tsx
<DatePicker
  format="dd/MM/yyyy"     // also the placeholder
  showTodayButton
  clearable
  align="end"
  onInvalidInput={(text) => console.warn("could not read", text)}
  onChange={setDate}
/>
```

Opens on click and on ↓. Escape closes it and returns focus to the field. The value is committed on Enter and on blur, never mid-keystroke.

### `DateRangePicker`

Two months, a hover preview, and the presets every reporting screen ends up writing by hand.

```tsx
<DateRangePicker
  minNights={2}
  maxNights={30}
  separator="–"
  presets={defaultPresets()}   // or false, or your own
  onChange={({ start, end }) => setRange({ start, end })}
/>
```

Selection order is handled: first click sets the start, second sets the end, and a click *before* the pending start re-anchors instead of producing a backwards range. A second click that would break `minNights`/`maxNights` also re-anchors — doing nothing at all is the behaviour users read as "the calendar is broken".

Built-in presets: today, last 7 days, last 30 days, this month, last month, year to date.

### `MonthPicker` and `YearPicker`

```tsx
<MonthPicker defaultYear={2025} min={new Date(2024, 0, 1)} onChange={setMonth} />
<YearPicker pageSize={12} max={new Date()} onChange={setYear} />
```

`MonthPicker` yields the 1st of the month at midnight; `YearPicker` yields 1 January. Both grey out whole months and years that fall outside `min`/`max`. The year pages are anchored to the current selection, so a date-of-birth field opens on 1998 rather than on this decade.

### `TimePicker`

```tsx
<TimePicker
  label="Start time"
  use12Hour
  showSeconds
  minuteStep={15}
  value={time}
  onChange={setTime}
/>
```

Each segment is a `role="spinbutton"`: type `09`, or use ↑/↓ to step by `hourStep`/`minuteStep`/`secondStep` (they wrap). 12-hour mode adds a real AM/PM toggle button. The value is a `TimeValue` — `{ hours, minutes, seconds }`, no date attached.

### `DateTimePicker`

Calendar and time in one popover. Picking a day keeps the time already chosen and vice versa.

```tsx
<DateTimePicker format="yyyy-MM-dd HH:mm" minuteStep={15} onChange={setWhen} />
```

Include time tokens in `format` or the time will not round-trip through the text field.

### `WeekPicker`

```tsx
<WeekPicker weekStartsOn={1} onChange={(week) => setWeek(week)} /> // { start, end }
```

Clicking any day takes its whole week; hovering previews the row.

### `ScheduleGrid`

Days across, times down, every cell a button — the booking screen.

```tsx
<ScheduleGrid
  startDate={monday}
  days={5}
  startHour={9}
  endHour={17}
  slotMinutes={30}
  disabledSlots={alreadyBooked}
  isSlotDisabled={(slot) => slot < new Date()}
  maxSelected={3}
  onChange={setChosenSlots}
  renderSlot={(slot, { selected }) => (selected ? "✓" : null)}
/>
```

Arrow keys move within the grid, Home/End jump to the ends of a row. Blocked slots stay focusable and carry `aria-disabled`.

### `RelativeTime`

```tsx
<RelativeTime value={post.createdAt} locale="en" cutoffDays={30} />
```

Renders "3 minutes ago" and keeps itself current — every second while the distance is measured in seconds, every hour once it is measured in days. A page with a hundred of these is not a hundred renders a second.

**Hydration is safe by construction.** "Now" is something only the browser knows, so the server (and the first client render, which has to match it exactly) emits the absolute UTC stamp; the relative label appears on mount. The `datetime` attribute always carries the full ISO instant. Pass `now` to pin the clock — the label then renders identically on the server and never ticks, which is what you want in a test or a PDF.

Past `cutoffDays`, it shows a plain date instead: nobody can turn "7 weeks ago" back into a date in their head.

---

## The engine

Every picker here is a thin shell over `src/engine.ts`, and all of it is exported. Use it without rendering anything.

```ts
import { addMonths, monthGrid, parseDate, formatDate, selectRangeDate } from "@lacspace/date";
```

**Construction** — `makeDate` (no two-digit-year trap), `cloneDate`, `isValidDate`, `isLeapYear`, `daysInMonth`.

**Boundaries** — `startOfDay`, `endOfDay`, `startOfWeek`, `endOfWeek`, `startOfMonth`, `endOfMonth`, `startOfYear`, `endOfYear`.

**Arithmetic** — `addDays`, `addWeeks`, `addMonths`, `addYears`, `addMinutes`, `addHours`. Months clamp: 31 January plus one month is 28 February (29 in a leap year), never 3 March.

**Comparison** — `isSameDay`, `isSameMonth`, `isSameYear`, `isSameWeek`, `compareDay`, `isBeforeDay`, `isAfterDay`, `diffInDays`, `diffInMonths`, `clampDate`.

**Grids** — `monthGrid(year, month, { weekStartsOn, fixedWeeks })` returns whole weeks of `CalendarDay` cells, padded at both ends and marked `outside`. Also `weekdayOrder`, `weekDays`, `eachDayOfInterval`, `isoWeekNumber`, `nextFocusFromKey`.

**Ranges** — `normalizeRange` (puts a backwards range the right way round), `isInRange`, `isRangeStart`, `isRangeEnd`, `previewRange`, `isInPreviewRange`, `nightsBetween`, `isRangeAllowed`, `selectRangeDate`, `isCompleteRange`, `defaultPresets`.

**Blocked days** — `isDateDisabled(date, { min, max, dates, weekdays, matcher })`, plus `isMonthDisabled`, `isYearDisabled`, `nextEnabledDate`.

**Formatting and parsing** — `formatDate(date, pattern, locale?)` and `parseDate(text, pattern, locale?)`, a strict pair:

| Token | Meaning | Token | Meaning |
| --- | --- | --- | --- |
| `yyyy` `yy` | year | `HH` `H` | hour, 0-23 |
| `MMMM` `MMM` | month name (`Intl`) | `hh` `h` | hour, 1-12 |
| `MM` `M` | month number | `mm` `m` | minute |
| `dd` `d` | day of month | `ss` `s` | second |
| `EEEE` `EEE` | weekday name (`Intl`) | `a` | AM/PM |
| `SSS` | milliseconds | `'...'` | literal text |

`parseDate` returns `null` for anything it cannot read in full, in range, and round-tripping — so `31/02/2025` and `hello` both come back `null`. Null is a real answer: mark the field invalid rather than guess. The numeric tokens never touch `Intl`, so `formatDate(d, "yyyy-MM-dd")` is identical everywhere and safe as a key or a payload.

**Time of day** — `getTimeValue`, `setTimeValue`, `roundToStep`, `floorToStep`, `normalizeTime`, `to12Hour`, `from12Hour`, `stepTimePart`, `formatTimeValue`, `parseTimeText`.

**Slots** — `daySlots`, `scheduleDays`, `slotKey`, `hasSlot`, `toggleSlot`.

**Relative time** — `relativeParts` (buckets into second/minute/hour/day/week/month/year, truncating so 90 seconds is "1 minute"), `formatRelative`, `relativeFallback`, `relativeRefreshMs`, `utcStamp`.

### Local time, on purpose

Everything works in the viewer's local time and nothing here parses an ISO string implicitly. `new Date("2025-02-03")` is UTC midnight — which is 2 February in the Americas, and the single most common date bug in the JavaScript ecosystem. Build dates from parts (`makeDate(2025, 1, 3)`) or pass the `Date` you already have.

## Theming

Every value is a `--lac-*` variable with an inline fallback, and this package never *defines* one — so it inherits your theme if you have one and stands alone if you do not.

```css
:root {
  --lac-accent: #7c3aed;
  --lac-radius: 14px;
  --lac-control-h-md: 42px;
}
```

Scope them to restyle one region:

```css
.booking-widget { --lac-accent: #0f766e; }
```

Every part is a flat class (`lac-cal-day`, `lac-sched-slot`, `lac-date-pop`) and every state is a `data-*` attribute (`data-selected`, `data-today`, `data-in-range`, `data-preview`, `data-disabled`, `data-outside`), so you can target exactly what you mean:

```css
.lac-cal-day[data-today="true"] { outline: 2px dashed var(--lac-accent); }
```

Your `className` always lands last, so an override never needs `!important`. Light and dark both work: the tokens come from `@lacspace/components`' base sheet if it is loaded, and the fallbacks are the light palette otherwise.

### If you cannot import CSS

```tsx
import { DateStyles } from "@lacspace/date";

<DateStyles />; // injects once, no-op if already present
```

## Internationalisation

Pass `locale` — any BCP-47 tag — and month names, weekday names and `aria-label`s follow it through `Intl`. There is no locale table to import and no bundle to grow.

```tsx
<Calendar locale="fr-FR" weekStartsOn={1} />
<RelativeTime value={ts} locale="es" />
```

An unknown or malformed tag degrades to the runtime default rather than throwing — Node built with a trimmed ICU knows one locale, and a date field must not explode there. `weekStartsOn` is deliberately separate from `locale`: the runtime cannot be asked which day the week starts on in every environment, and it is the one thing you always know about your own users.

## Server rendering

Import anything here straight from a React Server Component — the package ships the `"use client"` boundary itself. Nothing reads `window`, `document` or the clock during render. "Today" is read after mount, so the marker never disagrees between server and client, and `RelativeTime` switches from an absolute UTC stamp to its relative label on mount for the same reason.

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE).
