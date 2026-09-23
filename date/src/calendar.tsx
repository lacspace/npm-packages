import { forwardRef, useEffect, useRef, useState } from "react";
import type { HTMLAttributes, KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from "react";
import {
  addMonths,
  clampDate,
  endOfWeek,
  isMonthDisabled,
  isSameDay,
  isSameMonth,
  isYearDisabled,
  makeDate,
  monthLabel,
  monthNames,
  nextFocusFromKey,
  startOfDay,
  startOfMonth,
  startOfWeek,
  type CalendarDay,
  type CompleteRange,
  type DisabledRules,
  type Weekday,
} from "./engine.js";
import { Chevron, MonthView, NO_FLAGS, useToday, type DayFlags } from "./internal.js";
import { classes, useControllable, useStableId, type Size } from "./util.js";

/* ==========================================================================
   Roving focus
   ========================================================================== */

interface DayFocus {
  focused: Date;
  gridRef: RefObject<HTMLDivElement>;
  setFocused: (date: Date) => void;
  move: (date: Date) => void;
  handleKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
}

/**
 * The roving tabindex a `role="grid"` needs.
 *
 * Only one day in a grid is tabbable; the arrow keys move which one. The DOM
 * focus call happens in an effect keyed on a counter rather than on the date,
 * so pressing the same key twice still re-focuses, and clicking a day never
 * yanks focus back from wherever the user actually went.
 */
export function useDayFocus(params: {
  initial: Date;
  weekStartsOn: Weekday;
  min?: Date | null;
  max?: Date | null;
  isVisible: (date: Date) => boolean;
  onOutOfView: (date: Date) => void;
}): DayFocus {
  const { initial, weekStartsOn, min, max, isVisible, onOutOfView } = params;
  const [focused, setFocused] = useState<Date>(() => startOfDay(initial));
  const [tick, setTick] = useState(0);
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (tick === 0) return;
    const node = gridRef.current?.querySelector<HTMLElement>('[data-focused="true"]');
    node?.focus();
  }, [tick]);

  const move = (date: Date): void => {
    const target = startOfDay(clampDate(date, min, max));
    setFocused(target);
    if (!isVisible(target)) onOutOfView(target);
    setTick((value) => value + 1);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const next = nextFocusFromKey(focused, event.key, weekStartsOn, event.shiftKey);
    if (!next) return;
    event.preventDefault();
    move(next);
  };

  return { focused, gridRef: gridRef as RefObject<HTMLDivElement>, setFocused, move, handleKeyDown };
}

/* ==========================================================================
   Calendar
   ========================================================================== */

/** Props shared by everything that shows days and blocks some of them. */
export interface DayRuleProps {
  /** Nothing before this day can be chosen. */
  min?: Date;
  /** Nothing after this day can be chosen. */
  max?: Date;
  /** Specific blocked days — holidays, sold-out dates. Compared by calendar day. */
  disabledDates?: Date[];
  /** Blocked weekdays. `[0, 6]` blocks weekends. */
  disabledWeekdays?: number[];
  /** Anything the other rules cannot express, e.g. a lookup in your own data. */
  isDateDisabled?: (date: Date) => boolean;
}

