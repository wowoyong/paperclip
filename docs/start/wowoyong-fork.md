---
title: wowoyong Fork
summary: Opinionated starter path for the wowoyong Paperclip fork
---

# wowoyong Fork

The `wowoyong/paperclip` fork treats Paperclip less like a generic orchestration substrate and more like an operator OS for running specialist agents.

## Core stance

- `codex_local` is the default local worker path
- specialist routing is preferred over one big generalist
- Telegram/OpenClaw intake is a first-class entrypoint
- durable knowledge should land in `mac-wiki`, not only in issue comments

## Recommended first team

Start with this org shape:

1. `CEO`
2. `ChiefOfStaff`
3. `ProductPlanner`
4. `ResearchArchivist`
5. `ResearchScout`
6. `UXUIDesigner`
7. `FrontendEngineer`
8. `BackendEngineer`
9. `CodexCoder`

## Recommended first workflow

1. Receive a user request from Telegram/OpenClaw
2. Convert it into a Paperclip issue
3. Route it to the right specialist
4. Require a durable artifact: `plan`, `context`, `research-pack`, or `mac-wiki` note
5. Leave a compact handoff comment with next owner and next action

## Starter package

See `examples/wowoyong-personal-os/` for a portable starter-company package you can import and adapt.
