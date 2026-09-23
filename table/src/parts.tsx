/**
 * The table parts.
 *
 * `DataTable` composes these; so can you. They are thin — a `<th>` that knows
 * about `aria-sort` and a resize handle is still just a `<th>` — which is the
 * point: real table semantics, so screen readers, ctrl-F and copy-paste all
 * keep working.
 */
import { forwardRef, useRef, useState } from "react";
import type {
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";
import { pageTokens, resizeColumn, type SortDirection } from "./engine.js";
import { classes, cx, useStableId, type Align } from "./util.js";

/** Row height / padding. `compact` fits about a third more rows on a screen. */
export type Density = "compact" | "normal" | "comfortable";

/* ==========================================================================
   Frame
   ========================================================================== */

export interface TableScrollProps extends HTMLAttributes<HTMLDivElement> {
  /** Cap the height and scroll inside — required for a sticky header. */
  maxHeight?: number | string;
}

/**
 * The scroll container. A sticky header and pinned columns both need a scroll
 * box that is not the page, so this is what they stick against.
 */
export const TableScroll = forwardRef<HTMLDivElement, TableScrollProps>(function TableScroll(
  { maxHeight, className, style, ...rest },
  ref,
) {
  return (
    <div
      {...rest}
      ref={ref}
      className={classes("lac-table-scroll", className)}
      style={maxHeight === undefined ? style : { maxHeight, ...style }}
    />
  );
});

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  density?: Density;
  /** Shade alternate rows. */
  striped?: boolean;
  /** Draw vertical rules between columns. */
  bordered?: boolean;
  /** Highlight the row under the pointer. */
  hoverable?: boolean;
  /** Freeze the header while the body scrolls. Needs a `TableScroll` parent. */
  stickyHeader?: boolean;
  /** `fixed` respects your column widths exactly; `auto` fits content. */
  layout?: "auto" | "fixed";
}

/** The `<table>` itself. */
export const Table = forwardRef<HTMLTableElement, TableProps>(function Table(
  {
    density = "normal",
    striped = false,
    bordered = false,
    hoverable = true,
    stickyHeader = false,
    layout = "auto",
    className,
    ...rest
  },
  ref,
) {
  return (
    <table
      {...rest}
      ref={ref}
      className={classes("lac-table", className)}
      data-density={density}
      data-striped={striped || undefined}
      data-bordered={bordered || undefined}
      data-hoverable={hoverable || undefined}
      data-sticky={stickyHeader || undefined}
      data-layout={layout}
    />
  );
});

export interface TableCaptionProps extends HTMLAttributes<HTMLTableCaptionElement> {
  /**
   * Keep the caption in the accessibility tree but out of the design. A table
   * that looks self-explanatory on screen usually is not one in a screen
   * reader, so this is the default.
   */
  visuallyHidden?: boolean;
}

/** The table's accessible name. Worth writing even when it is hidden. */
export const TableCaption = forwardRef<HTMLTableCaptionElement, TableCaptionProps>(
  function TableCaption({ visuallyHidden = true, className, ...rest }, ref) {
    return (
      <caption
        {...rest}
        ref={ref}
        className={classes("lac-table-caption", className)}
        data-hidden={visuallyHidden || undefined}
      />
    );
  },
);

export const THead = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  function THead({ className, ...rest }, ref) {
    return <thead {...rest} ref={ref} className={classes("lac-table-head", className)} />;
  },
);

export const TBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  function TBody({ className, ...rest }, ref) {
    return <tbody {...rest} ref={ref} className={classes("lac-table-body", className)} />;
  },
);

export const TFoot = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  function TFoot({ className, ...rest }, ref) {
    return <tfoot {...rest} ref={ref} className={classes("lac-table-foot", className)} />;
  },
);

export interface TrProps extends HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean;
  expanded?: boolean;
  /** Paints the row as interactive. Add the key handling yourself, or use `DataTable`. */
  clickable?: boolean;
  /** The detail row that belongs to an expanded row — styled as a continuation. */
  detail?: boolean;
}

export const Tr = forwardRef<HTMLTableRowElement, TrProps>(function Tr(
  { selected, expanded, clickable, detail, className, ...rest },
  ref,
) {
  return (
    <tr
      {...rest}
      ref={ref}
      className={classes("lac-table-row", className)}
      data-selected={selected || undefined}
      data-expanded={expanded || undefined}
      data-clickable={clickable || undefined}
      data-detail={detail || undefined}
      aria-selected={selected === undefined ? undefined : selected}
    />
  );
});

/* ==========================================================================
   Cells
   ========================================================================== */

