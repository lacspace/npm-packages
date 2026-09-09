# Contributing to Lacspace Packages

Thanks for being here 💙 — the `@lacspace` ecosystem is **open**, zero-dependency and keyless, and it gets better with your help. This guide gets you from clone to PR quickly.

## Philosophy (what keeps these packages good)

- **Zero runtime dependencies.** Isomorphic (Node + browser + edge). If you need a heavy dep, it's probably a different package.
- **Deterministic & keyless.** No network by default, no API keys, no telemetry. Same input → same output.
- **Fully typed**, dual ESM + CJS (built with `tsup`), tested with `vitest`.
- **Lacspace Free Licence v1.0** — permissive and own-branded (see `LICENSE`). By contributing you agree your contribution ships under it.

## Quick start

```bash
git clone https://github.com/lacspace/npm-packages
cd npm-packages
npm install                 # workspaces
cd <package>                # e.g. logo or image
npm run build               # tsup
npm test                    # vitest
```

## The easiest, highest-impact contribution: grow the "brains" 🧠

Several packages are **data-driven** — you can improve them without writing code, just by curating JSON.

### `@lacspace/logo` — add a palette, icon, or font
The generator picks from `logo/src/data/`:

- **`palettes.json`** — add a mood-tagged palette. Every colour is a 6-digit hex; keep `bg`/`surface` dark and `primary`/`accent`/`from`/`to` vivid:
  ```json
  { "id": "my-palette", "name": "My Palette", "mood": ["tech", "bold"],
    "bg": "#0b1020", "surface": "#141a2e", "primary": "#3b82f6",
    "accent": "#22d3ee", "on": "#eef4ff", "from": "#0BB9D9", "to": "#3B82F6" }
  ```
- **`icons.json`** — add a clean **24×24 line icon** as inner SVG (stroke-based, no `fill`), with **keywords** so the brief can match it:
  ```json
  { "key": "rocket", "keywords": ["launch", "startup", "fast"],
    "svg": "<path d='M12 3 C15 6 16 10 16 13 L8 13 C8 10 9 6 12 3 Z'/>" }
  ```
  Keep paths simple and centred on the 24 grid. Test it: `generateLogo({ name: "Test", icon: "rocket" })`.
- **`fonts.json`** — add a Google-Fonts display/body pairing with a real fallback `stack` and mood tags.
- **`moods.json`** / **`keywords.json`** — map new industries/keywords to palettes, fonts, shapes and engines.

### `@lacspace/image`
New `pattern` kinds, `generators` (like `identicon`/`mesh`), or encoder improvements — keep them pure and deterministic.

## Writing code changes

1. Keep it **additive and backward-compatible** where possible (new options default to today's behaviour).
2. Add or update a **`vitest`** test in the package's `src/*.test.ts`.
3. Run `npm run build && npm test` in the package.
4. Match the existing code style (small, dependency-free, well-commented at the "why").

## Versioning

Additive changes → **minor** bump; fixes → **patch**. Maintainers handle publishing to npm. Don't bump versions in your PR unless asked.

## Opening a PR

- One focused change per PR; describe the *why*.
- Green tests + a clean `tsup` build.
- Be kind. First-time contributors are very welcome — if you're unsure, open an issue and we'll help.

Ideas we'd love: more curated palettes/icons/fonts, more industries in the logo brain, new deterministic image generators, docs and examples.

— The Lacspace team
