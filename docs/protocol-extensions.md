# Approved next alpha contracts

Status: E4 implementation integrated and tested on 2026-09-20. The existing protocol v1 remains the baseline. These additions retain immutable files, participant attribution, causal histories, and conflict visibility. Consumers must tolerate additional snapshot fields; older clients cannot claim to process these new events. See the engine README for `plan-set`, `scope-update` and `ticket-clarify`.

## Shared plan and goals

`plan.created` is a new root event with a generated UUID entity ID. `plan.updated` appends to that entity. Both carry a complete replacement projection in `data`:

```json
{
  "goals": {"project": null, "mediumTerm": null, "currentPhase": null},
  "assignments": [
    {"participant": "alice", "scope": [], "next": null},
    {"participant": "bob", "scope": [], "next": null}
  ],
  "status": "proposed",
  "evidence": [],
  "body": "Reason and source of this plan revision"
}
```

Goal and next values are nonempty strings or null. There are exactly two assignment entries, one per configured participant; scope is an array of nonempty strings. Either participant may explicitly propose/update a plan. Status is `proposed` or `agreed`; default is proposed. Agreed requires existing structured wiki decision evidence attributed to both participants as humans (direct statements or faithfully relayed human-confirmed statements). This is cooperative evidence, not authentication. Merely editing a plan never creates joint consent; evidence must cover the revised plan and scope.

The store has one current plan entity. A second independent root or same-previous updates form a visible conflict; do not select by timestamp. Refuse plan mutation while conflicted. Preserve all records, show candidate IDs, and leave top-level goals unknown when no unambiguous plan exists. Without a plan, goals remain null.

Snapshot adds `plan: null | {id, goals, assignments, status, evidence, body, history}`. Existing `goals` reflects the unambiguous plan; consumers must also show its proposed/agreed status. Historical revisions remain available in full history. CLI input should accept a user-prepared JSON file rather than a long set of ambiguous flags. Invalid remote events must not become accepted projected facts.

## Session scope change

`session.scope_updated` is owner-only on active or paused sessions. Data contains `scope`, `reason`, and optional `goal`, `branch`, `baseCommit`; omitted optional fields retain their prior values, explicit null clears them. Scope and reason are required. It changes the recorded scope, not product code or a Git branch. Preserve prior values in event history and re-evaluate overlap against the new projected scope. It never resumes a paused session or changes the start time.

## Requester clarification

`ticket.clarified` carries `{body}` and is requester-only on a nonterminal ticket. It appends context while retaining the current status. In particular, clarification does not answer a request, acknowledge it for the peer, or resolve it. The assignee subsequently responds through the existing rules. Include the clarification in history; no new ticket relation or completion state is implied.

## Delivery and verification

Changes use the existing isolated-store commit/sync behavior and local lock. Validate roles, inputs, predecessor chains and evidence both on writes and when deriving state. Test a two-clone plan exchange, concurrent plan conflict, scope-change preservation/overlap, requester clarification and forbidden transitions. Shared-store setup and an explicit mutation remain separate from background AI execution.
