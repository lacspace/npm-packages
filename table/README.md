# @lacspace/table

**A React data table with no dependencies.** Sorting, filtering, global search, pagination, row selection, column resizing, pinned columns, expandable rows, footer totals and CSV export — themeable through CSS variables, accessible, and safe to render on the server.

```bash
npm i @lacspace/table
```

```tsx
import "@lacspace/table/styles.css";
import { DataTable, textColumn, currencyColumn, dateColumn, badgeColumn } from "@lacspace/table";

interface Invoice {
  id: string;
  client: string;
  total: number;
  due: string;
  status: "paid" | "due" | "overdue";
}

export function Invoices({ rows }: { rows: Invoice[] }) {
  return (
    <DataTable
      caption="Invoices"
      data={rows}
      columns={[
        textColumn<Invoice>("client", { header: "Client", key: "client", pinned: "left", width: 200 }),
        currencyColumn<Invoice>("total", { header: "Total", key: "total", currency: "USD", aggregate: "sum" }),
        dateColumn<Invoice>("due", { header: "Due", key: "due" }),
        badgeColumn<Invoice>("status", {
          header: "Status",
          key: "status",
          tones: { paid: "success", due: "warning", overdue: "danger" },
        }),
      ]}
      searchable
      selectable
      exportable
      columnMenu
      stickyHeader
      maxHeight={520}
      onRowClick={(row) => open(`/invoices/${row.id}`)}
    />
  );
}
```

## Why this one

