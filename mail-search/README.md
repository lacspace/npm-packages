# @lacspace/mail-search

Parses a Gmail-style mail search box into a plain data structure (an AST) that any backend can turn into a query: MongoDB, SQL, IMAP SEARCH, or a simple array filter. It doesn't run the search for you and doesn't depend on any database. It also turns an AST back into a query string, and includes a small evaluator for filtering records in memory.

It has no dependencies and runs anywhere: Node 18+, Deno, Bun, workers and browsers.

```ts
import { parseSearch, toQueryString, matchesAst } from "@lacspace/mail-search";

const ast = parseSearch('invoice from:anita has:attachment is:unread after:2026-09-01 -label:done', {
  now: new Date(),
});
// {
//   text: "invoice",
//   clauses: [
//     { field: "text",  op: "contains", value: "invoice", negated: false },
//     { field: "from",  op: "contains", value: "anita", negated: false, operator: "from" },
//     { field: "has",   op: "has", value: "attachment", negated: false, operator: "has" },
//     { field: "is",    op: "is", value: "unread", negated: false, operator: "is" },
//     { field: "date",  op: "after", value: Date(2026-09-01T00:00Z), negated: false, operator: "after", raw: "2026-09-01" },
//     { field: "label", op: "eq", value: "done", negated: true, operator: "label" }
//   ],
//   orGroups: [],
//   errors: []
// }

toQueryString(ast); // 'invoice from:anita has:attachment is:unread after:2026-09-01 -label:done'
```

## Supported syntax

| Syntax | Clause |
| --- | --- |
| `word`, `"exact phrase"` | `{ field: "text", op: "contains" }` (`phrase: true` for quoted) |
| `from:` `to:` `cc:` `subject:` `filename:` | `op: "contains"` on that field |
| `label:x` | `{ field: "label", op: "eq" }` |
| `category:x` | `{ field: "category", op: "eq" }` (value lowercased) |
| `in:folder` | `{ field: "in", op: "in" }` |
| `has:attachment` (also `attachments`, `file`, `files`) | `{ field: "has", op: "has", value: "attachment" }` |
| `is:unread` `read` `starred` (`flagged`) `replied` (`answered`) `suspicious` (`risky`, `phishing`) `verified` `list` (`newsletter`, `bulk`) `important` (`priority`) | `{ field: "is", op: "is", value: <canonical> }` |
| `before:` / `after:` with `YYYY-MM-DD`, `YYYY/MM/DD`, `today`, `yesterday`, `7d` `2w` `3m` `1y` | `{ field: "date", op: "before" \| "after", value: Date }` at midnight UTC |
| `since:` / `until:` | same as `after:` / `before:`, but `until:` includes the named day |
| `newer_than:` / `older_than:` with `d` `w` `m` `y` | `{ field: "date", op: "after" \| "before" }`, counted back from `now` |
| `larger:` / `smaller:` with `B` `K` `M` `G` (1K = 1024) | `{ field: "size", op: "gt" \| "lt", value: bytes }` |
| `-anything` | `negated: true` |
| `a OR b` (uppercase) | the terms go into one `orGroups` entry |
| `key:"quoted value"` | the quotes are removed |

- Operator names are case-insensitive. Unknown operators (`foo:bar`, URLs, `10:30`) stay as free text.
- A bad value (`after:2026-02-31`, `larger:big`, `older_than:soon`) adds a message to `errors` and the token falls back to free text. An empty value (`from:`) adds an error and is dropped, so it can't match everything.
- A leading or trailing `OR` adds an error and is ignored.
- Free text terms are separate clauses, so `invoice march` means both words, not the exact phrase. `text` is the positive top-level terms joined with spaces, for backends that want one string.
- Parentheses and Gmail's `{a b}` braces aren't supported.

## API

