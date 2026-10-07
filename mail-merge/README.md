# @lacspace/mail-merge

Turn a CSV or spreadsheet of recipients plus one template into one personalised email per recipient. You get a validation report **before** anything is sent: bad addresses, duplicates, suppressed contacts and empty variables are all listed.

It does not send mail. Hand the messages to your mailer.

No dependencies. Runs in Node 18+, Deno, Bun, workers and browsers.

```ts
import { parseCsv, merge } from "@lacspace/mail-merge";

const csv = `﻿E-mail;First Name;Surname;Company
ram@example.com;Ram;Thapa;Himal Tea
sita@example.com;Sita;;
RAM@example.com;Ram;Thapa;Himal Tea
info@example.org;;;`;

const { rows, errors } = parseCsv(csv); // Excel ";" export, BOM stripped

const { messages, report } = merge(
  {
    subject: "Hi {{firstName | there}}, your invite",
    html: "<p>Dear {{first name|friend}},</p>{{#if company}}<p>Team {{company}} is welcome.</p>{{/if}}",
    text: "Dear {{firstName|friend}}",
  },
  rows,
  { suppress: ["@blocked.example"], extra: (row) => ({ unsubscribeUrl: `https://example.com/u?e=${row["E-mail"]}` }) },
);

messages[0];
// { to: { name: "Ram Thapa", address: "ram@example.com" }, subject: "Hi Ram, your invite",
//   html: "<p>Dear Ram,</p><p>Team Himal Tea is welcome.</p>", text: "Dear Ram", row, rowIndex: 0, warnings: [] }

report;
// { total: 4, ok: 3,
//   skipped: [{ row: 2, code: "duplicate", reason: "RAM@example.com already appears in an earlier row" }],
//   missingVars: {} }
// messages[2].warnings → ["info@example.org is a role address (info@); it may not reach a person"]
```

## API

### `parseCsv(text, opts?)` → `{ rows, columns, errors }`

Parses CSV text (RFC 4180) into rows of strings keyed by header.

- Quoted fields, `""` escapes and newlines inside quotes.
- CRLF, LF or CR line endings. A leading BOM is removed.
- `delimiter`: `","`, `";"`, `"\t"` or `"auto"` (default). Auto picks whichever of comma, semicolon or tab appears most in the header line. Excel uses `;` in many locales.
- Headers are trimmed. Duplicates become `email`, `email_2`, ... (compared ignoring case). Blank headers become `column_N`.
- Values are trimmed.
- Fully empty rows are skipped.
- Ragged rows are kept (missing cells become `""`, extra cells are dropped) and listed in `errors`. An unterminated quote is also listed.
- `errors[].row` is the 1-based line where the record starts (the header is line 1).
- `headerAliases`: `{ canonical: ["spelling", ...] }`. A header matching one of the spellings is renamed to the canonical name, so `{ email: ["correo"] }` turns a `Correo` column into `email`.

### `render(template, vars, opts?)` → `string`

Renders one template against one set of values.

- `escape`: `true` or `"html"` escapes `& < > " '` in values. `false` or `"none"` (default) leaves them alone.
- `missing`: `"empty"` (default) prints `""` for an empty value with no fallback. `"keep"` leaves the original tag in place.
- Values that aren't strings are converted: `null`/`undefined` → `""`, `Date` → ISO string, objects → JSON.

### `merge(input, rows, opts?)` → `{ messages, report }`

`input` is `{ subject, html?, text? }`. Each row becomes one message `{ to, subject, html?, text?, row, rowIndex, warnings }`.

Rows are checked in this order. The first failure skips the row with that `code`:

| code | When |
|---|---|
| `missing_email` | The email cell is empty, or no email column was found. |
| `invalid_email` | The address fails the syntax check. |
| `suppressed` | The address, or its exact `@domain`, is in `suppress`. |
| `duplicate` | The same address (ignoring case) already produced a message. |
| `missing_variable` | `requireVars` is on and a used variable is empty with no fallback. |
| `max_reached` | `max` messages have already been produced. |

Options:

- `emailField` / `emailColumn`: the column holding the address. When omitted, it's found through the email aliases.
- `dedupe` (default `true`), `validateEmail` (default `true`), `requireVars` (default `false`).
- `suppress`: any iterable of addresses or `"@domain"` entries. Case is ignored. `@domain` matches that domain only, not subdomains.
- `extra`: an object, or a function `(row) => object`, of extra variables such as an unsubscribe link. They override row values. `message.row` stays the original row.
- `max`: stop producing messages after this many.

What `merge` does with the content:

