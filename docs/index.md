# KeepEat 문서 색인

이 디렉터리는 Codex가 기능 작업 전에 필요한 정보를 단계적으로 찾아 읽도록 만든 지식 베이스다. 현재 코드에서 확인한 사실만 기록하고, 확인되지 않은 정책은 각 문서의 `TODO / 확인 필요`에 둔다.

## 최상위 문서

| 문서 | 목적 | 언제 읽나 |
| --- | --- | --- |
| `../AGENTS.md` | 에이전트용 짧은 진입점과 작업별 길찾기 | 새 작업 시작 시 항상 |
| `../ARCHITECTURE.md` | 현재 앱 구조, 주요 디렉터리, 라우팅, 상태, API 위치 요약 | 코드 탐색 전후 전체 맥락이 필요할 때 |

## Product

| 문서 | 목적 | 언제 읽나 |
| --- | --- | --- |
| `product/ingredient.md` | 냉장고 식재료 도메인, 등록/수정/삭제, 마스터 카탈로그 | 식재료, 냉장고, 보관/유통기한 작업 |
| `product/recipe.md` | 공용 레시피, 내 레시피, AI 추천, 조리 모드 | 레시피 목록/상세/요리 플로우 작업 |
| `product/auth.md` | 로그인, 회원가입, 토큰, 구글 OAuth, 계정 관리 | 인증/계정/마이페이지 작업 |
| `product/notification.md` | 알림함, 푸시 토큰, 알림 타입별 라우팅 | 푸시, 배지, 알림 목록/읽음 처리 작업 |

## Flows

| 문서 | 목적 | 언제 읽나 |
| --- | --- | --- |
| `flows/ingredient-registration.md` | 수동/갤러리/카메라 식재료 등록 흐름 | 추가 FAB, 등록 확인 화면 작업 |
| `flows/ocr-flow.md` | 이미지 crop, OCR 업로드, 후보 매핑, 에러 처리 | OCR, 영수증 인식, 이미지 전처리 작업 |
| `flows/recipe-recommendation.md` | AI 추천 요청, 완료 알림, 스와이프 저장 | AI 추천/스와이프 화면 작업 |

## Frontend

| 문서 | 목적 | 언제 읽나 |
| --- | --- | --- |
| `frontend/navigation.md` | Expo Router 구조, route params, 이동 규칙 | 화면 추가/이동/딥링크 작업 |
| `frontend/state-management.md` | Context, 로컬 상태, 저장소 사용 위치 | 상태 흐름 변경 작업 |
| `frontend/api-contracts.md` | 서비스 모듈과 현재 코드상 API 계약 | API 연동/DTO 변경 작업 |
| `frontend/environment-configuration.md` | local/demo/prod 실행, API URL, OAuth callback, EAS 설정 | 환경변수, 앱 variant, 빌드/배포 설정 작업 |
| `frontend/design-system.md` | 디자인 토큰과 현재 UI 규칙 위치 | UI 구현/리디자인 작업 |

## Decisions

| 문서 | 목적 | 언제 읽나 |
| --- | --- | --- |
| `decisions/README.md` | ADR 작성 위치와 템플릿 | 구조적 결정 또는 정책 변경을 남길 때 |

## Quality

| 문서 | 목적 | 언제 읽나 |
| --- | --- | --- |
| `quality/verification.md` | 현재 검증 명령과 수동 확인 시나리오 | 작업 완료 전 검증 계획 작성 시 |
| `quality/test-ids.md` | 테스트 식별자 현황과 제안 규칙 | E2E/컴포넌트 테스트 안정화 작업 |
