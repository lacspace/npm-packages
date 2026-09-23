/**
 * Column definitions and the helpers that write them for you.
 *
 * A column is data, not markup: it says how to *read* a value out of a row and
 * (optionally) how to draw it. Keeping the read separate from the draw is what
 * lets one definition drive sorting, filtering, search, footer totals and CSV
 * export without you writing any of that four more times.
 */
import type { ReactNode } from "react";
import {
  isBlank,
  toNumber,
  toText,
  type AggregateFn,
  type ExportColumn,
  type FilterField,
  type FilterValue,
  type SortField,
} from "./engine.js";
import type { Align, Tone } from "./util.js";

/* ==========================================================================
   The definition
   ========================================================================== */

/** What a cell renderer is handed. */
export interface CellContext<Row, Value = unknown> {
  /** The column's value for this row, already read through the accessor. */
  value: Value;
  /** The whole row, for cells that need more than one field. */
  row: Row;
  /** Position within the rendered page — 0 for the first visible row. */
  index: number;
  /** The row's stable id, the same one selection and expansion use. */
  id: string;
}

/** What a footer renderer is handed. */
export interface FooterContext<Row> {
  /** Every row that survived filtering — not just the current page. */
  rows: readonly Row[];
  /** The column's aggregate, or `null` when there was nothing to aggregate. */
  value: number | null;
  /** The column id, so one shared footer renderer can tell columns apart. */
  id: string;
}

/**
 * Everything on a column that does not depend on its value type. Split out so
 * the typed parts (`accessor`, `cell`, `compare`, `filterFn`) can be redeclared
 * by each helper with the value type that helper guarantees.
 */
export interface CommonColumnOptions<Row> {
  /** Header content. Rich nodes are fine; give `name` too if you use one. */
  header?: ReactNode;
  /** Plain-text name, used by the column menu, the export header and titles. */
  name?: string;
  /** Shorthand accessor: read this property off the row. */
  key?: Extract<keyof Row, string>;
  /** Footer content, or a renderer that receives the aggregate. */
  footer?: ReactNode | ((ctx: FooterContext<Row>) => ReactNode);
  /** Footer total to compute over the filtered rows. */
  aggregate?: AggregateFn;
  /** Turn that total into what the footer shows. Defaults to a formatted number. */
  formatAggregate?: (value: number | null) => ReactNode;
  /** Allow sorting by this column. Default `true` (except action columns). */
  sortable?: boolean;
  /** Offer a filter input for this column. Default `false`. */
  filterable?: boolean;
  /** Placeholder for that filter input. */
  filterPlaceholder?: string;
  /** Include in the global search. Default `true`. */
  searchable?: boolean;
  /** Text this column contributes to the global search. Defaults to its value. */
  getSearchText?: (row: Row) => string;
  /** Value written to CSV/TSV. Defaults to the cell value as text. */
  exportValue?: (row: Row) => unknown;
  /** Include in exports. Default `true`. */
  exportable?: boolean;
  /** Text alignment for header, cells and footer. */
  align?: Align;
  /** Starting width in pixels. Columns without one share the leftover space. */
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  /** Allow the drag handle on the header edge. Default `true` when sized. */
  resizable?: boolean;
  /** Freeze the column against an edge while the table scrolls sideways. */
  pinned?: "left" | "right";
  /** Offer the column in the visibility menu. Default `true`. */
  hideable?: boolean;
  /** Start hidden — for the columns power users want but nobody needs by default. */
  defaultHidden?: boolean;
  /** Extra class on the `<td>`. */
  className?: string;
  /** Extra class on the `<th>`. */
  headerClassName?: string;
}

/**
 * A column.
 *
 * `Value` is inferred from `accessor` when you build the column through
 * {@link defineColumn} or one of the helpers, which is what gives `cell` a
 * properly typed `value` instead of `unknown`.
 */
export interface ColumnDef<Row, Value = unknown> extends CommonColumnOptions<Row> {
  /** Unique id. Also the key used by sort, filter and visibility state. */
  id: string;
  /** How to read this column's value out of a row. */
  accessor?: (row: Row) => Value;
  /** How to draw it. Without one, the value is rendered as text. */
  cell?: (ctx: CellContext<Row, Value>) => ReactNode;
  /** Custom comparator, for when `localeCompare` is not the right answer. */
  compare?: (a: Value, b: Value, rowA: Row, rowB: Row) => number;
  /** Custom predicate, for filters the shape-based matcher cannot express. */
  filterFn?: (value: Value, filter: FilterValue, row: Row) => boolean;
}

/**
 * A column with its value type erased, so columns of different value types can
 * live in one array. Every helper returns this.
 */
