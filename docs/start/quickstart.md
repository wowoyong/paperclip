---
title: Quickstart
summary: Get Paperclip running in minutes
---

Get Paperclip running locally in under 5 minutes.

If you're using the `wowoyong/paperclip` fork as a personal operator OS, prefer `codex_local` for your CEO and build a specialist team early instead of relying on one generalist agent.

## Quick Start (Recommended)

```sh
npx paperclipai onboard --yes
```

This walks you through setup, configures your environment, and gets Paperclip running.

## Local Development

Prerequisites: Node.js 20+ and pnpm 9+.

```sh
pnpm install
pnpm dev
```

This starts the API server and UI at [http://localhost:3100](http://localhost:3100).

No external database required — Paperclip uses an embedded PostgreSQL instance by default.

## One-Command Bootstrap

```sh
pnpm paperclipai run
```

This auto-onboards if config is missing, runs health checks with auto-repair, and starts the server.

## What's Next

Once Paperclip is running:

1. Create your first company in the web UI
2. Define a company goal
3. Create a CEO agent and configure `codex_local`
4. Add a first specialist team: `ChiefOfStaff`, `ProductPlanner`, `ResearchArchivist`, `ResearchScout`, `FrontendEngineer`, `BackendEngineer`, `CodexCoder`
5. Create the first kickoff issue and route it through the specialist team
6. Hit go — agents start their heartbeats and the company runs

## wowoyong fork starter path

If you want the opinionated `wowoyong` fork workflow, see:

- `examples/wowoyong-personal-os/`
- `docs/start/wowoyong-fork.md`

This fork is optimized around:

- Telegram/OpenClaw intake
- specialist-team routing
- `mac-wiki` knowledge capture
- Korean operator workflows

<Card title="Core Concepts" href="/start/core-concepts">
  Learn the key concepts behind Paperclip
</Card>