- **Zero runtime dependencies.** React is the only peer — no TanStack, no virtualiser, no date library, no `clsx`.
- **The engine is pure functions.** Sorting, filtering, paging, selection, resizing, aggregates and CSV escaping live in `engine.ts` with no React and no DOM. That is why they are unit-tested, and why you can run them on a server or in a worker.
- **Headless if you want it.** [`useTable`](#headless-usetable) is the same engine with no markup. `DataTable` is that hook plus a `<table>`.
- **Real table semantics.** A real `<table>`, `<caption>`, `<th scope="col">`, `aria-sort`, sortable headers that are actual buttons, labelled checkboxes and a keyboard-operable resize handle.
- **Controlled *and* uncontrolled.** Sort, filters, search, page, page size, selection, expansion, column visibility and column widths each take `value` / `defaultValue` / `onChange`.
- **Server-render safe.** Nothing touches `window` during render, and the bundle ships the `"use client"` boundary, so you can import it straight from a React Server Component.
- **Fast enough without virtualisation.** Filtering and sorting run once per change; only the current page renders. 10,000 rows paginated render in well under a tenth of a second.

## Column definitions

A column says how to **read** a value and, optionally, how to **draw** it. The read drives sorting, filtering, search, footer totals and export — write it once.

```tsx
import { defineColumn } from "@lacspace/table";

defineColumn<Invoice, number>({
  id: "total",
  header: "Total",
  accessor: (row) => row.total,           // Value is inferred as number…
  cell: ({ value, row }) => <b>{value.toFixed(2)}</b>, // …so `value` is a number here
  aggregate: "sum",
  align: "end",
});
```

### Helpers

| Helper | Value | What it does |
| --- | --- | --- |
| `textColumn(id, opts)` | `string` | Plain text. `lines: 2` clamps with an ellipsis. |
| `numberColumn(id, opts)` | `number \| null` | Right-aligned, tabular figures, `Intl`-formatted. `decimals`, `format`, `locale`. |
| `currencyColumn(id, opts)` | `number \| null` | As above with `currency` (default `USD`); sums by default; exports the raw number. |
| `dateColumn(id, opts)` | `Date \| null` | Sorts chronologically, renders `<time dateTime>`, exports ISO. |
| `badgeColumn(id, opts)` | `string` | A status pill. `tones`, `labels`, `fallbackTone`. |
| `booleanColumn(id, opts)` | `boolean \| null` | Yes/no with a decorative mark and a real label. |
| `linkColumn(id, opts)` | `string` | An anchor from `href(row)`; the click never reaches `onRowClick`. |
| `actionsColumn(id, opts)` | `null` | Row buttons. Never sorted, searched or exported. |
| `customColumn(id, cell, opts)` | yours | Your renderer, the engine's accessor. |

### Options

Every helper and `defineColumn` accepts these.

| Option | Default | Notes |
| --- | --- | --- |
| `header` | the id | `ReactNode`. Pair rich headers with `name`. |
| `name` | header text or id | Plain text for the column menu, the export header and titles. |
| `key` | — | Shorthand accessor: read this property off the row. |
| `accessor` | from `key` | `(row) => value`. Wins over `key`. |
| `cell` | value as text | `({ value, row, index, id }) => ReactNode`. |
| `sortable` | `true` | |
| `compare` | locale-aware | `(a, b, rowA, rowB) => number`. |
| `filterable` | `false` | Adds an input to the filter row. |
| `filterFn` | shape-based | `(value, filter, row) => boolean`. |
| `searchable` | `true` | `false` keeps the column out of the global search. |
| `getSearchText` | value as text | Extra text to search, e.g. an id the cell does not show. |
| `aggregate` | — | `"sum" \| "avg" \| "min" \| "max" \| "count"`, over the **filtered** rows. |
| `footer` | from `aggregate` | Node, or `({ rows, value, id }) => ReactNode`. |
| `formatAggregate` | `formatNumber` | Turn the total into what the footer shows. |
| `align` | `"start"` | `"start" \| "center" \| "end"`. `end` also gets tabular figures. |
| `width` / `minWidth` / `maxWidth` | — / 64 / 960 | Pixels. Resizes clamp to min/max. |
| `resizable` | `true` | |
| `pinned` | — | `"left" \| "right"` — sticks against the edge while the table scrolls. |
| `hideable` / `defaultHidden` | `true` / `false` | For the column menu. |
| `exportValue` / `exportable` | value / `true` | Control what lands in the CSV. |
| `className` / `headerClassName` | — | Your classes win; no `!important` needed. |

## `DataTable`

Everything in [`UseTableOptions`](#headless-usetable) plus:

| Prop | Default | Notes |
| --- | --- | --- |
| `caption`, `captionVisible` | — / `false` | The accessible name. Hidden visually unless you ask. |
| `density` | `"normal"` | `compact` fits about a third more rows on a screen. |
| `striped`, `bordered`, `hoverable` | `false`, `false`, `true` | |
| `stickyHeader`, `maxHeight` | `false` | A frozen header needs a height to scroll inside. |
| `layout` | auto-detected | `fixed` honours your widths exactly — what you want with resizing on. |
| `loading`, `loadingRows` | `false` | Shimmer rows instead of data. |
| `empty*` | | `emptyTitle`, `emptyDescription`, `emptyIcon`, `emptyAction`, or `empty` to replace it. "Clear filters" appears by itself when filters are hiding everything. |
| `toolbar`, `toolbarStart`, `toolbarEnd` | `true` | The strip above the table. |
| `searchable`, `searchPlaceholder` | `false` | The global search box. |
| `filterRow` | `false` | A row of per-column inputs under the header. |
| `columnMenu`, `columnMenuLabel` | `false` | Show/hide columns. |
| `exportable`, `exportLabel`, `exportFilename` | `false` | The CSV button. |
| `selectable`, `getRowLabel` | `false` | The checkbox column. Label your rows. |
| `renderDetail` | — | `({ row, id, index, collapse }) => ReactNode`. Its presence adds the expander column. |
| `onRowClick`, `rowClassName` | — | Clicks inside links, buttons and inputs are ignored. |
| `showFooter` | auto | On when any column has an `aggregate` or a `footer`. |
| `pageSizeOptions`, `showPageSize`, `compactPagination`, `paginationLabels` | | The pager. |

### Controlled state

Any of it, any combination. Pass `value` and you own it; pass `defaultValue` and the table owns it. `onChange` fires either way.

```tsx
const [sort, setSort] = useState<SortRule[]>([{ id: "total", direction: "desc" }]);
const [selected, setSelected] = useState<string[]>([]);

<DataTable
  data={rows}
  columns={columns}
  sort={sort}
  onSortChange={(next) => setSort([...next])}
  selected={selected}
  onSelectedChange={(next) => setSelected([...next])}
  paginate={false}           // show all rows, no pager
  getRowId={(row) => row.id} // stable ids keep selection across pages and filters
/>
```

## Headless: `useTable`

The same engine, no markup. Render whatever you like.

```tsx
import { useTable, textColumn, numberColumn } from "@lacspace/table";

function Leaderboard({ players }: { players: Player[] }) {
  const table = useTable({
    data: players,
    columns: [
      textColumn<Player>("name", { key: "name" }),
      numberColumn<Player>("score", { key: "score", aggregate: "max" }),
    ],
    defaultSort: [{ id: "score", direction: "desc" }],
    defaultPageSize: 20,
  });

  return (
    <>
      <input value={table.query} onChange={(e) => table.setQuery(e.target.value)} />
      <ol>
        {table.rows.map(({ id, row }) => (
          <li key={id} onClick={() => table.toggleRowSelected(id)}>
            {row.name} — {row.score}
          </li>
        ))}
      </ol>
      <button disabled={!table.canNextPage} onClick={table.nextPage}>
        Next ({table.range.from}–{table.range.to} of {table.range.total})
      </button>
    </>
  );
}
```

The instance carries `rows`, `filteredRows`, `columns`, `allColumns`, `total`, `range`, `aggregates`, and the actions: `toggleSort`, `setFilter`, `clearFilters`, `setQuery`, `setPageIndex`, `setPageSize`, `nextPage`, `previousPage`, `toggleRowSelected`, `toggleAllOnPage`, `pageSelection`, `clearSelection`, `toggleExpanded`, `toggleColumn`, `setColumnWidth`, `toDelimitedText` and `download`.

## Building your own layout

The parts are exported, so you can keep our styling and lose our structure: `Table`, `TableScroll`, `TableCaption`, `THead`, `TBody`, `TFoot`, `Tr`, `Th`, `Td`, `TableToolbar`, `TableSearch`, `TableCheckbox`, `TableColumnsMenu`, `TablePagination`, `TableEmpty`.

```tsx
<TableScroll maxHeight={480}>
  <Table stickyHeader density="compact">
    <TableCaption>Open positions</TableCaption>
    <THead>
      <Tr>
        {table.columns.map((column) => (
          <Th
            key={column.id}
            sortable={column.sortable}
            sortDirection={table.sortDirection(column.id)}
            onSort={(additive) => table.toggleSort(column.id, additive)}
            align={column.align}
          >
            {column.header}
          </Th>
        ))}
      </Tr>
    </THead>
    <TBody>
      {table.rows.map((model) => (
        <Tr key={model.id} selected={model.selected}>
          {table.columns.map((column) => (
            <Td key={column.id} align={column.align}>
              {column.renderCell({ value: column.getValue(model.row), row: model.row, index: model.index, id: model.id })}
            </Td>
          ))}
        </Tr>
      ))}
    </TBody>
  </Table>
</TableScroll>
```

## Export

```ts
import { exportRows, downloadCsv, toCsv, toTsv } from "@lacspace/table";

const fields = [
  { header: "Client", value: (row: Invoice) => row.client },
  { header: "Total", value: (row: Invoice) => row.total },
];

const csv = exportRows(rows, fields);
const tsv = exportRows(rows, fields, { delimiter: "\t" }); // paste straight into a spreadsheet
downloadCsv("invoices.csv", csv);                            // touches the DOM only inside the call
```

Escaping follows RFC 4180 — quotes doubled, and any cell holding the delimiter, a quote or a line break is quoted. Cells starting with `=`, `+`, `-`, `@`, a tab or a carriage return are prefixed with an apostrophe so a spreadsheet cannot execute them; plain numbers such as `-12.5` are left alone. `downloadCsv` writes a BOM so Excel reads UTF-8 correctly, and returns `false` instead of throwing when there is no DOM.

## The engine, without React

Every one of these is a pure function you can import on its own:

`sortRows` · `defaultCompare` · `cycleSort` · `sortDirectionOf` · `sortIndexOf` · `filterRows` · `matchesFilter` · `matchesQuery` · `isEmptyFilter` · `pageCount` · `clampPage` · `pageSlice` · `pageRange` · `pageForSizeChange` · `pageTokens` · `toggleSelected` · `setSelection` · `selectionMode` · `isIndeterminate` · `pruneSelection` · `clampColumnWidth` · `resizeColumn` · `pinnedOffsets` · `aggregate` · `numericValues` · `escapeCell` · `neutraliseFormula` · `toDelimited` · `toCsv` · `toTsv` · `exportRows` · `toNumber` · `toText` · `isBlank`

Two behaviours worth knowing:

- **Blanks sort last in both directions.** `null`, `undefined` and `NaN` are always at the bottom, ascending or descending — flipping the sort should surface the biggest values, not a wall of empty cells.
- **Blanks are ignored by aggregates, not counted as zero.** The average of `3, blank, 5` is `4`.

## Theming

One stylesheet, every value a `--lac-*` variable — the same tokens as `@lacspace/components`, so a table dropped into that kit inherits your theme with nothing to configure.

```css
:root {
  --lac-accent: #7c3aed;
  --lac-radius: 14px;
  --lac-border: #e6e8ec;
}
```

Used on its own, the package supplies its own fallbacks (including a full dark palette) and never defines a `--lac-*` token itself, so it can't fight the kit. Dark mode follows the OS unless `data-theme="light"` says otherwise, and `data-theme="dark"` always wins.

No CSS pipeline? Render `<TableStyles />` once, or read the sheet as a string from `tableCss`.

```tsx
import { TableStyles } from "@lacspace/table";
```

## Accessibility

- A real `<table>` with `<caption>`, `<th scope="col">`, `<thead>`, `<tbody>` and `<tfoot>`.
- Sortable headers are `<button>`s inside the `<th>`, and the `<th>` carries `aria-sort`.
- Selection checkboxes always have a name — `getRowLabel` sets it; the header one says it acts on this page.
- The expander sets `aria-expanded` and `aria-controls` on its detail row.
- Resize handles are `role="separator"`, focusable, and move with the arrow keys (Shift for one pixel at a time).
- The column menu is a `<details>` element: keyboard-operable, Escape-closable, no portal, no JavaScript.
- Clickable rows are focusable and respond to Enter and Space; clicks on links, buttons and inputs inside them are not hijacked.
- Animations respect `prefers-reduced-motion`.

## TypeScript

`DataTable<Row>` infers the row type from `data`, and column value types flow from the accessor through `defineColumn` and the helpers into `cell`, `compare` and `filterFn`. The package is strict-mode clean with `noUncheckedIndexedAccess`, and ships no `any`.

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE).
