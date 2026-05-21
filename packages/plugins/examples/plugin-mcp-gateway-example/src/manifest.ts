import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclip.mcp-gateway",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "MCP Gateway (Example)",
  description:
    "Worker-only example plugin that centralizes agent-facing MCP access behind a curated Paperclip tool surface.",
  author: "Paperclip",
  categories: ["connector", "automation"],
  capabilities: [
    "plugin.state.read",
    "plugin.state.write",
    "agent.tools.register",
    "metrics.write",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      allowedTargets: {
        type: "array",
        title: "Allowed Targets",
        description: "Logical upstream targets that the gateway may expose to agents.",
        items: { type: "string" },
        default: ["docs", "research", "github", "notion", "slack"],
      },
      auditRetention: {
        type: "integer",
        title: "Audit Retention",
        description: "Maximum number of gateway request records kept in plugin state.",
        default: 50,
        minimum: 1,
        maximum: 500,
      },
      mode: {
        type: "string",
        title: "Gateway Mode",
        enum: ["dry_run", "proxy_ready"],
        default: "dry_run",
      },
    },
  },
  tools: [
    {
      name: "list-gateway-policy",
      displayName: "List Gateway Policy",
      description: "Returns the current MCP gateway policy, allowed targets, and runtime mode.",
      parametersSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "route-request",
      displayName: "Route Gateway Request",
      description:
        "Accepts a logical MCP request, checks policy, records the request in gateway audit state, and returns a normalized skeleton response.",
      parametersSchema: {
        type: "object",
        properties: {
          target: { type: "string" },
          operation: { type: "string" },
          input: {},
        },
        required: ["target", "operation"],
      },
    },
    {
      name: "recent-audit-log",
      displayName: "Recent Gateway Audit Log",
      description: "Returns the most recent gateway-routed requests stored in plugin state.",
      parametersSchema: {
        type: "object",
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 100 },
        },
      },
    },
  ],
};

export default manifest;
