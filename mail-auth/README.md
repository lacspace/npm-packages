# @lacspace/mail-auth

Email authentication results and phishing/impersonation heuristics for a webmail **"this message may be dangerous"** banner. It powers the warning banner in Lacspace Mail.

- `parseAuthenticationResults()` reads `Authentication-Results` (RFC 8601), `Received-SPF` and `ARC-Authentication-Results` into SPF / DKIM / DMARC / ARC verdicts.
- `assessRisk()` combines those verdicts with sender, reply-to, contact, domain, wording and link checks. It returns a `none` / `low` / `high` level, a 0–100 score and plain-English reasons.

It is pure JS with no dependencies and runs in Node, browsers, workers and React Native. Punycode decoding is built in.

```ts
import { parseAuthenticationResults, assessRisk } from "@lacspace/mail-auth";

const auth = parseAuthenticationResults(
  { authenticationResults: headers.getAll("Authentication-Results"), receivedSpf: headers.getAll("Received-SPF") },
  { trustedAuthservIds: ["mx1.yourmail.com"] }, // only YOUR server's header
);
// { spf: "pass", dkim: "pass", dmarc: "fail", dmarcPolicy: "reject", headerFrom: "lacsp4ce.com", authservId: "mx1.yourmail.com", … }

const risk = assessRisk({
  from: { name: "Lacspace Billing", address: "billing@lacsp4ce.com" },
  replyTo: [{ address: "lacspace.billing@gmail.com" }],
  subject: "[EXTERNAL] Updated bank details",
  snippet: "Our bank details have changed, please pay the attached invoice urgently.",
  auth,
  recipientDomain: "lacspace.com",
  knownContacts: addressBook,             // [{ name, address }]
  links,                                  // [{ href, text }] from your HTML sanitizer
});
// { level: "high", score: 100, reasons: [
//   "The sender's address (billing@lacsp4ce.com) looks like lacspace.com but is a different domain.",
//   "It failed lacsp4ce.com's anti-forgery check (DMARC), so it may not really be from them.",
//   "It urgently asks for a payment or new bank details. Confirm with the sender by phone before paying.",
//   … ], signals: [{ code: "lookalike.from", weight: 50, detail: "lacspace.com" }, …] }
```

## The banner

```tsx
function RiskBanner({ risk }: { risk: RiskAssessment }) {
  if (risk.level === "none") return null;                       // no banner at all
  const high = risk.level === "high";
  return (
    <div role="alert" className={high ? "banner banner--danger" : "banner banner--caution"}>
      <strong>{high ? "This message may be dangerous" : "Be careful with this message"}</strong>
      <ul>{risk.reasons.slice(0, high ? 3 : 2).map((r) => <li key={r}>{r}</li>)}</ul>
      {high && <p>Don't click links, open attachments or send money until you've checked with the sender another way.</p>}
    </div>
  );
}
```

| `level` | Score | Suggested UI |
|---|---|---|
| `none` | 0–19 | no banner |
| `low` | 20–49 | yellow "Be careful" banner with 1–2 reasons |
| `high` | 50–100 | red "may be dangerous" banner; consider disabling links and images |

The thresholds are exported as `RISK_THRESHOLDS` (`{ low: 20, high: 50 }`) and every weight as `SIGNAL_WEIGHTS`.

## Getting `auth`: trust only your own server's header

Any sender can put `Authentication-Results: mx.google.com; dkim=pass; dmarc=pass` in a message before sending it. Your receiving server adds its own header **above** everything that came in. So:

- Pass headers **top-down**, in the order they appear in the message. A string, a string array, a whole raw header block, or `{ authenticationResults, receivedSpf, arcAuthenticationResults }` all work.
- Pass `trustedAuthservIds` with your server's authserv-id (the first word of its header, e.g. `mx1.hostinger.com`). A parent domain also matches: `hostinger.com` trusts `mx1.hostinger.com`. The parser then uses the **topmost** header with that id. It also merges the consecutive headers your server split its results into, and ignores everything else. If no trusted header is found, SPF/DKIM/DMARC stay `null`.
- Without `trustedAuthservIds`, the topmost header is used. That is right when your mail server strips incoming `Authentication-Results` with its own id, as RFC 8601 requires. Microsoft 365 headers have no authserv-id, so don't pass the option for them.
- `Received-SPF` is used only when the selected header has no `spf=` result. The topmost one is read.
- If the selected header has an `arc=` result, `arc` comes from it. Otherwise it comes from the newest `ARC-Authentication-Results` (highest `i=`), using that hop's `arc=` result, then its DMARC result, then its DKIM result.
- Multiple DKIM signatures: any `pass` gives `pass`. Otherwise the strongest failure wins. Every signature is listed in `dkimDomains`.
- `compauth=`, `action=`, `reason=` and other extras are kept in `raw` but don't change the verdicts.
- Malformed input never throws. You get `null` verdicts instead.

## Heuristics

