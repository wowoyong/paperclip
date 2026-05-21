import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents } from "@paperclipai/db";
import { documentService } from "./documents.js";
import { issueService } from "./issues.js";

function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toISOString().replace("T", " ").slice(0, 16);
}

function firstNonEmptyLine(input: string | null | undefined): string {
  if (!input) return "";
  const line = input
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0);
  return line ?? "";
}

function stripMarkdown(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractMarkdownSection(input: string | null | undefined, heading: string): string {
  if (!input) return "";
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^###\\s+${escaped}\\s*$\\n?([\\s\\S]*?)(?=^###\\s+|\\s*$)`, "im");
  const match = input.match(pattern);
  return match?.[1]?.trim() ?? "";
}

function formatStructuredSummary(input: string | null | undefined): string {
  if (!input) return "";
  const summarySection = extractMarkdownSection(input, "summary (what this link says)");
  const topicsSection = extractMarkdownSection(input, "topic-by-topic summary");
  const takeawaysSection = extractMarkdownSection(input, "key takeaways");
  const actionItemsSection = extractMarkdownSection(input, "action items (what we should do)");

  const blocks: string[] = [];

  if (summarySection) {
    blocks.push("### 핵심 요약");
    blocks.push(summarySection);
  }

  if (topicsSection) {
    blocks.push("### 주요 주제별 요약");
    blocks.push(topicsSection);
  }

  if (takeawaysSection) {
    blocks.push("### 주요 포인트");
    blocks.push(takeawaysSection);
  }

  if (actionItemsSection) {
    blocks.push("### 실무 적용 아이디어");
    blocks.push(actionItemsSection);
  }

  return blocks.join("\n\n").trim();
}

function extractTodoProgress(todoBody: string | null | undefined) {
  const body = todoBody ?? "";
  const doneMatches = body.match(/^\s*[-*]\s*\[x\]\s+/gim) ?? [];
  const openMatches = body.match(/^\s*[-*]\s*\[\s\]\s+/gim) ?? [];
  return {
    done: doneMatches.length,
    open: openMatches.length,
    total: doneMatches.length + openMatches.length,
  };
}

function buildStatusSummary(issue: { status: string; activeRun?: { status: string } | null }) {
  if (issue.status === "done") return "완료됨";
  if (issue.status === "blocked") return "막힘 상태";
  if (issue.status === "in_review") return "검토 대기";
  if (issue.status === "in_progress") return issue.activeRun?.status === "running" ? "실행 중" : "진행 중";
  if (issue.status === "todo") return "대기 중";
  if (issue.status === "backlog") return "백로그";
  if (issue.status === "cancelled") return "취소됨";
  return issue.status;
}

export function issueReportService(db: Db) {
  const issuesSvc = issueService(db);
  const documentsSvc = documentService(db);

  return {
    upsertIssueReport: async (
      issueId: string,
      opts?: {
        changeSummary?: string | null;
        createdByAgentId?: string | null;
        createdByUserId?: string | null;
      },
    ) => {
      const issue = await issuesSvc.getById(issueId);
      if (!issue) return null;

      const [docs, commentsDesc, assigneeAgent, existingReport] = await Promise.all([
        documentsSvc.listIssueDocuments(issueId),
        issuesSvc.listComments(issueId, { order: "desc", limit: 8 }),
        issue.assigneeAgentId
          ? db
              .select({ id: agents.id, name: agents.name })
              .from(agents)
              .where(eq(agents.id, issue.assigneeAgentId))
              .then((rows) => rows[0] ?? null)
          : Promise.resolve(null),
        documentsSvc.getIssueDocumentByKey(issueId, "report"),
      ]);

      const comments = [...commentsDesc].reverse();
      const reportableDocs = docs.filter((doc) => doc.key !== "report");
      const planDoc = reportableDocs.find((doc) => doc.key === "plan") ?? null;
      const contextDoc = reportableDocs.find((doc) => doc.key === "context") ?? null;
      const todoDoc = reportableDocs.find((doc) => doc.key === "todo") ?? null;
      const todoProgress = extractTodoProgress(todoDoc?.body);
      const latestComment = commentsDesc[0] ?? null;
      const latestCommentStructuredSummary = formatStructuredSummary(latestComment?.body);
      const latestCommentSummary = stripMarkdown(latestComment?.body);
      const fallbackSummary = stripMarkdown(issue.description) || firstNonEmptyLine(planDoc?.body) || firstNonEmptyLine(contextDoc?.body);
      const summary = latestCommentStructuredSummary || latestCommentSummary || fallbackSummary || "요약이 아직 없습니다.";
      const activeRun = "activeRun" in issue ? (issue as { activeRun?: { id: string; status: string } | null }).activeRun ?? null : null;
      const statusSummary = buildStatusSummary({
        status: issue.status,
        activeRun,
      });
      const assigneeLabel = assigneeAgent?.name ?? issue.assigneeAgentId ?? issue.assigneeUserId ?? "unassigned";
      const docList = reportableDocs.length > 0
        ? reportableDocs.map((doc) => `- \`${doc.key}\`${doc.title ? ` — ${doc.title}` : ""}`).join("\n")
        : "- 없음";
      const timeline = comments.length > 0
        ? comments
            .slice(-6)
            .map((comment) => {
              const author = comment.authorAgentId ? `agent:${comment.authorAgentId.slice(0, 8)}` : comment.authorUserId ? `user:${comment.authorUserId.slice(0, 8)}` : "system";
              const snippet = stripMarkdown(comment.body).slice(0, 220) || "(empty)";
              return `- ${formatDateTime(comment.createdAt)} · ${author}\n  - ${snippet}`;
            })
            .join("\n")
        : "- 아직 코멘트가 없습니다.";

      const activeRunBlock = activeRun
        ? `- Active run: \`${activeRun.id}\` (${activeRun.status})`
        : "- Active run: 없음";

      const body = [
        `# ${issue.identifier ?? issue.id} 상태 리포트`,
        "",
        `- 제목: ${issue.title}`,
        `- 현재 상태: ${statusSummary} (\`${issue.status}\`)`,
        `- 현재 담당: ${assigneeLabel}`,
        `- 생성일: ${formatDateTime(issue.createdAt)}`,
        `- 마지막 갱신: ${formatDateTime(issue.updatedAt)}`,
        activeRunBlock,
        "",
        "## 한눈에 보기",
        "",
        summary,
        "",
        "## TODO 진행",
        "",
        todoProgress.total > 0
          ? `- 완료 ${todoProgress.done} / 전체 ${todoProgress.total} / 남음 ${todoProgress.open}`
          : "- TODO 문서에 체크리스트가 아직 없습니다.",
        "",
        "## 연결된 문서",
        "",
        docList,
        "",
        "## 최근 처리 흐름",
        "",
        timeline,
      ].join("\n");

      const result = await documentsSvc.upsertIssueDocument({
        issueId,
        key: "report",
        title: "Status Report",
        format: "markdown",
        body,
        changeSummary: opts?.changeSummary ?? "Refresh issue report",
        baseRevisionId: existingReport?.latestRevisionId ?? null,
        createdByAgentId: opts?.createdByAgentId ?? null,
        createdByUserId: opts?.createdByUserId ?? null,
      });

      return result.document;
    },
  };
}
