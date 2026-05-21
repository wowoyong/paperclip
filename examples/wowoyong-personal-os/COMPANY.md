---
kind: "company"
name: "wowoyong Personal OS"
description: "Operator-style specialist agent company for planning, research, execution, and durable knowledge capture."
brandColor: "#0f766e"
requireBoardApprovalForNewAgents: true
---

# wowoyong Personal OS

## Default specialist team

- ceo
- chiefofstaff
- productplanner
- researcharchivist
- researchscout
- uxuidesigner
- frontendengineer
- backendengineer
- codexcoder
- foundingengineer

## Intended workflow

1. Intake from Telegram/OpenClaw
2. Classify complexity
3. If simple, route directly to the right specialist
4. If moderate, route through `ChiefOfStaff`
5. If complex, route through `ChiefOfStaff` or `FoundingEngineer`
6. If strategic, route through `CEO`
7. Let the core supervisor drive planning, TODO shaping, and handoffs
6. Produce a durable artifact
8. Capture reusable knowledge in `mac-wiki`

## Supervisor pattern

- `CEO`
  - strategic supervisor
- `ChiefOfStaff`
  - operational supervisor and default queue owner
- `FoundingEngineer`
  - technical supervisor for cross-layer engineering escalation

All specialists should use the shared A2A protocol and work through supervisor-owned handoffs instead of acting as free-form coordinators.

## MCP gateway direction

- subagents should not each own raw MCP credentials when a shared gateway can do it once
- prefer one curated gateway plugin surface for agent-facing tool use
- keep specialist `mcpToolFilter` narrow so they only see tools appropriate for their lane

## Routing rule

- simple request
  - direct specialist -> result
- moderate request
  - `ChiefOfStaff` -> short planning / TODO shaping -> specialist -> result
- complex request
  - `ChiefOfStaff` or `FoundingEngineer` -> reasoning loop -> result
- strategic request
  - `CEO` -> reasoning loop -> result
