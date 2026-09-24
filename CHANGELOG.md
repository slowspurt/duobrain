# Changelog

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
