import { forwardRef, useEffect, useRef, useState } from "react";
import type { HTMLAttributes } from "react";
import {
  defaultPresets,
  formatDate,
  getTimeValue,
  isCompleteRange,
  isDateDisabled,
  isInPreviewRange,
  isInRange,
  isRangeEnd,
  isRangeStart,
  normalizeRange,
  parseDate,
  previewRange,
  selectRangeDate,
  setTimeValue,
  startOfDay,
  type DateRange,
  type DisabledRules,
  type RangePreset,
  type TimeValue,
  type Weekday,
} from "./engine.js";
import { Calendar, type DayRuleProps } from "./calendar.js";
import { CalendarIcon, ClockIcon, PickerField, Popover, useToday } from "./internal.js";
import { TimePicker } from "./time.js";
import { classes, useControllable, useStableId, type Size } from "./util.js";

/** Everything the three popover pickers share. */
export interface PickerBaseProps extends DayRuleProps {
  /** BCP-47 tag for the calendar's names. Falls back to the runtime default. */
  locale?: string;
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn?: Weekday;
  placeholder?: string;
  disabled?: boolean;
  /** Block typing but still allow picking from the calendar. */
  readOnly?: boolean;
  required?: boolean;
  /** Mark the field invalid from outside — your form library's error state. */
  invalid?: boolean;
  /** Show the clear button once there is a value. */
  clearable?: boolean;
  name?: string;
  size?: Size;
  /** Pin "today"; otherwise it is read after mount, which keeps SSR safe. */
  today?: Date;
  showOutsideDays?: boolean;
  fixedWeeks?: boolean;
  showWeekNumbers?: boolean;
  /** Which edge of the field the panel lines up with. */
  align?: "start" | "end";
  /** Called when typed text could not be read as a date. */
  onInvalidInput?: (text: string) => void;
}

function ruleSetFrom(props: DayRuleProps): DisabledRules {
  return {
    min: props.min,
    max: props.max,
    dates: props.disabledDates,
    weekdays: props.disabledWeekdays,
    matcher: props.isDateDisabled,
  };
}

/* ==========================================================================
   DatePicker
   ========================================================================== */

export interface DatePickerProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue">,
    PickerBaseProps {
  value?: Date | null;
  defaultValue?: Date | null;
  onChange?: (date: Date | null) => void;
  /** The pattern typed text is parsed with and the value is rendered in. */
  format?: string;
  /** Months side by side in the panel. */
  numberOfMonths?: number;
  /** Close the panel as soon as a day is picked. */
  closeOnSelect?: boolean;
  /** Offer a "Today" shortcut under the grid. */
  showTodayButton?: boolean;
}

/**
 * A text field with a calendar in a popover.
 *
 * The input stays a real, typeable input: `03/02/2025` typed straight in is
 * parsed against `format` and rejected if it is not a real date — `31/02/2025`
 * does not quietly become 3 March the way `new Date(...)` would have it. The
 * panel opens on click and on Down arrow, and Escape closes it and puts focus
 * back in the field.
 *
 * ```tsx
 * <DatePicker format="dd/MM/yyyy" min={new Date(2025, 0, 1)} onChange={setDate} />
 * ```
 */
