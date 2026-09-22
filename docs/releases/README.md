# Release procedure

Releases are distributed through GitHub. `package.json` remains private to prevent npm publication.

1. Update the version in `package.json`, `CHANGELOG.md`, and `docs/releases/v<version>.md`.
2. Run `npm run release:check`, `npm test`, and `npm run test:scenarios`.
3. Review the intended files, commit them, and verify CI on the release commit. Do not include unrelated local work.
4. After the release change reaches `main`, create an annotated `v<version>` tag at that exact commit and push the tag.
5. The Draft release workflow rechecks the tag/version, runs tests, and creates a **draft** with ZIP, tar.gz, and SHA256SUMS.
6. Inspect the assets and release notes, including remaining user acceptance or OAAP verification limits, before publishing the draft.

The workflow can be rerun through `workflow_dispatch` with an existing tag. It updates a draft but refuses
to overwrite a published release. Release source archives contain tracked files only.
`git archive` exclusions in `.gitattributes` keep CI files and internal research/submission
material out of downloadable distribution bundles; runnable verification examples remain included.

OAAP reception is a separately verified deployment. A working product release must not be described as
evidence of a working receiver or of real user adoption. See [OAAP operations](../oaap-operations.md).
