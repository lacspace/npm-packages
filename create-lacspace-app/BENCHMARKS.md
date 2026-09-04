# Benchmarks

A fair, reproducible head-to-head against `create-next-app`. We benchmark **scaffold time only** (the CLI writing files to disk) — dependency installation is excluded from both, because it's identical `npm install` work that depends on your network, not the tool.

## Method

- Both CLIs invoked **binary-direct** (`node .../dist/index.js`), not via `npx`/`npm create` (which add package-resolution overhead to both, unfairly and unequally).
- **Scaffold-only**: `--skip-install`/`--no-install` and git disabled on both.
- Median of **7 runs** on the same machine, back-to-back.
- `create-next-app` given the closest-matching flags (TypeScript, Tailwind, App Router, import alias).

## Reproduce it yourself

```bash
mkdir bench && cd bench
npm i create-next-app@latest create-lacspace-app@latest

CNA=node_modules/create-next-app/dist/index.js
CLA=node_modules/create-lacspace-app/dist/index.js

# create-lacspace-app — finished app, scaffold only
for i in 1 2 3 4 5 6 7; do rm -rf cla$i; \
  /usr/bin/time -p node "$CLA" cla$i --template saas --no-install --no-git -y >/dev/null 2>&1; done

# create-next-app — blank app, scaffold only
for i in 1 2 3 4 5 6 7; do rm -rf cna$i; \
  /usr/bin/time -p node "$CNA" cna$i --ts --tailwind --app --no-eslint --no-src-dir \
  --skip-install --disable-git --no-turbopack --import-alias "@/*" >/dev/null 2>&1; done

# compare what you got
echo "lacspace files: $(find cla1 -type f | wc -l)  pages: $(find cla1 -name page.tsx | wc -l)"
echo "next     files: $(find cna1 -type f | wc -l)  pages: $(find cna1 -name page.tsx | wc -l)"
```

## Results (create-next-app 16.3.4 vs create-lacspace-app 1.14.0)

| Metric | create-next-app | create-lacspace-app |
| --- | --- | --- |
| Scaffold time (median of 7) | **0.29s** | **0.15s** |
| Files written | 18 | 70 |
| `page.tsx` routes | 1 | 11 |
| Components | 0 | 37 (incl. a 26-component UI kit) |
| `sitemap.xml` / `robots.txt` / `/og` | ✗ | ✓ |
| `lib/site.ts` SEO config / JSON-LD | ✗ | ✓ |
| PWA manifest / styled 404 | ✗ | ✓ |
| Templates available | 1 | 8 |

## Honest caveats

- **This is not a "10× faster framework" claim.** Both scaffolders finish in well under a second; the ~1.9× gap is real but small in absolute terms. `create-lacspace-app` is faster largely because it writes precomputed template strings with no interactive prompt round-trips.
- The **meaningful** difference is *output*: `create-next-app` hands you a single blank page and no SEO; `create-lacspace-app` hands you a running, multi-page, SEO-complete app you can deploy immediately.
- "Time to a deployable, SEO-ready site" — the metric that actually matters to a developer — is where the gap is large, because with `create-next-app` that work is still ahead of you.
