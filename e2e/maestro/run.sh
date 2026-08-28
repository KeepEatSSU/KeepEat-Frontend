#!/usr/bin/env bash
# Maestro suite 실행 헬퍼.
# 자격증명은 e2e/maestro/.env.maestro (gitignore 됨) 에서 읽는다.
# 이 스크립트 자체에는 자격증명을 넣지 않는다.
#
# 사용법:
#   bash e2e/maestro/run.sh                 # 비파괴 기본 suite (flows/)
#   bash e2e/maestro/run.sh flows/01-login.yaml   # 단일 flow
#   bash e2e/maestro/run.sh --catalog       # 기본 6개 + 카탈로그 flow + 갤러리 빌드
#   bash e2e/maestro/run.sh --catalog-full  # --catalog + find-password step2
#                                           # (⚠️ TEST_EMAIL 로 인증 메일 1통 발송,
#                                           #  이메일당 rate limit 3회/15분 중 1회 소모)
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${DIR}/.env.maestro"
SCREENSHOT_DIR="$(cd "${DIR}/.." && pwd)/screenshots/current"

if [[ ! -f "$ENV_FILE" ]]; then
  cat >&2 <<EOF
${ENV_FILE} 가 없습니다. 아래 형식으로 직접 만들어주세요 (git 에 커밋되지 않습니다):

  TEST_EMAIL=테스트계정@example.com
  TEST_PASSWORD=비밀번호
EOF
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
: "${TEST_EMAIL:?.env.maestro 에 TEST_EMAIL 이 없습니다}"
: "${TEST_PASSWORD:?.env.maestro 에 TEST_PASSWORD 가 없습니다}"

# flow 의 takeScreenshot 이 ${SCREENSHOT_DIR}/<screen>.png 로 저장한다.
mkdir -p "$SCREENSHOT_DIR"

cd "$DIR"

run_maestro() {
  # 기기가 여러 개 연결된 경우: MAESTRO_DEVICE=emulator-5554 bash e2e/maestro/run.sh
  maestro ${MAESTRO_DEVICE:+--device "$MAESTRO_DEVICE"} test "$1" \
    -e TEST_EMAIL="$TEST_EMAIL" -e TEST_PASSWORD="$TEST_PASSWORD" \
    -e SCREENSHOT_DIR="$SCREENSHOT_DIR"
}

MODE="${1:-flows}"

case "$MODE" in
  --catalog|--catalog-full)
    # 갤러리 산출물의 잔재(이름이 바뀐 옛 스크린샷)가 섞이지 않도록 비운다.
    rm -f "$SCREENSHOT_DIR"/*.png
    START_TS=$(date +%s)
    run_maestro flows
    run_maestro flows-catalog
    if [[ "$MODE" == "--catalog-full" ]]; then
      run_maestro flows-catalog-full
    fi
    END_TS=$(date +%s)
    echo "flow 실행 시간: $((END_TS - START_TS))초"
    GALLERY_PATH=$(node "${DIR}/../screenshots/build-gallery.mjs")
    echo "갤러리: ${GALLERY_PATH}"
    ;;
  *)
    run_maestro "$MODE"
    ;;
esac