export type AnyColumn<Row> = ColumnDef<Row, unknown>;

/**
 * Build a column and keep the inference.
 *
 * ```ts
 * defineColumn<Invoice, number>({
 *   id: "total",
 *   accessor: (row) => row.total,          // Value inferred as number
 *   cell: ({ value }) => value.toFixed(2), // …so `value` is a number here
 * })
 * ```
 *
 * The returned column is typed `AnyColumn<Row>`. That single erasure is the
 * only cast in the package: a mixed `columns` array cannot keep one value type
 * per element, and the erasure is sound because the same definition supplies
 * both the accessor and the renderer.
 */
export function defineColumn<Row, Value>(def: ColumnDef<Row, Value>): AnyColumn<Row> {
  return def as unknown as AnyColumn<Row>;
}

/** Build a whole array of columns, each keeping its own inferred value type. */
export function defineColumns<Row>(columns: ReadonlyArray<AnyColumn<Row>>): Array<AnyColumn<Row>> {
  return columns.slice();
}

/* ==========================================================================
   Resolution — definition in, everything the table needs out
   ========================================================================== */

/** Default width used for pinned-offset maths when a column has no width. */
export const DEFAULT_COLUMN_WIDTH = 160;

/** A column definition with every default filled in. */
export interface ResolvedColumn<Row> {
  id: string;
  def: AnyColumn<Row>;
  header: ReactNode;
  /** Plain-text name for menus, titles and export headers. */
  name: string;
  getValue: (row: Row) => unknown;
  renderCell: (ctx: CellContext<Row, unknown>) => ReactNode;
  align: Align;
  width: number | undefined;
  minWidth: number;
  maxWidth: number;
  sortable: boolean;
  filterable: boolean;
  searchable: boolean;
  exportable: boolean;
  resizable: boolean;
  hideable: boolean;
  defaultHidden: boolean;
  pinned: "left" | "right" | false;
  aggregate: AggregateFn | undefined;
}

/** How a column reads its value: explicit accessor, then `key`, then nothing. */
export function columnReader<Row>(def: AnyColumn<Row>): (row: Row) => unknown {
  if (def.accessor) return def.accessor;
  const key = def.key;
  if (key !== undefined) return (row: Row) => (row as Record<string, unknown>)[key];
  return () => undefined;
}

/** Fill in every default a column did not state. */
export function resolveColumn<Row>(def: AnyColumn<Row>): ResolvedColumn<Row> {
  const getValue = columnReader(def);
  const name = def.name ?? (typeof def.header === "string" ? def.header : def.id);
  return {
    id: def.id,
    def,
    header: def.header ?? name,
    name,
    getValue,
    renderCell: def.cell ?? ((ctx) => toText(ctx.value)),
    align: def.align ?? "start",
    width: def.width,
    minWidth: def.minWidth ?? 64,
    maxWidth: def.maxWidth ?? 960,
    sortable: def.sortable ?? true,
    filterable: def.filterable ?? false,
    searchable: def.searchable ?? true,
    exportable: def.exportable ?? true,
    resizable: def.resizable ?? true,
    hideable: def.hideable ?? true,
    defaultHidden: def.defaultHidden ?? false,
    pinned: def.pinned ?? false,
    aggregate: def.aggregate,
  };
}

export function resolveColumns<Row>(
  defs: ReadonlyArray<AnyColumn<Row>>,
): Array<ResolvedColumn<Row>> {
  return defs.map(resolveColumn);
}

/** The sort fields the engine needs, derived from resolved columns. */
export function sortFieldsFrom<Row>(
  columns: ReadonlyArray<ResolvedColumn<Row>>,
): Record<string, SortField<Row>> {
  const fields: Record<string, SortField<Row>> = {};
  for (const column of columns) {
    const compare = column.def.compare;
    fields[column.id] = compare
      ? { getValue: column.getValue, compare }
      : { getValue: column.getValue };
  }
  return fields;
}

/** The filter fields the engine needs, derived from resolved columns. */
export function filterFieldsFrom<Row>(
  columns: ReadonlyArray<ResolvedColumn<Row>>,
): Record<string, FilterField<Row>> {
  const fields: Record<string, FilterField<Row>> = {};
  for (const column of columns) {
    const field: FilterField<Row> = {
      getValue: column.getValue,
      searchable: column.searchable,
    };
    if (column.def.filterFn) field.filterFn = column.def.filterFn;
    if (column.def.getSearchText) field.getSearchText = column.def.getSearchText;
    fields[column.id] = field;
  }
  return fields;
}

