# @lacspace/dkim

DKIM signing and verification for email:
- **RFC 6376**: `rsa-sha256`, simple and relaxed canonicalization, `l=`, `t=`, `x=`, `i=`, over-signed From;
- **RFC 8463**: `ed25519-sha256`;
- **RFC 8301**: `rsa-sha1` and RSA keys under 1024 bits are rejected.

It uses WebCrypto only and has no dependencies. The same code runs on Node 18+, Deno, Bun, Cloudflare Workers and browsers. DNS lookup is injectable, so the core never touches the network unless you let it.

```ts
import { signMessage, verifyMessage, generateKeyPair } from "@lacspace/dkim";

const signed = await signMessage(rawMime, {
  domain: "example.com",
  selector: "mail2026",
  privateKey: process.env.DKIM_PRIVATE_KEY!, // PKCS#8 PEM
});
// "DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=example.com; s=mail2026; t=…;\r\n h=from:to:subject:date:message-id:from; bh=…; b=…\r\n" + rawMime

const { pass, results } = await verifyMessage(incomingRaw);
// pass: true when at least one signature verifies AND its d= aligns with the From domain
// results: [{ domain: "example.com", selector: "mail2026", algorithm: "rsa-sha256", status: "pass",
//             aligned: true, canonicalization: "relaxed/relaxed", signedHeaders: [...], bodyHashOk: true, keyBits: 2048 }]
```

## Set up a sending domain

**1. Generate a key pair** (once per selector):

```ts
import { generateKeyPair } from "@lacspace/dkim";

const { privateKeyPem, publicKeyPem, dnsRecord } = await generateKeyPair({
  algorithm: "rsa-sha256", // or "ed25519-sha256"
  modulusLength: 2048,
  selector: "mail2026",
  domain: "example.com",
});
```

**2. Store `privateKeyPem` as a secret** in your secrets manager or server `.env`. Do not commit it to the repo.

**3. Publish `dnsRecord`** as a TXT record:

| Field | Value |
|---|---|
| Name / Host | `dnsRecord.name`, i.e. `mail2026._domainkey.example.com` (many DNS UIs want only `mail2026._domainkey`) |
| Type | `TXT` |
| Value | `dnsRecord.value`, i.e. `v=DKIM1; k=rsa; p=MIIBIjANBg…` |

A 2048-bit RSA value is about 410 characters. A single DNS character-string holds at most 255, so `dnsRecord.chunks` gives the value already split. Paste the chunks as separate quoted strings if your DNS UI asks for that. `dnsRecord.zone` is the BIND line:

```
mail2026._domainkey.example.com. IN TXT ( "v=DKIM1; k=rsa; p=MIIBIjANBgkqh…" "…IDAQAB" )
```

To build a record from a public key you already have, call `dkimDnsRecord(publicKeyPem | CryptoKey, { selector, domain, testing? })`. It accepts a PEM or a CryptoKey. `testing: true` adds `t=y` while you roll DKIM out.

**4. Check it.** Send a message to yourself and run `verifyMessage` on what arrives. The result should be `status: "pass"`.

## Sign before sending (with `@lacspace/mailer`)

Signing must happen **last**: once the MIME is final, any change to a signed header or to the body breaks the signature. Build the message with `buildMime` from `@lacspace/mailer`, sign it, then submit the raw bytes over SMTP `DATA`:

```ts
import { buildMime } from "@lacspace/mailer";
import { signMessage } from "@lacspace/dkim";

const mime = buildMime(mail, { address: "news@example.com", name: "Example" }, messageId);
const signed = await signMessage(mime, {
  domain: "example.com",
  selector: "mail2026",
  privateKey: process.env.DKIM_PRIVATE_KEY!,
  // optional:
  // algorithm: "ed25519-sha256",          // detected from the key by default
  // headers: ["from", "to", "subject", "date", "message-id", "list-unsubscribe", "list-unsubscribe-post"],
  // identity: "news@example.com",          // i=
  // expiresInSec: 7 * 24 * 3600,           // x=
});
// hand `signed` to your SMTP DATA step
```

`mailer.send()` builds and sends the MIME in one step and does not take a pre-built message yet. Until it does, sign at your own SMTP/relay layer.

**Dual signing (RSA + Ed25519):** many senders sign twice, so that receivers which don't yet support Ed25519 still have an RSA signature to check. Call `signMessage` on the output of the first call. Each call prepends one more `DKIM-Signature`.

