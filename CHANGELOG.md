# Changelog

## 0.1.9

Chart design tokens for analysis and tracking pages, in duobrain's own colors.

- `--duo-chart-*` tokens: five series starting with the two people's colors plus a gray Other, a charcoal single series with a lime highlight, a lime-to-forest sequential scale, a terracotta/steel-blue diverging pair, grid/axis/label chrome and mark sizes. Checked for color-blind separation and 3:1 contrast on white.
- The tokens page draws a short line chart, highlighted bars, a 90-day chart with averages and a year heatmap.
- Between releases, `release:check` only requires the `Design tokens:` line; the comparison with the previous tag runs when releasing.

## 0.1.8

The dashboard's look is published as design tokens.

- `tokens.css` holds 73 `--duo-*` tokens (colors by role, type, a 4px spacing scale, radii, shadows, layout); other pages can load it from `.duobrain/`, `node_modules/duobrain/` or a running dashboard's `/tokens.css`.
- `tokens.html` (or `/tokens`) shows each token with the elements that use it, and each element with the tokens it reads.
- Token names stay stable within 0.x.y; every release note now carries a `Design tokens:` line that `release:check` verifies.
- The dashboard is built only from the tokens; a few gaps are slightly wider and near-identical colors were unified. Old variable names remain as aliases until 0.2.0.

## 0.1.7

Records are written to be found, and an agent finds them in one step.

- `find` looks through wiki notes, tickets and session handoffs along two channels at once. Search matches words (BM25F, Korean as two-character pieces, light English stemming), judges the candidates by rule and returns at most a few cards with the reason each matched and a strength (`strong`, `weak`, `none`). Browse lists the other records as one short line each, so the agent can pick by meaning what the words missed. No bodies are returned.
- `wiki-get` and `ticket-get` open one note or one ticket in full. `wiki-list` now lists cards without bodies; `--full` keeps the previous output.
- Wiki notes may carry an `abstract` and `keywords`. Notes without them stay valid, and `note-add` names what is missing. Older engines ignore both fields.
- `status --brief` gains a `wiki` section: the evidence of my open tickets and notes others recorded after my last handoff, capped.
- The AI guide looks records up with `find`, answers lookups in four lines with a quoted line, and treats a record as missing only when neither channel has it.

## 0.1.6

First version published on npm.

- `install` and `update` drop the `git+` prefix npm adds to the repository URL. A copy installed from the npm package of 0.1.5 would have recorded `git+https://…` as its source, which Git cannot fetch, so `update` would have failed. 0.1.5 was not published to npm.
- `npx duobrain@0.1.6 install` is the documented install.

## 0.1.5

duobrain is published on npm.

- The first person runs `npx duobrain@0.1.5 install` in the product repository; no clone of duobrain is needed. Installing from a Git download still works.
- `update` keeps installing from the Git release tags, so npm and Git installs update the same way.
- The npm package holds only the runtime files that `install` vendors; `release:check` enforces it.
- The README and Getting started guide drop the "local alpha" label.

## 0.1.4

Updating duobrain takes one step for the updater and a pull for the partner.

- `update` commits only `.duobrain/` (and any agent file it rewrote) as `chore: update duobrain to vX.Y.Z`; other staged files stay out. `--no-commit` skips it.
- The product's `AGENTS.md` block is a fixed pointer to `.duobrain/AGENTS.md`, so it no longer changes between releases.
- The newly installed code finishes each update (`update-finish`).
- Each update is recorded as `tool.updated`; the partner's dashboard and `status --brief` (`duobrainUpdate`) say to pull until versions match. Older engines ignore the record.
- Upgrading from v0.1.3 or earlier: commit `.duobrain` and `AGENTS.md` by hand once.

## 0.1.3

The dashboard becomes a two-person board, and duobrain can be updated from it.

- New layout: a collapsible Ink & Lime sidebar with `Now`, `Requests`, `Flow` and `Wiki`, both people's current state, and a profile.
- `Now` shows the shared goal, a card per person, and open requests as sentences with whose turn it is; `Requests` pairs cards with a detail pane and `J`/`K`; `Flow` is a two-lane timeline of sessions, request events and wiki notes.
- With `--repository`, the local identity marks your requests as `Your turn` and shows your profile nickname and GitHub login; snapshots include `viewer`.
- Sharing status sits under the logo; a `Settings` tab holds language, auto-refresh, sidebar and version.
- `Check for updates` asks before running the copy's own `update`; a daily check (can be turned off) lights the button when a release is ready. Only the dashboard page can trigger the update.
- English by default, Korean only when the browser's first language is Korean.

## 0.1.2

Safety fix for duobrain copies placed inside a project.

- `update` run from a copy inside another repository (for example `tools/duobrain`) acted on that repository in 0.1.0 and 0.1.1: it fetched the project and could fast-forward the project's branch, reading the project's `package.json` as duobrain's version. It now refuses with `UPDATE_INSIDE_PROJECT` and explains how to move to `.duobrain`.
- `install` from such a copy records the release as `v<version>` instead of the project's commit.
- `install --no-agents` vendors without touching `AGENTS.md`, `CLAUDE.md` or `.gitattributes`.
- The vendoring guide explains how to move from a copied folder to `.duobrain`.

## 0.1.1

One person adds duobrain to the project; the other only pulls and joins.

- `install` vendors duobrain's runtime files into `<product>/.duobrain/`, pins the release in `VENDOR.json`, and writes the `AGENTS.md` block, the `CLAUDE.md` import and a `linguist-vendored` `.gitattributes` line.
- Run from a vendored copy, `update [--check] [--ref vX.Y.Z]` installs a published release and refreshes `AGENTS.md` with the new code. It only moves forward unless `--ref` is given, and never overwrites local edits in `.duobrain/`.
- `init --participant <id>` joins existing shared state without repeating both IDs; without shared state it fails before creating anything.
- [Why duobrain is vendored](docs/vendoring.md).

## 0.1.0

Initial Git-distributed release of duobrain for exactly two people and their existing AI tools.

- Git-backed shared plans, scoped sessions, handoffs, and resumable delivery on an isolated `duobrain/state` branch.
- Evidence-backed information requests and attributable human feedback, including clarification, reopening, and resolution.
- Shared source notes, wiki search, method comparison, and on-demand wiki refinement that preserves original notes.
- Read-only local dashboard in task tabs, English or Korean by browser language, with relative times, request turn owners and refresh while visible.
- Resumable AI-led onboarding with participant profiles.
- Compact `status --brief` and `overlap --brief` output, and a short English AI guide with on-demand references.
- Commit work records: `capture-extract`, `commit-note` and the `duobrain-commit` skill for Claude Code.
- `init` writes a managed duobrain block into `AGENTS.md` (imported by `CLAUDE.md`); `guide`, `agents-sync` and `update` commands.
- MIT license, CLI version output, CI checks, and a workflow that prepares draft GitHub releases from version tags.

Requires Node.js 22+ and Git. No runtime dependencies or npm installation are needed.
This is an early release: actual two-person acceptance on separate machines remains pending.
See [release notes](docs/releases/v0.1.0.md) for the scope and limitations.
