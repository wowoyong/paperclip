import { randomUUID } from "node:crypto";
import {
  definePlugin,
  runWorker,
  type PaperclipPlugin,
  type PluginContext,
  type ToolResult,
  type ToolRunContext,
} from "@paperclipai/plugin-sdk";

type GatewayMode = "dry_run" | "proxy_ready";

type GatewayConfig = {
  allowedTargets?: string[];
  auditRetention?: number;
  mode?: GatewayMode;
};

type GatewayAuditRecord = {
  id: string;
  agentId: string;
  runId: string;
  companyId: string;
  projectId: string;
  target: string;
  operation: string;
  mode: GatewayMode;
  outcome: "accepted" | "denied";
  createdAt: string;
  inputPreview?: string;
  note?: string;
};

const PLUGIN_NAME = "paperclip.mcp-gateway";
const AUDIT_LOG_STATE_KEY = "gateway-audit-log";
const DEFAULT_ALLOWED_TARGETS = ["docs", "research", "github", "notion", "slack"];
const DEFAULT_AUDIT_RETENTION = 50;
const DEFAULT_MODE: GatewayMode = "dry_run";

function normalizeStringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const normalized = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : [...fallback];
}

function clampRetention(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_AUDIT_RETENTION;
  return Math.max(1, Math.min(500, Math.floor(numeric)));
}

async function getConfig(ctx: PluginContext): Promise<Required<GatewayConfig>> {
  const raw = await ctx.config.get();
  const config = (raw ?? {}) as GatewayConfig;
  const mode: GatewayMode = config.mode === "proxy_ready" ? "proxy_ready" : DEFAULT_MODE;
  return {
    allowedTargets: normalizeStringList(config.allowedTargets, DEFAULT_ALLOWED_TARGETS),
    auditRetention: clampRetention(config.auditRetention),
    mode,
  };
}

async function readAuditLog(ctx: PluginContext): Promise<GatewayAuditRecord[]> {
  const raw = await ctx.state.get({ scopeKind: "instance", stateKey: AUDIT_LOG_STATE_KEY });
  return Array.isArray(raw) ? raw as GatewayAuditRecord[] : [];
}

async function writeAuditLog(
  ctx: PluginContext,
  retention: number,
  record: GatewayAuditRecord,
): Promise<GatewayAuditRecord[]> {
  const current = await readAuditLog(ctx);
  const next = [record, ...current].slice(0, retention);
  await ctx.state.set({ scopeKind: "instance", stateKey: AUDIT_LOG_STATE_KEY }, next);
  return next;
}

function previewInput(input: unknown): string | undefined {
  if (input == null) return undefined;
  const serialized = typeof input === "string" ? input : JSON.stringify(input);
  if (!serialized) return undefined;
  return serialized.length > 280 ? `${serialized.slice(0, 277)}...` : serialized;
}

function buildPolicyContent(config: Required<GatewayConfig>): string {
  return [
    `mode: ${config.mode}`,
    `allowed_targets: ${config.allowedTargets.join(", ")}`,
    `audit_retention: ${config.auditRetention}`,
    "policy: agents should call this gateway instead of storing per-tool MCP credentials.",
  ].join("\n");
}

function normalizeRouteParams(params: unknown): {
  target: string;
  operation: string;
  input?: unknown;
} {
  const record = (typeof params === "object" && params !== null ? params : {}) as Record<string, unknown>;
  const target = typeof record.target === "string" ? record.target.trim() : "";
  const operation = typeof record.operation === "string" ? record.operation.trim() : "";
  return {
    target,
    operation,
    input: record.input,
  };
}

async function handleListGatewayPolicy(
  ctx: PluginContext,
  _params: unknown,
): Promise<ToolResult> {
  const config = await getConfig(ctx);
  return {
    content: buildPolicyContent(config),
    data: {
      mode: config.mode,
      allowedTargets: config.allowedTargets,
      auditRetention: config.auditRetention,
    },
  };
}

