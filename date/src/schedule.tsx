import { forwardRef, useEffect, useRef, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import {
  daySlots,
  formatIntl,
  formatTimeValue,
  fullDateLabel,
  getTimeValue,
  hasSlot,
  isSameDay,
  scheduleDays,
  slotKey,
  toggleSlot,
  type SlotSpec,
} from "./engine.js";
import { useToday } from "./internal.js";
import { classes, clamp, useControllable, useStableId, type Size } from "./util.js";

export interface ScheduleGridProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue">,
    SlotSpec {
  /** The first day shown. */
  startDate: Date;
  /** Day columns. 1 is a day view, 7 a week. */
  days?: number;
  /** Selected slot start times, controlled. */
  value?: Date[];
  defaultValue?: Date[];
  onChange?: (slots: Date[]) => void;
  /** Allow more than one slot at a time. Off gives a single-booking picker. */
  multiple?: boolean;
  /** Hard cap on selections when `multiple`. Further clicks are ignored. */
  maxSelected?: number;
  /** Blocked slots — already booked, outside opening hours, in the past. */
  disabledSlots?: Date[];
  /** Anything the list cannot express, e.g. a lookup against your availability. */
  isSlotDisabled?: (slot: Date) => boolean;
  locale?: string;
  /** 12-hour labels in the time gutter. */
  use12Hour?: boolean;
  /** Pin "today" for the column highlight. Read after mount otherwise. */
  today?: Date;
  size?: Size;
  /** Replace the contents of a slot button — a price, a "2 left" badge. */
  renderSlot?: (slot: Date, state: { selected: boolean; disabled: boolean }) => ReactNode;
}

/**
 * A day or week of bookable time slots.
 *
 * This is the booking screen grid: days across, times down, every cell a real
 * button. Blocked slots stay focusable and carry `aria-disabled`, so a
 * keyboard user finds out a slot is taken instead of watching focus jump over
 * it, and arrow keys move within the grid the way a spreadsheet does.
 *
 * ```tsx
 * <ScheduleGrid
 *   startDate={monday}
 *   days={5}
 *   startHour={9}
 *   endHour={17}
 *   slotMinutes={30}
 *   disabledSlots={bookedSlots}
 *   onChange={setChosen}
 * />
 * ```
 */
export const ScheduleGrid = forwardRef<HTMLDivElement, ScheduleGridProps>(function ScheduleGrid(
  {
    startDate = new Date(),
    days = 7,
    startHour = 9,
    endHour = 17,
    slotMinutes = 30,
    value,
    defaultValue = [],
    onChange,
    multiple = true,
    maxSelected,
    disabledSlots,
    isSlotDisabled,
    locale,
    use12Hour = false,
    today: todayProp,
    size = "md",
    renderSlot,
    className,
    ...rest
  },
  ref,
) {
  const today = useToday(todayProp);
  const [selected, setSelected] = useControllable<Date[]>(value, defaultValue, onChange);
  const [focus, setFocus] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  const [tick, setTick] = useState(0);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const labelId = useStableId(undefined, "lac-sched");

  const spec: SlotSpec = { startHour, endHour, slotMinutes };
  const columns = scheduleDays(startDate, days);
  const columnSlots = columns.map((day) => daySlots(day, spec));
  const rowCount = columnSlots[0]?.length ?? 0;

  useEffect(() => {
    if (tick === 0) return;
    const node = gridRef.current?.querySelector<HTMLElement>('[data-focused="true"]');
    node?.focus();
  }, [tick]);

  const blocked = (slot: Date): boolean => {
    if (disabledSlots && hasSlot(disabledSlots, slot)) return true;
    return isSlotDisabled ? isSlotDisabled(slot) : false;
  };

  const choose = (slot: Date): void => {
    if (!multiple) {
      setSelected(hasSlot(selected, slot) ? [] : [slot]);
      return;
    }
    const next = toggleSlot(selected, slot);
    if (maxSelected !== undefined && next.length > maxSelected) return;
    setSelected(next);
  };

  const moveFocus = (rowDelta: number, colDelta: number): void => {
    setFocus((current) => ({
      row: clamp(current.row + rowDelta, 0, Math.max(0, rowCount - 1)),
      col: clamp(current.col + colDelta, 0, Math.max(0, columns.length - 1)),
    }));
    setTick((n) => n + 1);
  };

  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-sched", className)}
      data-size={size}
      data-days={columns.length}
    >
      <span id={labelId} className="lac-sched-label">
        {columns.length > 1 && columns[0] && columns[columns.length - 1]
          ? `${formatIntl(columns[0], locale, { day: "numeric", month: "short" })} – ${formatIntl(
              columns[columns.length - 1] as Date,
              locale,
              { day: "numeric", month: "short" },
            )}`
          : columns[0]
            ? fullDateLabel(columns[0], locale)
            : ""}
      </span>
      <div
        className="lac-sched-grid"
        role="grid"
        aria-labelledby={labelId}
        ref={gridRef}
        onKeyDown={(event) => {
          const map: Record<string, [number, number]> = {
            ArrowUp: [-1, 0],
            ArrowDown: [1, 0],
            ArrowLeft: [0, -1],
            ArrowRight: [0, 1],
          };
          const delta = map[event.key];
          if (delta) {
            event.preventDefault();
            moveFocus(delta[0], delta[1]);
            return;
          }
          if (event.key === "Home") {
            event.preventDefault();
            setFocus((current) => ({ row: current.row, col: 0 }));
            setTick((n) => n + 1);
          }
          if (event.key === "End") {
            event.preventDefault();
            setFocus((current) => ({ row: current.row, col: Math.max(0, columns.length - 1) }));
            setTick((n) => n + 1);
          }
        }}
      >
        <div className="lac-sched-row lac-sched-head" role="row">
          <span className="lac-sched-time" role="columnheader" aria-label="Time" />
          {columns.map((day) => (
            <span
              key={slotKey(day)}
              className="lac-sched-day"
              role="columnheader"
              data-today={today !== null && isSameDay(day, today) ? "true" : undefined}
            >
              {formatIntl(day, locale, { weekday: "short", day: "numeric" })}
            </span>
          ))}
        </div>

        {Array.from({ length: rowCount }, (_, row) => {
          const sample = columnSlots[0]?.[row];
          return (
            <div className="lac-sched-row" role="row" key={sample ? slotKey(sample) : row}>
              <span className="lac-sched-time" role="rowheader">
                {sample ? formatTimeValue(getTimeValue(sample), { use12Hour }) : ""}
              </span>
              {columns.map((day, col) => {
                const slot = columnSlots[col]?.[row];
                if (!slot) return <span className="lac-sched-slot" role="gridcell" key={`${col}-${row}`} />;
                const isDisabled = blocked(slot);
                const isSelected = hasSlot(selected, slot);
                const isFocused = focus.row === row && focus.col === col;
                return (
                  <button
                    key={slotKey(slot)}
                    type="button"
                    role="gridcell"
                    className="lac-sched-slot"
                    tabIndex={isFocused ? 0 : -1}
                    aria-label={`${fullDateLabel(day, locale)} at ${formatTimeValue(getTimeValue(slot), { use12Hour })}`}
                    aria-selected={isSelected}
                    aria-disabled={isDisabled || undefined}
                    data-focused={isFocused || undefined}
                    data-selected={isSelected || undefined}
                    data-disabled={isDisabled || undefined}
                    onFocus={() => setFocus({ row, col })}
                    onClick={() => {
                      if (!isDisabled) choose(slot);
                    }}
                  >
                    {renderSlot ? renderSlot(slot, { selected: isSelected, disabled: isDisabled }) : null}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
});
