# Release procedure

Releases are distributed through GitHub and npm. The Git tag, the GitHub release and the npm version are always the same `x.y.z`; `update` in a vendored copy still installs from the Git tags.

1. Update the version in `package.json`, `CHANGELOG.md`, and `docs/releases/v<version>.md`.
2. Run `npm run release:check`, `npm test`, and `npm run test:scenarios`.
3. Review the intended files, commit them, and verify CI on the release commit. Do not include unrelated local work.
4. After the release change reaches `main`, create an annotated `v<version>` tag at that exact commit and push the tag.
5. The Draft release workflow rechecks the tag/version, runs tests, and creates a **draft** with ZIP, tar.gz, and SHA256SUMS.
6. Inspect the assets and release notes before publishing the draft.
7. From a clean checkout of the tag, run `npm pack --dry-run` to confirm the package holds only `bin`, `src`, `guides`, `skills`, `package.json`, `LICENSE` and `README.md`, then `npm publish`.

The workflow can be rerun through `workflow_dispatch` with an existing tag. It updates a draft but refuses
to overwrite a published release. Release source archives contain tracked files only.
`git archive` exclusions in `.gitattributes` keep CI files and internal research/submission
material out of downloadable distribution bundles; runnable verification examples remain included.