async function handleRecentAuditLog(
  ctx: PluginContext,
  params: unknown,
): Promise<ToolResult> {
  const record = (typeof params === "object" && params !== null ? params : {}) as Record<string, unknown>;
  const requested = typeof record.limit === "number" ? record.limit : Number(record.limit ?? 10);
  const limit = Number.isFinite(requested) ? Math.max(1, Math.min(100, Math.floor(requested))) : 10;
  const entries = (await readAuditLog(ctx)).slice(0, limit);
  return {
    content: entries.length > 0
      ? entries.map((entry) => `${entry.createdAt} ${entry.outcome} ${entry.target}.${entry.operation}`).join("\n")
      : "No gateway audit records yet.",
    data: {
      entries,
      count: entries.length,
    },
  };
}

async function handleRouteRequest(
  ctx: PluginContext,
  params: unknown,
  runCtx: ToolRunContext,
): Promise<ToolResult> {
  const config = await getConfig(ctx);
  const { target, operation, input } = normalizeRouteParams(params);
  if (!target || !operation) {
    return {
      error: "target and operation are required",
    };
  }

  const allowed = config.allowedTargets.includes(target);
  const record: GatewayAuditRecord = {
    id: randomUUID(),
    agentId: runCtx.agentId,
    runId: runCtx.runId,
    companyId: runCtx.companyId,
    projectId: runCtx.projectId,
    target,
    operation,
    mode: config.mode,
    outcome: allowed ? "accepted" : "denied",
    createdAt: new Date().toISOString(),
    inputPreview: previewInput(input),
    note: allowed
      ? (
        config.mode === "proxy_ready"
          ? "Gateway accepted request, but upstream MCP proxy is not wired in this example plugin."
          : "Gateway dry-run accepted request and recorded it without calling an upstream MCP server."
      )
      : `Target "${target}" is not allowed by gateway policy.`,
  };

  await writeAuditLog(ctx, config.auditRetention, record);
  await ctx.metrics.write("gateway.route_request", 1, {
    target,
    operation,
    outcome: record.outcome,
    mode: config.mode,
  });

  if (!allowed) {
    ctx.logger.warn("Denied MCP gateway request", {
      agentId: runCtx.agentId,
      target,
      operation,
    });
    return {
      error: `Target "${target}" is not allowed by gateway policy`,
      data: {
        allowedTargets: config.allowedTargets,
        auditRecordId: record.id,
      },
    };
  }

  ctx.logger.info("Accepted MCP gateway request", {
    agentId: runCtx.agentId,
    target,
    operation,
    mode: config.mode,
  });

  return {
    content: config.mode === "proxy_ready"
      ? `Gateway accepted ${target}.${operation}, but no upstream proxy bridge is configured in this example plugin yet.`
      : `Gateway dry-run accepted ${target}.${operation} and recorded the request.`,
    data: {
      auditRecordId: record.id,
      target,
      operation,
      mode: config.mode,
      forwarded: false,
      inputPreview: record.inputPreview,
    },
  };
}

const plugin: PaperclipPlugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info(`${PLUGIN_NAME} setup complete`);

    ctx.tools.register(
      "list-gateway-policy",
      {
        displayName: "List Gateway Policy",
        description: "Returns the current MCP gateway policy, allowed targets, and runtime mode.",
        parametersSchema: {
          type: "object",
          properties: {},
        },
      },
      async (params) => await handleListGatewayPolicy(ctx, params),
    );

    ctx.tools.register(
      "route-request",
      {
        displayName: "Route Gateway Request",
        description:
          "Checks gateway policy, writes an audit record, and returns a normalized skeleton response for a logical MCP request.",
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
      async (params, runCtx) => await handleRouteRequest(ctx, params, runCtx),
    );

    ctx.tools.register(
      "recent-audit-log",
      {
        displayName: "Recent Gateway Audit Log",
        description: "Returns the most recent gateway-routed requests stored in plugin state.",
        parametersSchema: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100 },
          },
        },
      },
      async (params) => await handleRecentAuditLog(ctx, params),
    );
  },

  async onHealth() {
    return {
      status: "ok",
      message: `${PLUGIN_NAME} ready`,
    };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
