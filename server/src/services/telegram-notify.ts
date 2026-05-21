import { homedir } from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import type { Db } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { agents } from "@paperclipai/db";
import { documentService } from "./documents.js";
import { issueService } from "./issues.js";
import { logger } from "../middleware/logger.js";

const TELEGRAM_NOTIFY_DOC_KEY = "telegram_notify_state";
const OPENCLAW_CONFIG_PATH = path.join(homedir(), ".openclaw", "openclaw.json");
const TELEGRAM_SOURCE_MARKER = "Source: Telegram via OpenClaw";
const STATUSS_TO_NOTIFY = new Set(["in_progress", "in_review", "blocked", "done"]);

type TelegramConfig = {
  botToken: string | null;
  allowFrom: string[];
};

let cachedConfig: { loadedAt: number; value: TelegramConfig } | null = null;

function extractTelegramChatId(text: string | null | undefined): string | null {
  if (typeof text !== "string" || text.trim().length === 0) return null;
  const patterns = [
    /\bTelegram chat id\s*:\s*(\d{5,})\b/i,
    /\bid\s*:\s*(\d{5,})\b/i,
    /\bchat[_ -]?id\s*[:=]\s*(\d{5,})\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractSummaryFromReport(reportBody: string | null | undefined): string {
  if (!reportBody) return "요약이 아직 없습니다.";
  const sectionMatch = reportBody.match(/## 한눈에 보기\s+([\s\S]*?)(?:\n## |\s*$)/);
  const raw = sectionMatch?.[1] ?? reportBody;
  const lines = raw
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && !entry.startsWith("- 제목:"));
  if (lines.length === 0) return "요약이 아직 없습니다.";
  return lines.slice(0, 12).join("\n");
}

function statusLabel(status: string): string {
  switch (status) {
    case "todo":
      return "대기";
    case "backlog":
      return "백로그";
    case "in_progress":
      return "진행 중";
    case "in_review":
      return "검토 중";
    case "blocked":
      return "막힘";
    case "done":
      return "완료";
    case "cancelled":
      return "취소됨";
    default:
      return status;
  }
}

async function loadTelegramConfig(): Promise<TelegramConfig> {
  const now = Date.now();
  if (cachedConfig && now - cachedConfig.loadedAt < 30_000) {
    return cachedConfig.value;
  }
  try {
    const raw = await readFile(OPENCLAW_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw) as {
      channels?: { telegram?: { botToken?: string; allowFrom?: string[] } };
    };
    const value = {
      botToken: parsed.channels?.telegram?.botToken ?? null,
      allowFrom: Array.isArray(parsed.channels?.telegram?.allowFrom)
        ? parsed.channels?.telegram?.allowFrom.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        : [],
    };
    cachedConfig = { loadedAt: now, value };
    return value;
  } catch (err) {
    logger.warn({ err, path: OPENCLAW_CONFIG_PATH }, "failed to load openclaw telegram config");
    const value = { botToken: null, allowFrom: [] };
    cachedConfig = { loadedAt: now, value };
    return value;
  }
}

function parseNotifyState(body: string | null | undefined): { lastStatus?: string; lastMessageId?: number | null } | null {
  if (!body) return null;
  try {
    return JSON.parse(body) as { lastStatus?: string; lastMessageId?: number | null };
  } catch {
    return null;
  }
}

export function telegramNotifyService(db: Db) {
  const issuesSvc = issueService(db);
  const documentsSvc = documentService(db);

  return {
    async notifyIssueStatusChange(
      issueId: string,
      opts: {
        previousStatus: string | null | undefined;
        createdByAgentId?: string | null;
        createdByUserId?: string | null;
      },
    ) {
      const issue = await issuesSvc.getById(issueId);
      if (!issue || !issue.description?.includes(TELEGRAM_SOURCE_MARKER)) {
        return { delivered: false, reason: "not_telegram_source" as const };
      }
      if (!STATUSS_TO_NOTIFY.has(issue.status)) {
        return { delivered: false, reason: "status_not_notifiable" as const };
      }
      if (opts.previousStatus === issue.status) {
        return { delivered: false, reason: "status_unchanged" as const };
      }

      const [reportDoc, stateDoc, assigneeAgent, config] = await Promise.all([
        documentsSvc.getIssueDocumentByKey(issue.id, "report"),
        documentsSvc.getIssueDocumentByKey(issue.id, TELEGRAM_NOTIFY_DOC_KEY),
        issue.assigneeAgentId
          ? db
              .select({ id: agents.id, name: agents.name })
              .from(agents)
              .where(eq(agents.id, issue.assigneeAgentId))
              .then((rows) => rows[0] ?? null)
          : Promise.resolve(null),
        loadTelegramConfig(),
      ]);

      const notifyState = parseNotifyState(stateDoc?.body);
      if (notifyState?.lastStatus === issue.status) {
        return { delivered: false, reason: "already_sent_for_status" as const };
      }

      const chatId = extractTelegramChatId(issue.description) ?? config.allowFrom[0] ?? null;
      const botToken = config.botToken;
      if (!chatId || !botToken) {
        return { delivered: false, reason: "missing_telegram_credentials" as const };
      }

      const publicBaseUrl = process.env.PAPERCLIP_PUBLIC_BASE_URL || "https://pc.greencatart.work";
      const issueRef = issue.identifier ?? issue.id;
      const reportUrl = `${publicBaseUrl}/reports?issue=${issue.id}`;
      const issueUrl = `${publicBaseUrl}/issues/${issueRef}`;
      const assigneeLabel = assigneeAgent?.name ?? issue.assigneeAgentId ?? issue.assigneeUserId ?? "unassigned";
      const summary = extractSummaryFromReport(reportDoc?.body);

      const text = [
        `[Paperclip] ${issueRef} ${statusLabel(issue.status)}`,
        `제목: ${issue.title}`,
        `담당자: ${assigneeLabel}`,
        `요약: ${summary}`,
        `리포트: ${reportUrl}`,
        `상세: ${issueUrl}`,
      ].join("\n");

      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        logger.warn({ issueId: issue.id, status: response.status, body }, "telegram sendMessage failed");
        return { delivered: false, reason: "telegram_api_error" as const };
      }

      const result = (await response.json()) as { result?: { message_id?: number } };
      const messageId = result?.result?.message_id ?? null;

      await documentsSvc.upsertIssueDocument({
        issueId: issue.id,
        key: TELEGRAM_NOTIFY_DOC_KEY,
        title: "Telegram Notify State",
        format: "markdown",
        body: JSON.stringify(
          {
            lastStatus: issue.status,
            lastMessageId: messageId,
            lastSentAt: new Date().toISOString(),
            chatId,
          },
          null,
          2,
        ),
        changeSummary: "Update Telegram delivery state",
        baseRevisionId: stateDoc?.latestRevisionId ?? null,
        createdByAgentId: opts.createdByAgentId ?? null,
        createdByUserId: opts.createdByUserId ?? null,
      });

      return { delivered: true, reason: "sent" as const, chatId, messageId };
    },
  };
}
