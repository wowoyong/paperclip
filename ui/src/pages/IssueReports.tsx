import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, FileText, Loader2 } from "lucide-react";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { MarkdownBody } from "../components/MarkdownBody";
import { Badge } from "@/components/ui/badge";
import type { Issue, IssueComment, IssueDocument } from "@paperclipai/shared";

function toDateInputValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "-";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHistoryBucketLabel(value: string): string {
  const today = toDateInputValue(new Date());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = toDateInputValue(yesterdayDate);
  if (value === today) return "오늘";
  if (value === yesterday) return "어제";
  return value;
}

function statusTone(status: string) {
  if (status === "done") return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
  if (status === "in_progress") return "bg-blue-500/15 text-blue-700 border-blue-500/30";
  if (status === "in_review") return "bg-amber-500/15 text-amber-700 border-amber-500/30";
  if (status === "blocked") return "bg-rose-500/15 text-rose-700 border-rose-500/30";
  return "bg-muted text-muted-foreground border-border";
}

function buildFallbackReport(issue: Issue, comments: IssueComment[], docs: IssueDocument[]): string {
  const latestComment = comments[comments.length - 1] ?? null;
  const summary = latestComment?.body?.trim() || issue.description?.trim() || "요약이 아직 없습니다.";
  const docList = docs.length > 0
    ? docs.map((doc) => `- \`${doc.key}\`${doc.title ? ` — ${doc.title}` : ""}`).join("\n")
    : "- 아직 문서가 없습니다.";

  return [
    `# ${issue.identifier ?? issue.id} 상태 리포트`,
    "",
    `- 제목: ${issue.title}`,
    `- 상태: ${issue.status}`,
    `- 생성일: ${formatDateTime(issue.createdAt)}`,
    `- 마지막 업데이트: ${formatDateTime(issue.updatedAt)}`,
    "",
    "## 요약",
    "",
    summary,
    "",
    "## 연결 문서",
    "",
    docList,
  ].join("\n");
}

