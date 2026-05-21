#!/usr/bin/env bash

set -euo pipefail

COMPANY_ID="cf91355d-699c-419d-91c9-27c0e783b8e0"
GOAL_ID="720afb2f-6ec2-4dd9-ba22-ed56cc20dcca"
API_URL_DEFAULT="http://127.0.0.1:3050"
BRIDGE_KEY_FILE="${HOME}/.openclaw/credentials/paperclip-bridge-api-key.json"
CLAIMED_KEY_FILE="${HOME}/.openclaw/workspace/paperclip-claimed-api-key.json"

determine_routing() {
  local request_text="$1"
  local lower_text
  lower_text="$(printf '%s' "$request_text" | tr '[:upper:]' '[:lower:]')"

  ASSIGNEE_ID="$CHIEF_ID"
  ASSIGNEE_NAME="ChiefOfStaff"
  ROUTE_REASON="defaulted to operations coordination"
  NEW_PROJECT_INTENT=0
  COMPLEXITY="simple"
  CORE_AGENT_NAME=""
  HAS_STRATEGIC_INTENT=0

  HAS_ARCHIVE_INTENT=0
  HAS_LINK_INTENT=0
  HAS_RESEARCH_INTENT=0
  HAS_UX_INTENT=0
  HAS_FRONTEND_INTENT=0
  HAS_BACKEND_INTENT=0
  HAS_IMPLEMENT_INTENT=0
  HAS_PLANNING_INTENT=0
  HAS_OPERATIONS_INTENT=0

  if [[ "$lower_text" =~ (source\ pack|evidence|citation|citations|archive|raw\ source|1차\ 자료|출처|레퍼런스|근거\ 자료|자료\ 수집|아카이브|원문\ 링크|공식\ 링크) ]]; then
    HAS_ARCHIVE_INTENT=1
  fi

  if [[ "$lower_text" =~ (youtube|youtu\.be|video|영상|동영상|링크|url|http://|https://|article|blog\ post|webpage|landing\ page|문서\ 링크|페이지\ 링크) ]]; then
    HAS_LINK_INTENT=1
  fi

  if [[ "$lower_text" =~ (compare|pricing|price|latest|docs|documentation|vendor|research|recommend|recommendation|policy|policies|terms|조사|비교|가격|최신|문서|업체|추천|정책|약관) ]]; then
    HAS_RESEARCH_INTENT=1
  fi

  if [[ "$lower_text" =~ (ux|ui|wireframe|user\ flow|empty\ state|loading\ state|error\ state|screen\ flow|디자인|화면\ 구조|사용자\ 흐름|와이어프레임|상태\ 설계) ]]; then
    HAS_UX_INTENT=1
  fi

  if [[ "$lower_text" =~ (frontend|front-end|react|next\.js|component|route|client\ state|프론트엔드|프론트|컴포넌트|라우트|화면\ 구현) ]]; then
    HAS_FRONTEND_INTENT=1
  fi

  if [[ "$lower_text" =~ (backend|back-end|api|schema|database|worker|queue|auth|integration|백엔드|서버|인증|스키마|데이터베이스|잡\ 작업|연동) ]]; then
    HAS_BACKEND_INTENT=1
  fi

  if [[ "$lower_text" =~ (implement|setup|script|debug|fix|code|repo|automation|개발|구현|설치|스크립트|디버그|버그|코드|자동화|수정안) ]]; then
    HAS_IMPLEMENT_INTENT=1
  fi

  if [[ "$lower_text" =~ (requirements|requirement|scope|milestone|acceptance\ criteria|user\ story|prd|product\ plan|기획|요구사항|범위|마일스톤|우선순위|수용\ 기준|기능\ 정의) ]]; then
    HAS_PLANNING_INTENT=1
  fi

  if [[ "$lower_text" =~ (new\ project|project\ kickoff|kickoff|project\ start|start\ a\ project|새\ 프로젝트|프로젝트\ 시작|프로젝트\ 킥오프|프로젝트\ 만들|신규\ 프로젝트) ]]; then
    NEW_PROJECT_INTENT=1
  fi

  if [[ "$lower_text" =~ (agenda|follow-up|follow\ up|checklist|plan|planning|remind|summary|status|meeting|일정|체크리스트|계획|플랜|리마인드|요약|상태|미팅|회의) ]]; then
    HAS_OPERATIONS_INTENT=1
  fi

  if [[ "$lower_text" =~ (strategy|strategic|governance|org\ design|operating\ model|priority|portfolio|budget|executive|company-wide|전략|거버넌스|조직\ 설계|운영모델|우선순위|포트폴리오|예산|전사|임원) ]]; then
    HAS_STRATEGIC_INTENT=1
  fi

  IMPLEMENTATION_INTENT_COUNT=$((HAS_UX_INTENT + HAS_FRONTEND_INTENT + HAS_BACKEND_INTENT + HAS_IMPLEMENT_INTENT + HAS_PLANNING_INTENT))
  TOTAL_ACTIVE_INTENTS=$((HAS_ARCHIVE_INTENT + HAS_LINK_INTENT + HAS_RESEARCH_INTENT + HAS_UX_INTENT + HAS_FRONTEND_INTENT + HAS_BACKEND_INTENT + HAS_IMPLEMENT_INTENT + HAS_PLANNING_INTENT + HAS_OPERATIONS_INTENT))

  if [[ "$HAS_STRATEGIC_INTENT" -eq 1 ]]; then
    COMPLEXITY="strategic"
    CORE_AGENT_NAME="CEO"
  elif [[ "$NEW_PROJECT_INTENT" -eq 1 || "$TOTAL_ACTIVE_INTENTS" -ge 3 ]]; then
    COMPLEXITY="complex"
    CORE_AGENT_NAME="ChiefOfStaff"
  elif [[ "$TOTAL_ACTIVE_INTENTS" -eq 2 || "$HAS_OPERATIONS_INTENT" -eq 1 || "$HAS_PLANNING_INTENT" -eq 1 ]]; then
    COMPLEXITY="moderate"
    CORE_AGENT_NAME="ChiefOfStaff"
  fi

  if [[ "$HAS_STRATEGIC_INTENT" -eq 1 ]]; then
    ASSIGNEE_ID="$CHIEF_ID"
    ASSIGNEE_NAME="ChiefOfStaff"
    ROUTE_REASON="matched strategic intent; requires CEO-supervised coordination"
  elif [[ "$NEW_PROJECT_INTENT" -eq 1 ]]; then
    ASSIGNEE_ID="$CHIEF_ID"
    ASSIGNEE_NAME="ChiefOfStaff"
    ROUTE_REASON="matched new project / kickoff coordination intent"
  elif [[ "$HAS_RESEARCH_INTENT" -eq 1 && "$IMPLEMENTATION_INTENT_COUNT" -ge 1 ]]; then
    ASSIGNEE_ID="$CHIEF_ID"
    ASSIGNEE_NAME="ChiefOfStaff"
    ROUTE_REASON="matched mixed request (research + implementation); route through supervisor for research-first decomposition"
  elif [[ "$HAS_ARCHIVE_INTENT" -eq 1 && "$IMPLEMENTATION_INTENT_COUNT" -eq 0 ]]; then
    ASSIGNEE_ID="$ARCHIVIST_ID"
    ASSIGNEE_NAME="ResearchArchivist"
    ROUTE_REASON="matched source gathering / evidence intent"
  elif [[ "$HAS_LINK_INTENT" -eq 1 && "$HAS_RESEARCH_INTENT" -eq 0 && "$IMPLEMENTATION_INTENT_COUNT" -eq 0 ]]; then
    ASSIGNEE_ID="$LINK_ID"
    ASSIGNEE_NAME="LinkBriefAnalyst"
    ROUTE_REASON="matched link / youtube analysis intent"
  elif [[ "$HAS_RESEARCH_INTENT" -eq 1 ]]; then
    ASSIGNEE_ID="$RESEARCH_ID"
    ASSIGNEE_NAME="ResearchScout"
    ROUTE_REASON="matched research / comparison intent"
  elif [[ "$HAS_PLANNING_INTENT" -eq 1 ]]; then
    ASSIGNEE_ID="$PLANNER_ID"
    ASSIGNEE_NAME="ProductPlanner"
    ROUTE_REASON="matched product planning / requirements intent"
  elif [[ "$HAS_UX_INTENT" -eq 1 ]]; then
    ASSIGNEE_ID="$UX_ID"
    ASSIGNEE_NAME="UXUIDesigner"
    ROUTE_REASON="matched ux / interface design intent"
  elif [[ "$HAS_FRONTEND_INTENT" -eq 1 ]]; then
    ASSIGNEE_ID="$FRONTEND_ID"
    ASSIGNEE_NAME="FrontendEngineer"
    ROUTE_REASON="matched frontend implementation intent"
  elif [[ "$HAS_BACKEND_INTENT" -eq 1 ]]; then
    ASSIGNEE_ID="$BACKEND_ID"
    ASSIGNEE_NAME="BackendEngineer"
    ROUTE_REASON="matched backend implementation intent"
  elif [[ "$HAS_IMPLEMENT_INTENT" -eq 1 ]]; then
    ASSIGNEE_ID="$CODEX_ID"
    ASSIGNEE_NAME="CodexCoder"
    ROUTE_REASON="matched implementation / automation intent"
  elif [[ "$HAS_OPERATIONS_INTENT" -eq 1 ]]; then
    ASSIGNEE_ID="$CHIEF_ID"
    ASSIGNEE_NAME="ChiefOfStaff"
    ROUTE_REASON="matched operations / planning intent"
  fi

  if [[ "$ASSIGNEE_NAME" == "CEO" ]]; then
    COMPLEXITY="strategic"
    CORE_AGENT_NAME="CEO"
  elif [[ "$ASSIGNEE_NAME" == "FoundingEngineer" ]]; then
    COMPLEXITY="complex"
    CORE_AGENT_NAME="FoundingEngineer"
  elif [[ "$ASSIGNEE_NAME" == "ChiefOfStaff" ]]; then
    if [[ "$COMPLEXITY" == "simple" ]]; then
      COMPLEXITY="moderate"
    fi
    CORE_AGENT_NAME="$ASSIGNEE_NAME"
  fi
}

run_self_test() {
  CHIEF_ID="chief"
  RESEARCH_ID="research"
  CODEX_ID="codex"
  PLANNER_ID="planner"
  ARCHIVIST_ID="archivist"
  LINK_ID="link"
  UX_ID="ux"
  FRONTEND_ID="frontend"
  BACKEND_ID="backend"

  local failures=0
  local text
  local expected
  local label

  while IFS='|' read -r label text expected; do
    determine_routing "$text"
    if [[ "$ASSIGNEE_NAME" != "$expected" ]]; then
      echo "FAIL [$label] expected=$expected actual=$ASSIGNEE_NAME"
      failures=$((failures + 1))
    else
      echo "PASS [$label] => $ASSIGNEE_NAME"
    fi
  done <<'EOF'
mixed-ko|OpenAI/Anthropic 가격·정책 최신 비교 + 서버 자동화 코드 수정안 제안|ChiefOfStaff
mixed-en|Compare latest OpenAI policy/pricing and patch backend automation script|ChiefOfStaff
research-heavy-db|최신 Supabase와 Neon 가격/정책 차이를 비교해서 어떤 걸 기본 DB로 쓰는 게 나은지 추천안 정리해줘|ResearchScout
research-with-ticketing|최신 Supabase와 Neon 가격/정책 차이를 비교해서 추천안 정리하고 Paperclip 이슈로 만들고 담당자 배정까지 해줘|ResearchScout
research-only|OpenAI/Anthropic latest pricing and policy comparison with references|ResearchScout
archive-only|공식 문서와 가격 페이지 원문 링크만 모아서 source pack 형태로 정리해줘|ResearchArchivist
link-only|이 유튜브 링크 내용 요약하고 핵심 액션 아이템만 정리해줘 https://youtu.be/example|LinkBriefAnalyst
planning-only|이 기능 아이디어를 PRD 형태로 정리하고 acceptance criteria까지 만들어줘|ProductPlanner
ux-only|온보딩 플로우와 empty loading error 상태를 UX 관점에서 설계해줘|UXUIDesigner
frontend-only|React 기준으로 온보딩 컴포넌트 구조와 상태 관리를 구현 태스크로 쪼개줘|FrontendEngineer
backend-only|API 스키마와 인증 흐름, 작업 큐 설계를 백엔드 관점에서 정리해줘|BackendEngineer
automation-only|로컬 반복 작업 줄이게 설정 스크립트와 자동화 코드 수정안을 만들어줘|CodexCoder
operations-only|이번 주 우선순위와 후속 액션을 체크리스트로 정리해줘|ChiefOfStaff
new-project|새 프로젝트 시작: 고객 FAQ 챗봇 MVP 범위와 첫 주 체크리스트를 정리해줘|ChiefOfStaff
strategic|전사 AI 에이전트 운영모델과 거버넌스 전략을 수립해줘|ChiefOfStaff
EOF

  if [[ "$failures" -ne 0 ]]; then
    return 1
  fi
}

OUTPUT_MODE="summary"

if [[ "${1:-}" == "--json" ]]; then
  OUTPUT_MODE="json"
  shift
fi

if [[ "${1:-}" == "--self-test" ]]; then
  run_self_test
  exit 0
fi

if [[ $# -lt 1 ]]; then
  echo "usage: $0 '<telegram request text>'" >&2
  echo "       $0 --self-test" >&2
  exit 1
fi

REQUEST_TEXT="$*"

KEY_FILE="$BRIDGE_KEY_FILE"
if [[ ! -f "$KEY_FILE" ]]; then
  KEY_FILE="$CLAIMED_KEY_FILE"
fi

if [[ ! -f "$KEY_FILE" ]]; then
  echo "missing Paperclip key file: $BRIDGE_KEY_FILE or $CLAIMED_KEY_FILE" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 1
fi

PAPERCLIP_API_KEY="$(jq -r '.env.PAPERCLIP_API_KEY // empty' "$KEY_FILE")"
PAPERCLIP_API_URL="$(jq -r '.env.PAPERCLIP_API_URL // empty' "$KEY_FILE")"
if [[ -z "$PAPERCLIP_API_URL" ]]; then
  PAPERCLIP_API_URL="$API_URL_DEFAULT"
fi

if [[ "$PAPERCLIP_API_URL" == "http://127.0.0.1:3100" ]]; then
  PAPERCLIP_API_URL="http://127.0.0.1:3050"
fi

if [[ -z "$PAPERCLIP_API_KEY" ]]; then
  echo "missing PAPERCLIP_API_KEY in $KEY_FILE" >&2
  exit 1
fi

build_api_candidates() {
  local primary_url="$1"
  local urls=("$primary_url")
  local alt_url=""

  case "$primary_url" in
    http://127.0.0.1:3050|http://localhost:3050)
      alt_url="${primary_url/%:3050/:3100}"
      ;;
    http://127.0.0.1:3100|http://localhost:3100)
      alt_url="${primary_url/%:3100/:3050}"
      ;;
  esac

  if [[ -n "$alt_url" && "$alt_url" != "$primary_url" ]]; then
    urls+=("$alt_url")
  fi

  printf '%s\n' "${urls[@]}"
}

api_request() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local response=""
  local last_error=""
  local url=""
  local attempt=0

  while IFS= read -r url; do
    [[ -z "$url" ]] && continue

    for attempt in 1 2; do
      if [[ -n "$data" ]]; then
        if response="$(curl -fsS \
          --connect-timeout 2 \
          --max-time 20 \
          -X "$method" \
          -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
          -H "Content-Type: application/json" \
          "${url}${path}" \
          -d "$data" 2>&1)"; then
          PAPERCLIP_API_URL="$url"
          printf '%s' "$response"
          return 0
        fi
      else
        if response="$(curl -fsS \
          --connect-timeout 2 \
          --max-time 20 \
          -X "$method" \
          -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
          "${url}${path}" 2>&1)"; then
          PAPERCLIP_API_URL="$url"
          printf '%s' "$response"
          return 0
        fi
      fi

      last_error="$response"
      if [[ "$attempt" -eq 1 ]]; then
        sleep 1
      fi
    done
  done < <(build_api_candidates "$PAPERCLIP_API_URL")

  printf 'Paperclip API request failed for %s %s\n%s\n' "$method" "$path" "$last_error" >&2
  return 1
}

AGENTS_JSON="$(api_request GET "/api/companies/$COMPANY_ID/agents")"

agent_id_by_url_key() {
  local key="$1"
  jq -r --arg key "$key" '.[] | select(.urlKey == $key) | .id' <<<"$AGENTS_JSON" | head -n 1
}

CHIEF_ID="$(agent_id_by_url_key chiefofstaff)"
RESEARCH_ID="$(agent_id_by_url_key researchscout)"
CODEX_ID="$(agent_id_by_url_key codexcoder)"
PLANNER_ID="$(agent_id_by_url_key productplanner)"
ARCHIVIST_ID="$(agent_id_by_url_key researcharchivist)"
LINK_ID="$(agent_id_by_url_key linkbriefanalyst)"
UX_ID="$(agent_id_by_url_key uxuidesigner)"
FRONTEND_ID="$(agent_id_by_url_key frontendengineer)"
BACKEND_ID="$(agent_id_by_url_key backendengineer)"

if [[ -z "$CHIEF_ID" || -z "$RESEARCH_ID" || -z "$CODEX_ID" || -z "$PLANNER_ID" || -z "$ARCHIVIST_ID" || -z "$UX_ID" || -z "$FRONTEND_ID" || -z "$BACKEND_ID" || -z "$LINK_ID" ]]; then
  echo "failed to resolve one or more Paperclip agent ids" >&2
  exit 1
fi

determine_routing "$REQUEST_TEXT"

TITLE_SOURCE="$(printf '%s' "$REQUEST_TEXT" | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g' | sed 's/^ //; s/ $//')"
TITLE_TRIMMED="$(printf '%s' "$TITLE_SOURCE" | cut -c1-72)"
TITLE="Telegram intake: $TITLE_TRIMMED"
TELEGRAM_CHAT_ID=""
if [[ "$REQUEST_TEXT" =~ (Telegram\ chat\ id|chat[_\ -]?id|id)[[:space:]]*[:=][[:space:]]*([0-9]{5,}) ]]; then
  TELEGRAM_CHAT_ID="${BASH_REMATCH[2]}"
fi

DESCRIPTION=$(jq -n \
  --arg req "$REQUEST_TEXT" \
  --arg owner "$ASSIGNEE_NAME" \
  --arg reason "$ROUTE_REASON" \
  --arg complexity "$COMPLEXITY" \
  --arg core "${CORE_AGENT_NAME:-}" \
  --arg chatId "$TELEGRAM_CHAT_ID" \
  '[
    "Source: Telegram via OpenClaw",
    (if $chatId != "" then "Telegram chat id: " + $chatId else empty end),
    "",
    "Original request:",
    $req,
    "",
    "Routing:",
    ("- Complexity: " + $complexity),
    (if $core != "" then "- Core agent: " + $core else empty end),
    ("- Owner: " + $owner),
    ("- Reason: " + $reason)
  ] | join("\n")')

PAYLOAD=$(jq -n \
  --arg title "$TITLE" \
  --argjson description "$DESCRIPTION" \
  --arg assignee "$ASSIGNEE_ID" \
  --arg goalId "$GOAL_ID" \
  '{
    title: $title,
    description: $description,
    status: "todo",
    priority: "medium",
    assigneeAgentId: $assignee,
    goalId: $goalId
  }')

ISSUE_RESPONSE="$(api_request POST "/api/companies/$COMPANY_ID/issues" "$PAYLOAD")"

ISSUE_ID="$(jq -r '.id // empty' <<<"$ISSUE_RESPONSE")"
ISSUE_IDENTIFIER="$(jq -r '.identifier // empty' <<<"$ISSUE_RESPONSE")"
ISSUE_STATUS="$(jq -r '.status // empty' <<<"$ISSUE_RESPONSE")"
ISSUE_ASSIGNEE_ID="$(jq -r '.assigneeAgentId // empty' <<<"$ISSUE_RESPONSE")"

if [[ -z "$ISSUE_ID" || -z "$ISSUE_STATUS" ]]; then
  printf '%s\n' "$ISSUE_RESPONSE"
  exit 1
fi

PAPERCLIP_PUBLIC_BASE_URL="${PAPERCLIP_PUBLIC_BASE_URL:-https://pc.greencatart.work}"
ISSUE_REF="$ISSUE_ID"
if [[ -n "$ISSUE_IDENTIFIER" ]]; then
  ISSUE_REF="$ISSUE_IDENTIFIER"
fi

REPORT_URL="${PAPERCLIP_PUBLIC_BASE_URL}/reports?issue=${ISSUE_ID}"
ISSUE_URL="${PAPERCLIP_PUBLIC_BASE_URL}/issues/${ISSUE_REF}"
ASSIGNEE_LABEL="$ASSIGNEE_NAME"
if [[ -z "$ASSIGNEE_LABEL" && -n "$ISSUE_ASSIGNEE_ID" ]]; then
  ASSIGNEE_LABEL="$ISSUE_ASSIGNEE_ID"
fi

STATUS_LABEL="$ISSUE_STATUS"
case "$ISSUE_STATUS" in
  todo) STATUS_LABEL="대기" ;;
  backlog) STATUS_LABEL="백로그" ;;
  in_progress) STATUS_LABEL="진행 중" ;;
  in_review) STATUS_LABEL="검토 중" ;;
  blocked) STATUS_LABEL="막힘" ;;
  done) STATUS_LABEL="완료" ;;
  cancelled) STATUS_LABEL="취소됨" ;;