- **`parseSearch(q, { now? })`** returns `{ text, clauses, orGroups, errors }`. Never throws. `now` (a `Date` or milliseconds) is the reference time for relative dates; it defaults to the current time.
- **`toQueryString(ast)`** builds a query string. `parseSearch(toQueryString(ast), sameNow)` gives the same clauses and groups. Plain clauses come first, then OR groups. Date and size clauses use `raw` (what the user typed) when present, so `newer_than:7d` stays `newer_than:7d`. If you change a clause's `value`, delete its `raw`. Dates without `raw` are written as `YYYY-MM-DD` (the time of day is dropped).
- **`clauseToString(clause)`** formats one clause.
- **`matchesAst(ast, record, accessor?)`** returns true when the record matches: every clause, and at least one clause in each OR group. An empty AST matches everything.
  - `accessor(record, field, clause)` returns the record's value for a field. Return a boolean to answer the clause yourself (useful for `is:`, `has:` and `in:`), or a string, number, Date, object, or array of these. Objects are searched through their string values. Comparisons are case-insensitive, `contains` is a substring test, `eq`/`is`/`has`/`in` are whole-value tests on any element, `after` is inclusive and `before` is exclusive. A missing value fails the clause (and passes it when negated). A throwing accessor counts as missing.
  - Without an accessor it reads `record[field]`, and for `text` it searches every string value in the record.
- **Helpers**: `parseDay(value, now?)`, `parseSize(value)`, `subtractPeriod(ms, n, unit)`, `IS_VALUES`, `HAS_VALUES`, `OPERATORS`, `SEARCH_HELP` (example/description pairs for a help popover).

```ts
const inbox = messages.filter((m) =>
  matchesAst(ast, m, (m, field, clause) => {
    if (field === "is") return clause.value === "unread" ? !m.flags.includes("seen") : m.flags.includes(String(clause.value));
    if (field === "has") return m.attachments.length > 0;
    if (field === "text") return [m.subject, m.snippet, m.from.name, m.from.address];
    return m[field];
  }),
);
```

## Keeping your own database compiler

The package stops at the AST on purpose. Your app keeps a short compiler that knows your schema. For example, with MongoDB:

```ts
import { parseSearch, type SearchClause } from "@lacspace/mail-search";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rx = (v: unknown) => new RegExp(esc(String(v)), "i");

function toMongo(c: SearchClause): Record<string, unknown> {
  let f: Record<string, unknown>;
  switch (c.field) {
    case "text": f = { $or: ["subject", "from.address", "from.name", "snippet", "to.address", "attachments.filename"].map((k) => ({ [k]: rx(c.value) })) }; break;
    case "from": f = { $or: [{ "from.address": rx(c.value) }, { "from.name": rx(c.value) }] }; break;
    case "to": f = { $or: [{ "to.address": rx(c.value) }, { "to.name": rx(c.value) }, { "cc.address": rx(c.value) }] }; break;
    case "cc": f = { $or: [{ "cc.address": rx(c.value) }, { "cc.name": rx(c.value) }] }; break;
    case "subject": f = { subject: rx(c.value) }; break;
    case "filename": f = { "attachments.filename": rx(c.value), hasAttachments: true }; break;
    case "label": f = { labels: c.value }; break;
    case "category": f = { category: c.value }; break;
    case "in": f = { folder: c.value }; break;
    case "has": f = { hasAttachments: true }; break;
    case "is":
      f = ({
        unread: { flags: { $ne: "seen" } }, read: { flags: "seen" }, starred: { flags: "flagged" },
        replied: { flags: "answered" }, suspicious: { "risk.level": "high" }, list: { isList: true },
        important: { priority: "high" },
        verified: { $or: [{ "auth.dmarc": "pass" }, { "auth.spf": "pass", "auth.dkim": "pass" }] },
      } as Record<string, Record<string, unknown>>)[String(c.value)] ?? {};
      break;
    case "date": f = { date: c.op === "before" ? { $lt: c.value } : { $gte: c.value } }; break;
    case "size": f = { size: c.op === "gt" ? { $gt: c.value } : { $lt: c.value } }; break;
    default: f = {};
  }
  return c.negated ? { $nor: [f] } : f;
}

const ast = parseSearch(q);
const filter = {
  $and: [...ast.clauses.map(toMongo), ...ast.orGroups.map((g) => ({ $or: g.map(toMongo) }))],
};
```

The same pattern works for SQL `WHERE` clauses or IMAP `SEARCH` keys.

## Limits

- Dates are UTC days. `after:2026-09-01` means 2026-09-01T00:00Z. If your users think in a local time zone, shift `clause.value` in your compiler.
- `m` in `newer_than:` / `older_than:` is calendar months and `y` is calendar years, counted back from `now`.
- Sizes use 1K = 1024 bytes.
- No parentheses, no braces, no `AROUND`, and no nested boolean logic beyond one level of OR groups.
- `matchesAst` is a simple in-memory evaluator. It doesn't do stemming, accent folding or ranking.

Built by [Lacspace](https://lacspace.com). Licensed under the Lacspace Free Licence v1.0 (see LICENSE).
