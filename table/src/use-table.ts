/**
 * `useTable` — the whole table engine with no markup attached.
 *
 * `DataTable` is this hook plus a `<table>`. If the markup does not suit you,
 * take the hook and render your own: you keep sorting, filtering, search,
 * paging, selection, expansion, column visibility, resizing, aggregates and
 * export, and you lose nothing but our CSS.
 */
import { useCallback, useMemo } from "react";
import {
  aggregate as aggregateValues,
  clampColumnWidth,
  clampPage,
  cycleSort,
  downloadCsv,
  exportRows,
  filterRows,
  isEmptyFilter,
  pageCount as pageCountOf,
  pageForSizeChange,
  pageRange,
  pageSlice,
  selectionMode,
  setSelection,
  sortDirectionOf,
  sortIndexOf,
  sortRows,
  toggleSelected,
  type ExportOptions,
  type FilterValue,
  type SelectionMode,
  type SortDirection,
  type SortState,
} from "./engine.js";
import {
  exportColumnsFrom,
  filterFieldsFrom,
  resolveColumns,
  sortFieldsFrom,
  type AnyColumn,
  type ResolvedColumn,
} from "./columns.js";
import { useControllable } from "./util.js";

/** One row as the table sees it. */
export interface TableRowModel<Row> {
  /** Stable id — the key for selection, expansion and React. */
  id: string;
  row: Row;
  /** Position within the current page. */
  index: number;
  selected: boolean;
  expanded: boolean;
}

/** Which rows an export covers. */
export type ExportScope = "filtered" | "page" | "selected";

export interface UseTableOptions<Row> {
  /** The rows. Keep this array referentially stable (`useMemo`) for big tables. */
  data: readonly Row[];
  /** The columns, built by hand or with the column helpers. */
  columns: ReadonlyArray<AnyColumn<Row>>;
  /**
   * A stable id per row. Without one the table looks for `id`, `_id`, `key` or
   * `uuid` on the row and falls back to the row's position in `data` — which is
   * fine until rows are reordered, so pass this whenever you have a real key.
   */
  getRowId?: (row: Row, index: number) => string;
  /** Locale for string sorting. Pass one when server and client must agree. */
  locale?: string | string[];

  /** Controlled sort. */
  sort?: SortState;
  defaultSort?: SortState;
  onSortChange?: (sort: SortState) => void;
  /** Let shift-click add a second, third… sort key. Default `true`. */
  multiSort?: boolean;

  /** Controlled per-column filters, keyed by column id. */
  filters?: Readonly<Record<string, FilterValue>>;
  defaultFilters?: Readonly<Record<string, FilterValue>>;
  onFiltersChange?: (filters: Readonly<Record<string, FilterValue>>) => void;

  /** Controlled global search text. */
  query?: string;
  defaultQuery?: string;
  onQueryChange?: (query: string) => void;
  /** Columns the search covers. Defaults to every searchable column. */
  searchIds?: readonly string[];

  /** `false` renders every row — no pager. Default `true`. */
  paginate?: boolean;
  pageIndex?: number;
  defaultPageIndex?: number;
  onPageIndexChange?: (pageIndex: number) => void;
  pageSize?: number;
  defaultPageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;

  /** Controlled selection, as row ids. */
  selected?: readonly string[];
  defaultSelected?: readonly string[];
  onSelectedChange?: (selected: readonly string[]) => void;

  /** Controlled expansion, as row ids. */
  expanded?: readonly string[];
  defaultExpanded?: readonly string[];
  onExpandedChange?: (expanded: readonly string[]) => void;

  /** Controlled hidden columns, as column ids. */
  hiddenColumns?: readonly string[];
  defaultHiddenColumns?: readonly string[];
  onHiddenColumnsChange?: (hidden: readonly string[]) => void;

  /** Controlled column widths in pixels, keyed by column id. */
  columnWidths?: Readonly<Record<string, number>>;
  defaultColumnWidths?: Readonly<Record<string, number>>;
  onColumnWidthsChange?: (widths: Readonly<Record<string, number>>) => void;
}

/** Everything the hook hands back. */
export interface TableInstance<Row> {
  /** Every column, hidden ones included — this is what a column menu lists. */
  allColumns: Array<ResolvedColumn<Row>>;
  /** The columns actually rendered, pinned ones first (left) and last (right). */
  columns: Array<ResolvedColumn<Row>>;
  /** The rows on the current page. */
  rows: Array<TableRowModel<Row>>;
  /** Every row that survived filtering and sorting. */
  filteredRows: Row[];
  /** How many rows survived filtering — the denominator in "21–40 of 173". */
  total: number;
  /** True when filters or search are hiding something. */
  isFiltered: boolean;

