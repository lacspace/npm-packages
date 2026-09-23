import { forwardRef, useState } from "react";
import type { HTMLAttributes } from "react";
import {
  formatTimeValue,
  from12Hour,
  stepTimePart,
  to12Hour,
  type TimeValue,
} from "./engine.js";
import { classes, clamp, useControllable, useStableId, type Size } from "./util.js";

const ZERO: TimeValue = { hours: 0, minutes: 0, seconds: 0 };

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

interface SegmentProps {
  label: string;
  value: number;
  max: number;
  step: number;
  disabled?: boolean;
  /** Shown to screen readers instead of the bare number where it helps. */
  valueText?: string;
  onCommit: (value: number) => void;
}

/**
 * One editable number in a time field.
 *
 * A `role="spinbutton"` text input rather than a `<select>` of 60 options or a
 * scroll column: you can type `0930`, and Up/Down nudge by the step and wrap,
 * which is what people expect from every other time field they have used.
 * Typing is kept in a local draft so an intermediate "0" is not read as
 * midnight and immediately reformatted out from under the caret.
 */
function Segment({ label, value, max, step, disabled, valueText, onCommit }: SegmentProps): JSX.Element {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <input
      className="lac-time-seg"
      type="text"
      role="spinbutton"
      inputMode="numeric"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuetext={valueText}
      disabled={disabled}
      value={draft ?? pad2(value)}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, "").slice(-2);
        setDraft(digits);
        if (digits === "") return;
        const next = Number(digits);
        if (next <= max) onCommit(next);
      }}
      onFocus={(event) => event.target.select()}
      onBlur={() => {
        if (draft !== null && draft !== "") onCommit(clamp(Number(draft), 0, max));
        setDraft(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setDraft(null);
          onCommit(stepTimePart(value, 1, max, step));
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setDraft(null);
          onCommit(stepTimePart(value, -1, max, step));
        }
      }}
    />
  );
}

export interface TimePickerProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue"> {
  /** The chosen time, controlled. */
  value?: TimeValue | null;
  defaultValue?: TimeValue | null;
  onChange?: (time: TimeValue) => void;
  /** Show 1-12 with an AM/PM toggle instead of 0-23. */
  use12Hour?: boolean;
  /** Add a seconds segment. */
  showSeconds?: boolean;
  /** Arrow-key increment for each segment. `minuteStep={15}` gives quarter hours. */
  hourStep?: number;
  minuteStep?: number;
  secondStep?: number;
  disabled?: boolean;
  size?: Size;
  /** Accessible name for the group, when there is no visible label. */
  label?: string;
}

/**
 * Hours, minutes and optional seconds, each individually editable.
 *
 * The three segments are one `role="group"`, so a screen reader announces
 * "Start time, group" once and then each part as it is reached, rather than
 * three unrelated numbers. 12-hour mode adds a real AM/PM toggle button —
 * never a third text field that accepts "xm".
 */
export const TimePicker = forwardRef<HTMLDivElement, TimePickerProps>(function TimePicker(
  {
    value,
    defaultValue = null,
    onChange,
    use12Hour = false,
    showSeconds = false,
    hourStep = 1,
    minuteStep = 1,
    secondStep = 1,
    disabled,
    size = "md",
    label,
    className,
    ...rest
  },
  ref,
) {
  const [selected, setSelected] = useControllable<TimeValue | null>(value, defaultValue, (next) => {
    if (next) onChange?.(next);
  });
  const time = selected ?? ZERO;
  const { hour, period } = to12Hour(time.hours);
  const groupId = useStableId(undefined, "lac-time");

  const patch = (next: Partial<TimeValue>): void => setSelected({ ...time, ...next });

  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-time", className)}
      role="group"
      aria-label={label ?? rest["aria-label"]}
      id={rest.id ?? groupId}
      data-size={size}
      data-disabled={disabled || undefined}
    >
      <Segment
        label="Hours"
        value={use12Hour ? hour : time.hours}
        max={use12Hour ? 12 : 23}
        step={hourStep}
        disabled={disabled}
        valueText={formatTimeValue(time, { use12Hour, showSeconds })}
        onCommit={(next) => {
          if (!use12Hour) {
            patch({ hours: next });
            return;
          }
          const safe = next === 0 ? 12 : next;
          patch({ hours: from12Hour(safe, period) });
        }}
      />
      <span className="lac-time-sep" aria-hidden>
        :
      </span>
      <Segment
        label="Minutes"
        value={time.minutes}
        max={59}
        step={minuteStep}
        disabled={disabled}
        onCommit={(next) => patch({ minutes: next })}
      />
      {showSeconds && (
        <>
          <span className="lac-time-sep" aria-hidden>
            :
          </span>
          <Segment
            label="Seconds"
            value={time.seconds}
            max={59}
            step={secondStep}
            disabled={disabled}
            onCommit={(next) => patch({ seconds: next })}
          />
        </>
      )}
      {use12Hour && (
        <button
          type="button"
          className="lac-time-period"
          disabled={disabled}
          aria-label={`Switch to ${period === "AM" ? "PM" : "AM"}`}
          onClick={() => patch({ hours: from12Hour(hour, period === "AM" ? "PM" : "AM") })}
        >
          {period}
        </button>
      )}
    </div>
  );
});
