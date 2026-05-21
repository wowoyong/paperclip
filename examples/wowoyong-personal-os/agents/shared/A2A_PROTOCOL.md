# A2A Protocol

wowoyong Personal OS uses Paperclip issues, documents, and comments as the agent-to-agent transport.

## Transport

- issue
  - shared execution container
- issue documents
  - canonical artifact channel
- issue comments
  - signaling and handoff channel
- linked follow-up issues
  - optional split for independently tracked subtasks

## Canonical artifacts

- `plan`
- `context`
- `research-pack`
- `design-spec`
- `frontend-spec`
- `backend-spec`

Update the artifact first, then signal the handoff.

## Envelope

Use this compact handoff envelope:

```md
## A2A Handoff

- type: request
- from: ChiefOfStaff
- to: ProductPlanner
- issue: TES-123
- artifact: plan
- ask: define scope, milestones, and acceptance criteria
- due: next heartbeat
- blocker: none
```

## Sequence

1. Read the issue and current canonical artifacts.
2. Update the right artifact.
3. Leave an A2A handoff comment.
4. Name exactly one next owner.
5. Escalate to review instead of idling.
6. If the work changes shape, send a `replan` handoff and update `plan`/`todo`.

## Search fallback

For research-oriented agents:

1. concrete search
2. query rewrite
3. direct source fetch fallback
4. human review handoff if still unresolved

## Replan example

```md
## A2A Handoff

- type: replan
- from: ProductPlanner
- to: ChiefOfStaff
- issue: TES-123
- artifact: plan,todo
- change: the first milestone needs to be narrowed before implementation starts
- ask: update the TODO list and hand the first slice to one specialist
```
