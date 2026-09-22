# OAAP local setup

State: **awaiting_receiver**.

This is local configuration, not receiver deployment, verified reception or completed adoption.
No active oaap.json or agent notices have been installed. Supply a receiver when ready.

## Maintainer-owned receiver

From your local OAAP clone (the directory containing scripts/onboard.mjs):

1. Copy templates/sheets/OAAP-maintainer-template.xlsx to your own Google Drive and convert it to a private Google Sheet. Start with empty Records.
2. Copy receiver/Code.gs and receiver/appsscript.json into your own Apps Script project. Follow docs/SETUP.md in the OAAP clone.
3. Set SPREADSHEET_ID privately and REPOSITORY to https://github.com/slowspurt/duobrain. Keep the Sheet and script timezones UTC.
4. Review the actual Google grant and deployment settings with the maintainer; the CLI does not create or authorize Google resources.
5. After deploying, rerun the local onboarding CLI with your receiver URL. Keep credentials and private IDs out of project files.
6. Follow receiver/VERIFY.md in the OAAP clone. Check actual records independently; configuration and HTTP 200 alone do not verify reception.

The CLI performs no network or Git operations and cannot prove that a URL is reachable, owned by the maintainer or safe for sharing data.

## Feedback configuration

Review destination, questions and intended_use in .oaap/onboarding.json.
Once a receiver is configured and actual use is observed, relay a feedback request once using these saved questions. Ask for minimal expected/actual behavior and a shareable reproduction. Share only actual human responses approved for the destination; public posting requires the user’s instruction. Never upload partner records, full chats or credentials. Review sharing permission before scenario or RAG use. Configuration does not collect feedback or add a receiver operation.

Do not put secrets in onboarding configuration; these files may be committed.
Keep setup state and generated files together. Reconfigure through the CLI; manual changes inside its managed sections are conflicts, while unrelated instructions remain yours.
