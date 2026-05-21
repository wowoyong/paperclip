export const type = "codex_local";
export const label = "Codex (local)";
export const DEFAULT_CODEX_LOCAL_MODEL = "gpt-5.3-codex";
export const DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX = true;

export const models = [
  { id: "gpt-5.4", label: "gpt-5.4" },
  { id: DEFAULT_CODEX_LOCAL_MODEL, label: DEFAULT_CODEX_LOCAL_MODEL },
  { id: "gpt-5.3-codex-spark", label: "gpt-5.3-codex-spark" },
  { id: "gpt-5", label: "gpt-5" },
  { id: "o3", label: "o3" },
  { id: "o4-mini", label: "o4-mini" },
  { id: "gpt-5-mini", label: "gpt-5-mini" },
  { id: "gpt-5-nano", label: "gpt-5-nano" },
  { id: "o3-mini", label: "o3-mini" },
  { id: "codex-mini-latest", label: "Codex Mini" },
];

export const agentConfigurationDoc = `# codex_local agent configuration

Adapter: codex_local

Core fields:
- cwd (string, optional): default absolute working directory fallback for the agent process (created if missing when possible)
- instructionsFilePath (string, optional): absolute path to a markdown instructions file used as the static/base prompt section
- staticPromptTemplate (string, optional): inline static/base prompt section that should be cached in the session when possible
- cacheStaticPromptInSession (boolean, optional): defaults to true; when enabled, static prompt sections are only sent on fresh sessions
- model (string, optional): Codex model id
- modelReasoningEffort (string, optional): reasoning effort override (minimal|low|medium|high) passed via -c model_reasoning_effort=...
- promptTemplate (string, optional): per-run heartbeat prompt template
- supervisorPromptTemplate (string, optional): per-run supervisor overlay appended ahead of the heartbeat prompt
- search (boolean, optional): run codex with --search
- dangerouslyBypassApprovalsAndSandbox (boolean, optional): run with bypass flag
- command (string, optional): defaults to "codex"
- extraArgs (string[], optional): additional CLI args
- env (object, optional): KEY=VALUE environment variables
- workspaceStrategy (object, optional): execution workspace strategy; currently supports { type: "git_worktree", baseRef?, branchTemplate?, worktreeParentDir? }
- workspaceRuntime (object, optional): workspace runtime service intents; local host-managed services are realized before Codex starts and exposed back via context/env

Operational fields:
- timeoutSec (number, optional): run timeout in seconds
- graceSec (number, optional): SIGTERM grace period in seconds
- idleTimeoutSec (number, optional): kill the run when no stdout/stderr arrives for this long

Notes:
- Prompts are piped via stdin (Codex receives "-" prompt argument).
- Static prompt sections (shared instructions, durable skills, stable workflow rules) can be cached into the Codex session while short-lived supervisor overlays are resent every run.
- Paperclip auto-injects local skills into Codex personal skills dir ("$CODEX_HOME/skills" or "~/.codex/skills") when missing, so Codex can discover "$paperclip" and related skills.
- Some model/tool combinations reject certain effort levels (for example minimal with web search enabled).
- Search-enabled runs default to a tighter idle timeout (240s) when idleTimeoutSec is unset, so stalled searches fail fast instead of hanging indefinitely.
- When Paperclip realizes a workspace/runtime for a run, it injects PAPERCLIP_WORKSPACE_* and PAPERCLIP_RUNTIME_* env vars for agent-side tooling.
`;