`signHeader(raw, options)` returns only the `DKIM-Signature: …` header, folded with CRLF and with no trailing CRLF. Use it when you need to keep the original bytes untouched: the header goes in front of the message as-is.

## Verify incoming mail (verified-sender badges in a webmail)

```ts
import { verifyMessage } from "@lacspace/dkim";

const v = await verifyMessage(rawBytes, {
  // resolveTxt: (name) => Promise<string[][]>   default: node:dns/promises resolveTxt
  // now: Date.now(), maxSignatures: 5, minRsaBits: 1024, clockSkewSec: 300,
  // allowBodyLength: true, organizationalDomain: (d) => pslOrgDomain(d)
});

const badge = v.pass
  ? { kind: "verified", text: `Verified sender · ${v.fromDomain}` }
  : v.results.some((r) => r.status === "pass")
    ? { kind: "signed", text: `Signed by ${v.results.find((r) => r.status === "pass")!.domain}` } // valid but not From's domain
    : v.results.some((r) => r.status === "fail")
      ? { kind: "warning", text: "Signature broken — message may have been altered" }
      : { kind: "none" };
```

Run this once, when the message arrives. Store the result next to the message instead of verifying again on every view: keys get rotated or revoked later, and a message that verified at delivery would then start failing.

**Status values** follow RFC 8601 `dkim=` results:

| `status` | Meaning | Typical `reason` |
|---|---|---|
| `pass` | signature and body hash verify | (none), or a note that `l=` covers only part of the body |
| `fail` | the signature is well-formed but the message does not match it | `body hash did not verify`, `signature did not verify`, `signature expired (x=)`, `l= is longer than the body` |
| `permerror` | the signature can never verify | missing or revoked key, key under 1024 bits, `rsa-sha1`, k= mismatch, From not in `h=`, i= outside d=, syntax error |
| `temperror` | try again later | DNS timeout or SERVFAIL; Ed25519 missing from this runtime's WebCrypto |
| `policy` | verifies, but local policy refuses it | `t=` in the future beyond `clockSkewSec`; `l=` when `allowBodyLength: false` |

How the result is worked out:
- **`aligned`** compares d= with the domain of the From header. Without a Public Suffix List, the check is: equal, or one is a subdomain of the other with at least two labels. For DMARC-grade alignment, pass `organizationalDomain`.
- **`pass`** at the top level needs at least one `pass` that is also `aligned`, and exactly one From header.
- **`testing`** is `true` when the key record carries `t=y`.

## What it handles

- **Several signatures** on one message, evaluated in parallel and capped by `maxSignatures` (top-most first). Body hashes are computed once for each canonicalization and `l=` combination.
- **`h=` selection** is bottom-up, so a repeated header such as `h=x-tag:x-tag` takes the two lowest instances. A listed name that is absent counts as an empty string, which stops that header from being added later. Header names match case-insensitively.
- **Over-signed From.** The signer lists `from` one extra time, so an attacker can't prepend a second From. A message with more than one From header never gets a top-level `pass`.
- **`b=` removal** follows RFC 6376 §3.7: the `b=` tag name stays and its value, including folding whitespace, is removed. Folded `DKIM-Signature` headers and base64 that contains FWS both parse.
- **DNS TXT records** that come back split into several strings are joined. Records with `v=`, `k=rsa` or `k=ed25519`, `h=`, `s=`, `t=y` and `t=s` are all checked.
- **Key formats:**
  - Ed25519 `p=` is the raw 32-byte key (RFC 8463).
  - RSA `p=` can be SPKI or bare PKCS#1.
  - Private keys can be PKCS#8 (`PRIVATE KEY`), PKCS#1 (`RSA PRIVATE KEY`) or a `CryptoKey`.
- **Bytes.** `Uint8Array` input is hashed byte-exactly. String input with non-Latin-1 characters is encoded to UTF-8 first, and bare LF line endings are normalised to CRLF.

## API

