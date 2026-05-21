# wowoyong Personal OS Starter

This folder is an opinionated starter-company package for the `wowoyong/paperclip` fork.

It is designed for:

- a solo operator or small agency
- `codex_local` as the default worker runtime
- specialist-team routing instead of one generalist
- `mac-wiki` as a durable knowledge companion

## Included specialists

- `CEO`
- `ChiefOfStaff`
- `ProductPlanner`
- `ResearchArchivist`
- `ResearchScout`
- `UXUIDesigner`
- `FrontendEngineer`
- `BackendEngineer`
- `CodexCoder`
- `FoundingEngineer`

## Not included by default

- `OpenClawAssistant`

`OpenClawAssistant` requires local gateway URL, token, pairing scopes, and device auth material. Those values are environment-specific, so they should be added after import.

## Suggested import flow

1. Import this package into a new company.
2. Configure your CEO as `codex_local`.
3. Verify the first heartbeat for `CEO` and `FoundingEngineer`.
4. Add `OpenClawAssistant` only after your local OpenClaw gateway details are confirmed.
5. Connect the company to `mac-wiki` conventions and starter playbooks.
