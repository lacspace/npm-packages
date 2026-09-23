/**
 * @lacspace/table — a dependency-free React data table.
 *
 * Bring the stylesheet in once, anywhere in your app:
 *   import "@lacspace/table/styles.css";
 * then restyle everything by redefining the --lac-* variables in your own CSS.
 * Already using @lacspace/components? Its tokens drive this table too.
 */

/* Table ------------------------------------------------------------------ */
export { DataTable } from "./data-table.js";
export type { DataTableProps, RowDetailContext } from "./data-table.js";

/* Headless engine hook ---------------------------------------------------- */
export { useTable, inferRowId } from "./use-table.js";
export type { UseTableOptions, TableInstance, TableRowModel, ExportScope } from "./use-table.js";

/* Parts, for building your own layout ------------------------------------- */
export {
  Table,
  TableScroll,
  TableCaption,
  THead,
  TBody,
  TFoot,
  Tr,
  Th,
  Td,
  TableToolbar,
  TableSearch,
  TableCheckbox,
  TableColumnsMenu,
  TablePagination,
  TableEmpty,
} from "./parts.js";
export type {
  TableProps,
  TableScrollProps,
  TableCaptionProps,
  TrProps,
  ThProps,
  TdProps,
  PinProps,
  Density,
  TableToolbarProps,
  TableSearchProps,
  TableCheckboxProps,
  TableColumnsMenuProps,
  ColumnToggle,
  TablePaginationProps,
  PaginationLabels,
  TableEmptyProps,
} from "./parts.js";

/* Columns ----------------------------------------------------------------- */
export {
  defineColumn,
  defineColumns,
  resolveColumn,
  resolveColumns,
  columnReader,
  sortFieldsFrom,
  filterFieldsFrom,
  exportColumnsFrom,
  textColumn,
  numberColumn,
  currencyColumn,
  dateColumn,
  badgeColumn,
  booleanColumn,
  linkColumn,
  actionsColumn,
  customColumn,
  formatNumber,
  formatCurrency,
  formatDate,
  toDate,
  DEFAULT_COLUMN_WIDTH,
} from "./columns.js";
export type {
  ColumnDef,
  AnyColumn,
  CommonColumnOptions,
  ResolvedColumn,
  CellContext,
  FooterContext,
  TextColumnOptions,
  NumberColumnOptions,
  CurrencyColumnOptions,
  DateColumnOptions,
  BadgeColumnOptions,
  BooleanColumnOptions,
  LinkColumnOptions,
  ActionsColumnOptions,
  CustomColumnOptions,
  RowAction,
  NumberFormatOptions,
  CurrencyFormatOptions,
  DateFormatOptions,
} from "./columns.js";

/* The engine — pure functions, usable with no React at all ---------------- */
export {
  // values
  isBlank,
  toNumber,
  toText,
  // sorting
  defaultCompare,
  sortRows,
  sortDirectionOf,
  sortIndexOf,
  cycleSort,
  // filtering
  isNumberRange,
  isEmptyFilter,
  matchesFilter,
  matchesQuery,
  filterRows,
  searchableIds,
  // pagination
  pageCount,
  clampPage,
  pageSlice,
  pageRange,
  pageForSizeChange,
  pageTokens,
  // selection
  toggleSelected,
  setSelection,
  selectionMode,
  isIndeterminate,
  pruneSelection,
  // sizing
  clampColumnWidth,
  resizeColumn,
  pinnedOffsets,
  MIN_COLUMN_WIDTH,
  MAX_COLUMN_WIDTH,
  // aggregates
  aggregate,
  numericValues,
  // export
  neutraliseFormula,
  escapeCell,
  toDelimited,
  toCsv,
  toTsv,
  exportRows,
  downloadCsv,
  FORMULA_PREFIXES,
} from "./engine.js";
export type {
  SortDirection,
  SortRule,
  SortState,
  SortField,
  NumberRange,
  FilterValue,
  FilterField,
  FilterOptions,
  PageToken,
  SelectionState,
  SelectionMode,
  AggregateFn,
  ExportColumn,
  ExportOptions,
  DelimitedOptions,
} from "./engine.js";

/* Styling + shared helpers ------------------------------------------------ */
export { TableStyles, tableCss } from "./styles-inject.js";
export { cx, classes, clamp, useControllable, useStableId } from "./util.js";
export type { Size, Tone, Align } from "./util.js";