/** The export columns for a set of resolved columns, in the order given. */
export function exportColumnsFrom<Row>(
  columns: ReadonlyArray<ResolvedColumn<Row>>,
): Array<ExportColumn<Row>> {
  return columns
    .filter((column) => column.exportable)
    .map((column) => ({
      header: column.name,
      value: column.def.exportValue ?? column.getValue,
    }));
}

/* ==========================================================================
   Formatting
   ========================================================================== */

/**
 * Coerce a cell value to a `Date`, or `null`.
 *
 * Accepts dates, epoch milliseconds and anything `Date` can parse; an
 * unparseable value is `null` rather than an Invalid Date, so it sorts as a
 * blank instead of poisoning the comparison.
 */
export function toDate(value: unknown): Date | null {
  if (isBlank(value)) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value === "number") return Number.isFinite(value) ? new Date(value) : null;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
}

export interface NumberFormatOptions {
  /** BCP-47 locale. Pass one explicitly when you server-render, or the server
   *  and the browser can format the same number differently and React will
   *  complain about the mismatch. */
  locale?: string;
  /** Fixed number of decimals. Shorthand for min/max fraction digits. */
  decimals?: number;
  /** Anything else `Intl.NumberFormat` understands. */
  format?: Intl.NumberFormatOptions;
  /** Shown when the value is blank. Default `"—"`. */
  blank?: string;
}

