# KeepEat

식재료 소비기한 관리와 AI 맞춤 레시피 추천을 연결한 모바일 앱입니다. 2026.03-진행 중.

## 주요 화면

| 로그인 | 냉장고 홈 | OCR 영역 선택 | AI 레시피 생성 |
| --- | --- | --- | --- |
| <img src="docs/images/readme/auth-login.jpg" width="180" alt="로그인 화면" /> | <img src="docs/images/readme/fridge-home.jpg" width="180" alt="냉장고 홈 화면" /> | <img src="docs/images/readme/ocr-crop.jpg" width="180" alt="영수증 OCR 영역 선택 화면" /> | <img src="docs/images/readme/ai-recipe-ready.jpg" width="180" alt="AI 레시피 생성 결과 화면" /> |

## 식재료 등록과 소비기한 관리

| 추가 방식 선택 | 식재료 선택 | 수동 입력 | OCR 결과 확인 |
| --- | --- | --- | --- |
| <img src="docs/images/readme/ingredient-add-menu.jpg" width="180" alt="식재료 추가 방식 선택 화면" /> | <img src="docs/images/readme/ingredient-picker.jpg" width="180" alt="식재료 선택 화면" /> | <img src="docs/images/readme/ingredient-add-manual.jpg" width="180" alt="식재료 수동 등록 화면" /> | <img src="docs/images/readme/ocr-result-valid.jpg" width="180" alt="OCR 결과 확인 화면" /> |

| 검색 | 카테고리 필터 | 상세 수정 | 임박 알림 |
| --- | --- | --- | --- |
| <img src="docs/images/readme/fridge-search.jpg" width="180" alt="냉장고 검색 화면" /> | <img src="docs/images/readme/fridge-category-filter.jpg" width="180" alt="냉장고 카테고리 필터 화면" /> | <img src="docs/images/readme/ingredient-detail-edit.jpg" width="180" alt="식재료 상세 수정 화면" /> | <img src="docs/images/readme/expiry-notification.jpg" width="180" alt="소비기한 임박 알림 화면" /> |

## AI 레시피와 조리 흐름

| 추천 카드 | 조리법 확인 | 레시피 목록 | 레시피 상세 |
| --- | --- | --- | --- |
| <img src="docs/images/readme/ai-recipe-swipe.jpg" width="180" alt="AI 레시피 스와이프 화면" /> | <img src="docs/images/readme/ai-recipe-card-back.jpg" width="180" alt="AI 레시피 카드 조리법 화면" /> | <img src="docs/images/readme/recipe-list.jpg" width="180" alt="레시피 목록 화면" /> | <img src="docs/images/readme/recipe-detail.jpg" width="180" alt="레시피 상세 화면" /> |

| 레시피 필터 | 요리 준비 | 조리 단계 | 요리 완료 |
| --- | --- | --- | --- |
| <img src="docs/images/readme/recipe-filter.jpg" width="180" alt="레시피 필터 화면" /> | <img src="docs/images/readme/cooking-ready.jpg" width="180" alt="요리 준비 화면" /> | <img src="docs/images/readme/cooking-step.jpg" width="180" alt="조리 단계 화면" /> | <img src="docs/images/readme/cooking-complete.jpg" width="180" alt="요리 완료 화면" /> |

## 팀 구성

| 이름 | 담당 |
| --- | --- |
| 이선용 | 프론트엔드 단독: 화면·상태 설계, API 연동, 디자인 시스템, QA·검증 자동화 |
| 최한기 | 식재료 소비기한 |
| 김지성 | 알림·로그인 |
| 방경환 | AI 맞춤 레시피 |

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| 모바일 앱 | React Native, Expo |
| 언어 | TypeScript |
| 라우팅 | Expo Router |
| 상태 관리 | React Context, 화면 로컬 상태 |
| 네트워크 | REST API, Axios, multipart fetch |
| 저장소 | AsyncStorage, Expo SecureStore |
| 검증 | npm verify, Maestro |

## 프론트엔드 구현 범위

