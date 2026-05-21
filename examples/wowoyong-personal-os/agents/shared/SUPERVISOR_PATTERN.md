# Supervisor Pattern

wowoyong Personal OS uses a layered supervisor pattern.

## Layers

- `CEO`
  - strategic supervisor
- `ChiefOfStaff`
  - operational supervisor
- `FoundingEngineer`
  - technical supervisor

Specialists are workers with clear lanes, not general coordinators.

## Flow

1. intake arrives
2. `ChiefOfStaff` creates a minimal `plan` and `context`
3. `ProductPlanner` expands the plan when requirement clarity is needed
4. `ChiefOfStaff` derives owner-scoped execution TODOs
5. the worker updates the canonical artifact
6. the worker leaves an A2A handoff
7. `ChiefOfStaff` decides the next worker, review, escalation, or closeout

## Plan and TODO core

- `ChiefOfStaff`
  - intake skeleton, queue ownership, TODO reconciliation
- `ProductPlanner`
  - detailed plan, milestones, acceptance criteria, execution-ready task shape

Preferred TODO shape:

```md
- [ ] Write pricing comparison brief
  - owner: ResearchScout
  - artifact: research-pack
  - done when: comparison and recommendation are added
```

## Escalation

- operational ambiguity -> `ChiefOfStaff`
- cross-layer engineering conflict -> `FoundingEngineer`
- strategic priority or quality arbitration -> `CEO`