/** A number as text, via `Intl`. Blanks become the `blank` placeholder. */
export function formatNumber(value: unknown, options: NumberFormatOptions = {}): string {
  const { locale, decimals, format, blank = "—" } = options;
  const numeric = toNumber(value);
  if (numeric === null) return blank;
  const fraction =
    decimals === undefined
      ? {}
      : { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  return new Intl.NumberFormat(locale, { ...fraction, ...format }).format(numeric);
}

export interface CurrencyFormatOptions extends NumberFormatOptions {
  /** ISO 4217 code. Default `USD`. */
  currency?: string;
}

/** A number as money. */
export function formatCurrency(value: unknown, options: CurrencyFormatOptions = {}): string {
  const { currency = "USD", decimals = 2, ...rest } = options;
  return formatNumber(value, {
    ...rest,
    decimals,
    format: { style: "currency", currency, ...rest.format },
  });
}

export interface DateFormatOptions {
  locale?: string;
  /** Anything `Intl.DateTimeFormat` understands. Default `dateStyle: "medium"`. */
  format?: Intl.DateTimeFormatOptions;
  blank?: string;
}

/** A date as text, via `Intl`. */
export function formatDate(value: unknown, options: DateFormatOptions = {}): string {
  const { locale, format, blank = "—" } = options;
  const date = toDate(value);
  if (!date) return blank;
  return new Intl.DateTimeFormat(locale, format ?? { dateStyle: "medium" }).format(date);
}

/* ==========================================================================
   Column helpers
   ========================================================================== */

export interface TextColumnOptions<Row> extends CommonColumnOptions<Row> {
  accessor?: (row: Row) => string | number | null | undefined;
  cell?: (ctx: CellContext<Row, string>) => ReactNode;
  /** Clamp long text to N lines with an ellipsis. */
  lines?: number;
}

/** Plain text: the column you reach for nine times out of ten. */
export function textColumn<Row>(id: string, options: TextColumnOptions<Row> = {}): AnyColumn<Row> {
  const { accessor, cell, lines, ...rest } = options;
  const read = accessor ?? columnReader({ id, ...rest } as AnyColumn<Row>);
  return defineColumn<Row, string>({
    ...rest,
    id,
    accessor: (row) => toText(read(row)),
    cell:
      cell ??
      (lines
        ? ({ value }) => (
            <span
              className="lac lac-table-clamp"
              style={{ WebkitLineClamp: lines, ["--lac-table-lines" as string]: String(lines) }}
              title={value}
            >
              {value}
            </span>
          )
        : undefined),
  });
}

export interface NumberColumnOptions<Row> extends CommonColumnOptions<Row>, NumberFormatOptions {
  accessor?: (row: Row) => number | string | null | undefined;
  cell?: (ctx: CellContext<Row, number | null>) => ReactNode;
}

/**
 * A number: right-aligned, tabular figures, `Intl`-formatted.
 *
 * Right alignment is not decoration — it is what lets a reader compare
 * magnitudes down a column without reading a single digit.
 */
export function numberColumn<Row>(
  id: string,
  options: NumberColumnOptions<Row> = {},
): AnyColumn<Row> {
  const { accessor, cell, locale, decimals, format, blank, ...rest } = options;
  const read = accessor ?? columnReader({ id, ...rest } as AnyColumn<Row>);
  const fmt = { locale, decimals, format, blank };
  return defineColumn<Row, number | null>({
    align: "end",
    ...rest,
    id,
    accessor: (row) => toNumber(read(row)),
    cell: cell ?? (({ value }) => <span className="lac lac-table-num">{formatNumber(value, fmt)}</span>),
    formatAggregate: rest.formatAggregate ?? ((value) => formatNumber(value, fmt)),
  });
}

export interface CurrencyColumnOptions<Row> extends CommonColumnOptions<Row>, CurrencyFormatOptions {
  accessor?: (row: Row) => number | string | null | undefined;
  cell?: (ctx: CellContext<Row, number | null>) => ReactNode;
}

/** Money. Same as a number column, with the currency baked into the format. */
export function currencyColumn<Row>(
  id: string,
  options: CurrencyColumnOptions<Row> = {},
): AnyColumn<Row> {
  const { accessor, cell, locale, decimals, format, blank, currency, ...rest } = options;
  const read = accessor ?? columnReader({ id, ...rest } as AnyColumn<Row>);
  const fmt = { locale, decimals, format, blank, currency };
  return defineColumn<Row, number | null>({
    align: "end",
    aggregate: "sum",
    ...rest,
    id,
    accessor: (row) => toNumber(read(row)),
    cell:
      cell ?? (({ value }) => <span className="lac lac-table-num">{formatCurrency(value, fmt)}</span>),
    formatAggregate: rest.formatAggregate ?? ((value) => formatCurrency(value, fmt)),
    exportValue: rest.exportValue ?? ((row) => toNumber(read(row))),
  });
}

export interface DateColumnOptions<Row> extends CommonColumnOptions<Row>, DateFormatOptions {
  accessor?: (row: Row) => Date | string | number | null | undefined;
  cell?: (ctx: CellContext<Row, Date | null>) => ReactNode;
}

/**
 * A date. The value stays a `Date` so sorting is chronological, while the cell
 * renders a `<time>` with a machine-readable `dateTime`.
 */
export function dateColumn<Row>(id: string, options: DateColumnOptions<Row> = {}): AnyColumn<Row> {
  const { accessor, cell, locale, format, blank = "—", ...rest } = options;
  const read = accessor ?? columnReader({ id, ...rest } as AnyColumn<Row>);
  return defineColumn<Row, Date | null>({
    ...rest,
    id,
    accessor: (row) => toDate(read(row)),
    cell:
      cell ??
      (({ value }) =>
        value ? (
          <time dateTime={value.toISOString()}>{formatDate(value, { locale, format, blank })}</time>
        ) : (
          blank
        )),
    exportValue: rest.exportValue ?? ((row) => toDate(read(row))),
  });
}

export interface BadgeColumnOptions<Row> extends CommonColumnOptions<Row> {
  accessor?: (row: Row) => string | number | null | undefined;
  cell?: (ctx: CellContext<Row, string>) => ReactNode;
  /** Tone per value, e.g. `{ paid: "success", overdue: "danger" }`. */
  tones?: Readonly<Record<string, Tone>>;
  /** Display text per value, when the stored value is not what you want shown. */
  labels?: Readonly<Record<string, string>>;
  /** Tone for values not in `tones`. Default `default`. */
  fallbackTone?: Tone;
}

/** A status pill. Sorts and exports on the raw value, not the label. */
export function badgeColumn<Row>(id: string, options: BadgeColumnOptions<Row> = {}): AnyColumn<Row> {
  const { accessor, cell, tones, labels, fallbackTone = "default", ...rest } = options;
  const read = accessor ?? columnReader({ id, ...rest } as AnyColumn<Row>);
  return defineColumn<Row, string>({
    ...rest,
    id,
    accessor: (row) => toText(read(row)),
    cell:
      cell ??
      (({ value }) => {
        if (value === "") return null;
        const tone = tones?.[value] ?? fallbackTone;
        return (
          <span className="lac lac-table-badge" data-tone={tone}>
            {labels?.[value] ?? value}
          </span>
        );
      }),
  });
}

export interface BooleanColumnOptions<Row> extends CommonColumnOptions<Row> {
  accessor?: (row: Row) => boolean | null | undefined;
  cell?: (ctx: CellContext<Row, boolean | null>) => ReactNode;
  trueLabel?: string;
  falseLabel?: string;
  blank?: string;
}

/**
 * Yes/no. The mark is decorative and the label carries the meaning, so a screen
 * reader hears "Yes" rather than "check mark".
 */
export function booleanColumn<Row>(
  id: string,
  options: BooleanColumnOptions<Row> = {},
): AnyColumn<Row> {
  const { accessor, cell, trueLabel = "Yes", falseLabel = "No", blank = "—", ...rest } = options;
  const read = accessor ?? columnReader({ id, ...rest } as AnyColumn<Row>);
  return defineColumn<Row, boolean | null>({
    ...rest,
    id,
    accessor: (row) => {
      const raw = read(row);
      return isBlank(raw) ? null : Boolean(raw);
    },
    cell:
      cell ??
      (({ value }) =>
        value === null ? (
          blank
        ) : (
          <span className="lac lac-table-bool" data-on={value || undefined}>
            <span aria-hidden="true">{value ? "✓" : "✕"}</span>
            {value ? trueLabel : falseLabel}
          </span>
        )),
    exportValue: rest.exportValue ?? ((row) => (isBlank(read(row)) ? null : Boolean(read(row)))),
  });
}

export interface LinkColumnOptions<Row> extends CommonColumnOptions<Row> {
  accessor?: (row: Row) => string | number | null | undefined;
  cell?: (ctx: CellContext<Row, string>) => ReactNode;
  /** Where the link goes. */
  href: (row: Row) => string;
  /** Open in a new tab — `rel="noreferrer"` is added for you. */
  external?: boolean;
}

/** A linked cell. The click is stopped from bubbling into `onRowClick`. */
export function linkColumn<Row>(id: string, options: LinkColumnOptions<Row>): AnyColumn<Row> {
  const { accessor, cell, href, external, ...rest } = options;
  const read = accessor ?? columnReader({ id, ...rest } as AnyColumn<Row>);
  return defineColumn<Row, string>({
    ...rest,
    id,
    accessor: (row) => toText(read(row)),
    cell:
      cell ??
      (({ value, row }) => (
        <a
          className="lac lac-table-link"
          href={href(row)}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer noopener" : undefined}
          onClick={(event) => event.stopPropagation()}
        >
          {value}
        </a>
      )),
  });
}

/** One button in an actions column. */
export interface RowAction<Row> {
  label: string;
  onSelect: (row: Row) => void;
  /** `danger` paints it red. */
  tone?: "default" | "danger";
  icon?: ReactNode;
  /** Hide the label and use it as `aria-label` instead. */
  iconOnly?: boolean;
  disabled?: (row: Row) => boolean;
  /** Leave the action out for this row entirely. */
  hidden?: (row: Row) => boolean;
}

export interface ActionsColumnOptions<Row> extends CommonColumnOptions<Row> {
  actions?: ReadonlyArray<RowAction<Row>>;
  cell?: (ctx: CellContext<Row, null>) => ReactNode;
}

/**
 * Row actions. Not sortable, not searchable, not exported — a column of buttons
 * is not data. Clicks are stopped so they never also fire `onRowClick`.
 */
export function actionsColumn<Row>(
  id = "actions",
  options: ActionsColumnOptions<Row> = {},
): AnyColumn<Row> {
  const { actions = [], cell, ...rest } = options;
  return defineColumn<Row, null>({
    header: "",
    name: "Actions",
    align: "end",
    width: 120,
    resizable: false,
    ...rest,
    id,
    sortable: false,
    filterable: false,
    searchable: false,
    exportable: false,
    accessor: () => null,
    cell:
      cell ??
      (({ row }) => (
        <span className="lac lac-table-actions">
          {actions
            .filter((action) => !action.hidden?.(row))
            .map((action) => (
              <button
                key={action.label}
                type="button"
                className="lac lac-table-btn"
                data-tone={action.tone ?? "default"}
                data-size="sm"
                disabled={action.disabled?.(row)}
                aria-label={action.iconOnly ? action.label : undefined}
                title={action.iconOnly ? action.label : undefined}
                onClick={(event) => {
                  event.stopPropagation();
                  action.onSelect(row);
                }}
              >
                {action.icon}
                {action.iconOnly ? null : action.label}
              </button>
            ))}
        </span>
      )),
  });
}

export interface CustomColumnOptions<Row, Value> extends CommonColumnOptions<Row> {
  accessor?: (row: Row) => Value;
  compare?: (a: Value, b: Value, rowA: Row, rowB: Row) => number;
  filterFn?: (value: Value, filter: FilterValue, row: Row) => boolean;
}

/**
 * Anything else: you bring the renderer, the accessor keeps sorting, filtering
 * and export working on the underlying value.
 */
export function customColumn<Row, Value>(
  id: string,
  cell: (ctx: CellContext<Row, Value>) => ReactNode,
  options: CustomColumnOptions<Row, Value> = {},
): AnyColumn<Row> {
  return defineColumn<Row, Value>({ ...options, id, cell });
}
