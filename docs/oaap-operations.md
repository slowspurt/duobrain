# OAAP operations

OAAP 0.1 setup is prepared for `https://github.com/slowspurt/duobrain`.
Local state is **awaiting_receiver**. A private, dedicated Google Sheet and an Apps Script project
have been created, but the public receiver has not been deployed or verified.

## Configuration

The public, credential-free input is [.oaap/config.json](../.oaap/config.json).
Use the upstream OAAP checkout at revision `a4df662a7ea1876e307934e871cc5569828294e7`:

```sh
node scripts/onboard.mjs --project /path/to/duobrain --config /path/to/duobrain/.oaap/config.json
node scripts/onboard.mjs --project /path/to/duobrain --config /path/to/duobrain/.oaap/config.json --apply
node scripts/onboard.mjs --project /path/to/duobrain --check
```

Replace `receiver: null` only with the verified, maintainer-owned deployment URL. The generated
manifest and notices are installed only when a receiver is configured. Preserve generated provenance
and use the onboarder to update its managed sections. Product instructions belong outside those sections.

The private Sheet uses Summary, Records, and Settings; UTC; exactly 2,001 Records rows;
and report formulas bounded at row 2,001. Expanding the imported grid expanded formula ranges too;
these were restored and read back. Initial metrics are zero and the reporting source remains `demo`.

## Exposure and deployment decision

The upstream receiver accepts unauthenticated events. It validates fields and payload size and limits
stored events to 2,000, but does not authenticate agents, rate-limit callers, or prevent valid-shaped spam.
Event update keys protect existing result updates, not creation of new access events.

A public endpoint can therefore receive fabricated events, fill available storage, and consume Apps Script
execution or service quotas. The reference code exposes no records-reading endpoint, and the Sheet stays
private, but this does not make the write endpoint resistant to abuse.

For broader public operation, review rate limits, an intake budget, origin authentication, retention,
and a way to stop intake. A proxy with a still-open unauthenticated origin can be bypassed. Even an
origin shared secret checked inside Apps Script does not stop requests from consuming script executions;
stronger isolation requires an authenticated origin or moving ingestion to a suitably protected service.

The maintainer is selecting the deployment boundary before public activation. OAAP preparation does not
change duobrain's runtime or upload shared plans, partner notes, tickets, or wiki contents.

## Verification status

| Check | Evidence |
| --- | --- |
| Upstream local suite | 53 tests passed on the pinned OAAP revision |
| Local duobrain setup | Applied without receiver; only setup material is active |
| Google Sheet | Private owner-only copy; headers, UTC, capacity, empty counts and bounded formulas checked |
| Apps Script | Code, manifest and target properties prepared; not deployed |
| Native text storage / public HTTP | Not yet verified in this installation |
| Real AI access, download and use | Not yet observed |

Follow the [upstream verification guide](https://github.com/slowspurt/OAAP/blob/a4df662a7ea1876e307934e871cc5569828294e7/receiver/VERIFY.md).
Keep update keys and raw verification state outside version control. Synthetic tests use `source: demo`;
they must not be relabeled as real adoption. CLI `--check` tests local consistency only.

## Feedback

Usage feedback goes through the public repository's Usage feedback issue form. It is separate from
OAAP access/result events and from product-internal feedback tickets between collaboration partners.
Ask about expected behavior, observed behavior, and a minimal shareable reproduction after observed use.
Only publish a user's response when they instruct publication. Review submitted cases before using them
to improve guides, regression scenarios, or any future retrieval system.

References: [OAAP setup](https://github.com/slowspurt/OAAP/blob/a4df662a7ea1876e307934e871cc5569828294e7/docs/SETUP.md),
[Google quotas](https://developers.google.com/apps-script/guides/services/quotas).
