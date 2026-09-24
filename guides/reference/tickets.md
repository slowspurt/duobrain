# Tickets

Reference for [the duobrain AI guide](../duobrain-ai.md). The lifecycle is defined in [protocol v1](../../docs/protocol.md#ticket-data).

## Which kind

- **`information`**: a fact is missing from the work record, such as a base commit, a passing check, a decision's reason or a method. The answer must cite at least one existing shared wiki note.
- **`feedback`**: a person's judgment is needed, such as a preference, approval or priority. Only the assignee's `ticket-respond --actor human` answers it. You may prepare options, impact, existing constraints and a recommendation, but a draft is not an answer.

Before creating a ticket, check `tickets` in `status --brief`. If a matching nonterminal ticket exists, add context with `ticket-clarify` instead of creating a duplicate. Ask the user first only when the target work is ambiguous or a new human decision is needed.

## Flow

```
requester:  ticket-create --kind information --title <t> --body <what to add and why> --actor ai
assignee:   sync → ticket-ack --ticket <id> → note-add --file <md>
            → ticket-respond --ticket <id> --body <t> --evidence wiki/<note>.md --actor ai
requester:  sync → read the evidence → ticket-resolve --ticket <id> --body <why it is complete>
```

Keep the ticket id from `event.entityId` in the `ticket-create` output. Every write commits locally and then tries to sync, so check `sync.status` in each result.

## Rules

- There is no evidence yet: `ticket-needs-information --ticket <id> --body <what is needed>`. A partial answer stays partial.
- The requester adds context: `ticket-clarify`. This keeps the status and the completion condition unchanged, and it is not an acknowledgment, answer or resolution.
- `answered` is not `resolved`. Only the requester resolves, after checking that the response meets the request.
- A wrong answer or new evidence is needed: only the requester can `ticket-reopen`. `ticket-close --reason cancelled|duplicate` is not a resolution.
- `note-add` stores a parser-validated Markdown file as an immutable `wiki/<uuid>.md`. Legacy notes need `--id <uuid>`.
- There is no ticket-relation feature. Do not claim tickets were linked.

Everyday questions and the capability behind each one are mapped in [the conversation-to-capability map](../../docs/scenarios/conversation-to-capability-map.md).