| 영역 | 내용 |
| --- | --- |
| 화면·상태 설계 | Expo Router 기반 탭/스택 화면 구성, 인증 게이트, 화면별 로컬 상태와 Context 조합 |
| API 연동 | 인증, 식재료, OCR, 레시피, 알림 API 래퍼와 DTO 매핑 |
| 식재료 등록 UX | 수동 입력, 영수증 OCR 결과 확인, 보관방법별 소비기한 제안, 직접 입력 재료 처리 |
| 냉장고 관리 | 소비기한 기준 정렬, 검색, 보관 방식 필터, 카테고리 필터, 상세 수정, 다중 삭제 |
| AI 레시피 | 추천 요청 상태, 완료 알림, 스와이프 저장, 레시피 상세와 조리 모드 연결 |
| 디자인 시스템 | 디자인 토큰과 공통 컴포넌트 기반 UI 일관성 관리 |
| QA·검증 | `npm run verify`, Maestro YAML 기반 핵심 플로우 검증 |

## 디자인 시스템과 공통 컴포넌트

| 경로 | 설명 |
| --- | --- |
| `constants/theme.ts` | 색상, 타이포그래피, 간격, radius, shadow, feedback, glass surface 토큰 |
| `components/` | 헤더, 모달, 바텀시트, 카드, 토스트, 입력 컴포넌트 등 공통 컴포넌트 27개 |
| `components/ConfirmModal.tsx` | 삭제, 취소, 탈퇴, 권한 안내 등 여러 화면에서 재사용하는 확인 모달 |
| `components/Toast.tsx` | `ToastProvider`와 `useToast()` 기반 전역 피드백 및 인앱 알림 드롭다운 |
| `components/RecipeFilterSheet.tsx` | 공용 레시피와 내 레시피 화면에서 공유하는 레시피 필터 바텀시트 |

## 상태 관리와 API 경계

전역 상태는 별도 상태 관리 라이브러리 없이 React Context 중심으로 구성했습니다. 인증, 알림, 식재료 마스터, AI 추천처럼 여러 화면에서 공유되는 상태는 Context로 분리하고, 검색어·필터·입력값처럼 화면에 종속된 상태는 로컬 state로 관리했습니다.

| Context | 역할 |
| --- | --- |
| `AuthContext` | 로그인 상태, 사용자 정보, 토큰 기반 부팅 복구 |
| `NotificationContext` | 알림 목록, 읽음 처리, unread count, 푸시 탭 라우팅 |
| `IngredientMasterContext` | 서버·캐시·로컬 seed 기반 식재료 마스터 데이터 |
| `RecipeRecommendationContext` | AI 추천 요청 상태, 추천 결과, 스와이프 저장 상태 |

API 통신은 `services/` 계층에 모아 화면 컴포넌트가 서버 DTO에 직접 의존하지 않도록 분리했습니다.

## AI 작업 컨텍스트와 검증

AI 코딩 도구가 필요한 맥락만 참조할 수 있도록 `AGENTS.md`를 진입점으로 두고, 도메인 규칙·사용자 흐름·프론트엔드 공통 규칙·검증 문서를 `docs/` 아래에 계층화했습니다.

| 경로 | 설명 |
| --- | --- |
| `AGENTS.md` | AI 작업 규칙 진입점 |
| `ARCHITECTURE.md` | 앱 구조, 라우팅, Provider, API 경계 요약 |
| `docs/` | 계층화 문서 17개 |
| `docs/frontend/design-system.md` | 디자인 토큰과 공통 UI 규칙 |
| `docs/quality/verification.md` | 정적 검증과 수동 확인 시나리오 |
| `.maestro/login.yaml` | 로그인 검증 플로우 |
| `.maestro/ingredient-add-manual.yaml` | 식재료 수동 추가 검증 플로우 |
| `.maestro/cooking-flow.yaml` | 조리 플로우 검증 YAML |

## 핵심 경로

| 경로 | 설명 |
| --- | --- |
| `app/` | Expo Router 기반 화면 라우트 |
| `app/(tabs)/index.tsx` | 냉장고 홈 |
| `app/(tabs)/explore.tsx` | 공용 레시피 탐색 |
| `app/(tabs)/recipe.tsx` | 내 레시피 |
| `app/add-confirm.tsx` | 식재료 등록 확인 |
| `app/crop.tsx` | 영수증 OCR 영역 선택 |
| `app/recipe-swipe.tsx` | AI 추천 레시피 스와이프 |
| `app/cooking-ready.tsx`, `app/cooking-step.tsx`, `app/cooking-complete.tsx` | 조리 모드 |
| `context/` | 인증, 알림, 식재료 마스터, AI 추천 Context |
| `services/` | API 클라이언트와 도메인별 서비스 래퍼 |

## 브랜치 안내

프론트엔드는 `front` 브랜치에서 개발 중인 진행 중 프로젝트입니다.
