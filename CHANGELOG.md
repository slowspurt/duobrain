# Changelog

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