export interface CalendarProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue">,
    DayRuleProps {
  /** The selected day, controlled. */
  value?: Date | null;
  /** The starting selection when uncontrolled. */
  defaultValue?: Date | null;
  onChange?: (date: Date | null) => void;
  /** The month on screen, controlled — pass this to drive the arrows yourself. */
  month?: Date;
  /** The month to open on when uncontrolled. Defaults to the selection, then today. */
  defaultMonth?: Date;
  onMonthChange?: (month: Date) => void;
  /** 0 = Sunday, 1 = Monday. The single most locale-dependent thing here. */
  weekStartsOn?: Weekday;
  /** BCP-47 tag for month and weekday names. Falls back to the runtime default. */
  locale?: string;
  /** How many months to show side by side. */
  numberOfMonths?: number;
  /** Show the greyed days that pad the first and last rows. */
  showOutsideDays?: boolean;
  /** Always render six rows, so the calendar never changes height. */
  fixedWeeks?: boolean;
  /** Show the ISO week number in a left-hand gutter. */
  showWeekNumbers?: boolean;
  /** Pin "today". Leave unset and it is read after mount, which keeps SSR safe. */
  today?: Date;
  size?: Size;
  /** Clicking the selected day again clears it. */
  clearOnReselect?: boolean;
  /**
   * Paint extra state onto days. `RangePicker` and `WeekPicker` are both built
   * on this, and an availability calendar wants it too.
   */
  dayFlags?: (day: CalendarDay, defaults: DayFlags) => DayFlags;
  /** Pointer moved onto a day, or off the grid (null). Drives range previews. */
  onDayHover?: (date: Date | null) => void;
  /** Rendered inside the calendar, under the grid — presets, a time picker, "Today". */
  footer?: ReactNode;
  /** Replace the contents of a day cell. The cell, its button and a11y stay ours. */
  renderDay?: (day: CalendarDay) => ReactNode;
}

/**
 * A month grid.
 *
 * Keyboard support is the WAI-ARIA grid pattern in full: arrows move a day or
 * a week, PageUp/PageDown a month (with Shift, a year), Home and End the ends
 * of the week, Enter or Space selects. Blocked days stay focusable and are
 * marked `aria-disabled`, so a keyboard user can read why a day is unavailable
 * instead of watching focus skip over it.
 *
 * ```tsx
 * <Calendar
 *   defaultValue={new Date(2025, 1, 3)}
 *   weekStartsOn={1}
 *   min={new Date(2025, 0, 1)}
 *   disabledWeekdays={[0, 6]}
 *   onChange={(date) => console.log(date)}
 * />
 * ```
 */