| Code | Weight | Fires when |
|---|---|---|
| `auth.dmarc_fail` | 50 | DMARC `fail` / `policy` / `permerror` |
| `auth.spf_fail` | 25 | SPF `fail` / `permerror`, and DMARC didn't pass |
| `auth.spf_softfail` | 15 | SPF `softfail`, and DMARC didn't pass |
| `auth.dkim_fail` | 20 | DKIM failed, and DMARC didn't pass |
| `auth.unauthenticated` | 10 | results reported, but SPF, DKIM and DMARC are all `none` |
| `auth.dmarc_pass` | −15 | DMARC passed and no identity disguise below was found |
| `known_contact` | −20 | exact address is in `knownContacts` and nothing failed |
| `lookalike.from` | 50 | sender domain imitates `recipientDomain`, `trustedDomains` or a contact's domain |
| `domain.mixed_script` | 30 | a domain label mixes Latin with Cyrillic/Greek/Armenian, or is all-Cyrillic but reads as Latin |
| `domain.punycode` | 10 | international (`xn--`) domain that isn't otherwise suspicious |
| `display_name.other_address` | 45 | display name shows an email address that isn't the real one |
| `impersonation.known_contact` | 45 | display name matches a contact's name but the address is on another domain |
| `free_mail.brand` | 40 | free-mail sender whose name claims a brand, a bank or your organisation (`brandNames` adds more) |
| `free_mail.role` | 30 | free-mail sender whose name claims a role: CEO, HR, IT Department, Accounts… |
| `display_name.claims_org` | 30 | outside company domain whose name mentions your organisation |
| `reply_to.free_mail` | 30 | company sender, replies go to a free-mail account |
| `reply_to.different_domain` | 20 | replies go to another registrable domain |
| `lookalike.reply_to` | 35 | the reply-to domain is a lookalike |
| `content.payment_request` | 35 / 25 | payment-change, wire, gift-card, invoice-pay or crypto wording, 35 when it's also urgent |
| `content.credential_request` | 35 / 25 | "verify your account", "password expires", "account suspended", "unusual sign-in"…, 35 when it's also urgent |
| `content.urgent_request` | 25 | urgency + a money/sign-in word, with no specific phrase |
| `content.cue` | 5 | a single urgency or money word |
| `link.lookalike` | 40 | a link goes to a lookalike of your domains |
| `link.text_mismatch` | 30 | link text shows one domain, href goes to another |
| `link.userinfo` | 30 | `https://real.com@evil.example/` trick |
| `link.ip_address` | 25 | href is a bare IP address |
| `link.punycode` | 15 | href host is `xn--` |

The score is the sum of the weights, clamped to 0–100. Reasons are ordered by weight and de-duplicated. You get at most 5, each at most 120 characters. Signals with a negative weight never produce a reason.

**What counts as a lookalike:** `lookalikeOf(domain, candidates)` compares the registrable labels:
- homoglyph skeletons: `rn`→`m`, `vv`→`w`, `cl`→`d`, `l/1/I`, `0/o`, `5/s`, `3/e`, `@/a`, Cyrillic/Greek `а е о р с у х і ј ѕ ԁ ɡ α ο ρ ν`…;
- decoded `xn--` punycode;
- edit distance, with adjacent swaps counting once: ≤ 2 for names of 9+ letters, ≤ 1 for names of 4–8 letters;
- TLD swaps (`lacspace.co`);
- the real name in a subdomain (`lacspace.com.evil.io`) or in an affix (`lacspace-support.com`, `securelacspace.com`).

A domain with the same registrable domain as a candidate never matches. Free-mail senders are not checked against contacts' free-mail domains, so `ymail.com` is not reported as a `gmail.com` lookalike.

**Wording:** English, romanised Nepali (*turuntai*, *paisa pathaunu*, *naya khata*) and Nepali (तुरुन्तै, भुक्तानी, नयाँ खाता, खाता नम्बर, पासवर्ड). A specific phrase plus urgency fires strongly. A lone word is only a 5-point cue. Gateway subject tags such as `[EXTERNAL]`, `[EXT]`, `External:` and `*EXTERNAL*` are stripped first and never add risk.

## API

- **`parseAuthenticationResults(input, { trustedAuthservIds? })`:** returns `{ spf, dkim, dmarc, arc?, dkimDomains, spfDomain?, dmarcPolicy?, headerFrom?, authservId?, raw }`.
  - `Verdict` is `"pass" | "fail" | "softfail" | "neutral" | "none" | "temperror" | "permerror" | "policy" | null`.
- **`assessRisk(msg, { freeMailDomains?, brandNames? })`:** returns `{ level, score, reasons, signals }`.
  - `msg.auth` can be a parse result or just `{ spf, dkim, dmarc }`.
- **`lookalikeOf(domain, candidates)`:** returns the candidate being imitated, or `null`.
- **`skeleton(s)`:** a confusable-collapsed form, for comparison only.
- **`registrableDomain(host)`:** the last two labels, or three under known second-level suffixes such as `co.uk`, `com.np`, `org.np`, `edu.np`, `gov.np`, `com.au` and `co.in`.
- **`decodePunycode(label)`:** RFC 3492 decoding. The `xn--` prefix is optional.
- **`toUnicodeDomain(host)`:** converts a whole host to Unicode.
- **`isFreeMail(domain, extra?)`** and **`FREE_MAIL_DOMAINS`:** the built-in free-mail list.
- Extras: `editDistance`, `hasMixedScript`, `isWholeScriptConfusable`, `RISK_THRESHOLDS`, `SIGNAL_WEIGHTS`.

## Limitations

- **Heuristics, not a verdict.** A high score means "worth a warning", not "proven phishing". A low score doesn't mean "safe". Keep the user's own judgement in the loop, and don't auto-delete mail on this score.
- **No network lookups.** It does no URL or domain reputation checks, no DNS, no WHOIS or domain-age checks, and no attachment scanning. Combine it with those if you have them.
- **Authentication is only as good as the header you trust.** Without `trustedAuthservIds`, or a server that strips spoofed headers, a sender can fake the verdicts.
- **The registrable domain is a heuristic** (a curated list of second-level suffixes, not the full Public Suffix List). The confusables map is compact, not the full Unicode TR39 table.
- **Lookalikes are checked only against domains you supply:** `recipientDomain`, `trustedDomains` and contacts. Brand impersonation from a non-free-mail domain that isn't one of them isn't detected.
- **The wording lists are short and tuned for English and Nepali.** Other languages only get the structural checks.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0): free for personal and commercial use.
