<p align="center">
  <img src="docs/assets/readme-banner.svg" alt="duobrain — You work together. Your AI should, too. Two people. Two AIs. One shared memory." width="100%" />
</p>

<p align="center">
  <a href="https://duobrain.pages.dev"><strong>Explore the demo ↗</strong></a> ·
  <a href="#get-started"><strong>Get started</strong></a> ·
  <a href="docs/agent-guidance/repository-onboarding.md">Full walkthrough</a> ·
  <a href="GETTING_STARTED.md">한국어</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-local_alpha-d4fa6c?style=flat-square&amp;labelColor=11191e" alt="Status: local alpha" />
  <img src="https://img.shields.io/badge/Node.js-22%2B-d4fa6c?style=flat-square&amp;labelColor=11191e" alt="Requires Node.js 22 or newer" />
  <img src="https://img.shields.io/badge/participants-exactly_2-b5a2ff?style=flat-square&amp;labelColor=11191e" alt="Built for exactly two participants" />
</p>

**Less repeating. More building.**

Your partner already figured it out. Their AI helped. The context is somewhere in their work—and you're about to ask them to explain it all again.

**duobrain gives two people and their AIs a shared project memory.** Connect your existing Git project, give your AI the collaboration guide, and turn plans, decisions, work logs, prompts and harnesses into knowledge you can both use.

From **what happened** to **why it happened** to **what you should do next**.

## Ask the questions you already ask

| You ask your AI | duobrain gives it a way to… |
| --- | --- |
| “How did Bob do this?” | Find the shared work record, prompt and harness references, and compare captured evidence. |
| “Where is Bob up to? What should I do next?” | Read the latest shared plan, work scope, blockers and handoff. |
| “The plan changed. What does that mean for me?” | Check the revised goals and each person's assignment. |
| “We don't have that detail. Can you get it?” | Leave a focused information request for the partner's next AI session. |
| “I need Bob's opinion on this.” | Create a human-feedback ticket and keep the decision attributable. |
| “Is this old note still the current guidance?” | Follow its sources, knowledge status and later summaries. |

When the evidence is there, your AI can use it. When it isn't, it can ask for the missing piece. Your partner's AI checks the request when they next work, shares permitted evidence, and leaves a record your AI can pick up after syncing.

**The handoff survives the conversation.** Open questions stay in the inbox; resolved requests stay searchable in history.

## A small team deserves a clear picture

- **Shared direction.** Project, medium-term and current-phase goals, with a scope and next step for each person.
- **Work you can pick up.** Start and finish records, pauses, scope changes, overlap checks and worktree preparation.
- **A wiki with receipts.** Source notes, decisions, captured methods and links back to the evidence.
- **Requests that stay visible.** Information requests and direct human feedback, with separate inbox and history views.
- **A dashboard for both of you.** Shared plans, recent work, recorded time, declared blockers and wiki exploration.
- **A daily refresh.** Revisit importance and recency while keeping the original sources and unresolved requests.

Built specifically for a pair. Use the AI tools you already work with; duobrain supplies the shared records and collaboration procedures.

## Get started

You need **Node.js 22+**, **Git**, and two clones of the same product repository with permission to push to its `origin`. Keep the duobrain tool checkout separate from the project you're building. No `npm install` is needed.

### 1. Get duobrain

Each person runs:

```sh
git clone https://github.com/slowspurt/duobrain.git
cd duobrain
```

Want a quick look first?

```sh
node src/dashboard/run.js
```

Open **http://127.0.0.1:4173** for the sample dashboard. The [web demo](https://duobrain.pages.dev) is a separate guided experience with example data; connecting your actual project comes next.

### 2. Connect both project clones

From each person's duobrain checkout, replace the product path below. Use the same participant IDs **in the same order** on both machines.

```sh
# Alice's machine
node bin/duobrain.js init \
  --repository /path/to/product \
  --participants alice,bob --participant alice
```

```sh
# Bob's machine
node bin/duobrain.js init \
  --repository /path/to/product \
  --participants alice,bob --participant bob
```

### 3. Give your AI the collaboration guide

Paste this into your existing AI's project instructions or first task. Replace the paths and your participant ID.

