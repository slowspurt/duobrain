# Why duobrain is vendored

**Vendoring** means committing a copy of a tool or library into your own repository instead of asking every person to install it. The name comes from the *vendor* who supplies the code: you keep the supplier's copy in your tree.

duobrain recommends it because the product is built for exactly two people, and the second person should be able to join from the project alone.

## What `install` does

```
product/
├── .duobrain/            vendored duobrain: bin, src, guides, skills, package.json, LICENSE
│   ├── VENDOR.json       which release this copy is: version, source URL, tag, commit
│   └── README.md         "do not edit; update with node .duobrain/bin/duobrain.js update"
├── .gitattributes        /.duobrain/** linguist-vendored linguist-generated
├── AGENTS.md             managed duobrain block: run node .duobrain/bin/duobrain.js
└── CLAUDE.md             @AGENTS.md
```

The copy holds only runtime files (about 400KB). Tests, docs and examples stay upstream. It has **no `.git` of its own**, so to Git it is ordinary product files, not a nested repository or a submodule.

## Common ways to use someone else's code

| Approach | How the code arrives | Who installs | Pinned version | Works offline |
| --- | --- | --- | --- | --- |
| Global install (`npm i -g`, `npm link`) | Each person installs it | Everyone | Per machine; can drift | Yes, after install |
| Package manager dependency (`package.json`, `go.mod`) | A lock file names it; each person downloads it | Everyone, automatically | Yes, in the lock file | After the first download |
| On-demand run (`npx github:…`) | Downloaded when run | Nobody | If the command names a tag | No |
| Git submodule | A pointer to another repository's commit | Everyone runs `git submodule update` | Yes | After the first update |
| **Vendoring** | Committed into the repository | **Nobody** | **Yes, in the tree** | **Yes** |

duobrain works in any repository, not only JavaScript projects, so it cannot rely on a package manager being there. Submodules add a step that people often forget. A global install puts the burden on both people and lets their versions drift.

## Trade-offs

What you gain:

- **One person installs, both use it.** A clone or pull brings the tool along.
- **The same version for both people.** The version is part of the commit. When one person updates and commits, the other gets the update by pulling.
- **No network or registry needed** to run it, and nothing outside the project.
- **Stable paths.** `AGENTS.md` can point at `.duobrain/guides/…`, the same on every machine.

What it costs, and how duobrain handles it:

| Cost | Mitigation |
| --- | --- |
| Adds about 400KB to the repository and each update adds a diff | Only runtime files are copied. `.gitattributes` marks the folder `linguist-vendored` and `linguist-generated`, so GitHub leaves it out of language stats and collapses it in pull request diffs. |
| AI tools or reviewers may treat it as product code | The `AGENTS.md` block says `.duobrain/` is a vendored tool that must never be edited. `.duobrain/README.md` repeats it. |
| Local edits could be lost on update | `update` refuses to replace `.duobrain/` when committed files there were edited (`VENDOR_DIRTY`). |
| Security fixes don't arrive on their own | `update --check` shows the newest release; `update` installs it in one commit. |

## Updating

```sh
node .duobrain/bin/duobrain.js update --check   # compare VENDOR.json with the newest release tag
node .duobrain/bin/duobrain.js update           # replace .duobrain and refresh AGENTS.md
git add .duobrain AGENTS.md && git commit -m "chore: update duobrain"
```

`update` lists the `vX.Y.Z` tags at the source in `VENDOR.json`, shallow-clones the newest one into a temporary folder, copies its runtime files over `.duobrain/`, rewrites `VENDOR.json`, and deletes the temporary folder. The `AGENTS.md` block is then rewritten by the **new** code, so block changes ship with the release. Without `--ref`, it only moves to a newer version.

## Moving from a copied folder

v0.1.0 had no `install`, so some projects copied duobrain into a folder such as `tools/duobrain`. Such a
copy sits inside the project's own Git repository. **Before v0.1.2, running `update` from it acted on the
project's repository**: it fetched the project and could fast-forward the project's branch. From v0.1.2,
`update` refuses with `UPDATE_INSIDE_PROJECT`.

To switch to the vendored layout, which `update` can replace safely:

```sh
node tools/duobrain/bin/duobrain.js install      # creates .duobrain from that copy; add --no-agents to keep your own AGENTS.md
git rm -r tools/duobrain
git add .duobrain AGENTS.md CLAUDE.md .gitattributes
git commit -m "chore: vendor duobrain in .duobrain"
node .duobrain/bin/duobrain.js update            # then move to the newest release
```

If you write `AGENTS.md` yourself, pass `--no-agents` and point it at `node .duobrain/bin/duobrain.js`.
The managed block is optional; it only saves you from editing the instructions after each update.

## When not to vendor

Use the global install described in the README if you want one duobrain for many repositories, if the repository must not contain third-party files, or if you are developing duobrain itself.