/** Where a pinned cell sticks, and how far from that edge. */
export interface PinProps {
  pinned?: "left" | "right" | false;
  /** Pixels from the pinned edge — the total width of the columns before it. */
  pinnedOffset?: number;
}

export interface ThProps
  extends Omit<ThHTMLAttributes<HTMLTableCellElement>, "onResize" | "align">,
    PinProps {
  align?: Align;
  /** Render the label as a sort button and manage `aria-sort`. */
  sortable?: boolean;
  /** Current direction, or `false` when this column is not sorted. */
  sortDirection?: SortDirection | false;
  /** 1-based position in a multi-sort. Shown as a small badge when > 1 keys. */
  sortIndex?: number;
  /** Called on click/Enter. `additive` is true for shift-click. */
  onSort?: (additive: boolean) => void;
  /** Show the drag handle on the trailing edge. */
  resizable?: boolean;
  /** Current width, needed to resize from a known starting point. */
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  /** Fires continuously while dragging, and on each arrow-key press. */
  onResize?: (width: number) => void;
  /** Accessible name for the drag handle. */
  resizeLabel?: string;
}

const ARIA_SORT: Record<string, "ascending" | "descending" | "none"> = {
  asc: "ascending",
  desc: "descending",
};

/**
 * A header cell.
 *
 * When `sortable`, the label becomes a real `<button>` inside the `<th>` and
 * the cell carries `aria-sort` — the combination screen readers actually
 * announce. The resize handle is keyboard-operable with the arrow keys, because
 * a drag-only control is a control some people simply do not have.
 */
export const Th = forwardRef<HTMLTableCellElement, ThProps>(function Th(
  {
    align = "start",
    sortable = false,
    sortDirection = false,
    sortIndex = 0,
    onSort,
    resizable = false,
    width,
    minWidth,
    maxWidth,
    onResize,
    resizeLabel,
    pinned = false,
    pinnedOffset = 0,
    className,
    children,
    style,
    scope = "col",
    ...rest
  },
  ref,
) {
  const own = useRef<HTMLTableCellElement | null>(null);
  const [drag, setDrag] = useState<{ x: number; width: number } | null>(null);

  const setNode = (node: HTMLTableCellElement | null): void => {
    own.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as { current: HTMLTableCellElement | null }).current = node;
  };

  const currentWidth = (): number => width ?? own.current?.getBoundingClientRect().width ?? 0;

  const label = sortable ? (
    <button
      type="button"
      className="lac lac-table-sort"
      onClick={(event) => onSort?.(event.shiftKey)}
      data-direction={sortDirection || undefined}
    >
      <span>{children}</span>
      <span className="lac-table-sort-mark" aria-hidden="true">
        {sortDirection === "asc" ? "▲" : sortDirection === "desc" ? "▼" : "↕"}
      </span>
      {sortIndex > 1 && (
        <span className="lac-table-sort-order" aria-hidden="true">
          {sortIndex}
        </span>
      )}
    </button>
  ) : (
    children
  );

  return (
    <th
      {...rest}
      ref={setNode}
      scope={scope}
      className={classes("lac-table-th", className)}
      data-align={align}
      data-pinned={pinned || undefined}
      data-sorted={sortDirection || undefined}
      data-resizing={drag ? "true" : undefined}
      aria-sort={sortable ? ARIA_SORT[sortDirection || "none"] ?? "none" : undefined}
      style={{
        width,
        ...(pinned === "left" ? { left: pinnedOffset } : null),
        ...(pinned === "right" ? { right: pinnedOffset } : null),
        ...style,
      }}
    >
      {label}
      {resizable && (
        <span
          className="lac lac-table-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={resizeLabel ?? "Resize column"}
          tabIndex={0}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            setDrag({ x: event.clientX, width: currentWidth() });
          }}
          onPointerMove={(event) => {
            if (!drag) return;
            onResize?.(resizeColumn(drag.width, event.clientX - drag.x, minWidth, maxWidth));
          }}
          onPointerUp={(event) => {
            if (!drag) return;
            event.currentTarget.releasePointerCapture(event.pointerId);
            setDrag(null);
          }}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 1 : 16;
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              onResize?.(resizeColumn(currentWidth(), -step, minWidth, maxWidth));
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              onResize?.(resizeColumn(currentWidth(), step, minWidth, maxWidth));
            }
          }}
        />
      )}
    </th>
  );
});

export interface TdProps extends Omit<TdHTMLAttributes<HTMLTableCellElement>, "align">, PinProps {
  align?: Align;
  /** Tabular figures, so digits line up down the column. */
  numeric?: boolean;
}

