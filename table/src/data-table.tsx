/**
 * `DataTable` — the batteries-included table.
 *
 * Give it `columns` and `data` and you get sorting, filtering, search, paging,
 * selection, resizing, pinned columns, expandable detail rows, a skeleton, an
 * empty state, footer totals and CSV export. Every one of those is also
 * controllable from outside, and everything it does is available without the
 * markup through {@link useTable}.
 */
import { Fragment } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { DEFAULT_COLUMN_WIDTH, formatNumber, type ResolvedColumn } from "./columns.js";
import { pinnedOffsets } from "./engine.js";
import {
  TBody,
  TFoot,
  THead,
  Table,
  TableCaption,
  TableCheckbox,
  TableColumnsMenu,
  TableEmpty,
  TablePagination,
  TableScroll,
  TableSearch,
  TableToolbar,
  Td,
  Th,
  Tr,
  type Density,
  type PaginationLabels,
} from "./parts.js";
import { useTable, type TableInstance, type TableRowModel, type UseTableOptions } from "./use-table.js";
import { classes, useStableId } from "./util.js";

/** What a detail renderer is handed. */
export interface RowDetailContext<Row> {
  row: Row;
  id: string;
  index: number;
  /** Collapse the row from inside the detail — for a "Close" button. */
  collapse: () => void;
}

export interface DataTableProps<Row>
  extends UseTableOptions<Row>,
    Omit<HTMLAttributes<HTMLDivElement>, keyof UseTableOptions<Row> | "children" | "onSelect"> {
  /** The table's accessible name. Write one. */
  caption?: ReactNode;
  /** Show the caption on screen as well as to screen readers. */
  captionVisible?: boolean;

  density?: Density;
  striped?: boolean;
  bordered?: boolean;
  hoverable?: boolean;
  /** Freeze the header. Pair with `maxHeight` or there is nothing to scroll. */
  stickyHeader?: boolean;
  /** Cap the table's height and scroll inside it. */
  maxHeight?: number | string;
  /** `fixed` honours your widths exactly — what you want with resizing on. */
  layout?: "auto" | "fixed";

  /** Swap the rows for a shimmer while the first page loads. */
  loading?: boolean;
  /** How many skeleton rows to draw. Default: the page size, capped at 10. */
  loadingRows?: number;

  /** Replace the whole empty state. */
  empty?: ReactNode;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  emptyIcon?: ReactNode;
  /** Extra action in the empty state. "Clear filters" is offered automatically. */
  emptyAction?: ReactNode;

  /** Hide the toolbar strip entirely. Default `true` when anything lives in it. */
  toolbar?: boolean;
  /** Extra toolbar content, before the built-in buttons. */
  toolbarStart?: ReactNode;
  /** Extra toolbar content, after the built-in buttons. */
  toolbarEnd?: ReactNode;
  /** Show the global search box. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Show a row of per-column filter inputs under the header. */
  filterRow?: boolean;
  /** Show the show/hide columns menu. */
  columnMenu?: boolean;
  columnMenuLabel?: string;
  /** Show the CSV export button. */
  exportable?: boolean;
  exportLabel?: string;
  exportFilename?: string;

  /** Add the checkbox column. */
  selectable?: boolean;
  /** Accessible name for a row's checkbox. Default "Select row N". */
  getRowLabel?: (row: Row, index: number) => string;

  /** Render a detail panel under a row. Its presence adds the expander column. */
  renderDetail?: (ctx: RowDetailContext<Row>) => ReactNode;

  /** Clicking a row. Clicks inside links, buttons and inputs are ignored. */
  onRowClick?: (row: Row, id: string) => void;
  /** Extra class per row — status colouring, for instance. */
  rowClassName?: (row: Row, index: number) => string | undefined;

  /** Show the footer. Default: on when any column has an `aggregate` or `footer`. */
  showFooter?: boolean;

  /** Rows-per-page choices. */
  pageSizeOptions?: readonly number[];
  /** Hide the rows-per-page select. */
  showPageSize?: boolean;
  paginationLabels?: Partial<PaginationLabels>;
  /** Prev/next only — better on a phone. */
  compactPagination?: boolean;
}

