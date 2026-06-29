# KeepEat 에이전트 지식 베이스

이 파일은 Codex가 KeepEat 기능 작업을 시작할 때 읽는 짧은 지도입니다. 상세 내용은 `docs/` 아래 문서로 분리되어 있습니다.

## 작업 시작 규칙

- 작업 전 `ARCHITECTURE.md`와 해당 작업의 관련 문서를 먼저 읽는다.
- 코드, 문서, API 계약이 충돌하면 현재 코드와 실제 실행 결과를 우선 확인한다.
- 확인되지 않은 내용은 추측하지 않고 `TODO` 또는 `확인 필요`로 남긴다.
- 코드 변경 후 최소 정적 검증은 `npm run verify`로 실행한다.

## 먼저 읽을 문서

1. 전체 구조 파악: `ARCHITECTURE.md`
2. 문서 색인: `docs/index.md`
3. 작업 도메인별 세부 문서:
   - 식재료/냉장고: `docs/product/ingredient.md`
   - 레시피/요리: `docs/product/recipe.md`
   - 인증/계정: `docs/product/auth.md`
   - 알림/푸시: `docs/product/notification.md`
4. 화면 흐름별 세부 문서:
   - 식재료 등록: `docs/flows/ingredient-registration.md`
   - OCR: `docs/flows/ocr-flow.md`
   - AI 레시피 추천: `docs/flows/recipe-recommendation.md`
5. 프론트엔드 작업 공통:
   - 라우팅: `docs/frontend/navigation.md`
   - 상태 관리: `docs/frontend/state-management.md`
   - API 계약: `docs/frontend/api-contracts.md`
   - 디자인 시스템: `docs/frontend/design-system.md`
6. 검증/테스트:
   - 검증 절차: `docs/quality/verification.md`
   - 테스트 식별자: `docs/quality/test-ids.md`
7. 결정 기록:
   - `docs/decisions/README.md`

## 작업별 빠른 길찾기

| 작업 | 우선 문서 |
| --- | --- |
| 새 화면/라우트 추가 | `ARCHITECTURE.md`, `docs/frontend/navigation.md` |
| 냉장고 목록, 검색, 삭제, 상세 수정 | `docs/product/ingredient.md`, `docs/frontend/api-contracts.md` |
| 식재료 추가 또는 OCR 수정 | `docs/flows/ingredient-registration.md`, `docs/flows/ocr-flow.md` |
| 레시피 목록, 상세, 내 레시피, 조리 모드 | `docs/product/recipe.md`, `docs/frontend/navigation.md` |
| AI 추천/스와이프 저장 | `docs/flows/recipe-recommendation.md`, `docs/frontend/state-management.md` |
| 로그인, 회원가입, 구글 OAuth, 탈퇴 | `docs/product/auth.md`, `docs/frontend/api-contracts.md` |
| 알림함, 배지, 푸시 탭 라우팅 | `docs/product/notification.md`, `docs/frontend/state-management.md` |
| UI 토큰/컴포넌트 스타일 | `docs/frontend/design-system.md` |
| 린트/타입체크/수동 검증 | `docs/quality/verification.md` |

## 에이전트 작성 원칙

- 코드 변경 전 현재 파일과 관련 문서를 다시 확인한다. 이 문서는 1차 뼈대이며 오래될 수 있다.
- 확인되지 않은 API DTO, 비즈니스 규칙, 화면 동작은 추측하지 않고 `TODO` 또는 `확인 필요`로 남긴다.
- 기존 코드의 패턴을 우선한다: Expo Router, React Context, `services/` API 래퍼, `constants/theme.ts`.
- 큰 설명을 `AGENTS.md`에 추가하지 않는다. 상세 내용은 관련 `docs/` 문서에 넣는다.
- 코드 동작, API 계약, 사용자 플로우가 바뀌면 관련 문서도 같은 작업에서 갱신한다.
