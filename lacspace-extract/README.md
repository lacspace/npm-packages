# lacspace-extract

**Free, open-source data extraction.** Pull **text and tables** out of **PDFs, HTML pages and spreadsheets** into clean **JSON, NDJSON, CSV or Excel**. A zero-dependency PDF text engine (no OCR needed for text PDFs), HTML `<table>` extraction, and CSV/Excel reading — no API keys.

```bash
npx lacspace-extract report.pdf              # print the text
npx lacspace-extract prices.html -f csv      # every table → CSV
```

## What it does — by file type

| Input | Default | With `--tables` / `--text` |
| --- | --- | --- |
| `.pdf` | extract the **text** | `--tables` also detects column-aligned tables |
| `.html` / `.htm` | extract every **`<table>`** | `--text` also gives the page text |
| `.csv` `.tsv` `.xlsx` `.json` `.ndjson` | read the **rows** | convert between formats |

```bash
# PDF → text file
npx lacspace-extract report.pdf -o report.txt

# PDF statement → its table as Excel
npx lacspace-extract statement.pdf --tables -f xlsx -o statement.xlsx

# HTML price table → CSV
npx lacspace-extract prices.html -f csv -o prices.csv

# CSV → JSON (or any format → any format)
npx lacspace-extract data.csv -f json
```

## Options

| Option | Meaning |
| --- | --- |
| `--tables` | Also detect tables (PDF/text: best-effort, column-aligned) |
| `--text` | Also/force plain-text extraction |
| `-f, --format <fmt>` | `json` · `ndjson` · `csv` · `xlsx` · `txt` |
| `-o, --out <file>` | Output file, or `-` for stdout |
| `--sheet <name>` | Excel sheet name |

## Library

```ts
import { extractFile, extractPdfText, htmlTables } from "lacspace-extract";

const { text, pageCount } = await extractFile("report.pdf");
const { tables } = await extractFile("page.html");   // header-keyed rows per <table>

// Or go straight to the engines:
import { readFileSync } from "node:fs";
const pdf = extractPdfText(readFileSync("report.pdf"));   // { text, pageCount }
const rows = htmlTables("<table>…</table>");              // Record<string,string>[][]
```

`serializeRows`, `readRows` and `convertFile` are re-exported so you can write results to any format without a second dependency.

## Honest limits

The PDF engine reads **text-based PDFs** — it inflates FlateDecode content streams and parses the text operators. It does **not** do OCR, so **scanned/image PDFs won't yield text**, and unusual CID font encodings or heavily-positioned layouts are best-effort. Table detection from PDFs relies on column-aligned spacing; complex tables may need a manual selector. HTML and spreadsheet extraction are exact.

## Licence

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)**. Part of the [Lacspace developer platform](https://developer.lacspace.com).
