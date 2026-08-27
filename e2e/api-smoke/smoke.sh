#!/usr/bin/env bash
# KeepEat API 스모크 테스트 (층 1)
#
# 읽기/멱등 API만 순회하는 비파괴 회귀 검증 스크립트.
# 사용법:
#   BASE_URL=https://... TEST_EMAIL=... TEST_PASSWORD=... bash e2e/api-smoke/smoke.sh
#
# 원칙:
#   - 자격증명/토큰은 환경변수로만 받는다. 파일 저장·하드코딩 금지.
#   - 응답 body는 절대 출력하지 않는다 (토큰/이메일 등 개인정보 로그 방지).
#   - 각 호출은 기대 status 목록과 대조하고, 하나라도 어긋나면 exit 1.
#
# 의도적으로 호출하지 않는 엔드포인트와 이유:
#   - POST /api/users/password/**            : rate limit 소모 + 메일 발송 (파괴적)
#   - POST /api/users/send, /verify          : 인증 메일 발송 (파괴적)
#   - POST /api/v1/recipes/generate          : AI 생성 1일 1회 제한 소모
#   - POST /api/users/logout, /logout-all    : refresh 토큰 무효화 → 실기기 앱 세션 파괴
#   - POST /api/users/refresh                : refresh rotation으로 회전된 토큰이
#                                              앱에 저장된 세션과 경쟁 → 검증하지 않음
#   - DELETE /api/users/me (탈퇴)            : 파괴적
#   - OCR 업로드                              : 파일 필요 + 외부 API 비용
#   - reaction / cook 계열                    : 데이터 변형
#
# 백엔드 계약 메모 (컨트롤러가 소스 오브 트루스):
#   - 글로벌 prefix 없음. 사용자/알림은 /api/..., 식재료/레시피는 /api/v1/...
#   - 성공 응답 래퍼 없음. 에러만 {status, code, message}.
#   - 빈 목록은 200+[] 이 아니라 204 No Content 인 엔드포인트가 있음.
#   - /user-ingredients/search 는 파라미터 q, /recipes 는 keyword.

set -u

: "${BASE_URL:?BASE_URL 환경변수가 필요합니다 (예: https://demo-server)}"
: "${TEST_EMAIL:?TEST_EMAIL 환경변수가 필요합니다}"
: "${TEST_PASSWORD:?TEST_PASSWORD 환경변수가 필요합니다}"

BASE_URL="${BASE_URL%/}"
CURL_OPTS=(--silent --show-error --max-time 15)

RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
RESET=$'\033[0m'

FAILED=0
PASS_COUNT=0

# JSON에서 문자열/불리언 값 추출 (jq 없이 동작; body는 stdin으로만 전달)
json_get() {
  local key="$1"
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import json,sys; d=json.load(sys.stdin); v=d.get(sys.argv[1]); print("" if v is None else (str(v).lower() if isinstance(v,bool) else v))' "$key"
  else
    sed -n "s/.*\"${key}\"[[:space:]]*:[[:space:]]*\"\{0,1\}\([^\",}]*\)\"\{0,1\}.*/\1/p" | head -1
  fi
}

# check <기대status목록(콤마)> <METHOD> <PATH> [json-body]
# 응답 body는 버린다. status만 검사.
check() {
  local expected="$1" method="$2" path="$3" body="${4-}"
  local args=("${CURL_OPTS[@]}" -o /dev/null -w '%{http_code}' -X "$method" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}")
  if [[ -n "$body" ]]; then
    args+=(-H 'Content-Type: application/json' -d "$body")
  fi
  local status
  status=$(curl "${args[@]}" "${BASE_URL}${path}" 2>/dev/null) || status="000"
  if [[ ",${expected}," == *",${status},"* ]]; then
    printf '%sPASS%s %-5s %-45s %s (expected %s)\n' "$GREEN" "$RESET" "$method" "$path" "$status" "$expected"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    printf '%sFAIL%s %-5s %-45s %s (expected %s)\n' "$RED" "$RESET" "$method" "$path" "$status" "$expected"
    FAILED=1
  fi
}

