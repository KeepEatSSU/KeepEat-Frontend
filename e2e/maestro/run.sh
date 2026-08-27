#!/usr/bin/env bash
# Maestro suite 실행 헬퍼.
# 자격증명은 e2e/maestro/.env.maestro (gitignore 됨) 에서 읽는다.
# 이 스크립트 자체에는 자격증명을 넣지 않는다.
#
# 사용법:
#   bash e2e/maestro/run.sh                # 비파괴 기본 suite (flows/)
#   bash e2e/maestro/run.sh flows/01-login.yaml   # 단일 flow
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${DIR}/.env.maestro"

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

TARGET="${1:-flows}"
cd "$DIR"
# 기기가 여러 개 연결된 경우: MAESTRO_DEVICE=emulator-5554 bash e2e/maestro/run.sh
exec maestro ${MAESTRO_DEVICE:+--device "$MAESTRO_DEVICE"} test "$TARGET" \
  -e TEST_EMAIL="$TEST_EMAIL" -e TEST_PASSWORD="$TEST_PASSWORD"
