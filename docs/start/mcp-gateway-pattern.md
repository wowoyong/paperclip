# MCP Gateway Pattern

`wowoyong/paperclip` should prefer a single agent-facing MCP gateway over direct per-agent MCP credentials.

## Why

- reduce duplicated MCP authentication across specialist agents
- centralize secret storage and token rotation
- keep audit logs and rate-limit policy in one place
- let agents see a curated, bounded tool surface instead of every raw MCP

## Recommended shape

```text
specialist agent
-> Paperclip plugin tool surface
-> paperclip.mcp-gateway plugin
-> external MCP servers
```

## Operator rules

- core supervisors may see a wider gateway tool surface
- specialist agents should only see the gateway tools needed for their lane
- raw admin plugins should be blocked for subagents with `runtimeConfig.mcpToolFilter`
- once the gateway plugin exists, prefer `allowedPluginIds: ["paperclip.mcp-gateway"]`

## Runtime policy

- authentication happens once inside the gateway plugin/service
- gateway plugin maps agent/tool requests to upstream MCP calls
- gateway plugin can enforce:
  - allow/deny lists
  - per-agent quotas
  - request logging
  - response redaction

## Current implementation status

- agent-side MCP tool filtering is implemented in Paperclip routes/dispatcher
- subagents can already block direct plugin tool access with `mcpToolFilter`
- a dedicated `paperclip.mcp-gateway` plugin/service is still the next step

## Example policy

```json
{
  "runtimeConfig": {
    "mcpToolFilter": {
      "allowedPluginIds": ["paperclip.mcp-gateway"],
      "deniedPluginIds": ["paperclip.admin"]
    }
  }
}
```