esac

SUMMARY_TEXT="$(cat <<EOF
접수 완료

- 이슈: ${ISSUE_REF}
- 현재 상태: ${STATUS_LABEL}
- 담당자: ${ASSIGNEE_LABEL}
- 복잡도: ${COMPLEXITY}
$(if [[ -n "${CORE_AGENT_NAME:-}" ]]; then printf '%s\n' "- 코어 에이전트: ${CORE_AGENT_NAME}"; fi)
- 라우팅 이유: ${ROUTE_REASON}

리포트: ${REPORT_URL}
상세: ${ISSUE_URL}
EOF
)"

if [[ "$OUTPUT_MODE" == "json" ]]; then
  jq -n \
    --arg issueId "$ISSUE_ID" \
    --arg issueRef "$ISSUE_REF" \
    --arg status "$ISSUE_STATUS" \
    --arg statusLabel "$STATUS_LABEL" \
    --arg assignee "$ASSIGNEE_LABEL" \
    --arg complexity "$COMPLEXITY" \
    --arg core "${CORE_AGENT_NAME:-}" \
    --arg reason "$ROUTE_REASON" \
    --arg reportUrl "$REPORT_URL" \
    --arg issueUrl "$ISSUE_URL" \
    --arg reply "$SUMMARY_TEXT" \
    --argjson issue "$ISSUE_RESPONSE" \
    '{
      issueId: $issueId,
      issueRef: $issueRef,
      status: $status,
      statusLabel: $statusLabel,
      assignee: $assignee,
      complexity: $complexity,
      coreAgent: ($core | select(. != "")),
      routingReason: $reason,
      reportUrl: $reportUrl,
      issueUrl: $issueUrl,
      replyText: $reply,
      issue: $issue
    }'
else
  printf '%s\n' "$SUMMARY_TEXT"
fi