export const DatePicker = forwardRef<HTMLDivElement, DatePickerProps>(function DatePicker(
  {
    value,
    defaultValue = null,
    onChange,
    format = "yyyy-MM-dd",
    locale,
    weekStartsOn = 0,
    placeholder,
    disabled,
    readOnly,
    required,
    invalid,
    clearable = true,
    name,
    size = "md",
    today: todayProp,
    showOutsideDays = true,
    fixedWeeks = false,
    showWeekNumbers = false,
    numberOfMonths = 1,
    closeOnSelect = true,
    showTodayButton = false,
    align = "start",
    onInvalidInput,
    min,
    max,
    disabledDates,
    disabledWeekdays,
    isDateDisabled: isDateDisabledProp,
    className,
    id,
    ...rest
  },
  ref,
) {
  const rules = ruleSetFrom({ min, max, disabledDates, disabledWeekdays, isDateDisabled: isDateDisabledProp });
  const today = useToday(todayProp);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [badInput, setBadInput] = useState(false);
  const [selected, setSelected] = useControllable<Date | null>(value, defaultValue, onChange);
  const [text, setText] = useState<string>(() =>
    selected ? formatDate(selected, format, locale) : "",
  );

  const fieldId = useStableId(id, "lac-datepicker");
  const popoverId = `${fieldId}-panel`;
  const selectedKey = selected ? selected.getTime() : null;

  useEffect(() => {
    setText(selectedKey === null ? "" : formatDate(new Date(selectedKey), format, locale));
    setBadInput(false);
  }, [selectedKey, format, locale]);

  const commit = (raw: string): void => {
    const trimmed = raw.trim();
    if (trimmed === "") {
      setBadInput(false);
      setSelected(null);
      setText("");
      return;
    }
    const parsed = parseDate(trimmed, format, locale);
    if (!parsed || isDateDisabled(parsed, rules)) {
      setBadInput(true);
      onInvalidInput?.(trimmed);
      return;
    }
    setBadInput(false);
    setSelected(parsed);
    setText(formatDate(parsed, format, locale));
  };

  const pick = (date: Date | null): void => {
    setSelected(date);
    if (closeOnSelect) {
      setOpen(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div {...rest} ref={ref} className={classes("lac-datepicker", className)}>
      <PickerField
        ref={inputRef}
        id={fieldId}
        name={name}
        value={text}
        placeholder={placeholder ?? format}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        invalid={invalid || badInput}
        size={size}
        open={open}
        popoverId={popoverId}
        clearable={clearable}
        triggerLabel="Choose a date"
        icon={<CalendarIcon />}
        onTextChange={(next) => {
          setText(next);
          setBadInput(false);
        }}
        onCommit={commit}
        onClear={() => {
          setSelected(null);
          setText("");
          inputRef.current?.focus();
        }}
        onOpen={() => setOpen(true)}
        onToggle={() => setOpen(!open)}
      />
      <Popover
        id={popoverId}
        open={open}
        onClose={() => setOpen(false)}
        returnFocusRef={inputRef}
        align={align}
      >
        <Calendar
          value={selected}
          onChange={pick}
          defaultMonth={selected ?? todayProp ?? undefined}
          weekStartsOn={weekStartsOn}
          locale={locale}
          numberOfMonths={numberOfMonths}
          showOutsideDays={showOutsideDays}
          fixedWeeks={fixedWeeks}
          showWeekNumbers={showWeekNumbers}
          today={todayProp}
          size={size}
          min={min}
          max={max}
          disabledDates={disabledDates}
          disabledWeekdays={disabledWeekdays}
          isDateDisabled={isDateDisabledProp}
          footer={
            showTodayButton && today ? (
              <button
                type="button"
                className="lac-date-action"
                disabled={isDateDisabled(today, rules)}
                onClick={() => pick(startOfDay(today))}
              >
                Today
              </button>
            ) : undefined
          }
        />
      </Popover>
    </div>
  );
});

/* ==========================================================================
   DateRangePicker
   ========================================================================== */

export interface DateRangePickerProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue">,
    PickerBaseProps {
  value?: DateRange;
  defaultValue?: DateRange;
  onChange?: (range: DateRange) => void;
  format?: string;
  /** What sits between the two dates in the field. */
  separator?: string;
  /** Months side by side. Two is the point of a range picker. */
  numberOfMonths?: number;
  /** Shortest allowed stay, in nights. A second click that breaks it re-anchors. */
  minNights?: number;
  /** Longest allowed stay, in nights. */
  maxNights?: number;
  /** Shortcut buttons. Pass `false` to hide them, or your own list. */
  presets?: RangePreset[] | false;
  /** Close the panel once both ends are chosen. */
  closeOnComplete?: boolean;
}

const EMPTY_RANGE: DateRange = { start: null, end: null };

/**
 * Two months, a hover preview and the presets every reporting screen needs.
 *
 * Selection order is handled for you: the first click sets the start, the
 * second the end, and a second click *before* the start re-anchors instead of
 * producing a backwards range. `minNights`/`maxNights` are enforced at that
 * same moment — a click that cannot make a legal range starts a new one rather
 * than silently doing nothing, which is the failure mode users read as "the
 * calendar is broken".
 *
 * ```tsx
 * <DateRangePicker minNights={2} onChange={({ start, end }) => ...} />
 * ```
 */
export const DateRangePicker = forwardRef<HTMLDivElement, DateRangePickerProps>(
  function DateRangePicker(
    {
      value,
      defaultValue = EMPTY_RANGE,
      onChange,
      format = "yyyy-MM-dd",
      separator = "–",
      locale,
      weekStartsOn = 0,
      placeholder,
      disabled,
      readOnly,
      required,
      invalid,
      clearable = true,
      name,
      size = "md",
      today: todayProp,
      showOutsideDays = true,
      fixedWeeks = false,
      showWeekNumbers = false,
      numberOfMonths = 2,
      minNights,
      maxNights,
      presets,
      closeOnComplete = true,
      align = "start",
      onInvalidInput,
      min,
      max,
      disabledDates,
      disabledWeekdays,
      isDateDisabled: isDateDisabledProp,
      className,
      id,
      ...rest
    },
    ref,
  ) {
    const rules = ruleSetFrom({ min, max, disabledDates, disabledWeekdays, isDateDisabled: isDateDisabledProp });
    const today = useToday(todayProp);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [open, setOpen] = useState(false);
    const [badInput, setBadInput] = useState(false);
    const [hovered, setHovered] = useState<Date | null>(null);
    const [range, setRange] = useControllable<DateRange>(value, defaultValue, onChange);

    const fieldId = useStableId(id, "lac-rangepicker");
    const popoverId = `${fieldId}-panel`;

    const render = (current: DateRange): string => {
      if (!current.start) return "";
      const head = formatDate(current.start, format, locale);
      if (!current.end) return head;
      return `${head} ${separator} ${formatDate(current.end, format, locale)}`;
    };

    const [text, setText] = useState<string>(() => render(range));
    const rangeKey = `${range.start ? range.start.getTime() : ""}|${range.end ? range.end.getTime() : ""}`;

    useEffect(() => {
      setText(render(range));
      setBadInput(false);
      // `rangeKey` changes exactly when either end does.
    }, [rangeKey, format, locale, separator]);

    const commit = (raw: string): void => {
      const trimmed = raw.trim();
      if (trimmed === "") {
        setBadInput(false);
        setRange(EMPTY_RANGE);
        return;
      }
      const token = separator.trim() || "–";
      const parts = trimmed.split(token);
      const startText = (parts[0] ?? "").trim();
      const endText = (parts[1] ?? "").trim();
      const start = parseDate(startText, format, locale);
      const end = endText ? parseDate(endText, format, locale) : null;
      if (!start || (endText !== "" && !end)) {
        setBadInput(true);
        onInvalidInput?.(trimmed);
        return;
      }
      if (isDateDisabled(start, rules) || (end && isDateDisabled(end, rules))) {
        setBadInput(true);
        onInvalidInput?.(trimmed);
        return;
      }
      setBadInput(false);
      setRange(normalizeRange({ start, end }));
    };

    const pickDay = (date: Date | null): void => {
      if (!date) return;
      const next = selectRangeDate(range, date, { minNights, maxNights });
      setRange(next);
      setHovered(null);
      if (closeOnComplete && isCompleteRange(next)) {
        setOpen(false);
        inputRef.current?.focus();
      }
    };

    const anchor = range.start && !range.end ? range.start : null;
    const presetList = presets === false ? [] : (presets ?? defaultPresets());

    return (
      <div {...rest} ref={ref} className={classes("lac-rangepicker", className)}>
        <PickerField
          ref={inputRef}
          id={fieldId}
          name={name}
          value={text}
          placeholder={placeholder ?? `${format} ${separator} ${format}`}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          invalid={invalid || badInput}
          size={size}
          open={open}
          popoverId={popoverId}
          clearable={clearable}
          triggerLabel="Choose a date range"
          icon={<CalendarIcon />}
          onTextChange={(next) => {
            setText(next);
            setBadInput(false);
          }}
          onCommit={commit}
          onClear={() => {
            setRange(EMPTY_RANGE);
            inputRef.current?.focus();
          }}
          onOpen={() => setOpen(true)}
          onToggle={() => setOpen(!open)}
        />
        <Popover
          id={popoverId}
          open={open}
          onClose={() => setOpen(false)}
          returnFocusRef={inputRef}
          align={align}
        >
          <div className="lac-range-body">
            {presetList.length > 0 && (
              <div className="lac-range-presets" role="group" aria-label="Preset ranges">
                {presetList.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="lac-date-action"
                    onClick={() => {
                      const next = normalizeRange(preset.range(today ?? new Date()));
                      setRange(next);
                      if (closeOnComplete && isCompleteRange(next)) {
                        setOpen(false);
                        inputRef.current?.focus();
                      }
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
            <Calendar
              value={null}
              onChange={pickDay}
              onDayHover={setHovered}
              defaultMonth={range.start ?? todayProp ?? undefined}
              weekStartsOn={weekStartsOn}
              locale={locale}
              numberOfMonths={numberOfMonths}
              showOutsideDays={showOutsideDays}
              fixedWeeks={fixedWeeks}
              showWeekNumbers={showWeekNumbers}
              today={todayProp}
              size={size}
              min={min}
              max={max}
              disabledDates={disabledDates}
              disabledWeekdays={disabledWeekdays}
              isDateDisabled={isDateDisabledProp}
              dayFlags={(day) => {
                const preview = previewRange(anchor, hovered);
                const inPreview = isInPreviewRange(day.date, anchor, hovered);
                const start = isRangeStart(day.date, range) || isRangeStart(day.date, preview);
                const end = isRangeEnd(day.date, range) || (inPreview && isRangeEnd(day.date, preview));
                return {
                  selected: start || end,
                  inRange: isInRange(day.date, range) || inPreview,
                  rangeStart: start,
                  rangeEnd: end,
                  preview: inPreview && !isInRange(day.date, range),
                };
              }}
            />
          </div>
        </Popover>
      </div>
    );
  },
);

/* ==========================================================================
   DateTimePicker
   ========================================================================== */

export interface DateTimePickerProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue">,
    PickerBaseProps {
  value?: Date | null;
  defaultValue?: Date | null;
  onChange?: (date: Date | null) => void;
  /** Pattern for the field. Include time tokens or the time will not round-trip. */
  format?: string;
  use12Hour?: boolean;
  showSeconds?: boolean;
  minuteStep?: number;
  hourStep?: number;
  secondStep?: number;
  /** Label on the button that closes the panel. */
  doneLabel?: string;
}

/**
 * One field for a day and a time.
 *
 * Picking a day keeps the time already chosen and vice versa, so setting a
 * meeting for "next Tuesday at the same time" is two clicks rather than a
 * re-entry of both halves. The panel stays open after a day is picked —
 * there is a second decision to make — and closes on the Done button, Escape
 * or a click outside.
 */
export const DateTimePicker = forwardRef<HTMLDivElement, DateTimePickerProps>(
  function DateTimePicker(
    {
      value,
      defaultValue = null,
      onChange,
      format = "yyyy-MM-dd HH:mm",
      locale,
      weekStartsOn = 0,
      placeholder,
      disabled,
      readOnly,
      required,
      invalid,
      clearable = true,
      name,
      size = "md",
      today: todayProp,
      showOutsideDays = true,
      fixedWeeks = false,
      showWeekNumbers = false,
      use12Hour = false,
      showSeconds = false,
      hourStep = 1,
      minuteStep = 1,
      secondStep = 1,
      doneLabel = "Done",
      align = "start",
      onInvalidInput,
      min,
      max,
      disabledDates,
      disabledWeekdays,
      isDateDisabled: isDateDisabledProp,
      className,
      id,
      ...rest
    },
    ref,
  ) {
    const rules = ruleSetFrom({ min, max, disabledDates, disabledWeekdays, isDateDisabled: isDateDisabledProp });
    const today = useToday(todayProp);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [open, setOpen] = useState(false);
    const [badInput, setBadInput] = useState(false);
    const [selected, setSelected] = useControllable<Date | null>(value, defaultValue, onChange);

    const fieldId = useStableId(id, "lac-datetimepicker");
    const popoverId = `${fieldId}-panel`;
    const selectedKey = selected ? selected.getTime() : null;
    const [text, setText] = useState<string>(() =>
      selected ? formatDate(selected, format, locale) : "",
    );

    useEffect(() => {
      setText(selectedKey === null ? "" : formatDate(new Date(selectedKey), format, locale));
      setBadInput(false);
    }, [selectedKey, format, locale]);

    const time: TimeValue = selected
      ? getTimeValue(selected)
      : { hours: 9, minutes: 0, seconds: 0 };

    const commit = (raw: string): void => {
      const trimmed = raw.trim();
      if (trimmed === "") {
        setBadInput(false);
        setSelected(null);
        setText("");
        return;
      }
      const parsed = parseDate(trimmed, format, locale);
      if (!parsed || isDateDisabled(parsed, rules)) {
        setBadInput(true);
        onInvalidInput?.(trimmed);
        return;
      }
      setBadInput(false);
      setSelected(parsed);
    };

    return (
      <div {...rest} ref={ref} className={classes("lac-datetimepicker", className)}>
        <PickerField
          ref={inputRef}
          id={fieldId}
          name={name}
          value={text}
          placeholder={placeholder ?? format}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          invalid={invalid || badInput}
          size={size}
          open={open}
          popoverId={popoverId}
          clearable={clearable}
          triggerLabel="Choose a date and time"
          icon={<ClockIcon />}
          onTextChange={(next) => {
            setText(next);
            setBadInput(false);
          }}
          onCommit={commit}
          onClear={() => {
            setSelected(null);
            setText("");
            inputRef.current?.focus();
          }}
          onOpen={() => setOpen(true)}
          onToggle={() => setOpen(!open)}
        />
        <Popover
          id={popoverId}
          open={open}
          onClose={() => setOpen(false)}
          returnFocusRef={inputRef}
          align={align}
        >
          <Calendar
            value={selected}
            onChange={(date) => setSelected(date ? setTimeValue(date, time) : null)}
            defaultMonth={selected ?? todayProp ?? undefined}
            weekStartsOn={weekStartsOn}
            locale={locale}
            showOutsideDays={showOutsideDays}
            fixedWeeks={fixedWeeks}
            showWeekNumbers={showWeekNumbers}
            today={todayProp}
            size={size}
            min={min}
            max={max}
            disabledDates={disabledDates}
            disabledWeekdays={disabledWeekdays}
            isDateDisabled={isDateDisabledProp}
            footer={
              <div className="lac-datetime-foot">
                <TimePicker
                  label="Time"
                  value={time}
                  onChange={(next) => {
                    const base = selected ?? startOfDay(today ?? new Date());
                    setSelected(setTimeValue(base, next));
                  }}
                  use12Hour={use12Hour}
                  showSeconds={showSeconds}
                  hourStep={hourStep}
                  minuteStep={minuteStep}
                  secondStep={secondStep}
                  size={size}
                />
                <button
                  type="button"
                  className="lac-date-action"
                  data-primary="true"
                  onClick={() => {
                    setOpen(false);
                    inputRef.current?.focus();
                  }}
                >
                  {doneLabel}
                </button>
              </div>
            }
          />
        </Popover>
      </div>
    );
  },
);