export const Td = forwardRef<HTMLTableCellElement, TdProps>(function Td(
  { align = "start", numeric, pinned = false, pinnedOffset = 0, className, style, ...rest },
  ref,
) {
  return (
    <td
      {...rest}
      ref={ref}
      className={classes("lac-table-td", className)}
      data-align={align}
      data-numeric={numeric || undefined}
      data-pinned={pinned || undefined}
      style={{
        ...(pinned === "left" ? { left: pinnedOffset } : null),
        ...(pinned === "right" ? { right: pinnedOffset } : null),
        ...style,
      }}
    />
  );
});

/* ==========================================================================
   Chrome: toolbar, search, column menu, pagination, empty state
   ========================================================================== */

export interface TableToolbarProps extends HTMLAttributes<HTMLDivElement> {
  /** Leading slot — usually the search box. */
  start?: ReactNode;
  /** Trailing slot — usually buttons. Pushed to the far edge. */
  end?: ReactNode;
}

/** The strip above the table. Everything in it is yours. */
export const TableToolbar = forwardRef<HTMLDivElement, TableToolbarProps>(function TableToolbar(
  { start, end, className, children, ...rest },
  ref,
) {
  return (
    <div {...rest} ref={ref} className={classes("lac-table-toolbar", className)}>
      {start}
      {children}
      {end && <div className="lac-table-toolbar-end">{end}</div>}
    </div>
  );
});

export interface TableSearchProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value: string;
  onValueChange: (value: string) => void;
  /** Accessible name. Visually hidden unless `labelVisible`. */
  label?: string;
  labelVisible?: boolean;
  /** Show a button that empties the box. */
  clearable?: boolean;
}

/** The global search box. `type="search"` so browsers offer their own clear. */
export const TableSearch = forwardRef<HTMLInputElement, TableSearchProps>(function TableSearch(
  {
    value,
    onValueChange,
    label = "Search table",
    labelVisible = false,
    clearable = true,
    className,
    id,
    placeholder = "Search…",
    ...rest
  },
  ref,
) {
  const inputId = useStableId(id, "lac-table-search");
  return (
    <div className={classes("lac-table-search", className)}>
      <label htmlFor={inputId} className={cx("lac-table-search-label", !labelVisible && "lac-sr-only")}>
        {label}
      </label>
      <input
        {...rest}
        ref={ref}
        id={inputId}
        type="search"
        className="lac lac-table-input"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {clearable && value !== "" && (
        <button
          type="button"
          className="lac lac-table-search-clear"
          aria-label="Clear search"
          onClick={() => onValueChange("")}
        >
          ✕
        </button>
      )}
    </div>
  );
});

export interface TableCheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Required: a checkbox in a table row is meaningless without a name. */
  label: string;
  /** The "some rows on this page" state. */
  indeterminate?: boolean;
}

/**
 * A selection checkbox. `indeterminate` is a DOM property, not an attribute, so
 * it is set through a ref callback.
 */
export const TableCheckbox = forwardRef<HTMLInputElement, TableCheckboxProps>(
  function TableCheckbox({ label, indeterminate = false, className, ...rest }, ref) {
    const setNode = (node: HTMLInputElement | null): void => {
      if (node) node.indeterminate = indeterminate;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as { current: HTMLInputElement | null }).current = node;
    };
    return (
      <input
        {...rest}
        ref={setNode}
        type="checkbox"
        aria-label={label}
        className={classes("lac-table-check", className)}
      />
    );
  },
);

/** One entry in the column menu. */
export interface ColumnToggle {
  id: string;
  name: string;
  visible: boolean;
  hideable?: boolean;
}

export interface TableColumnsMenuProps extends Omit<HTMLAttributes<HTMLDetailsElement>, "onToggle"> {
  columns: readonly ColumnToggle[];
  onToggleColumn: (id: string, visible: boolean) => void;
  label?: string;
}

/**
 * The show/hide columns menu.
 *
 * Built on `<details>` on purpose: it opens with the keyboard, closes with
 * Escape and exposes its expanded state to assistive tech without a line of
 * JavaScript or a portal — so it also renders correctly on a server.
 */
export const TableColumnsMenu = forwardRef<HTMLDetailsElement, TableColumnsMenuProps>(
  function TableColumnsMenu({ columns, onToggleColumn, label = "Columns", className, ...rest }, ref) {
    return (
      <details {...rest} ref={ref} className={classes("lac-table-menu", className)}>
        <summary className="lac lac-table-btn">{label}</summary>
        <div className="lac-table-menu-panel" role="group" aria-label={label}>
          {columns.map((column) => (
            <label key={column.id} className="lac-table-menu-item">
              <input
                type="checkbox"
                checked={column.visible}
                disabled={column.hideable === false}
                onChange={(event) => onToggleColumn(column.id, event.target.checked)}
              />
              <span>{column.name}</span>
            </label>
          ))}
        </div>
      </details>
    );
  },
);