```text
Use duobrain for this two-person project.

Tool checkout: /path/to/duobrain
Product checkout: /path/to/product
My participant ID: alice
Partner: bob

Read guides/duobrain-ai.md and docs/agent-guidance/repository-onboarding.md
from the tool checkout. Preserve the existing project instructions.

Sync the permitted collaboration records. Check our plan, current goals,
work scopes and open requests. If the plan is incomplete, ask for the
missing context or meeting notes. Keep proposals distinct from agreements.

Within our existing sharing permissions, record work starts and handoffs,
answer information requests with evidence, and commit and push the records.
Tell me what my partner has shared, what is blocked, and what I can do next.
```

Then try: **“Where is Bob up to, and what can I pick up?”**

Your AI runs these procedures when you use it. Cloning duobrain does not start a background AI or install a tool-specific integration.

### 4. Open your project dashboard

```sh
node bin/duobrain.js sync --repository /path/to/product
node src/dashboard/run.js --repository /path/to/product
```

Open **http://127.0.0.1:4173**. Browse goals and assignments, recent work, blockers, the request inbox, resolved history and shared wiki. The dashboard reads your local records; sync to bring in your partner's latest updates.

## A few commands you'll actually use

Run these from the duobrain checkout, with your product path. Your AI can run the same commands under your existing authorization.

**Start with context.**

```sh
node bin/duobrain.js sync --repository /path/to/product
node bin/duobrain.js status --repository /path/to/product
node bin/duobrain.js start --repository /path/to/product \
  --title "Build the export screen" --scope src/export --actor ai
```

Keep the returned `event.entityId` as your session ID. When you finish:

```sh
node bin/duobrain.js end --repository /path/to/product \
  --session YOUR_SESSION_ID --summary "Export screen connected and checked" \
  --next "Confirm the empty-state behavior" --actor ai
```

**Ask for a missing piece.**

```sh
node bin/duobrain.js ticket-create --repository /path/to/product \
  --kind information --title "Which export harness did you use?" \
  --body "Share the captured prompt, harness version and source note." --actor ai
```

Use `--kind feedback` for a question that needs your partner's judgment. An answer stays open until the requester confirms it resolves the request. The [full walkthrough](docs/agent-guidance/repository-onboarding.md#4-work-one-complete-information-request) covers acknowledgment, source notes, responses and resolution.

**Find and compare the evidence.**

```sh
node bin/duobrain.js wiki-search --repository /path/to/product \
  --query "export harness"
node bin/duobrain.js method-compare --repository /path/to/product \
  --file /path/to/comparison.json
```

Prepare `comparison.json` using the [comparison example](docs/engine/README.md#shared-wiki-discovery-and-method-comparison). It identifies both people's notes and any captured prompt/harness text. Add `--request-missing` to create or reuse an information ticket for missing evidence within your agreed sharing scope.

**Keep the wiki useful.**

```sh
node bin/duobrain.js wiki-refine --repository /path/to/product \
  --file /path/to/daily-refinement.json --if-due
```

The first participant sets up the [daily schedule and policy](docs/engine/README.md#daily-wiki-refinement-execution). An external scheduler calls this command; duobrain checks the configured time and avoids a second successful scheduled run on the same local date. [Cron setup →](docs/engine/README.md#external-cron-setup)

Commands return JSON. Collaboration writes create their own records and attempt to push them; they do not commit your product code. **`pending` / exit code `2` means delivery needs a retry:** run `sync` from the same product clone. Use `node bin/duobrain.js --help` for all commands.

## Go a little further

| I want to… | Read this |
| --- | --- |
| Set up a real two-person workflow | [Repository onboarding](docs/agent-guidance/repository-onboarding.md) |
| Give my AI the day-to-day procedures | [AI collaboration guide · 한국어](guides/duobrain-ai.md) |
| Configure commands, comparison or scheduling | [CLI usage](docs/engine/README.md) |
| Use the dashboard | [Dashboard guide · 한국어](docs/dashboard/README.md) |
| See what has been verified | [Implementation status](docs/implementation-status.md) |

## Try it, test it, tell us where it breaks

This is a **local alpha**. The engine, wiki and dashboard currently pass **77 tests**, including two-clone collaboration flows. Testing with two people on separate machines and their existing AI tools is the next acceptance step.

```sh
node --test test/engine/*.test.js test/wiki/*.test.js test/dashboard/*.test.js
```

Have a collaboration question duobrain should help answer? [Open an issue](https://github.com/slowspurt/duobrain/issues) with the situation, what you expected and what happened. Use a small, shareable example.

License selection is pending; this repository is not yet a licensed open-source release.

---

<p align="center"><strong>Build together. Keep the context together.</strong></p>