echo "== KeepEat API smoke =="
echo "BASE_URL: ${BASE_URL}"
echo

# --- 1. 로그인: 토큰 확보 (body는 변수에만 담고 출력하지 않는다) ---
login_response=$(curl "${CURL_OPTS[@]}" -w $'\n%{http_code}' -X POST \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}" \
  "${BASE_URL}/api/users/login" 2>/dev/null) || login_response=$'\n000'
login_status="${login_response##*$'\n'}"
login_body="${login_response%$'\n'*}"

if [[ "$login_status" != "200" ]]; then
  printf '%sFAIL%s POST  %-45s %s (expected 200)\n' "$RED" "$RESET" "/api/users/login" "$login_status"
  echo "로그인 실패 — 이후 검증을 진행할 수 없습니다. (429면 rate limit: 15분당 10회)" >&2
  exit 1
fi
ACCESS_TOKEN=$(printf '%s' "$login_body" | json_get accessToken)
unset login_body login_response
if [[ -z "$ACCESS_TOKEN" ]]; then
  printf '%sFAIL%s 로그인 200이지만 accessToken 파싱 실패\n' "$RED" "$RESET"
  exit 1
fi
printf '%sPASS%s POST  %-45s 200 (expected 200)\n' "$GREEN" "$RESET" "/api/users/login"
PASS_COUNT=$((PASS_COUNT + 1))

# --- 2. 인증 GET 순회 (읽기 전용) ---
# /users/me 는 body에서 isNotificationEnabled 를 읽어야 하므로 별도 처리
me_response=$(curl "${CURL_OPTS[@]}" -w $'\n%{http_code}' \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  "${BASE_URL}/api/users/me" 2>/dev/null) || me_response=$'\n000'
me_status="${me_response##*$'\n'}"
me_body="${me_response%$'\n'*}"
if [[ "$me_status" == "200" ]]; then
  printf '%sPASS%s GET   %-45s 200 (expected 200)\n' "$GREEN" "$RESET" "/api/users/me"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  printf '%sFAIL%s GET   %-45s %s (expected 200)\n' "$RED" "$RESET" "/api/users/me" "$me_status"
  FAILED=1
fi
notification_enabled=$(printf '%s' "$me_body" | json_get isNotificationEnabled)
unset me_body me_response

check 200,204 GET '/api/v1/user-ingredients'
check 200,204 GET '/api/v1/user-ingredients/search?q=a'
check 200     GET '/api/v1/ingredients/master'
check 200     GET '/api/notifications'
check 200     GET '/api/notifications/unread-count'
check 200     GET '/api/v1/my-recipes'
check 200     GET '/api/v1/recipes'
# result: 생성 이력 없음(404) / 생성 중(409) / 완료(200) 모두 정상 상태로 간주
check 200,404,409 GET '/api/v1/recipes/result'

# --- 3. 알림 설정: 현재 값을 그대로 재전송 (무해한 멱등 PATCH) ---
if [[ "$notification_enabled" == "true" || "$notification_enabled" == "false" ]]; then
  check 200 PATCH '/api/users/me/notification-setting' "{\"enabled\":${notification_enabled}}"
else
  printf '%sFAIL%s PATCH %-45s skip (isNotificationEnabled 파싱 실패)\n' "$RED" "$RESET" "/api/users/me/notification-setting"
  FAILED=1
fi

# logout 은 의도적으로 호출하지 않는다 (세션 파괴 방지 — 상단 주석 참고)

echo
if [[ "$FAILED" -eq 0 ]]; then
  printf '%s모든 검사 통과 (%d passed)%s\n' "$GREEN" "$PASS_COUNT" "$RESET"
  exit 0
else
  printf '%s실패한 검사가 있습니다%s\n' "$RED" "$RESET"
  exit 1
fi
