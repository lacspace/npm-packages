/**
 * Pieces shared by the pickers: the month grid view, the popover, the field
 * shell and the two chevrons. Not exported from the package — they are the
 * seams between components, not public API — but every public component is
 * built from them, so the calendar inside a `DatePicker` is the same calendar
 * you get from `<Calendar />`.
 */
import { forwardRef, useEffect, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  RefObject,
  ReactNode,
} from "react";
import {
  fullDateLabel,
  isDateDisabled,
  isSameDay,
  isoWeekNumber,
  monthGrid,
  weekdayNames,
  type CalendarDay,
  type DisabledRules,
  type Weekday,
} from "./engine.js";
import { cx } from "./util.js";

/* ==========================================================================
   Today, without a hydration mismatch
   ========================================================================== */

/**
 * The current day, or null until the component has mounted.
 *
 * "Today" is the one thing a calendar knows that the server cannot: render it
 * during SSR and the server's clock (and time zone) decides which cell gets
 * the marker, which is exactly the kind of attribute mismatch that makes React
 * throw away the server HTML. So the marker appears after mount. Pass `today`
 * explicitly and that wins — useful in tests and in apps that pin a clock.
 */
export function useToday(explicit?: Date | null): Date | null {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (explicit) return explicit;
  return mounted ? new Date() : null;
}

/* ==========================================================================
   Icons
   ========================================================================== */

