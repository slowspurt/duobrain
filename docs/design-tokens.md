# Design tokens

The dashboard's colors, type, spacing, radii and shadows are published as `--duo-*` CSS custom
properties in [`src/dashboard/public/tokens.css`](../src/dashboard/public/tokens.css). When the two of you
build something next to duobrain — a manual for a specific task, a dashboard of what you delivered — load
that file and reuse duobrain's UI instead of designing tokens of your own; every release says whether the
tokens changed.

`tokens.html` shows every token with its value and the dashboard elements that use it, then each element
drawn with the real dashboard styles and the tokens it reads. Open it from a running dashboard at
<http://127.0.0.1:4173/tokens>, or open the file directly.

## Loading the tokens

Load the file; do not copy its values.

| How duobrain is installed | Path |
| --- | --- |
| Vendored in the project | `.duobrain/src/dashboard/public/tokens.css` |
| npm | `node_modules/duobrain/src/dashboard/public/tokens.css` |
| Running dashboard | `http://127.0.0.1:4173/tokens.css` |

```html
<link rel="stylesheet" href=".duobrain/src/dashboard/public/tokens.css">
<style>
  .report { background: var(--duo-color-surface); border-radius: var(--duo-radius-lg); padding: var(--duo-space-6); }
  .report h1 { font: var(--duo-weight-bold) var(--duo-text-2xl)/var(--duo-leading-tight) var(--duo-font-sans); }
</style>
```

These paths are part of the promise below. The tokens are set on `:root` and only use the `--duo-`
prefix, so they do not clash with your own variables. Fonts are named, not bundled: `--duo-font-sans`
falls back from Inter and Pretendard to the system font.

## Names

| Group | Pattern | Examples |
| --- | --- | --- |
| Color | `--duo-color-<role>[-<variant>]` | `--duo-color-surface`, `--duo-color-ink-soft`, `--duo-color-accent`, `--duo-color-person-1-subtle`, `--duo-color-waiting-indicator` |
| Type | `--duo-font-*`, `--duo-text-<size>`, `--duo-weight-*`, `--duo-leading-*`, `--duo-tracking-*` | `--duo-text-sm`, `--duo-weight-bold` |
| Space | `--duo-space-<n>` = n × 4px, plus `--duo-space-half` (2px) | `--duo-space-3` (12px), `--duo-space-8` (32px) |
| Radius | `--duo-radius-<size>` | `--duo-radius-md`, `--duo-radius-pill` |
| Elevation | `--duo-shadow-*`, `--duo-ring-*` | `--duo-shadow-card`, `--duo-ring-selected` |
| Layout | `--duo-sidebar-*`, `--duo-content-max` | `--duo-content-max` |

Roles describe what a color is for, not what it looks like: `--duo-color-accent` is the lime used for
"your turn" and primary actions, `-subtle` is the quiet background of the same role, `-indicator` is the
dot, and `-line` is its border.

## What stays stable

- **Within a 0.x.y line (patch releases), a token is never renamed or removed.** Tokens may be added,
  and values may be adjusted when the dashboard's look changes.
- **Renames and removals happen only in a new minor version (0.x+1.0).** The old name stays as an alias for
  that minor version and is listed in the release note.
- **The file paths above stay the same.**
- Nothing else in `styles.css` is public: class names, layout and the rest of the dashboard's CSS can
  change in any release.

## Release notes

Every release note from v0.1.8 has one line about the tokens:

```
Design tokens: unchanged
Design tokens: added --duo-color-x; changed --duo-space-3
```

`npm run release:check` compares `tokens.css` with the previous release tag and refuses a release whose
line does not match, or a patch release that removes a token. `node scripts/token-changes.mjs <tag>`
prints the line to paste.

## For duobrain contributors

- The dashboard's own CSS uses only `--duo-*` tokens: no literal colors, `rem` sizes, radii or spacing in
  `styles.css`. A test enforces it, so a new look starts as a token.
- After changing `tokens.css` or `styles.css`, run `node scripts/build-tokens-page.mjs` to regenerate
  `tokens.html`; a test fails when it is out of date.
- Variable names from before 0.1.8 (`--bg`, `--ink`, `--lime`, …) remain as aliases in `styles.css`
  until 0.2.0.
- There is no dark theme yet; when one comes, it will set the same names under a selector rather than
  add new ones.
