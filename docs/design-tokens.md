# Design tokens

The dashboard's colors, type, spacing, radii and shadows are published as `--duo-*` CSS custom
properties in [`src/dashboard/public/tokens.css`](../src/dashboard/public/tokens.css). When the two of you
build something next to duobrain — a manual for a specific task, a data-tracking dashboard — load
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
| Chart | `--duo-chart-series-<1–5>`, `-other`, `-single`, `-highlight`, `-sequential-<1–5>`, `-diverging-*`, `-grid` / `-axis` / `-label`, mark sizes | `--duo-chart-highlight`, `--duo-chart-line-width` |
| Layout | `--duo-sidebar-*`, `--duo-content-max` | `--duo-content-max` |

Roles describe what a color is for, not what it looks like: `--duo-color-accent` is the lime used for
"your turn" and primary actions, `-subtle` is the quiet background of the same role, `-indicator` is the
dot, and `-line` is its border.

## Charts

For a data-tracking page, the `--duo-chart-*` tokens give chart colors drawn from duobrain's own palette,
checked for color-blind separation and contrast against the white card surface, plus the chart chrome.

- **One series:** draw it in `--duo-chart-single` (charcoal) and light only the mark that matters, such
  as this week or you, in `--duo-chart-highlight` (lime) with `--duo-chart-highlight-line` around it.
- **Several series** (`--duo-chart-series-1` to `-5`) are assigned in that order and never cycled.
  Series 1 and 2 are the two people's colors, so a two-person chart needs nothing else; then terracotta,
  steel blue and olive. A sixth series and anything secondary use `--duo-chart-other` (gray). All five
  clear 3:1 on white. Scatter-like charts, where any two colors can touch, stay readable up to three
  series.
- **Lines** need no legend: label each line at its end, in text color.
- **Sequential** (`-sequential-1` to `-5`, lime to forest green) shows how much; for ordered steps such as
  stages or tiers start at step 2. **Diverging** (`-diverging-negative` terracotta, `-neutral`,
  `-positive` steel blue) shows above or below a baseline.
- **Chrome:** `-grid` for hairlines, `-axis` for the baseline, `-label` for ticks, legends and values.
  Text never takes a series color; a colored mark beside it carries the identity.
- **Marks:** 2px lines (`-line-width`), 8px points (`-marker-size`), 4px rounded data ends on bars
  (`-bar-radius`) and a 2px surface gap between adjacent fills (`-gap`).
- Status meaning (done, waiting, failed) keeps the status tokens and always comes with a label; never use a
  status color as a series.
- One y-axis per chart: two measures on different scales become two charts.

The tokens page draws a line chart, a highlighted bar chart and every chart color.

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
