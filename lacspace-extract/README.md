# lacspace-extract

**Free, open-source data extraction.** Pull **text, tables and metadata** out of **PDFs, Office documents (DOCX / PPTX / EPUB), HTML pages and spreadsheets** into clean **JSON, NDJSON, CSV, Excel or Markdown**. A zero-dependency PDF text engine (no OCR needed for text PDFs), a zero-dependency ZIP reader for Office files, HTML readability, per-page extraction, metadata and a built-in grep — no API keys.

```bash
npx lacspace-extract report.pdf                          # print the text
npx lacspace-extract report.pdf --grep "invoice" -i      # find "invoice" across the doc
npx lacspace-extract notes.docx -f md -o notes.md        # DOCX → Markdown
npx lacspace-extract article.html --readable -f md       # the article, no nav/footer
```

## What it does — by file type

| Input | Default | With flags |
| --- | --- | --- |
| `.pdf` | extract the **text** | `--pages 2-5`, `--per-page`, `--meta`, `--tables`, `--grep` |
| `.docx` | extract **paragraphs** | `--tables` also pulls real Word tables |
| `.pptx` | extract **text per slide** | `--per-page` for one block per slide |
| `.epub` | extract the **book text** in reading order | `--meta` for the title |
| `.html` / `.htm` | extract every **`<table>`** | `--readable` for the main article, `--text` for all text |
| `.csv` `.tsv` `.xlsx` `.json` `.ndjson` | read the **rows** | convert between formats |

```bash
# Just pages 2–5, split page by page, as JSON
npx lacspace-extract report.pdf --pages 2-5 --per-page -f json

# PDF metadata (title/author/dates) + text
npx lacspace-extract report.pdf --meta

# Slide-by-slide text from a deck
npx lacspace-extract deck.pptx --per-page

# DOCX → Markdown (headings, paragraphs, tables)
npx lacspace-extract report.docx -f md -o report.md

# The readable article from a web page → Markdown
npx lacspace-extract article.html --readable -f md

# Every HTML table → CSV
npx lacspace-extract prices.html -f csv -o prices.csv

# CSV → JSON (any format → any format)
npx lacspace-extract data.csv -f json
```

## Options

| Option | Meaning |
| --- | --- |
| `--tables` | Also detect tables (PDF/text: best-effort, column-aligned; DOCX: real `w:tbl` tables) |
| `--text` | Also/force plain-text extraction |
| `--readable` | HTML: extract the main article (drop nav/footer/aside) + page metadata |
| `--pages <range>` | PDF: only these pages — `2-5`, `1,3,5`, `4-` (open-ended). Implies `--per-page` |
| `--per-page` | PDF/PPTX: one text block per page/slide (a `pages` array in JSON) |
| `--meta` | Include document metadata (PDF Info/XMP, EPUB title) |
| `--grep <regex>` | Print only matching lines, with page/line numbers |
| `-i, --ignore-case` | Case-insensitive `--grep` |
| `-C, --context <n>` | Lines of context around each `--grep` match |
| `-f, --format <fmt>` | `json` · `ndjson` · `csv` · `xlsx` · `txt` · `md` |
| `-o, --out <file>` | Output file, or `-` for stdout |
| `--sheet <name>` | Excel sheet name |

## Library

```ts
import {
  extractFile, extractPdfText, extractPdfPages, pdfMeta,
  extractDocx, extractPptx, extractEpub, readZip,
  htmlTables, columnTables, readableHtml, toMarkdown, grepText,
} from "lacspace-extract";
import { readFileSync } from "node:fs";

// One-call dispatcher (picks the engine by extension)
const { text, pageCount } = await extractFile("report.pdf");
const { tables } = await extractFile("page.html");            // header-keyed rows per <table>
const { readable } = await extractFile("article.html", { readable: true });

// PDF depth
const pages = extractPdfPages(readFileSync("report.pdf"), { range: "2-5" }); // [{ page, text }]
const meta  = pdfMeta(readFileSync("report.pdf"));            // { title, author, created, … }

// Office (zero-dep ZIP + XML)
const doc  = extractDocx(readFileSync("report.docx"));        // { text, tables }
const deck = extractPptx(readFileSync("deck.pptx"));          // { text, slides }
const book = extractEpub(readFileSync("book.epub"));          // { text, title }
const zip  = readZip(readFileSync("archive.zip"));            // Map<name, Buffer>

// HTML readability + Markdown + search
const article = readableHtml("<html>…</html>");              // { title, byline, blocks, text, meta }
const md = toMarkdown(article);                               // Markdown from structure
const hits = grepText(text, "invoice", { ignoreCase: true, context: 1 });
```

`serializeRows`, `readRows` and `convertFile` are re-exported so you can write results to any format without a second dependency.

### Public API added in 0.2.0

- `extractPdfPages(bytes, { range? }): { page, text }[]` — per-page text with an optional page range.
- `pdfMeta(bytes): PdfMeta` — title/author/subject/keywords/creator/producer/created/modified + `encrypted`.
- `parsePageRange(spec, total): number[]`, `pdfIsEncrypted(latin): boolean`.
- `readZip(bytes): Map<string, Buffer>`, `zipText(zip, name)` — zero-dep ZIP reader (stored + deflate).
- `extractDocx`, `extractPptx`, `extractEpub` — Office document readers.
- `columnTables(text)`, `splitFixedWidth(lines)` — column-boundary ruled-table detection.
- `readableHtml(html): ReadableResult` — main-article extraction + metadata.
- `toMarkdown(RichDoc | ExtractResult)`, `blocksToMarkdown`, `resultToDoc` — Markdown rendering.
- `grepText(text, pattern, opts)`, `grepPages(pages, pattern, opts)` — search with context.

Everything from 0.1.0 (`extractFile`, `extractPdfText`, `htmlTables`, `htmlText`, `lineTables`) is unchanged.

## Honest limits

- **Scanned/image PDFs need OCR.** The PDF engine reads *text-based* PDFs — it inflates FlateDecode content streams and parses text operators. Scanned pages contain images, not text, so they yield nothing here.
- **Encrypted PDFs are detected and reported, not decrypted.** Empty-password RC4/AESV2 decryption isn't implemented yet; the CLI clearly reports `encrypted` and exits rather than emitting garbage.
- **Complex/positioned PDF layouts are best-effort.** Unusual CID font encodings and heavily-positioned text may not reconstruct perfectly. Table detection relies on column-aligned spacing (`--tables` / `columnTables`) — complex or borderless tables may need manual cleanup.
- **Office extraction is text-first.** DOCX keeps paragraph breaks and pulls tables; PPTX gives per-slide text; EPUB gives spine text in reading order. Images, styling and precise layout aren't reconstructed.
- **Readability is pragmatic, not a full Readability.js.** It scores containers by paragraph density and drops nav/footer/aside — great for articles/blogs/docs, best-effort on unusual markup.
- HTML `<table>` and spreadsheet extraction are exact.

## Licence

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)**. Part of the [Lacspace developer platform](https://developer.lacspace.com).
