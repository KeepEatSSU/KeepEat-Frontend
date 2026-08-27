# API 스모크 테스트 (층 1)

curl 기반의 비파괴 API 회귀 검증. 로그인 → 토큰 확보 → 읽기/멱등 API 순회 후
status code 만 대조한다. **응답 body 는 출력하지 않는다** (토큰/개인정보 로그 방지).

## 실행법

자격증명은 파일에 저장하지 말고 실행하는 셸에서 직접 export 한다:

```bash
export TEST_EMAIL='테스트계정@example.com'
export TEST_PASSWORD='비밀번호'
BASE_URL=https://www.141.147.155.197.nip.io bash e2e/api-smoke/smoke.sh
```

| 환경변수 | 설명 |
| --- | --- |
| `BASE_URL` | 대상 서버 origin (경로 없이). demo: `.env` 의 `EXPO_PUBLIC_API_URL_DEMO` 값 |
| `TEST_EMAIL` | 이메일 가입(LOCAL) 테스트 계정 |
| `TEST_PASSWORD` | 테스트 계정 비밀번호 |

성공 시 exit 0, 하나라도 기대 status 와 다르면 빨간 FAIL 출력 후 exit 1.

## 검증 항목

| 호출 | 기대 status |
| --- | --- |
| `POST /api/users/login` | 200 |
| `GET /api/users/me` | 200 |
| `GET /api/v1/user-ingredients` | 200, 204(빈 목록) |
| `GET /api/v1/user-ingredients/search?q=a` | 200, 204 |
| `GET /api/v1/ingredients/master` | 200 |
| `GET /api/notifications` | 200 |
| `GET /api/notifications/unread-count` | 200 |
| `GET /api/v1/my-recipes` | 200 |
| `GET /api/v1/recipes` | 200 |
| `GET /api/v1/recipes/result` | 200, 404(생성 이력 없음), 409(생성 중) |
| `PATCH /api/users/me/notification-setting` | 200 — `/me` 의 현재 값을 그대로 재전송 (무해) |

## 의도적으로 호출하지 않는 것

스크립트 상단 주석에도 동일하게 명시되어 있다:

- **password 계열 / send / verify** — 메일 발송 + rate limit 소모
- **`POST /api/v1/recipes/generate`** — AI 생성 1일 1회 제한 소모
- **logout / logout-all** — refresh 토큰 무효화로 실기기 앱 세션 파괴
- **refresh (rotation 검증)** — 회전된 토큰이 앱에 저장된 세션과 경쟁
- **탈퇴 (`DELETE /api/users/me`)** — 파괴적
- **OCR** — 파일 필요 + 외부 API 비용
- **reaction / cook** — 데이터 변형

## 주의

- 로그인 rate limit: IP+이메일 기준 15분당 10회. 반복 실행 시 429 가 나면 기다릴 것.
- 스크립트는 로그인 1회만 수행하므로 suite 1회 실행은 안전하다.
