# @paperclipai/plugin-mcp-gateway-example

Worker-only example plugin that demonstrates the recommended Paperclip MCP gateway pattern:

```text
agent -> Paperclip tool surface -> paperclip.mcp-gateway -> external MCP servers
```

This example does **not** proxy to a real upstream MCP server yet. It focuses on the control-plane pieces you want first:

- central allow-list for logical upstream targets
- agent-facing tool surface
- gateway audit log in plugin state
- normalized responses for future proxy wiring

## Why this pattern

Instead of giving every specialist agent separate MCP credentials, you can:

1. authenticate MCP providers once in the gateway layer
2. expose only curated gateway tools to agents
3. enforce policy, audit, and rate limits centrally

That reduces credential sprawl and makes tool governance much easier.

## Tools

- `paperclip.mcp-gateway.list-gateway-policy`
- `paperclip.mcp-gateway.route-request`
- `paperclip.mcp-gateway.recent-audit-log`

## Config

- `allowedTargets`: logical upstream names agents are allowed to request
- `auditRetention`: max audit entries stored in instance state
- `mode`:
  - `dry_run`: accept and record requests without proxying
  - `proxy_ready`: same response contract, but intended for the future bridge implementation

## Local build

```bash
pnpm --filter @paperclipai/plugin-mcp-gateway-example typecheck
pnpm --filter @paperclipai/plugin-mcp-gateway-example build
```

## Local install

```bash
pnpm paperclipai plugin install ./packages/plugins/examples/plugin-mcp-gateway-example
```

After install, agents can be configured to use the gateway tools instead of talking to external MCP/plugin tools directly.