export const Calendar = forwardRef<HTMLDivElement, CalendarProps>(function Calendar(
  {
    value,
    defaultValue = null,
    onChange,
    month,
    defaultMonth,
    onMonthChange,
    weekStartsOn = 0,
    locale,
    numberOfMonths = 1,
    showOutsideDays = true,
    fixedWeeks = false,
    showWeekNumbers = false,
    today: todayProp,
    size = "md",
    clearOnReselect = false,
    min,
    max,
    disabledDates,
    disabledWeekdays,
    isDateDisabled,
    dayFlags,
    onDayHover,
    footer,
    renderDay,
    className,
    ...rest
  },
  ref,
) {
  const today = useToday(todayProp);
  const [selected, setSelected] = useControllable<Date | null>(value, defaultValue, onChange);
  const [viewMonth, setViewMonth] = useControllable<Date>(
    month ? startOfMonth(month) : undefined,
    startOfMonth(defaultMonth ?? value ?? defaultValue ?? todayProp ?? new Date()),
    onMonthChange,
  );

  const rules: DisabledRules = {
    min,
    max,
    dates: disabledDates,
    weekdays: disabledWeekdays,
    matcher: isDateDisabled,
  };

  const months: Date[] = [];
  for (let i = 0; i < Math.max(1, numberOfMonths); i += 1) months.push(addMonths(viewMonth, i));
  const lastMonth = months[months.length - 1] ?? viewMonth;

  const focus = useDayFocus({
    initial: selected ?? viewMonth,
    weekStartsOn,
    min,
    max,
    isVisible: (date) => months.some((m) => isSameMonth(m, date)),
    onOutOfView: (date) => setViewMonth(startOfMonth(date)),
  });

  const captionId = useStableId(undefined, "lac-cal");
  const shiftMonths = (delta: number): void => setViewMonth(startOfMonth(addMonths(viewMonth, delta)));

  const prevDisabled = isMonthDisabled(
    addMonths(viewMonth, -1).getFullYear(),
    addMonths(viewMonth, -1).getMonth(),
    { min, max },
  );
  const nextDisabled = isMonthDisabled(
    addMonths(lastMonth, 1).getFullYear(),
    addMonths(lastMonth, 1).getMonth(),
    { min, max },
  );

  const select = (date: Date): void => {
    if (clearOnReselect && selected && isSameDay(selected, date)) {
      setSelected(null);
    } else {
      setSelected(date);
    }
    focus.setFocused(startOfDay(date));
  };

  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-cal", className)}
      data-size={size}
      data-months={months.length}
    >
      <div className="lac-cal-months" ref={focus.gridRef}>
        {months.map((current, index) => (
          <MonthView
            key={`${current.getFullYear()}-${current.getMonth()}`}
            month={current}
            weekStartsOn={weekStartsOn}
            locale={locale}
            today={today}
            rules={rules}
            showOutsideDays={showOutsideDays}
            fixedWeeks={fixedWeeks}
            showWeekNumbers={showWeekNumbers}
            focused={isSameMonth(current, focus.focused) ? focus.focused : null}
            onSelect={select}
            onHover={onDayHover}
            onKeyDown={focus.handleKeyDown}
            captionId={`${captionId}-${index}`}
            renderDay={renderDay}
            flagsFor={(day) => {
              const base: DayFlags = {
                ...NO_FLAGS,
                selected: selected !== null && isSameDay(day.date, selected),
              };
              return dayFlags ? dayFlags(day, base) : base;
            }}
            caption={
              <>
                {index === 0 ? (
                  <button
                    type="button"
                    className="lac-cal-nav"
                    aria-label="Previous month"
                    disabled={prevDisabled}
                    onClick={() => shiftMonths(-1)}
                  >
                    <Chevron dir={-1} />
                  </button>
                ) : (
                  <span className="lac-cal-nav" aria-hidden />
                )}
                <span className="lac-cal-title" aria-live="polite">
                  {monthLabel(current, locale)}
                </span>
                {index === months.length - 1 ? (
                  <button
                    type="button"
                    className="lac-cal-nav"
                    aria-label="Next month"
                    disabled={nextDisabled}
                    onClick={() => shiftMonths(1)}
                  >
                    <Chevron dir={1} />
                  </button>
                ) : (
                  <span className="lac-cal-nav" aria-hidden />
                )}
              </>
            }
          />
        ))}
      </div>
      {footer && <div className="lac-cal-footer">{footer}</div>}
    </div>
  );
});

/* ==========================================================================
   MonthPicker
   ========================================================================== */

export interface MonthPickerProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
  /** The chosen month, as the 1st of that month. */
  value?: Date | null;
  defaultValue?: Date | null;
  onChange?: (month: Date | null) => void;
  /** The year on screen, controlled. */
  year?: number;
  defaultYear?: number;
  onYearChange?: (year: number) => void;
  min?: Date;
  max?: Date;
  locale?: string;
  /** Month name length in the grid. */
  monthFormat?: "long" | "short";
  today?: Date;
  size?: Size;
}

/**
 * Twelve months in a grid.
 *
 * The value is always the 1st of the chosen month at midnight, so it can be
 * compared and stored without the "which day did it pick?" question a month
 * field otherwise invites.
 */
