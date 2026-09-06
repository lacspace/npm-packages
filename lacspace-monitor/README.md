# lacspace-monitor

**Free, open-source change monitor.** Watch any **web page**, **CSS selector**, **JSON API field** or **RSS/Atom feed** and get told when something moves — a price drop, a new listing, a status flip, a fresh post. Snapshots + diffs on a schedule, webhook alerts, export to JSON/CSV/Excel. No API keys. Built on the [lacspace-scraper](https://www.npmjs.com/package/lacspace-scraper) engine.

```bash
npx lacspace-monitor https://example.com --selector "h1" --interval 5m
```

## What it watches

| Watch | Flag | Detects |
| --- | --- | --- |
| A CSS selector's text | `--selector ".price"` | the value changing (before → after) |
| An attribute | `--selector "a.cta" --attr @href` | the attribute changing |
| A JSON API field | `--json data.status` | that field's value changing |
| An RSS/Atom/JSON feed | `--feed` | **new items** since last check |
| The whole page | *(default)* | any visible-text change |
| The raw body | `--text` | any byte change |

## How it works

The **first run captures a baseline**; every run after reports what moved. Snapshots live in a small state file (`.lacspace-monitor.json` by default), so you can run it from **cron or CI** and it just works — or use `--interval` to keep it running.

```bash
# Baseline now, then check every 10 minutes; POST changes to a webhook
npx lacspace-monitor https://shop.site/product --selector ".price" \
  --interval 10m --webhook https://hooks.mysite.com/price
```

## Watch many things — a config file

```jsonc
// monitor.json
{
  "watches": [
    { "url": "https://shop.site/p/1", "selector": ".price", "label": "Widget price" },
    { "url": "https://api.site/status", "path": "data.status", "label": "API status" },
    { "url": "https://blog.site/rss.xml", "type": "feed", "label": "Blog posts" }
  ],
  "webhook": "https://hooks.mysite.com/monitor",
  "state": ".lacspace-monitor.json"
}
```

```bash
npx lacspace-monitor --config monitor.json --interval 30m
```

## Options

| Option | Meaning |
| --- | --- |
| `-s, --selector <css>` | Watch a selector's text (`--attr @href` for an attribute) |
| `--json <path>` | Watch a JSON field, dot/bracket path (`data.items[0].price`) |
| `--feed` / `--text` / `--page` | Watch a feed / raw body / whole page (default) |
| `--label <text>` | Label for reports |
| `--state <file>` | Snapshot store (default `.lacspace-monitor.json`) |
| `--webhook <url>` | POST changed results as JSON |
| `--config <file>` | Config with `watches[]`, `webhook`, `state` |
| `--interval <dur>` | Re-check every `30s` / `5m` / `1h` (omit = run once) |
| `-q, --quiet` | Only print watches that changed |
| `-f, --format <fmt>` / `-o <file>` | Also write results as json/ndjson/csv/xlsx |

The webhook receives `{ tool, at, changes: [ { id, label, url, type, changed, before, after, added, removed } ] }`.

## Library

```ts
import { runChecks, loadState, saveState, sendWebhook } from "lacspace-monitor";

const state = loadState(".lacspace-monitor.json");
const { results, state: next } = await runChecks(
  [
    { url: "https://example.com", selector: "h1", label: "Homepage title" },
    { url: "https://api.site/status", path: "data.status", label: "Status" },
  ],
  state,
);
saveState(".lacspace-monitor.json", next);

const changed = results.filter((r) => r.changed);
if (changed.length) await sendWebhook("https://hooks.site/x", changed);
```

Pure, unit-tested helpers are exported too: `hashValue`, `getByPath`, `feedItemIds`, `diffSnapshots`, `inferType`, `watchId`, `snapshotValue` / `snapshotItems`.

## Please monitor responsibly

Keep intervals sane (minutes, not milliseconds), respect each site's Terms and robots policy, and don't hammer servers. This is for watching things you're allowed to watch.

## Licence

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)**. Part of the [Lacspace developer platform](https://developer.lacspace.com).
