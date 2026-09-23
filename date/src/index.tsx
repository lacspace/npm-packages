/**
 * @lacspace/date — dependency-free React date and time pickers.
 *
 * Bring the stylesheet in once, anywhere in your app:
 *   import "@lacspace/date/styles.css";
 * then restyle everything by redefining the --lac-* variables in your own CSS.
 * Already using @lacspace/components? The tokens are shared, so these pickers
 * pick up your theme with nothing else to do.
 */

/* Styles ------------------------------------------------------------------ */
export { DateStyles, dateCss } from "./styles-inject.js";

/* Shared helpers ---------------------------------------------------------- */
export { cx, classes, clamp, useControllable, useStableId } from "./util.js";
export type { Size } from "./util.js";

/* Calendar family --------------------------------------------------------- */
export { Calendar, MonthPicker, YearPicker, WeekPicker, useDayFocus } from "./calendar.js";
export type {
  CalendarProps,
  DayRuleProps,
  MonthPickerProps,
  YearPickerProps,
  WeekPickerProps,
} from "./calendar.js";

/* Picker family ----------------------------------------------------------- */
export { DatePicker, DateRangePicker, DateTimePicker } from "./picker.js";
export type {
  DatePickerProps,
  DateRangePickerProps,
  DateTimePickerProps,
  PickerBaseProps,
} from "./picker.js";

/* Time family ------------------------------------------------------------- */
export { TimePicker } from "./time.js";
export type { TimePickerProps } from "./time.js";

/* Schedule family --------------------------------------------------------- */
export { ScheduleGrid } from "./schedule.js";
export type { ScheduleGridProps } from "./schedule.js";

/* Relative time ----------------------------------------------------------- */
export { RelativeTime } from "./relative.js";
export type { RelativeTimeProps } from "./relative.js";

/* The engine -------------------------------------------------------------- */
export {
  // construction
  makeDate,
  cloneDate,
  isValidDate,
  isLeapYear,
  daysInMonth,
  // boundaries
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  // arithmetic
  addDays,
  addWeeks,
  addMonths,
  addYears,
  addMinutes,
  addHours,
  // comparison
  isSameDay,
  isSameMonth,
  isSameYear,
  isSameWeek,
  compareDay,
  isBeforeDay,
  isAfterDay,
  diffInDays,
  diffInMonths,
  clampDate,
  // grid
  monthGrid,
  weekdayOrder,
  eachDayOfInterval,
  weekDays,
  isoWeekNumber,
  nextFocusFromKey,
  // ranges
  isCompleteRange,
  normalizeRange,
  isInRange,
  isRangeStart,
  isRangeEnd,
  previewRange,
  isInPreviewRange,
  nightsBetween,
  isRangeAllowed,
  selectRangeDate,
  defaultPresets,
  // disabled rules
  isDateDisabled,
  isMonthDisabled,
  isYearDisabled,
  nextEnabledDate,
  // formatting + parsing
  resolveLocale,
  formatIntl,
  monthNames,
  weekdayNames,
  fullDateLabel,
  monthLabel,
  formatDate,
  parseDate,
  utcStamp,
  // time of day
  getTimeValue,
  setTimeValue,
  roundToStep,
  floorToStep,
  normalizeTime,
  to12Hour,
  from12Hour,
  stepTimePart,
  formatTimeValue,
  parseTimeText,
  // schedule slots
  daySlots,
  scheduleDays,
  slotKey,
  hasSlot,
  toggleSlot,
  // relative time
  relativeParts,
  relativeFallback,
  formatRelative,
  relativeRefreshMs,
} from "./engine.js";

export type {
  Weekday,
  CalendarDay,
  MonthGridOptions,
  DateRange,
  CompleteRange,
  RangeLimits,
  RangePreset,
  DisabledRules,
  TimeValue,
  TimeSteps,
  SlotSpec,
  RelativeUnit,
  RelativeParts,
} from "./engine.js";