/** A chevron. `dir` is -1 for previous, 1 for next. */
export function Chevron({ dir }: { dir: -1 | 1 }): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden focusable="false">
      <path
        d={dir === -1 ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A small calendar glyph for the field's trigger button. */
export function CalendarIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden focusable="false">
      <rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 6.5h12M5.5 1.8v2.4M10.5 1.8v2.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** A small clock glyph for time fields. */
export function ClockIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden focusable="false">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.6V8l2.4 1.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** The clear ("×") glyph. */
export function ClearIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden focusable="false">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* ==========================================================================
   Month view
   ========================================================================== */

/** How a single day should be painted. */
export interface DayFlags {
  selected: boolean;
  inRange: boolean;
  rangeStart: boolean;
  rangeEnd: boolean;
  preview: boolean;
}

/** Nothing special about this day. */
export const NO_FLAGS: DayFlags = {
  selected: false,
  inRange: false,
  rangeStart: false,
  rangeEnd: false,
  preview: false,
};

export interface MonthViewProps {
  /** Any date inside the month to render. */
  month: Date;
  weekStartsOn: Weekday;
  locale?: string;
  /** Today, or null before mount. */
  today: Date | null;
  rules: DisabledRules;
  showOutsideDays: boolean;
  fixedWeeks: boolean;
  showWeekNumbers: boolean;
  /** The roving-tabindex day. Null when this month holds no focus. */
  focused: Date | null;
  flagsFor: (day: CalendarDay) => DayFlags;
  onSelect: (date: Date) => void;
  onHover?: (date: Date | null) => void;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  /** Id of the caption element, so the grid gets an accessible name. */
  captionId: string;
  caption: ReactNode;
  renderDay?: (day: CalendarDay) => ReactNode;
}

/**
 * One month as a `role="grid"`.
 *
 * Every day is a real `<button>` carrying the full date in its `aria-label`,
 * because "14" read on its own tells a screen-reader user nothing. Blocked
 * days are `aria-disabled` rather than `disabled`: a disabled button cannot be
 * focused, and a keyboard user who cannot land on a day is never told why it
 * is unavailable.
 */
export function MonthView({
  month,
  weekStartsOn,
  locale,
  today,
  rules,
  showOutsideDays,
  fixedWeeks,
  showWeekNumbers,
  focused,
  flagsFor,
  onSelect,
  onHover,
  onKeyDown,
  captionId,
  caption,
  renderDay,
}: MonthViewProps): JSX.Element {
  const weeks = monthGrid(month.getFullYear(), month.getMonth(), { weekStartsOn, fixedWeeks });
  const shortNames = weekdayNames(locale, "short", weekStartsOn);
  const longNames = weekdayNames(locale, "long", weekStartsOn);

  // Exactly one cell per grid is tabbable. When the roving focus sits in
  // another month, the first selectable day here takes the tab stop so the
  // grid is still reachable.
  let tabbableKey: string | null = null;
  for (const week of weeks) {
    for (const day of week) {
      if (focused && isSameDay(day.date, focused)) {
        tabbableKey = day.key;
        break;
      }
      if (!tabbableKey && !day.outside && !isDateDisabled(day.date, rules)) tabbableKey = day.key;
    }
  }

  return (
    <div className="lac lac-cal-month">
      <div className="lac-cal-caption" id={captionId}>
        {caption}
      </div>
      <div className="lac-cal-grid" role="grid" aria-labelledby={captionId} onKeyDown={onKeyDown}>
        <div className="lac-cal-row lac-cal-head" role="row">
          {showWeekNumbers && (
            <span className="lac-cal-weeknum" role="columnheader" aria-label="Week number" />
          )}
          {shortNames.map((name, index) => (
            <span
              key={name + String(index)}
              className="lac-cal-weekday"
              role="columnheader"
              aria-label={longNames[index] ?? name}
            >
              {name}
            </span>
          ))}
        </div>

        {weeks.map((week, weekIndex) => {
          const first = week[0];
          return (
            <div className="lac-cal-row" role="row" key={first ? first.key : String(weekIndex)}>
              {showWeekNumbers && first && (
                <span className="lac-cal-weeknum" role="rowheader">
                  {isoWeekNumber(first.date)}
                </span>
              )}
              {week.map((day) => {
                if (day.outside && !showOutsideDays) {
                  return <span className="lac-cal-day" role="gridcell" data-empty="true" key={day.key} />;
                }
                const disabled = isDateDisabled(day.date, rules);
                const flags = flagsFor(day);
                const isFocused = focused !== null && isSameDay(day.date, focused);
                const isToday = today !== null && isSameDay(day.date, today);
                return (
                  <button
                    key={day.key}
                    type="button"
                    role="gridcell"
                    className="lac-cal-day"
                    tabIndex={day.key === tabbableKey ? 0 : -1}
                    aria-label={fullDateLabel(day.date, locale)}
                    aria-selected={flags.selected}
                    aria-disabled={disabled || undefined}
                    aria-current={isToday ? "date" : undefined}
                    data-focused={isFocused || undefined}
                    data-outside={day.outside || undefined}
                    data-today={isToday || undefined}
                    data-selected={flags.selected || undefined}
                    data-disabled={disabled || undefined}
                    data-in-range={flags.inRange || undefined}
                    data-range-start={flags.rangeStart || undefined}
                    data-range-end={flags.rangeEnd || undefined}
                    data-preview={flags.preview || undefined}
                    onClick={() => {
                      if (!disabled) onSelect(day.date);
                    }}
                    onMouseEnter={() => onHover?.(day.date)}
                    onMouseLeave={() => onHover?.(null)}
                  >
                    {renderDay ? renderDay(day) : day.day}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ==========================================================================
   Popover
   ========================================================================== */

export interface PopoverProps {
  /** Id of the panel, so the field can point `aria-controls` at it. */
  id?: string;
  open: boolean;
  onClose: () => void;
  /** The control that opened it — focus goes back there on Escape. */
  returnFocusRef: RefObject<HTMLElement>;
  labelledBy?: string;
  align?: "start" | "end";
  className?: string;
  children: ReactNode;
}

/**
 * The floating panel a picker opens.
 *
 * Closes on Escape and on a click outside, and hands focus back to the field
 * on Escape — a keyboard user must never be stranded inside a panel they
 * cannot leave. It is a plain absolutely-positioned element rather than a
 * portal: no z-index war, no dependency, and it inherits your theme because it
 * is still inside your tree.
 */
export function Popover({
  id,
  open,
  onClose,
  returnFocusRef,
  labelledBy,
  align = "start",
  className,
  children,
}: PopoverProps): JSX.Element | null {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
      returnFocusRef.current?.focus();
    };
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node | null;
      if (!target) return;
      if (ref.current?.contains(target)) return;
      if (returnFocusRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, onClose, returnFocusRef]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      id={id}
      role="dialog"
      aria-label={labelledBy ? undefined : "Choose a date"}
      aria-labelledby={labelledBy}
      className={cx("lac", "lac-date-pop", className)}
      data-align={align}
    >
      {children}
    </div>
  );
}

/* ==========================================================================
   Field shell
   ========================================================================== */

export interface PickerFieldProps {
  id: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  invalid?: boolean;
  size?: "sm" | "md" | "lg";
  open: boolean;
  /** Id of the popover, for `aria-controls`. */
  popoverId: string;
  clearable?: boolean;
  /** Label for the trigger button — "Choose a date", "Choose a time". */
  triggerLabel: string;
  icon: ReactNode;
  name?: string;
  required?: boolean;
  autoComplete?: string;
  onTextChange: (text: string) => void;
  onCommit: (text: string) => void;
  onClear: () => void;
  onOpen: () => void;
  onToggle: () => void;
  className?: string;
}

/**
 * Input, trigger and clear button, wired the way every picker here needs.
 *
 * The input stays a real text input: typing a date is faster than clicking one
 * and is the only way some people can use a date field at all. Down arrow
 * opens the panel, which is the shortcut keyboard users reach for first, and
 * the value is committed on blur and on Enter rather than on every keystroke,
 * so half-typed text is never parsed into a surprise.
 */
export const PickerField = forwardRef<HTMLInputElement, PickerFieldProps>(function PickerField(
  {
    id,
    value,
    placeholder,
    disabled,
    readOnly,
    invalid,
    size = "md",
    open,
    popoverId,
    clearable = true,
    triggerLabel,
    icon,
    name,
    required,
    autoComplete = "off",
    onTextChange,
    onCommit,
    onClear,
    onOpen,
    onToggle,
    className,
  },
  ref,
) {
  return (
    <div className={cx("lac-date-field", className)} data-size={size} data-disabled={disabled || undefined}>
      <input
        ref={ref}
        id={id}
        name={name}
        type="text"
        className="lac-date-input"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        autoComplete={autoComplete}
        inputMode="numeric"
        role="combobox"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-haspopup="dialog"
        aria-invalid={invalid || undefined}
        data-invalid={invalid || undefined}
        onChange={(event) => onTextChange(event.target.value)}
        onBlur={(event) => onCommit(event.target.value)}
        onClick={() => {
          if (!disabled && !open) onOpen();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            onOpen();
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            onCommit(event.currentTarget.value);
          }
        }}
      />
      {clearable && value !== "" && !disabled && !readOnly && (
        <button
          type="button"
          className="lac-date-clear"
          aria-label="Clear"
          onClick={() => onClear()}
        >
          <ClearIcon />
        </button>
      )}
      <button
        type="button"
        className="lac-date-trigger"
        aria-label={triggerLabel}
        aria-expanded={open}
        aria-controls={popoverId}
        disabled={disabled}
        onClick={() => onToggle()}
      >
        {icon}
      </button>
    </div>
  );
});