export function IssueReports() {
  const { selectedCompanyId, setSelectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [searchParams, setSearchParams] = useSearchParams();

  const dateFilter = searchParams.get("date") ?? "";
  const selectedIssueId = searchParams.get("issue") ?? "";

  useEffect(() => {
    setBreadcrumbs([{ label: "리포트" }]);
  }, [setBreadcrumbs]);

  const { data: issueFromParam, isLoading: issueFromParamLoading } = useQuery({
    queryKey: queryKeys.issues.detail(selectedIssueId || "__none__"),
    queryFn: () => issuesApi.get(selectedIssueId),
    enabled: !!selectedIssueId,
  });

  const effectiveCompanyId = selectedCompanyId ?? issueFromParam?.companyId ?? null;

  useEffect(() => {
    if (!issueFromParam?.companyId) return;
    if (selectedCompanyId === issueFromParam.companyId) return;
    setSelectedCompanyId(issueFromParam.companyId, { source: "manual" });
  }, [issueFromParam?.companyId, selectedCompanyId, setSelectedCompanyId]);

  const { data: issues = [], isLoading, error } = useQuery({
    queryKey: queryKeys.issues.list(effectiveCompanyId ?? "__none__"),
    queryFn: () =>
      issuesApi.list(effectiveCompanyId!, {
        status: "backlog,todo,in_progress,in_review,blocked,done,cancelled",
      }),
    enabled: !!effectiveCompanyId,
  });

  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(effectiveCompanyId ?? "__none__"),
    queryFn: () => agentsApi.list(effectiveCompanyId!),
    enabled: !!effectiveCompanyId,
  });

  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      if (dateFilter && toDateInputValue(issue.createdAt) !== dateFilter) return false;
      return true;
    });
  }, [issues, dateFilter]);

  const groupedIssues = useMemo(() => {
    const sorted = [...filteredIssues].sort((a, b) => {
      const aTime = new Date(a.updatedAt).getTime();
      const bTime = new Date(b.updatedAt).getTime();
      return bTime - aTime;
    });
    const groups: Array<{ key: string; label: string; items: Issue[] }> = [];
    for (const issue of sorted) {
      const key = toDateInputValue(issue.createdAt) || "unknown";
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.key !== key) {
        groups.push({ key, label: formatHistoryBucketLabel(key), items: [issue] });
      } else {
        lastGroup.items.push(issue);
      }
    }
    return groups;
  }, [filteredIssues]);

  const statusCounts = useMemo(() => {
    return filteredIssues.reduce<Record<string, number>>((acc, issue) => {
      acc[issue.status] = (acc[issue.status] ?? 0) + 1;
      return acc;
    }, {});
  }, [filteredIssues]);

  const selectedIssue = useMemo(() => {
    if (selectedIssueId) {
      return filteredIssues.find((issue) => issue.id === selectedIssueId) ?? issueFromParam ?? filteredIssues[0] ?? null;
    }
    return filteredIssues[0] ?? issueFromParam ?? null;
  }, [filteredIssues, issueFromParam, selectedIssueId]);

  useEffect(() => {
    if (!selectedIssue) return;
    if (selectedIssue.id === selectedIssueId) return;
    const next = new URLSearchParams(searchParams);
    next.set("issue", selectedIssue.id);
    setSearchParams(next, { replace: true });
  }, [selectedIssue, selectedIssueId, searchParams, setSearchParams]);

  const { data: issueDetail, isLoading: issueLoading } = useQuery({
    queryKey: queryKeys.issues.detail(selectedIssue?.id ?? "__none__"),
    queryFn: () => issuesApi.get(selectedIssue!.id),
    enabled: !!selectedIssue?.id,
  });

  const { data: issueComments = [] } = useQuery({
    queryKey: queryKeys.issues.comments(selectedIssue?.id ?? "__none__"),
    queryFn: () => issuesApi.listComments(selectedIssue!.id),
    enabled: !!selectedIssue?.id,
  });

  const { data: issueDocuments = [] } = useQuery({
    queryKey: queryKeys.issues.documents(selectedIssue?.id ?? "__none__"),
    queryFn: () => issuesApi.listDocuments(selectedIssue!.id),
    enabled: !!selectedIssue?.id,
  });

  const reportDoc = useMemo(() => issueDocuments.find((doc) => doc.key === "report") ?? null, [issueDocuments]);
  const renderedReport = useMemo(() => {
    if (!issueDetail) return "";
    return reportDoc?.body ?? buildFallbackReport(issueDetail, [...issueComments].reverse(), issueDocuments);
  }, [issueComments, issueDetail, issueDocuments, reportDoc]);

  const assigneeName = useMemo(() => {
    if (!issueDetail?.assigneeAgentId) return issueDetail?.assigneeUserId ?? "unassigned";
    return agents.find((agent) => agent.id === issueDetail.assigneeAgentId)?.name ?? issueDetail.assigneeAgentId;
  }, [agents, issueDetail]);

  if (!effectiveCompanyId && !issueFromParamLoading) {
    return <EmptyState icon={FileText} message="리포트를 보려면 회사를 선택하세요." />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        리포트를 불러오는 중...
      </div>
    );
  }

  if (error) {
    return <EmptyState icon={FileText} message={error instanceof Error ? error.message : "리포트를 불러오지 못했습니다."} />;
  }

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-end">
        <div className="flex-1">
          <p className="text-sm font-medium">완료/진행 리포트</p>
          <p className="mt-1 text-xs text-muted-foreground">날짜별 히스토리처럼 요청 이력을 훑어보면서 각 이슈의 현재 상태와 리포트를 확인할 수 있습니다.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-1">
          <label className="text-xs text-muted-foreground">
            요청 일자
            <div className="mt-1 relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                type="date"
                value={dateFilter}
                onChange={(event) => {
                  const next = new URLSearchParams(searchParams);
                  if (event.target.value) next.set("date", event.target.value);
                  else next.delete("date");
                  setSearchParams(next, { replace: true });
                }}
              />
            </div>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          ["done", "완료"],
          ["in_progress", "진행"],
          ["in_review", "검토"],
          ["blocked", "막힘"],
          ["todo", "대기"],
        ].map(([key, label]) => (
          <Badge key={key} variant="outline" className="gap-1">
            <span>{label}</span>
            <span className="text-muted-foreground">{statusCounts[key] ?? 0}</span>
          </Badge>
        ))}
      </div>

      <div className="grid min-h-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium">대상 이슈</p>
            <p className="mt-1 text-xs text-muted-foreground">{filteredIssues.length}건</p>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {groupedIssues.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">조건에 맞는 이슈가 없습니다.</div>
            ) : (
              groupedIssues.map((group) => (
                <div key={group.key} className="border-b border-border last:border-b-0">
                  <div className="sticky top-0 z-[1] bg-card/95 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur">
                    {group.label}
                  </div>
                  {group.items.map((issue) => (
                    <button
                      key={issue.id}
                      type="button"
                      onClick={() => {
                        const next = new URLSearchParams(searchParams);
                        next.set("issue", issue.id);
                        setSearchParams(next, { replace: true });
                      }}
                      className={`w-full border-t border-border px-4 py-3 text-left transition-colors hover:bg-accent/40 ${selectedIssue?.id === issue.id ? "bg-accent/40" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{issue.identifier ?? issue.id}</span>
                        <Badge variant="outline" className={statusTone(issue.status)}>
                          {issue.status}
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-foreground">{issue.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(issue.updatedAt)}</p>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          {!selectedIssue || !issueDetail ? (
            <div className="px-6 py-10 text-sm text-muted-foreground">
              {issueLoading ? "리포트를 불러오는 중..." : "왼쪽에서 이슈를 선택하세요."}
            </div>
          ) : (
            <div className="flex min-h-0 flex-col">
              <div className="border-b border-border px-6 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-semibold">{issueDetail.title}</p>
                  <Badge variant="outline" className={statusTone(issueDetail.status)}>
                    {issueDetail.status}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>이슈: {issueDetail.identifier ?? issueDetail.id}</span>
                  <span>담당: {assigneeName}</span>
                  <span>생성: {formatDateTime(issueDetail.createdAt)}</span>
                  <span>업데이트: {formatDateTime(issueDetail.updatedAt)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  <Link className="text-primary underline-offset-4 hover:underline" to={`/issues/${issueDetail.id}`}>
                    이슈 상세 보기
                  </Link>
                  {reportDoc && (
                    <button
                      type="button"
                      className="text-primary underline-offset-4 hover:underline"
                      onClick={() => {
                        const blob = new Blob([reportDoc.body], { type: "text/markdown;charset=utf-8" });
                        const url = URL.createObjectURL(blob);
                        const anchor = document.createElement("a");
                        anchor.href = url;
                        anchor.download = `${issueDetail.identifier ?? issueDetail.id}-report.md`;
                        document.body.appendChild(anchor);
                        anchor.click();
                        anchor.remove();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      report.md 다운로드
                    </button>
                  )}
                </div>
              </div>

              <div className="grid gap-4 px-6 py-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="min-w-0">
                  <p className="mb-3 text-sm font-medium">요약 리포트</p>
                  <MarkdownBody className="[&>*:first-child]:mt-0">{renderedReport}</MarkdownBody>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium">문서</p>
                    <div className="mt-2 space-y-2">
                      {issueDocuments.length === 0 ? (
                        <p className="text-xs text-muted-foreground">연결된 문서가 없습니다.</p>
                      ) : (
                        issueDocuments.map((doc) => (
                          <div key={doc.id} className="rounded-md border border-border px-3 py-2">
                            <p className="text-sm font-medium">{doc.key}</p>
                            <p className="text-xs text-muted-foreground">{doc.title ?? "Untitled"}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium">최근 코멘트</p>
                    <div className="mt-2 space-y-2">
                      {issueComments.length === 0 ? (
                        <p className="text-xs text-muted-foreground">코멘트가 아직 없습니다.</p>
                      ) : (
                        [...issueComments].slice(0, 5).map((comment) => (
                          <div key={comment.id} className="rounded-md border border-border px-3 py-2">
                            <p className="text-[11px] text-muted-foreground">{formatDateTime(comment.createdAt)}</p>
                            <p className="mt-1 line-clamp-4 text-xs text-foreground">{comment.body}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