/** One rendered column slot: a data column, or the table's own gutter columns. */
interface Slot<Row> {
  key: string;
  kind: "select" | "expander" | "data";
  column?: ResolvedColumn<Row>;
  width: number | undefined;
  offsetWidth: number;
  pinned: "left" | "right" | false;
}

const GUTTER_WIDTH = 44;

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("a,button,input,select,textarea,label,[role='button']"));
}

/**
 * The table.
 *
 * ```tsx
 * <DataTable
 *   caption="Invoices"
 *   data={invoices}
 *   columns={[textColumn<Invoice>("client", { key: "client" }), currencyColumn<Invoice>("total")]}
 *   searchable
 *   selectable
 * />
 * ```
 */
export function DataTable<Row>(props: DataTableProps<Row>): JSX.Element {
  const {
    // engine options
    data = [],
    columns: columnDefs = [],
    getRowId,
    locale,
    multiSort,
    searchIds,
    paginate = true,
    sort,
    defaultSort,
    onSortChange,
    filters,
    defaultFilters,
    onFiltersChange,
    query,
    defaultQuery,
    onQueryChange,
    pageIndex,
    defaultPageIndex,
    onPageIndexChange,
    pageSize,
    defaultPageSize,
    onPageSizeChange,
    selected,
    defaultSelected,
    onSelectedChange,
    expanded,
    defaultExpanded,
    onExpandedChange,
    hiddenColumns,
    defaultHiddenColumns,
    onHiddenColumnsChange,
    columnWidths,
    defaultColumnWidths,
    onColumnWidthsChange,
    // presentation
    caption,
    captionVisible = false,
    density = "normal",
    striped = false,
    bordered = false,
    hoverable = true,
    stickyHeader = false,
    maxHeight,
    layout,
    loading = false,
    loadingRows,
    empty,
    emptyTitle = "Nothing to show",
    emptyDescription,
    emptyIcon,
    emptyAction,
    toolbar = true,
    toolbarStart,
    toolbarEnd,
    searchable = false,
    searchPlaceholder,
    filterRow = false,
    columnMenu = false,
    columnMenuLabel = "Columns",
    exportable = false,
    exportLabel = "Export CSV",
    exportFilename = "table.csv",
    selectable = false,
    getRowLabel,
    renderDetail,
    onRowClick,
    rowClassName,
    showFooter,
    pageSizeOptions,
    showPageSize = true,
    paginationLabels,
    compactPagination = false,
    className,
    ...rest
  } = props;

  const table: TableInstance<Row> = useTable<Row>({
    data,
    columns: columnDefs,
    getRowId,
    locale,
    multiSort,
    searchIds,
    paginate,
    sort,
    defaultSort,
    onSortChange,
    filters,
    defaultFilters,
    onFiltersChange,
    query,
    defaultQuery,
    onQueryChange,
    pageIndex,
    defaultPageIndex,
    onPageIndexChange,
    pageSize,
    defaultPageSize,
    onPageSizeChange,
    selected,
    defaultSelected,
    onSelectedChange,
    expanded,
    defaultExpanded,
    onExpandedChange,
    hiddenColumns,
    defaultHiddenColumns,
    onHiddenColumnsChange,
    columnWidths,
    defaultColumnWidths,
    onColumnWidthsChange,
  });

  const baseId = useStableId(rest.id, "lac-table");

  /* ---- the rendered column slots, with pinned offsets ------------------ */

  const slots: Array<Slot<Row>> = [];
  if (renderDetail) {
    slots.push({ key: "__expander", kind: "expander", width: GUTTER_WIDTH, offsetWidth: GUTTER_WIDTH, pinned: "left" });
  }
  if (selectable) {
    slots.push({ key: "__select", kind: "select", width: GUTTER_WIDTH, offsetWidth: GUTTER_WIDTH, pinned: "left" });
  }
  for (const column of table.columns) {
    const width = table.columnWidths[column.id] ?? column.width;
    slots.push({
      key: column.id,
      kind: "data",
      column,
      width,
      offsetWidth: width ?? DEFAULT_COLUMN_WIDTH,
      pinned: column.pinned,
    });
  }

  const leftSlots = slots.filter((slot) => slot.pinned === "left");
  const rightSlots = slots.filter((slot) => slot.pinned === "right");
  const leftOffsets = pinnedOffsets(leftSlots.map((slot) => slot.offsetWidth), "left");
  const rightOffsets = pinnedOffsets(rightSlots.map((slot) => slot.offsetWidth), "right");
  const offsets = new Map<string, number>();
  leftSlots.forEach((slot, index) => offsets.set(slot.key, leftOffsets[index] ?? 0));
  rightSlots.forEach((slot, index) => offsets.set(slot.key, rightOffsets[index] ?? 0));
  const offsetOf = (slot: Slot<Row>): number => offsets.get(slot.key) ?? 0;

  const columnCount = slots.length;
  const multiSorted = table.sort.length > 1;
  const hasFooter =
    showFooter ??
    table.columns.some((column) => column.aggregate !== undefined || column.def.footer !== undefined);
  const filterable = table.columns.filter((column) => column.filterable);
  const showFilterRow = filterRow && filterable.length > 0;
  const showToolbar =
    toolbar &&
    Boolean(searchable || columnMenu || exportable || toolbarStart || toolbarEnd || (selectable && table.selected.length));
  const skeletonRows = loadingRows ?? Math.min(paginate ? table.pageSize : 6, 10);

  /* ---- rows ------------------------------------------------------------ */

  const renderRow = (model: TableRowModel<Row>): ReactNode => {
    const detailId = `${baseId}-detail-${model.id}`;
    const clickable = Boolean(onRowClick);
    return (
      <Fragment key={model.id}>
        <Tr
          selected={selectable ? model.selected : undefined}
          expanded={model.expanded}
          clickable={clickable}
          className={rowClassName?.(model.row, model.index)}
          tabIndex={clickable ? 0 : undefined}
          onClick={
            clickable
              ? (event) => {
                  if (isInteractiveTarget(event.target)) return;
                  onRowClick?.(model.row, model.id);
                }
              : undefined
          }
          onKeyDown={
            clickable
              ? (event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  if (isInteractiveTarget(event.target)) return;
                  event.preventDefault();
                  onRowClick?.(model.row, model.id);
                }
              : undefined
          }
        >
          {slots.map((slot) => {
            const pinned = slot.pinned;
            const offset = offsetOf(slot);
            if (slot.kind === "expander") {
              return (
                <Td key={slot.key} pinned={pinned} pinnedOffset={offset} align="center">
                  <button
                    type="button"
                    className="lac lac-table-expander"
                    aria-expanded={model.expanded}
                    aria-controls={detailId}
                    aria-label={model.expanded ? "Collapse row" : "Expand row"}
                    data-open={model.expanded || undefined}
                    onClick={(event) => {
                      event.stopPropagation();
                      table.toggleExpanded(model.id);
                    }}
                  >
                    <span aria-hidden="true">▸</span>
                  </button>
                </Td>
              );
            }
            if (slot.kind === "select") {
              return (
                <Td key={slot.key} pinned={pinned} pinnedOffset={offset} align="center">
                  <TableCheckbox
                    label={getRowLabel?.(model.row, model.index) ?? `Select row ${model.index + 1}`}
                    checked={model.selected}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => table.toggleRowSelected(model.id, event.target.checked)}
                  />
                </Td>
              );
            }
            const column = slot.column;
            if (!column) return null;
            return (
              <Td
                key={slot.key}
                align={column.align}
                numeric={column.align === "end" || undefined}
                pinned={pinned}
                pinnedOffset={offset}
                className={column.def.className}
                style={slot.width === undefined ? undefined : { width: slot.width }}
              >
                {column.renderCell({
                  value: column.getValue(model.row),
                  row: model.row,
                  index: model.index,
                  id: model.id,
                })}
              </Td>
            );
          })}
        </Tr>
        {renderDetail && model.expanded && (
          <Tr detail id={detailId}>
            <Td colSpan={columnCount} className="lac-table-detail">
              {renderDetail({
                row: model.row,
                id: model.id,
                index: model.index,
                collapse: () => table.toggleExpanded(model.id, false),
              })}
            </Td>
          </Tr>
        )}
      </Fragment>
    );
  };

  /* ---- render ---------------------------------------------------------- */

  return (
    <div
      {...rest}
      className={classes("lac-table-wrap", className)}
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
    >
      {showToolbar && (
        <TableToolbar
          start={
            <>
              {searchable && (
                <TableSearch
                  value={table.query}
                  onValueChange={table.setQuery}
                  placeholder={searchPlaceholder}
                  label={typeof caption === "string" ? `Search ${caption}` : "Search table"}
                />
              )}
              {toolbarStart}
              {selectable && table.selected.length > 0 && (
                <span className="lac-table-selected-count" role="status">
                  {table.selected.length} selected
                  <button type="button" className="lac lac-table-btn" onClick={table.clearSelection}>
                    Clear
                  </button>
                </span>
              )}
            </>
          }
          end={
            <>
              {toolbarEnd}
              {columnMenu && (
                <TableColumnsMenu
                  label={columnMenuLabel}
                  columns={table.allColumns.map((column) => ({
                    id: column.id,
                    name: column.name,
                    visible: table.isColumnVisible(column.id),
                    hideable: column.hideable,
                  }))}
                  onToggleColumn={(id, visible) => table.toggleColumn(id, visible)}
                />
              )}
              {exportable && (
                <button
                  type="button"
                  className="lac lac-table-btn"
                  onClick={() => table.download(exportFilename)}
                >
                  {exportLabel}
                </button>
              )}
            </>
          }
        />
      )}

      <TableScroll maxHeight={maxHeight}>
        <Table
          density={density}
          striped={striped}
          bordered={bordered}
          hoverable={hoverable}
          stickyHeader={stickyHeader}
          layout={layout ?? (slots.some((slot) => slot.width !== undefined) ? "fixed" : "auto")}
        >
          {caption && <TableCaption visuallyHidden={!captionVisible}>{caption}</TableCaption>}

          <THead>
            <Tr>
              {slots.map((slot) => {
                const pinned = slot.pinned;
                const offset = offsetOf(slot);
                if (slot.kind === "expander") {
                  return (
                    <Th key={slot.key} pinned={pinned} pinnedOffset={offset} width={slot.width}>
                      <span className="lac-sr-only">Expand</span>
                    </Th>
                  );
                }
                if (slot.kind === "select") {
                  return (
                    <Th key={slot.key} pinned={pinned} pinnedOffset={offset} width={slot.width} align="center">
                      <TableCheckbox
                        label="Select all rows on this page"
                        checked={table.pageSelection === "all"}
                        indeterminate={table.pageSelection === "some"}
                        onChange={(event) => table.toggleAllOnPage(event.target.checked)}
                      />
                    </Th>
                  );
                }
                const column = slot.column;
                if (!column) return null;
                return (
                  <Th
                    key={slot.key}
                    align={column.align}
                    sortable={column.sortable}
                    sortDirection={table.sortDirection(column.id)}
                    sortIndex={multiSorted ? table.sortIndex(column.id) : 0}
                    onSort={(additive) => table.toggleSort(column.id, additive)}
                    resizable={column.resizable}
                    width={slot.width}
                    minWidth={column.minWidth}
                    maxWidth={column.maxWidth}
                    onResize={(width) => table.setColumnWidth(column.id, width)}
                    resizeLabel={`Resize ${column.name}`}
                    pinned={pinned}
                    pinnedOffset={offset}
                    className={column.def.headerClassName}
                  >
                    {column.header}
                  </Th>
                );
              })}
            </Tr>

            {showFilterRow && (
              <Tr className="lac-table-filters">
                {slots.map((slot) => {
                  const column = slot.column;
                  const offset = offsetOf(slot);
                  if (!column) {
                    return <Td key={slot.key} pinned={slot.pinned} pinnedOffset={offset} />;
                  }
                  const value = table.filters[column.id];
                  return (
                    <Td key={slot.key} pinned={slot.pinned} pinnedOffset={offset}>
                      {column.filterable && (
                        <input
                          type="search"
                          className="lac lac-table-input"
                          value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
                          placeholder={column.def.filterPlaceholder ?? column.name}
                          aria-label={`Filter by ${column.name}`}
                          onChange={(event) => table.setFilter(column.id, event.target.value)}
                        />
                      )}
                    </Td>
                  );
                })}
              </Tr>
            )}
          </THead>

          <TBody>
            {loading ? (
              Array.from({ length: skeletonRows }, (_, row) => (
                <Tr key={`skeleton-${row}`} aria-hidden="true">
                  {slots.map((slot) => (
                    <Td key={slot.key}>
                      <span className="lac lac-table-skeleton" />
                    </Td>
                  ))}
                </Tr>
              ))
            ) : table.rows.length === 0 ? (
              <Tr>
                <TableEmpty
                  colSpan={columnCount}
                  title={emptyTitle}
                  description={
                    emptyDescription ??
                    (table.isFiltered ? "No rows match the current filters." : undefined)
                  }
                  icon={emptyIcon}
                  action={
                    empty ?? (
                      <>
                        {table.isFiltered && (
                          <button type="button" className="lac lac-table-btn" onClick={table.clearFilters}>
                            Clear filters
                          </button>
                        )}
                        {emptyAction}
                      </>
                    )
                  }
                />
              </Tr>
            ) : (
              table.rows.map(renderRow)
            )}
          </TBody>

          {hasFooter && !loading && (
            <TFoot>
              <Tr>
                {slots.map((slot) => {
                  const column = slot.column;
                  const offset = offsetOf(slot);
                  if (!column) {
                    return <Td key={slot.key} pinned={slot.pinned} pinnedOffset={offset} />;
                  }
                  const value = table.aggregates[column.id] ?? null;
                  const footer = column.def.footer;
                  const content =
                    typeof footer === "function"
                      ? footer({ rows: table.filteredRows, value, id: column.id })
                      : footer !== undefined
                        ? footer
                        : column.aggregate
                          ? (column.def.formatAggregate ?? ((total: number | null) => formatNumber(total)))(value)
                          : null;
                  return (
                    <Td
                      key={slot.key}
                      align={column.align}
                      numeric={column.align === "end" || undefined}
                      pinned={slot.pinned}
                      pinnedOffset={offset}
                    >
                      {content}
                    </Td>
                  );
                })}
              </Tr>
            </TFoot>
          )}
        </Table>
      </TableScroll>

      {paginate && (
        <TablePagination
          pageIndex={table.pageIndex}
          pageCount={table.pageCount}
          pageSize={table.pageSize}
          total={table.total}
          onPageChange={table.setPageIndex}
          onPageSizeChange={showPageSize ? table.setPageSize : undefined}
          pageSizeOptions={pageSizeOptions}
          compact={compactPagination}
          labels={paginationLabels}
        />
      )}
    </div>
  );
}