  sort: SortState;
  setSort: (sort: SortState) => void;
  /** Header click: asc → desc → unsorted. `additive` appends a sort key. */
  toggleSort: (id: string, additive?: boolean) => void;
  sortDirection: (id: string) => SortDirection | false;
  /** 1-based position in a multi-sort, or 0. */
  sortIndex: (id: string) => number;
  clearSort: () => void;

  filters: Readonly<Record<string, FilterValue>>;
  setFilter: (id: string, value: FilterValue) => void;
  setFilters: (filters: Record<string, FilterValue>) => void;
  clearFilters: () => void;
  query: string;
  setQuery: (query: string) => void;

  paginate: boolean;
  pageIndex: number;
  pageSize: number;
  pageCount: number;
  /** 1-based `{ from, to, total }` for the "showing…" line. */
  range: { from: number; to: number; total: number };
  setPageIndex: (pageIndex: number) => void;
  /** Changes the page size, keeping the first visible row on screen. */
  setPageSize: (pageSize: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  firstPage: () => void;
  lastPage: () => void;
  canPreviousPage: boolean;
  canNextPage: boolean;

  selected: readonly string[];
  selectedRows: Row[];
  isSelected: (id: string) => boolean;
  toggleRowSelected: (id: string, on?: boolean) => void;
  /** The header checkbox — acts on the current page only. */
  toggleAllOnPage: (on?: boolean) => void;
  /** `none` | `some` (indeterminate) | `all`, for the current page. */
  pageSelection: SelectionMode;
  clearSelection: () => void;

  expanded: readonly string[];
  isExpanded: (id: string) => boolean;
  toggleExpanded: (id: string, on?: boolean) => void;

  hiddenColumns: readonly string[];
  isColumnVisible: (id: string) => boolean;
  toggleColumn: (id: string, on?: boolean) => void;
  showAllColumns: () => void;

  columnWidths: Readonly<Record<string, number>>;
  /** Sets a width, clamped to the column's own min/max. */
  setColumnWidth: (id: string, width: number) => void;
  resetColumnWidths: () => void;

  /** Footer totals for every column that asked for one, keyed by column id. */
  aggregates: Record<string, number | null>;
  /** The id the table uses for a row. */
  rowId: (row: Row, index: number) => string;

  /** Rows as delimited text. Default: filtered rows, visible columns, CSV. */
  toDelimitedText: (options?: ExportOptions & { scope?: ExportScope }) => string;
  /** The same text, saved to the reader's disk. No-op (and `false`) on a server. */
  download: (filename?: string, options?: ExportOptions & { scope?: ExportScope }) => boolean;
}

const ID_KEYS = ["id", "_id", "key", "uuid"] as const;

/** The fallback row id: a real key off the row if there is one, else position. */
export function inferRowId(row: unknown, index: number): string {
  if (row && typeof row === "object") {
    const record = row as Record<string, unknown>;
    for (const key of ID_KEYS) {
      const value = record[key];
      if (typeof value === "string" || typeof value === "number") return String(value);
    }
  }
  return String(index);
}

/**
 * The table engine as a hook.
 *
 * Every piece of state is controlled *or* uncontrolled: pass `sort` and you own
 * it, pass `defaultSort` and the table owns it, pass neither and it starts
 * empty. `onXChange` fires either way.
 */
export function useTable<Row>(options: UseTableOptions<Row>): TableInstance<Row> {
  const {
    data,
    columns: columnDefs,
    getRowId,
    locale,
    multiSort = true,
    searchIds,
    paginate = true,
  } = options;

  const allColumns = useMemo(() => resolveColumns(columnDefs), [columnDefs]);

  const [sort, setSortState] = useControllable<SortState>(
    options.sort,
    options.defaultSort ?? [],
    options.onSortChange,
  );
  const [filters, setFiltersState] = useControllable<Readonly<Record<string, FilterValue>>>(
    options.filters,
    options.defaultFilters ?? {},
    options.onFiltersChange,
  );
  const [query, setQuery] = useControllable(options.query, options.defaultQuery ?? "", options.onQueryChange);
  const [pageIndexRaw, setPageIndexState] = useControllable(
    options.pageIndex,
    options.defaultPageIndex ?? 0,
    options.onPageIndexChange,
  );
  const [pageSize, setPageSizeState] = useControllable(
    options.pageSize,
    options.defaultPageSize ?? 10,
    options.onPageSizeChange,
  );
  const [selected, setSelected] = useControllable<readonly string[]>(
    options.selected,
    options.defaultSelected ?? [],
    options.onSelectedChange,
  );
  const [expanded, setExpanded] = useControllable<readonly string[]>(
    options.expanded,
    options.defaultExpanded ?? [],
    options.onExpandedChange,
  );
  const defaultHidden = useMemo(
    () => options.defaultHiddenColumns ?? allColumns.filter((c) => c.defaultHidden).map((c) => c.id),
    [options.defaultHiddenColumns, allColumns],
  );
  const [hiddenColumns, setHiddenColumns] = useControllable<readonly string[]>(
    options.hiddenColumns,
    defaultHidden,
    options.onHiddenColumnsChange,
  );
  const [columnWidths, setColumnWidths] = useControllable<Readonly<Record<string, number>>>(
    options.columnWidths,
    options.defaultColumnWidths ?? {},
    options.onColumnWidthsChange,
  );

  /* ---- row ids ------------------------------------------------------- */

  const rowId = useCallback(
    (row: Row, index: number) => getRowId?.(row, index) ?? inferRowId(row, index),
    [getRowId],
  );

  const idByRow = useMemo(() => {
    const map = new Map<Row, string>();
    data.forEach((row, index) => {
      if (!map.has(row)) map.set(row, rowId(row, index));
    });
    return map;
  }, [data, rowId]);

  const idOf = useCallback(
    (row: Row, index: number) => idByRow.get(row) ?? rowId(row, index),
    [idByRow, rowId],
  );

  /* ---- filter → sort → page ------------------------------------------ */

  const filterFields = useMemo(() => filterFieldsFrom(allColumns), [allColumns]);
  const sortFields = useMemo(() => sortFieldsFrom(allColumns), [allColumns]);

  const filtered = useMemo(
    () => filterRows(data, filterFields, { filters, query, searchIds }),
    [data, filterFields, filters, query, searchIds],
  );

  const sorted = useMemo(
    () => sortRows(filtered, sort, sortFields, locale),
    [filtered, sort, sortFields, locale],
  );

  const total = sorted.length;
  const pageCount = paginate ? pageCountOf(total, pageSize) : 1;
  const pageIndex = paginate ? clampPage(pageIndexRaw, total, pageSize) : 0;

  const pageRows = useMemo(
    () => (paginate ? pageSlice(sorted, pageIndex, pageSize) : sorted),
    [paginate, sorted, pageIndex, pageSize],
  );

  const rows = useMemo<Array<TableRowModel<Row>>>(
    () =>
      pageRows.map((row, index) => {
        const id = idOf(row, index);
        return {
          id,
          row,
          index,
          selected: selected.includes(id),
          expanded: expanded.includes(id),
        };
      }),
    [pageRows, idOf, selected, expanded],
  );

  /* ---- columns -------------------------------------------------------- */

  const columns = useMemo(() => {
    const visible = allColumns.filter((column) => !hiddenColumns.includes(column.id));
    const weight = (column: ResolvedColumn<Row>): number =>
      column.pinned === "left" ? 0 : column.pinned === "right" ? 2 : 1;
    return visible
      .map((column, index) => ({ column, index }))
      .sort((a, b) => weight(a.column) - weight(b.column) || a.index - b.index)
      .map((entry) => entry.column);
  }, [allColumns, hiddenColumns]);

  /* ---- aggregates ----------------------------------------------------- */

  const aggregates = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const column of allColumns) {
      if (!column.aggregate) continue;
      out[column.id] = aggregateValues(
        filtered.map((row) => column.getValue(row)),
        column.aggregate,
      );
    }
    return out;
  }, [allColumns, filtered]);

  /* ---- actions -------------------------------------------------------- */

  const pageIds = useMemo(() => rows.map((row) => row.id), [rows]);

  const setPageIndex = useCallback(
    (next: number) => setPageIndexState(clampPage(next, total, pageSize)),
    [setPageIndexState, total, pageSize],
  );

  const setPageSize = useCallback(
    (next: number) => {
      // Keep the row the reader is looking at on screen across the size change.
      setPageIndexState(pageForSizeChange(pageIndex, pageSize, next));
      setPageSizeState(next);
    },
    [setPageIndexState, setPageSizeState, pageIndex, pageSize],
  );

  const toggleSort = useCallback(
    (id: string, additive = false) =>
      setSortState(cycleSort(sort, id, { additive: additive && multiSort })),
    [setSortState, sort, multiSort],
  );

  const setFilter = useCallback(
    (id: string, value: FilterValue) => {
      const next: Record<string, FilterValue> = { ...filters };
      if (isEmptyFilter(value)) delete next[id];
      else next[id] = value;
      setFiltersState(next);
      // A narrower result set almost never still has the page you were on.
      setPageIndexState(0);
    },
    [filters, setFiltersState, setPageIndexState],
  );

  const exportColumns = useMemo(() => exportColumnsFrom(columns), [columns]);

  const toDelimitedText = useCallback(
    (exportOptions: ExportOptions & { scope?: ExportScope } = {}) => {
      const { scope = "filtered", ...rest } = exportOptions;
      const source =
        scope === "page" ? pageRows : scope === "selected" ? sorted.filter((row, index) => selected.includes(idOf(row, index))) : sorted;
      return exportRows(source, exportColumns, rest);
    },
    [pageRows, sorted, selected, idOf, exportColumns],
  );

  const selectedRows = useMemo(
    () => data.filter((row, index) => selected.includes(idOf(row, index))),
    [data, selected, idOf],
  );

  const download = useCallback(
    (filename = "table.csv", exportOptions: ExportOptions & { scope?: ExportScope } = {}) =>
      downloadCsv(filename, toDelimitedText(exportOptions)),
    [toDelimitedText],
  );

  return {
    allColumns,
    columns,
    rows,
    filteredRows: sorted,
    total,
    isFiltered: Boolean(query.trim()) || Object.values(filters).some((f) => !isEmptyFilter(f)),

    sort,
    setSort: setSortState,
    toggleSort,
    sortDirection: (id) => sortDirectionOf(sort, id),
    sortIndex: (id) => sortIndexOf(sort, id),
    clearSort: () => setSortState([]),

    filters,
    setFilter,
    setFilters: setFiltersState,
    clearFilters: () => {
      setFiltersState({});
      setQuery("");
      setPageIndexState(0);
    },
    query,
    setQuery: (next: string) => {
      setQuery(next);
      setPageIndexState(0);
    },

    paginate,
    pageIndex,
    pageSize,
    pageCount,
    range: paginate ? pageRange(pageIndex, pageSize, total) : { from: total ? 1 : 0, to: total, total },
    setPageIndex,
    setPageSize,
    nextPage: () => setPageIndex(pageIndex + 1),
    previousPage: () => setPageIndex(pageIndex - 1),
    firstPage: () => setPageIndex(0),
    lastPage: () => setPageIndex(pageCount - 1),
    canPreviousPage: pageIndex > 0,
    canNextPage: pageIndex < pageCount - 1,

    selected,
    selectedRows,
    isSelected: (id) => selected.includes(id),
    toggleRowSelected: (id, on) => setSelected(toggleSelected(selected, id, on)),
    toggleAllOnPage: (on) =>
      setSelected(setSelection(selected, pageIds, on ?? selectionMode(selected, pageIds) !== "all")),
    pageSelection: selectionMode(selected, pageIds),
    clearSelection: () => setSelected([]),

    expanded,
    isExpanded: (id) => expanded.includes(id),
    toggleExpanded: (id, on) => setExpanded(toggleSelected(expanded, id, on)),

    hiddenColumns,
    isColumnVisible: (id) => !hiddenColumns.includes(id),
    toggleColumn: (id, on) => {
      const hiddenNow = hiddenColumns.includes(id);
      const visible = on ?? hiddenNow;
      setHiddenColumns(visible ? hiddenColumns.filter((entry) => entry !== id) : [...hiddenColumns, id]);
    },
    showAllColumns: () => setHiddenColumns([]),

    columnWidths,
    setColumnWidth: (id, width) => {
      const column = allColumns.find((entry) => entry.id === id);
      const next = clampColumnWidth(width, column?.minWidth, column?.maxWidth);
      setColumnWidths({ ...columnWidths, [id]: next });
    },
    resetColumnWidths: () => setColumnWidths({}),

    aggregates,
    rowId: idOf,
    toDelimitedText,
    download,
  };
}
