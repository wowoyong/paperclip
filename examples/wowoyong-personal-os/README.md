# wowoyong Personal OS Starter

This folder is an opinionated starter-company package for the `wowoyong/paperclip` fork.

It is meant to help you launch a personal operator company quickly, not just import a bag of agent files.

The target outcome is:

- one CEO that can keep direction and quality high
- a specialist bench that can plan, research, design, and implement
- a default path from intake to durable artifact
- a company shape that compounds into `mac-wiki` instead of disappearing into chat

It is designed for:

- a solo operator or small agency
- `codex_local` as the default worker runtime
- specialist-team routing instead of one generalist
- `mac-wiki` as a durable knowledge companion
- an MCP gateway pattern instead of per-agent raw MCP credentials

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

## What success looks like

After import, you should be able to:

- open the company in Paperclip and see the specialist org chart
- assign a kickoff issue to `ChiefOfStaff` or `ProductPlanner`
- route research to `ResearchArchivist` or `ResearchScout`
- route implementation to `FrontendEngineer`, `BackendEngineer`, or `CodexCoder`
- capture the durable output in `mac-wiki`

## MCP gateway direction

The recommended long-term model is:

- agents do not each hold separate MCP credentials
- Paperclip exposes a curated plugin tool surface
- one gateway plugin/service owns upstream MCP auth and routing
- subagents use `mcpToolFilter` so their visible tool surface stays narrow

Reference: [MCP Gateway Pattern](../../docs/start/mcp-gateway-pattern.md)