| Function | Returns |
|---|---|
| `signMessage(raw, options)` | `Promise<string>`: the message with `DKIM-Signature` prepended (CRLF, or LF if the input uses only LF) |
| `signHeader(raw, options)` | `Promise<string>`: the folded header only |
| `verifyMessage(raw, options?)` | `Promise<{ results, pass, fromDomain }>` |
| `generateKeyPair({ algorithm?, modulusLength?, selector?, domain?, testing? })` | `Promise<{ privateKeyPem, publicKeyPem, dnsRecord, algorithm }>` |
| `dkimDnsRecord(publicKey, { selector?, domain?, algorithm?, testing? })` | `Promise<{ name, type: "TXT", value, chunks, zone }>` |
| `parseDkimSignature(headerValue)` / `parseDkimKey(txt \| string[])` | parsed tags; throw `DkimError` on syntax errors |
| `canonicalizeHeader(name, value, mode)` / `canonicalizeBody(body, mode, length?)` | canonical forms (RFC 6376 §3.4) |
| `stripSignatureValue`, `parseTagList`, `chunkTxt`, `fromDomainOf`, `importPrivateKey`, `ed25519SeedToPkcs8`, `toPem` | lower-level helpers |

`SignOptions`:

| Option | Default | Notes |
|---|---|---|
| `domain` | | `d=` |
| `selector` | | `s=` |
| `privateKey` | | `CryptoKey` or PEM |
| `algorithm` | from the key | |
| `headerCanon` | `"relaxed"` | |
| `bodyCanon` | `"relaxed"` | |
| `headers` | the standard set | `from, to, cc, subject, date, message-id, reply-to, in-reply-to, references, mime-version, content-type, content-transfer-encoding, list-unsubscribe, list-unsubscribe-post`, signed only when present |
| `oversignFrom` | `true` | |
| `identity` | | `i=` |
| `expiresInSec` | | `x=` |
| `timestamp` | `true` | `t=` |
| `time` | | signing time, for tests |
| `bodyLength` | | `l=`: `true` for the full length, or a number. Discouraged |
| `crypto` | | an injected WebCrypto |

## Runtime notes

- **Node ≥ 20** recommended: Ed25519 is in its WebCrypto by default. Node 18.4+ supports it in `crypto.webcrypto` too.
- **Without `globalThis.crypto`**, the package dynamically imports `node:crypto` and uses its `webcrypto` (some Node 18 setups need this). You can also pass `{ crypto }` explicitly.
- **If a runtime lacks Ed25519**, Ed25519 signatures verify as `temperror` rather than `fail`.
- **DNS:** the default `resolveTxt` dynamically imports `node:dns/promises`. On edge runtimes and in browsers, pass your own resolver, for example DNS-over-HTTPS:

  ```ts
  const resolveTxt = async (name: string) => {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${name}&type=TXT`, { headers: { accept: "application/dns-json" } });
    const j = await r.json();
    if (j.Status === 3) throw Object.assign(new Error("NXDOMAIN"), { code: "ENOTFOUND" });
    return (j.Answer ?? []).filter((a: any) => a.type === 16).map((a: any) => [...a.data.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]));
  };
  ```

  Throw an error with `code` `ENOTFOUND`, `ENODATA` or `NXDOMAIN` for "no such key", which gives `permerror`. Any other error gives `temperror`.

## Security notes

- **Keep private keys out of the repo.** Load them from a secrets manager or the server environment. Use one key per selector, and never reuse a DKIM key for TLS or anything else.
- **Rotate selectors** every 6–12 months:
  1. Publish the new selector's record.
  2. Switch signing over to it.
  3. Keep the old record up for about a week, so mail still in transit can verify.
  4. Revoke the old record by publishing `p=` empty. Delete it later.

  Date-based selectors (`mail2026`, `s202610`) make this easy to track.
- **Use RSA-2048 at minimum.** 1024-bit keys still verify, because RFC 8301 sets that floor, but they are weak. To refuse them, set `minRsaBits: 2048` on verification. Ed25519 keys are small and fast, so add one as a second signature.
- **Avoid `l=`.** Anyone can append content after the signed length, and the signature still passes. On the verifying side, `allowBodyLength: false` turns such signatures into `policy`.
- **DKIM alone doesn't prove the sender is genuine.** It proves that the signing domain vouched for these headers and this body. Show a "verified sender" badge only when `pass` is true, which means the signature is aligned with From. Pair DKIM with SPF and DMARC on your domains.

## Limitations

- Only `q=dns/txt`. `z=` (copied headers) is parsed but ignored.
- Alignment without a Public Suffix List is approximate. Inject `organizationalDomain` for exact DMARC behaviour.
- ARC (RFC 8617) and DMARC policy evaluation are out of scope.

## Licence

Lacspace Free Licence v1.0. See [LICENSE](./LICENSE).
