# @lacspace/captcha

**A keyless, privacy-friendly CAPTCHA — zero dependencies, no Google, no Cloudflare.**

No account, no API keys, no tracking, no fire-hydrant puzzles. Instead of profiling
the user, the browser quietly solves a small **proof-of-work** puzzle (invisible to
humans, ~a few hundred ms) that makes bulk/bot submissions expensive.

The scheme is **stateless and self-verifying** (HMAC-signed challenges, ALTCHA-style):
you keep one server secret and store nothing between issuing and verifying. The
SHA-256/HMAC core is pure JS, verified against the **NIST** and **RFC 4231** test vectors.

```bash
npm i @lacspace/captcha
```

---

## Server: issue a challenge + verify

```ts
import { createChallenge, verifySolution } from "@lacspace/captcha";

const secret = process.env.CAPTCHA_SECRET!; // any random string

// GET /api/captcha  → hand the browser a challenge
app.get("/api/captcha", async (_req, res) => {
  res.json(await createChallenge({ secret }));
});

// POST /api/signup  → verify the widget's hidden field before trusting the form
app.post("/api/signup", async (req, res) => {
  const { success } = await verifySolution(req.body["lacspace-captcha"], { secret });
  if (!success) return res.status(400).json({ error: "captcha failed" });
  // ...proceed
});
```

## Browser: drop in the widget

```ts
import { renderCaptcha } from "@lacspace/captcha/client";

renderCaptcha(document.getElementById("captcha")!, {
  challenge: "/api/captcha",     // your endpoint above
  onVerified: () => console.log("human!"),
});
```

The widget adds a hidden `<input name="lacspace-captcha">`, so if it lives inside a
`<form>`, the solution is submitted automatically — nothing else to wire.

### No widget? Solve it yourself

```ts
import { solveChallenge, encodeSolution } from "@lacspace/captcha";

const challenge = await fetch("/api/captcha").then((r) => r.json());
const solution = await solveChallenge(challenge);          // yields so the UI stays smooth
const field = encodeSolution(solution!);                   // submit this string
```

---

## Tuning difficulty

`createChallenge({ secret, maxNumber, expiresMs })`:

| Option | Effect |
| --- | --- |
| `maxNumber` (default `100000`) | Bigger = more work for the client. ~100k ≈ tens–hundreds of ms. Raise it for login/signup, lower it for low-value forms. |
| `expiresMs` (default `300000`) | How long a challenge stays valid. `0` = never expires. |

## How it works (and why it's safe)

1. The server sends a random `salt`, a `challenge = SHA256(salt + number)` for a
   secret `number ∈ [0, maxNumber]`, and `signature = HMAC(secret, challenge)`.
   The `number` is **not** sent.
2. The browser brute-forces `number` (the work) and returns it.
3. The server checks the hash matches **and** the HMAC matches — so a bot can't
   forge its own trivially-easy challenge; only puzzles you signed are accepted.

> **Replay note:** challenges are stateless. For high-value actions, tie the
> solution to the request (or keep a short-lived set of used signatures) if you
> need strict one-time-use.

## API

**Server / isomorphic:** `createChallenge`, `verifySolution`, `solveChallenge`,
`encodeSolution`, `decodeSolution`, `sha256Hex`, `hmacSha256Hex`.

**Browser (`@lacspace/captcha/client`):** `renderCaptcha`.

## License

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE).