export const MonthPicker = forwardRef<HTMLDivElement, MonthPickerProps>(function MonthPicker(
  {
    value,
    defaultValue = null,
    onChange,
    year,
    defaultYear,
    onYearChange,
    min,
    max,
    locale,
    monthFormat = "short",
    today: todayProp,
    size = "md",
    className,
    ...rest
  },
  ref,
) {
  const today = useToday(todayProp);
  const [selected, setSelected] = useControllable<Date | null>(value, defaultValue, onChange);
  const [shownYear, setShownYear] = useControllable<number>(
    year,
    defaultYear ?? (value ?? defaultValue ?? todayProp ?? new Date()).getFullYear(),
    onYearChange,
  );
  const names = monthNames(locale, monthFormat);
  const longNames = monthNames(locale, "long");
  const captionId = useStableId(undefined, "lac-month");

  return (
    <div {...rest} ref={ref} className={classes("lac-monthpick", className)} data-size={size}>
      <div className="lac-cal-caption" id={captionId}>
        <button
          type="button"
          className="lac-cal-nav"
          aria-label="Previous year"
          disabled={isYearDisabled(shownYear - 1, { min, max })}
          onClick={() => setShownYear(shownYear - 1)}
        >
          <Chevron dir={-1} />
        </button>
        <span className="lac-cal-title" aria-live="polite">
          {shownYear}
        </span>
        <button
          type="button"
          className="lac-cal-nav"
          aria-label="Next year"
          disabled={isYearDisabled(shownYear + 1, { min, max })}
          onClick={() => setShownYear(shownYear + 1)}
        >
          <Chevron dir={1} />
        </button>
      </div>
      <div className="lac-pickgrid" role="grid" aria-labelledby={captionId}>
        {[0, 1, 2, 3].map((row) => (
          <div className="lac-pickgrid-row" role="row" key={row}>
            {[0, 1, 2].map((col) => {
              const month = row * 3 + col;
              const date = makeDate(shownYear, month, 1);
              const disabled = isMonthDisabled(shownYear, month, { min, max });
              const isSelected = selected !== null && isSameMonth(selected, date);
              const isCurrent = today !== null && isSameMonth(today, date);
              return (
                <button
                  key={month}
                  type="button"
                  role="gridcell"
                  className="lac-pickgrid-cell"
                  aria-label={`${longNames[month] ?? String(month + 1)} ${shownYear}`}
                  aria-selected={isSelected}
                  aria-disabled={disabled || undefined}
                  aria-current={isCurrent ? "date" : undefined}
                  data-selected={isSelected || undefined}
                  data-today={isCurrent || undefined}
                  data-disabled={disabled || undefined}
                  onClick={() => {
                    if (!disabled) setSelected(date);
                  }}
                >
                  {names[month] ?? month + 1}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
});

/* ==========================================================================
   YearPicker
   ========================================================================== */

export interface YearPickerProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
  /** The chosen year, as 1 January of it. */
  value?: Date | null;
  defaultValue?: Date | null;
  onChange?: (year: Date | null) => void;
  min?: Date;
  max?: Date;
  /** Years per page. 12 fits the same 3x4 grid as the month picker. */
  pageSize?: number;
  today?: Date;
  size?: Size;
}

/**
 * A page of years.
 *
 * Paging is anchored to the selection rather than to "now", so opening a field
 * that already holds 1998 shows 1998 — the decade-hopping that a year picker
 * anchored to the current decade forces on you is pure friction in a
 * date-of-birth field.
 */
export const YearPicker = forwardRef<HTMLDivElement, YearPickerProps>(function YearPicker(
  {
    value,
    defaultValue = null,
    onChange,
    min,
    max,
    pageSize = 12,
    today: todayProp,
    size = "md",
    className,
    ...rest
  },
  ref,
) {
  const today = useToday(todayProp);
  const [selected, setSelected] = useControllable<Date | null>(value, defaultValue, onChange);
  const anchorYear = (value ?? defaultValue ?? todayProp ?? new Date()).getFullYear();
  const span = Math.max(1, pageSize);
  const [pageStart, setPageStart] = useState<number>(() => anchorYear - (anchorYear % span));
  const captionId = useStableId(undefined, "lac-year");

  const years: number[] = [];
  for (let i = 0; i < span; i += 1) years.push(pageStart + i);
  const rows: number[][] = [];
  for (let i = 0; i < years.length; i += 3) rows.push(years.slice(i, i + 3));
  const lastYear = years[years.length - 1] ?? pageStart;

  return (
    <div {...rest} ref={ref} className={classes("lac-yearpick", className)} data-size={size}>
      <div className="lac-cal-caption" id={captionId}>
        <button
          type="button"
          className="lac-cal-nav"
          aria-label="Previous years"
          disabled={isYearDisabled(pageStart - 1, { min, max })}
          onClick={() => setPageStart(pageStart - span)}
        >
          <Chevron dir={-1} />
        </button>
        <span className="lac-cal-title" aria-live="polite">
          {`${pageStart} – ${lastYear}`}
        </span>
        <button
          type="button"
          className="lac-cal-nav"
          aria-label="Next years"
          disabled={isYearDisabled(lastYear + 1, { min, max })}
          onClick={() => setPageStart(pageStart + span)}
        >
          <Chevron dir={1} />
        </button>
      </div>
      <div className="lac-pickgrid" role="grid" aria-labelledby={captionId}>
        {rows.map((row, index) => (
          <div className="lac-pickgrid-row" role="row" key={row[0] ?? index}>
            {row.map((year) => {
              const date = makeDate(year, 0, 1);
              const disabled = isYearDisabled(year, { min, max });
              const isSelected = selected !== null && selected.getFullYear() === year;
              const isCurrent = today !== null && today.getFullYear() === year;
              return (
                <button
                  key={year}
                  type="button"
                  role="gridcell"
                  className="lac-pickgrid-cell"
                  aria-label={String(year)}
                  aria-selected={isSelected}
                  aria-disabled={disabled || undefined}
                  aria-current={isCurrent ? "date" : undefined}
                  data-selected={isSelected || undefined}
                  data-today={isCurrent || undefined}
                  data-disabled={disabled || undefined}
                  onClick={() => {
                    if (!disabled) setSelected(date);
                  }}
                >
                  {year}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
});

/* ==========================================================================
   WeekPicker
   ========================================================================== */

export interface WeekPickerProps
  extends Omit<CalendarProps, "value" | "defaultValue" | "onChange" | "dayFlags" | "onDayHover"> {
  /** The selected week, as its first and last day. */
  value?: CompleteRange | null;
  defaultValue?: CompleteRange | null;
  onChange?: (week: CompleteRange | null) => void;
}

/**
 * Selects a whole week at a time.
 *
 * Clicking any day takes the week it belongs to, and hovering previews the
 * whole row — a "week ending 14 March" field where the user has to land on the
 * right day is a field people get wrong.
 */
export const WeekPicker = forwardRef<HTMLDivElement, WeekPickerProps>(function WeekPicker(
  { value, defaultValue = null, onChange, weekStartsOn = 0, ...rest },
  ref,
) {
  const [selected, setSelected] = useControllable<CompleteRange | null>(
    value,
    defaultValue,
    onChange,
  );
  const [hovered, setHovered] = useState<Date | null>(null);

  const inWeek = (date: Date, anchor: Date | null): boolean => {
    if (!anchor) return false;
    return isSameDay(startOfWeek(date, weekStartsOn), startOfWeek(anchor, weekStartsOn));
  };

  return (
    <Calendar
      {...rest}
      ref={ref}
      weekStartsOn={weekStartsOn}
      value={selected ? selected.start : null}
      onChange={(date) => {
        if (!date) {
          setSelected(null);
          return;
        }
        setSelected({
          start: startOfWeek(date, weekStartsOn),
          end: startOfDay(endOfWeek(date, weekStartsOn)),
        });
      }}
      onDayHover={setHovered}
      dayFlags={(day) => {
        const inSelected = selected !== null && inWeek(day.date, selected.start);
        const inHover = inWeek(day.date, hovered);
        const start = isSameDay(day.date, startOfWeek(day.date, weekStartsOn));
        return {
          selected: inSelected,
          inRange: inSelected,
          rangeStart: inSelected && start,
          rangeEnd: inSelected && !start && isSameDay(day.date, startOfDay(endOfWeek(day.date, weekStartsOn))),
          preview: inHover && !inSelected,
        };
      }}
    />
  );
});

