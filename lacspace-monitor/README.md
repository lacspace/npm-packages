# lacspace-monitor

**Free, open-source change monitor.** Watch a **web page**, **CSS selector**, **JSON API field**, **RSS/Atom feed**, **HTTP status**, **response header**, **response time**, **SSL-certificate expiry** or **uptime** — and get told the moment something moves. **Condition-based alerts** (price drops, thresholds, keywords), **Slack / Discord / Telegram / e-mail / webhook** notifiers, a **change-history log** and **rich diffs**. Snapshots + diffs on a schedule, export to JSON/CSV/Excel. No API keys. Built on the [lacspace-scraper](https://www.npmjs.com/package/lacspace-scraper) engine.

```bash
# Alert me on Slack only when the price actually drops
npx lacspace-monitor https://shop.site/product --selector ".price" --when decreased --slack $HOOK
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
| Text presence | `--contains "In stock"` | the text appearing / disappearing |
| Text absence | `--absent "Sold out"` | it staying gone / coming back |
| A regex | `--match "v\\d+\\.\\d+"` | a pattern starting / stopping matching |
| HTTP status | `--status` | the status code changing (200 → 503) |
| A response header | `--header etag` | that header's value changing |
| Response time | `--response-time` | how long the request took (ms) |
| SSL expiry | `--ssl-expiry` | days until the TLS cert expires |
| Uptime | `--availability` | up ↔ down (status < 400 = up) |

## Alert only when it matters — `--when`

By default a watch alerts on **any** change. Add `--when <rule>` to fire only when the change (or the current value) matches a condition:

| Rule | Fires when | Example |
| --- | --- | --- |
| `increased` / `decreased` | the number went up / down | price drop: `--selector .price --when decreased` |
| `changed` | anything moved (the default) | |
| `contains:<s>` / `not-contains:<s>` | the new value has / lacks text | `--when "not-contains:In stock"` |
| `matches:<regex>` | the new value matches a regex | `--when "matches:^v2\\."` |
| `>N` `<N` `>=N` `<=N` | numeric threshold on the value | slow: `--response-time --when ">500"` |
| `==<v>` / `!=<v>` | equals / not-equals (number or string) | down: `--status --when "!=200"` |

Numbers are parsed leniently, so `--when ">100"` works on `"$1,299.00"`, `"812 ms"` or `"v2"`. **Change rules** (`increased`/`decreased`/`changed`) need the value to move and never fire on the first run; **value rules** (`contains`, `>N`, `==` …) fire whenever the current value matches — including the baseline, so `--ssl-expiry --when "<14"` warns you immediately.

```bash
# Warn 14 days before a certificate expires, by e-mail
npx lacspace-monitor https://mysite.com --ssl-expiry --when "<14" \
  --email you@mysite.com --smtp smtp.mailgun.org:587
```

## Notifiers

Point a change at any (or several) of these — messages are formatted per channel:

| Flag | Delivers to |
| --- | --- |
| `--webhook <url>` | a raw JSON `POST` (unchanged from v0.1) |
| `--slack <url>` | a Slack incoming webhook (header + sections) |
| `--discord <url>` | a Discord webhook (embeds) |
| `--telegram <botToken>:<chatId>` | the Telegram Bot API |
| `--email <to> --smtp <host:port>` | e-mail over SMTP (STARTTLS or implicit TLS) |

E-mail auth and options come from the environment: `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE=1` (implicit TLS; auto-on for port 465). The SMTP client is dependency-free (raw `node:net` / `node:tls`).

```bash
npx lacspace-monitor https://api.site/health --status --when "!=200" \
  --discord $DISCORD_HOOK --telegram 123456:ABCdef:987654321 --interval 1m
```

## Change history

Append every detected change to an NDJSON log and summarize it later:

```bash
npx lacspace-monitor https://shop.site/p --selector ".price" --history changes.ndjson
npx lacspace-monitor history changes.ndjson     # totals, busiest watches, recent changes
```

Each snapshot also keeps a small retained trend (last few values) inside the state file.

## Rich diffs

- `--json` changes are reported **path-by-path** (`data.items.0.price 9 → 8`).
- Multi-line page/text changes are shown as a **line-level** diff (`+`/`-`).
- Helpers `lineDiff`, `wordDiff`, `jsonDiff` are exported for your own use.

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
    { "url": "https://shop.site/p/1", "selector": ".price", "label": "Widget price", "when": "decreased" },
    { "url": "https://api.site/status", "path": "data.status", "label": "API status", "when": "!=ok" },
    { "url": "https://mysite.com", "type": "ssl-expiry", "label": "Cert", "when": "<14" },
    { "url": "https://blog.site/rss.xml", "type": "feed", "label": "Blog posts" }
  ],
  "notify": [
    { "kind": "slack", "url": "https://hooks.slack.com/services/…" }
  ],
  "webhook": "https://hooks.mysite.com/monitor",
  "history": "changes.ndjson",
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
| `--contains <s>` / `--absent <s>` / `--match <regex>` | Watch text presence / absence / a regex |
| `--status` / `--header <name>` / `--response-time` / `--ssl-expiry` / `--availability` | Watch response metadata |
| `--when <rule>` | Only alert when the condition matches (see above) |
| `--label <text>` | Label for reports |
| `--state <file>` | Snapshot store (default `.lacspace-monitor.json`) |
| `--history <file>` | Append changes to an NDJSON log |
| `--webhook` / `--slack` / `--discord` / `--telegram` / `--email <to>` `--smtp <host:port>` | Notifiers |
| `--config <file>` | Config with `watches[]`, `webhook`, `notify[]`, `state`, `history` |
| `--interval <dur>` | Re-check every `30s` / `5m` / `1h` (omit = run once) |
| `-q, --quiet` | Only print (and only banner) when something changed |
| `--fail-on-change` | Exit non-zero if anything alerted — a CI gate |
| `-f, --format <fmt>` / `-o <file>` | Also write results as json/ndjson/csv/xlsx |

The webhook receives `{ tool, at, changes: [ { id, label, url, type, changed, alerted, condition, before, after, added, removed } ] }`.

## Library

```ts
import { runChecks, loadState, saveState, notify, appendHistory } from "lacspace-monitor";

const state = loadState(".lacspace-monitor.json");
const { results, state: next } = await runChecks(
  [
    { url: "https://example.com", selector: "h1", label: "Homepage title" },
    { url: "https://shop.site/p", selector: ".price", when: "decreased", label: "Price" },
    { url: "https://mysite.com", type: "ssl-expiry", when: "<14", label: "Cert" },
  ],
  state,
);
saveState(".lacspace-monitor.json", next);

const alerts = results.filter((r) => r.alerted);
if (alerts.length) {
  await notify(alerts, [{ kind: "slack", url: process.env.SLACK_HOOK! }]);
  appendHistory("changes.ndjson", alerts);
}
```

Pure, unit-tested helpers are exported too:

- **Conditions:** `parseCondition`, `parseNumeric`, `evalCondition`, `evalWhen`
- **Diffs:** `lineDiff`, `wordDiff`, `jsonDiff`
- **SSL:** `sslDaysUntil(notAfter, now?)` — whole days until a cert expires
- **Notifiers:** `formatSlack`, `formatDiscord`, `formatTelegram`, `formatEmail`, `formatText`, `changeSummary`, `sendSlack`, `sendDiscord`, `sendTelegram`, `sendEmail`, `sendWebhookPayload`
- **History:** `readHistory`, `summarizeHistory`, `resultToHistory`
- **Core:** `hashValue`, `getByPath`, `feedItemIds`, `diffSnapshots`, `inferType`, `watchId`, `snapshotValue`, `snapshotItems`, `retainHistory`

## Honest limitations

- **SSL/status/response-time/availability** use a native request (not a headless browser); JS-rendered content still needs a real selector/page watch.
- **Response time** and **SSL days** drift every check, so they **only alert with a `--when`** rule (no rule → recorded but never alerts).
- **E-mail** speaks plain SMTP with `AUTH LOGIN` — fine for common providers (Gmail app-passwords, Mailgun, SES SMTP, Postmark), but it isn't a full MTA; there is no OAuth2 or DKIM signing. Deliverability is your relay's job.
- `--contains` / `--match` test the fetched HTML source, so a keyword inside a `<script>` or comment still counts as present.
- Notifiers are best-effort: a failed delivery is reported and never crashes the run.

## Please monitor responsibly

Keep intervals sane (minutes, not milliseconds), respect each site's Terms and robots policy, and don't hammer servers. This is for watching things you're allowed to watch.

## Licence

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)**. Part of the [Lacspace developer platform](https://developer.lacspace.com).
