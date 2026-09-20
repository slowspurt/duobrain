# G2 connection-flow check and S3 conversation gap

Status: executable S4/G2 scenario check against main `64476ee`.

Run:

```sh
node examples/scenarios/verify-concurrent-flow.mjs
```

The script creates one temporary bare Git remote and two independent local clones, then removes them. It does not read or write the repository's configured public remote. It executes this connection flow:

1. B records and delivers a session start.
2. A explicitly synchronizes shared state and assesses an overlapping path.
3. The engine reports path overlap while leaving semantic overlap `unknown`; peer live presence and unpushed product changes also remain unknown.
4. A keeps a staged-plus-unstaged source checkout byte-for-byte and index-for-index unchanged while preparing a clean, separate product worktree. No product integration occurs automatically.
5. In that worktree, A records `start → pause → resume → end`, including summary, blocker, and next action.
6. A's successful pushes prove remote delivery only. B's existing local snapshot still lacks A's session until B explicitly synchronizes; only then does B observe the handoff.

This is a single-environment, temporary two-clone check. It is not a two-machine acceptance test and does not exercise automatic AI execution, background waiting, or automatic conversation resumption.

## W3 compared with F04 and F05

| S3 statement | W3 reference-only result | W3 captured-text result | Remaining gap |
| --- | --- | --- | --- |
| F04 says different captured refs prove only that the refs differ. | `different-reference`; artifact versions may be known, but text comparison is unavailable and missing text is reported. | W3 can show bounded changed excerpts when both texts were explicitly captured. | Neither mode supports a causal conclusion about which prompt or harness produced a better result. |
| F05 says missing dimensions should become a narrow information request and later work resumes only after explicit sync. | W3 returns an uncreated `ticketCandidate` naming the missing text fields. | With the requested text supplied, comparison can complete without a candidate. | W3 does not create, deliver, acknowledge, answer, resolve, wait for, or automatically resume from a ticket; those remain explicit engine and conversation operations. |

F04's S3 wording remains correct for opaque/reference-only evidence, but its “W3 planned” label is now historical: the integrated W3 implementation can compare text that callers explicitly provide. F05's user-flow explanation also remains correct because producing a candidate is not the same as creating or delivering a ticket, and a delivered record is not peer confirmation.