- Values are HTML-escaped in `html`. They are not escaped in `subject` or `text`.
- CR/LF in the rendered subject collapses to a single space, so a value can't add headers.
- `to.name` comes from the name/fullName column, else firstName + lastName. If neither exists and the cell looks like `Name <addr>`, that name is used. CR/LF is removed.
- A used variable that is empty with no fallback is counted once per row in `report.missingVars`. The message still goes out with `""` and a warning, unless `requireVars` is set.
- Variables only used inside an `{{#if}}` branch that wasn't taken are not counted.
- Role addresses (`info@`, `admin@`, `noreply@`, `no-reply@`, `support@`, `sales@`) get a warning, not a skip.
- `report.skipped[].row` and `message.rowIndex` are 0-based indexes into `rows`.
- An email cell of `"Name" <addr>` or `mailto:addr` is accepted.

### Also exported

- `mergeAll`: the same function as `merge` (`mergeAll === merge`).
- `parseRows(input, opts?)`: takes CSV text (same as `parseCsv`) or an array of objects, e.g. from a spreadsheet library. Values are stringified: `null`/`undefined` → `""`, `Date` → ISO, numbers and booleans → text, arrays and objects → JSON. Keys are trimmed and become columns in first-seen order. Missing keys become `""`. Empty rows are skipped. Non-object entries are listed in `errors` with their 0-based index.
- `compileTemplate(src)` → `{ vars, render(vars, opts?) }`: parse once, render many times.
- `findVariables(template)`: the variable names used, in order, including `{{#if}}`/`{{#unless}}` conditions. Duplicates are removed (ignoring case, spaces, underscores and hyphens).
- `isValidEmail(address)`, `escapeHtml(s)`, `normalizeKey(name)`, `BUILTIN_ALIASES`, `FILTERS`, `ROLE_LOCAL_PARTS`, and the TypeScript types.

## Template syntax

| Syntax | Meaning |
|---|---|
| `{{var}}` | The value. |
| `{{var\|fallback text}}` | The value, or the fallback when the value is empty or blank. |
| `{{var \| upper}}` | Apply a filter. |
| `{{name \| first \| there}}` | Filters chain. A fallback can follow. |
| `{{x\|"upper"}}` | A quoted fallback. Use quotes when the fallback equals a filter name or needs a `\|` or edge spaces. |
| `{{#if var}}…{{else}}…{{/if}}` | Shown when the value is non-blank. |
| `{{#unless var}}…{{/unless}}` | Shown when the value is blank. `{{else}}` works here too. |

- Filters: `upper`, `lower`, `title` (Title Case), `capitalize` (first letter up, rest down), `trim`, `first` (first word). A pipe segment is a filter only when it trims to one of these names. Anything else is fallback text.
- Filters apply to the value, never to the fallback. The fallback is template text, so it is not escaped.
- `{{var|}}` means "empty is fine": prints nothing and isn't counted as missing.
- Blocks nest. An unclosed block ends at the end of the template.
- Unknown tags (`{{#each}}`, a stray `{{/if}}`, `{{}}`) stay as literal text.
- No code is ever run. Values are inserted once and never re-parsed, so a value containing `{{x}}` stays literal.

## Column aliases

Variable names and column headers match ignoring case, spaces, underscores and hyphens. So `{{firstName}}`, `{{first name}}` and `{{FIRST_NAME}}` all read a `First Name` column. An exact match wins. Otherwise these groups apply:

| Variable | Matches columns |
|---|---|
| `firstName` | First Name, first_name, firstname, fname, given name |
| `lastName` | Last Name, last_name, surname, family name, lname |
| `name` | name, full name, fullName |
| `company` | company, organisation, organization, org |
| `email` | email, e-mail, email address, e-mail address, mail |
| `phone` | phone, phone number, telephone, mobile |
| `city` | city, town |
| `country` | country |
| `title` | title, job title |

Add your own with `headerAliases` in `parseCsv`/`parseRows`.

## Limits

- Everything is held in memory. There is no streaming parser.
- Email checking is a syntax check only. It does not look up MX records or test the mailbox. Unicode (non-ASCII) addresses, quoted local parts and IP-literal domains are rejected.
- Suppression is exact: `@domain` does not cover subdomains.
- `{{#if}}` only tests "blank or not". `"0"`, `"false"` and `"no"` count as true.
- `title` and `capitalize` use JavaScript's case mapping. Scripts without case, such as Devanagari, pass through unchanged.
- Values are always trimmed, including quoted ones.
- `headerAliases` applies at parse time. `render` and `merge` only know the built-in aliases.
- It builds messages; it doesn't send them, throttle them or add unsubscribe headers.

Built by [Lacspace](https://lacspace.com). Licensed under the Lacspace Free Licence v1.0 (see LICENSE).