export interface PaginationLabels {
  first: string;
  previous: string;
  next: string;
  last: string;
  page: string;
  rowsPerPage: string;
  /** `(from, to, total) => string` for the "showing…" line. */
  summary: (from: number, to: number, total: number) => string;
}

const DEFAULT_LABELS: PaginationLabels = {
  first: "First page",
  previous: "Previous page",
  next: "Next page",
  last: "Last page",
  page: "Page",
  rowsPerPage: "Rows per page",
  summary: (from, to, total) => (total === 0 ? "No rows" : `${from}–${to} of ${total}`),
};

export interface TablePaginationProps extends HTMLAttributes<HTMLElement> {
  pageIndex: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (pageIndex: number) => void;
  /** Omit to hide the rows-per-page select. */
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
  /** How many numbered buttons to show. Fewer on a phone. */
  maxPageButtons?: number;
  /** Drop the numbered buttons and show only prev/next. */
  compact?: boolean;
  labels?: Partial<PaginationLabels>;
}

/** The pager. A `<nav>` with a label, so it can be jumped to directly. */
export const TablePagination = forwardRef<HTMLElement, TablePaginationProps>(
  function TablePagination(
    {
      pageIndex,
      pageCount,
      pageSize,
      total,
      onPageChange,
      onPageSizeChange,
      pageSizeOptions = [10, 25, 50, 100],
      maxPageButtons = 7,
      compact = false,
      labels,
      className,
      ...rest
    },
    ref,
  ) {
    const text = { ...DEFAULT_LABELS, ...labels };
    const from = total === 0 ? 0 : pageIndex * pageSize + 1;
    const to = Math.min(total, from + pageSize - 1);

    return (
      <nav
        {...rest}
        ref={ref}
        className={classes("lac-table-pagination", className)}
        aria-label={text.page}
      >
        <span className="lac-table-pagination-summary">{text.summary(from, to, total)}</span>

        {onPageSizeChange && (
          <label className="lac-table-pagination-size">
            <span>{text.rowsPerPage}</span>
            <select
              className="lac lac-table-input"
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="lac-table-pagination-pages">
          <button
            type="button"
            className="lac lac-table-btn"
            aria-label={text.previous}
            disabled={pageIndex <= 0}
            onClick={() => onPageChange(pageIndex - 1)}
          >
            ‹
          </button>
          {!compact &&
            pageTokens(pageIndex, pageCount, maxPageButtons).map((token, position) =>
              token === "ellipsis" ? (
                <span key={`gap-${position}`} className="lac-table-pagination-gap" aria-hidden="true">
                  …
                </span>
              ) : (
                <button
                  key={token}
                  type="button"
                  className="lac lac-table-btn"
                  data-current={token === pageIndex || undefined}
                  aria-current={token === pageIndex ? "page" : undefined}
                  aria-label={`${text.page} ${token + 1}`}
                  onClick={() => onPageChange(token)}
                >
                  {token + 1}
                </button>
              ),
            )}
          <button
            type="button"
            className="lac lac-table-btn"
            aria-label={text.next}
            disabled={pageIndex >= pageCount - 1}
            onClick={() => onPageChange(pageIndex + 1)}
          >
            ›
          </button>
        </div>
      </nav>
    );
  },
);

export interface TableEmptyProps extends Omit<TdHTMLAttributes<HTMLTableCellElement>, "title"> {
  /** Must span every column, or the message sits under the first one. */
  colSpan: number;
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  /** A way out — "Clear filters", "Add the first invoice". */
  action?: ReactNode;
}

/**
 * The empty state, as a real row.
 *
 * It says what to do next, because "No data" tells a reader nothing about
 * whether they broke something or simply have not added anything yet.
 */
export const TableEmpty = forwardRef<HTMLTableCellElement, TableEmptyProps>(function TableEmpty(
  { colSpan, title = "Nothing to show", description, icon, action, className, children, ...rest },
  ref,
) {
  return (
    <td {...rest} ref={ref} colSpan={colSpan} className={classes("lac-table-empty", className)}>
      {children ?? (
        <div className="lac-table-empty-inner">
          {icon && (
            <span className="lac-table-empty-icon" aria-hidden="true">
              {icon}
            </span>
          )}
          <p className="lac-table-empty-title">{title}</p>
          {description && <p className="lac-table-empty-desc">{description}</p>}
          {action}
        </div>
      )}
    </td>
  );
});
