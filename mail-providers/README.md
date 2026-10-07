# @lacspace/mail-providers

Helps an app connect a mailbox with just an address and a password. It works out the mail provider from a domain's MX records, and gives you an ordered list of IMAP/SMTP server settings to try. It covers Hostinger, Titan, GoDaddy, Google Workspace / Gmail, Microsoft 365 / Outlook, Zoho, Yahoo and iCloud, plus generic `imap.` / `smtp.` / `mail.<domain>` guesses for everything else.

It makes no network calls. You do the MX lookup (one line in Node, shown below) and pass the hosts in. It has no dependencies and runs anywhere: Node 18+, Deno, Bun, workers and browsers.

```ts
import { promises as dns } from "node:dns";
import { providerFromMx, serverCandidates } from "@lacspace/mail-providers";

const mx = await dns.resolveMx("acme.com").catch(() => []); // [{ exchange, priority }, …]

providerFromMx(mx); // "gmail"

serverCandidates("anita@acme.com", mx);
// [{
//   provider: "gmail",
//   name: "Google Workspace / Gmail",
//   imap: { host: "imap.gmail.com", port: 993, secure: true, user: "anita@acme.com" },
//   smtp: { host: "smtp.gmail.com", port: 465, secure: true, user: "anita@acme.com" },
//   limits: { perHour: "unknown", perDay: "unknown" },
//   reason: "mx"
// }]
```

Try each candidate in order (log in over IMAP, then SMTP) and keep the first that works.

## Presets

| Key | IMAP | SMTP | Note |
| --- | --- | --- | --- |
| `hostinger` | imap.hostinger.com:993 TLS | smtp.hostinger.com:465 TLS | |
| `titan` | imap.titan.email:993 TLS | smtp.titan.email:465 TLS | |
| `godaddy` | imap.secureserver.net:993 TLS | smtpout.secureserver.net:465 TLS | |
| `gmail` | imap.gmail.com:993 TLS | smtp.gmail.com:465 TLS | Use an App Password |
| `outlook` | outlook.office365.com:993 TLS | smtp.office365.com:587 STARTTLS | The tenant may block basic auth |
| `zoho` | imap.zoho.com:993 TLS | smtp.zoho.com:465 TLS | |
| `yahoo` | imap.mail.yahoo.com:993 TLS | smtp.mail.yahoo.com:465 TLS | Requires an app password |
| `icloud` | imap.mail.me.com:993 TLS | smtp.mail.me.com:587 STARTTLS | Requires an app-specific password |

`secure: true` means TLS from the first byte (ports 993 and 465). `secure: false` means connect in plain text and upgrade with STARTTLS (port 587). This is the same meaning Nodemailer and most IMAP clients use. Don't send a password on a `secure: false` connection unless STARTTLS succeeded.

## Send limits

Every preset has `limits: { perHour: "unknown", perDay: "unknown" }`. That is deliberate. Providers change their sending limits, apply different ones per plan and per account age, and often don't publish them. This package won't guess, and it only sets a number when a documented source exists (in `limits.source`); right now none do.

**Your app must set its own conservative limits** per mailbox, from the provider's current documentation for that customer's plan. Back off when the server returns 4xx/5xx rate errors (for example 421, 450, 451, 452, 550 or 554 mentioning a limit).

## API

- **`providerFromMx(mxHosts)`** returns a `ProviderKey` or `null`. `mxHosts` can be strings or Node `resolveMx` records (`{ exchange, priority }`), which are sorted by priority. Hosts are lowercased and a trailing dot is dropped. The first recognised host wins, and matching respects domain boundaries (`evilhostinger.com` is not Hostinger).
- **`serverCandidates(email, mxHosts?, options?)`** returns the ordered candidates. The order is:
  1. `options.prefer`, in order (for example the hosts you resell: `{ prefer: ["hostinger", "titan"] }`);
  2. providers recognised from the MX hosts, in MX priority order. Hostinger and Titan share customers, so when either is found the other comes next (`reason: "paired"`);
  3. when no MX hosts were passed: a well-known consumer domain (gmail.com, outlook.com, hotmail.com, yahoo.com, icloud.com, me.com …);
  4. when nothing was recognised (or with `options.alwaysFallback`): `imap.<domain>` / `smtp.<domain>`, then `mail.<domain>` for both, on 993/465 TLS, as `provider: "custom"`.

  An address without a valid domain returns `[]`. Each candidate is a fresh copy, so it is safe to edit.
- **`PRESETS`**: frozen `Record<ProviderKey, { key, name, imap, smtp, limits, note? }>`. **`PROVIDER_KEYS`**, **`presetFor(key)`** (null for unknown keys), **`isProviderKey(v)`**.
- **Helpers**: `providerFromMxHost(host)`, `providerFromDomain(domain)`, `normalizeMx(mx)`, `domainOf(email)`, `MX_HINTS`, `DOMAIN_HINTS`.

## Limits

- No DNS, no connection tests and no autoconfig/autodiscover lookups. It only maps MX hosts and domains to known settings.
- Zoho is detected on all its regional MX hosts, but the preset uses the global `imap.zoho.com` / `smtp.zoho.com`. Accounts in other Zoho regions may need their regional hostnames; check Zoho's documentation and pass them as your own settings.
- Gmail, Yahoo, iCloud and many Microsoft 365 tenants refuse normal passwords over IMAP/SMTP. Users need an app password, or your app needs OAuth (see `@lacspace/oauth`).
- Domains behind a third-party spam filter (their MX points at the filter) won't be recognised, and get the generic guesses.

Built by [Lacspace](https://lacspace.com). Licensed under the Lacspace Free Licence v1.0 (see LICENSE).
