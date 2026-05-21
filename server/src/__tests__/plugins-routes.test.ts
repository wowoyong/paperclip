import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../middleware/index.js";
import { pluginRoutes } from "../routes/plugins.js";

const mockAgentService = vi.hoisted(() => ({
  getById: vi.fn(),
}));

const mockToolDispatcher = vi.hoisted(() => ({
  listToolsForAgent: vi.fn(),
  getTool: vi.fn(),
  executeTool: vi.fn(),
}));

vi.mock("../services/agents.js", () => ({
  agentService: () => mockAgentService,
}));

vi.mock("../services/plugin-registry.js", () => ({
  pluginRegistryService: () => ({
    getById: vi.fn(),
    getByKey: vi.fn(),
  }),
}));

vi.mock("../services/plugin-lifecycle.js", () => ({
  pluginLifecycleManager: () => ({}),
}));

vi.mock("../services/plugin-loader.js", () => ({
  pluginLoader: vi.fn(),
  getPluginUiContributionMetadata: vi.fn(),
}));

vi.mock("../services/activity-log.js", () => ({
  logActivity: vi.fn(),
}));

vi.mock("../services/live-events.js", () => ({
  publishGlobalLiveEvent: vi.fn(),
}));

vi.mock("../services/plugin-config-validator.js", () => ({
  validateInstanceConfig: vi.fn(),
}));

const COMPANY_ID = "cf91355d-699c-419d-91c9-27c0e783b8e0";
const AGENT_ID = "dd212ba2-8fd1-426d-9eb1-2fd72a80b761";

const BOARD_ACTOR = {
  type: "board",
  userId: "local-board",
  companyIds: [COMPANY_ID],
  source: "local_implicit",
  isInstanceAdmin: true,
};

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = BOARD_ACTOR;
    next();
  });
  app.use(
    "/api",
    pluginRoutes(
      {} as any,
      {} as any,
      undefined,
      undefined,
      { toolDispatcher: mockToolDispatcher as any },
      undefined,
    ),
  );
  app.use(errorHandler);
  return app;
}

describe("plugin tool route filters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies agent MCP tool filters to discovery", async () => {
    mockAgentService.getById.mockResolvedValue({
      id: AGENT_ID,
      companyId: COMPANY_ID,
      runtimeConfig: {
        mcpToolFilter: {
          allowedPluginIds: ["paperclip.mcp-gateway"],
          deniedToolNames: ["paperclip.mcp-gateway:admin-list-secrets"],
        },
      },
    });
    mockToolDispatcher.listToolsForAgent.mockReturnValue([]);

    const res = await request(createApp()).get(`/api/plugins/tools?agentId=${AGENT_ID}`);

    expect(res.status).toBe(200);
    expect(mockToolDispatcher.listToolsForAgent).toHaveBeenCalledWith({
      allowedPluginIds: ["paperclip.mcp-gateway"],
      deniedToolNames: ["paperclip.mcp-gateway:admin-list-secrets"],
    });
  });

  it("blocks execution when the agent MCP tool filter denies the tool", async () => {
    mockAgentService.getById.mockResolvedValue({
      id: AGENT_ID,
      companyId: COMPANY_ID,
      runtimeConfig: {
        mcpToolFilter: {
          deniedPluginIds: ["paperclip.admin"],
        },
      },
    });
    mockToolDispatcher.getTool.mockReturnValue({
      pluginId: "paperclip.admin",
      name: "dangerous-op",
      namespacedName: "paperclip.admin:dangerous-op",
    });

    const res = await request(createApp())
      .post("/api/plugins/tools/execute")
      .send({
        tool: "paperclip.admin:dangerous-op",
        parameters: {},
        runContext: {
          agentId: AGENT_ID,
          runId: "run-1",
          companyId: COMPANY_ID,
          projectId: "proj-1",
        },
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("blocked by the agent MCP tool filter");
    expect(mockToolDispatcher.executeTool).not.toHaveBeenCalled();
  });

  it("allows execution when the tool passes the agent MCP tool filter", async () => {
    mockAgentService.getById.mockResolvedValue({
      id: AGENT_ID,
      companyId: COMPANY_ID,
      runtimeConfig: {
        mcpToolFilter: {
          allowedPluginIds: ["paperclip.mcp-gateway"],
          deniedToolNames: [],
          allowedToolNames: [],
          deniedPluginIds: [],
        },
      },
    });
    mockToolDispatcher.getTool.mockReturnValue({
      pluginId: "paperclip.mcp-gateway",
      name: "search-docs",
      namespacedName: "paperclip.mcp-gateway:search-docs",
    });
    mockToolDispatcher.executeTool.mockResolvedValue({
      pluginId: "paperclip.mcp-gateway",
      toolName: "search-docs",
      result: { content: [{ type: "text", text: "ok" }] },
    });

    const res = await request(createApp())
      .post("/api/plugins/tools/execute")
      .send({
        tool: "paperclip.mcp-gateway:search-docs",
        parameters: { q: "pricing" },
        runContext: {
          agentId: AGENT_ID,
          runId: "run-2",
          companyId: COMPANY_ID,
          projectId: "proj-1",
        },
      });

    expect(res.status).toBe(200);
    expect(mockToolDispatcher.executeTool).toHaveBeenCalledWith(
      "paperclip.mcp-gateway:search-docs",
      { q: "pricing" },
      expect.objectContaining({ agentId: AGENT_ID, companyId: COMPANY_ID }),
    );
  });
});
