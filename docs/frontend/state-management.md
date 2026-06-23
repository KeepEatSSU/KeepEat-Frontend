# 상태 관리

## 현재 원칙

현재 프로젝트는 React Context와 화면 로컬 상태를 사용한다. Redux, Zustand, React Query는 확인되지 않았다.

전역 상태는 `context/`에 있고, 화면 단위 비동기 데이터와 UI 상태는 각 `app/*.tsx` 화면의 `useState`, `useEffect`, `useFocusEffect`로 관리한다.

## Context 목록

| Context | 파일 | 역할 |
| --- | --- | --- |
| `AuthContext` | `context/AuthContext.tsx` | 사용자, 인증 여부, 로그인/회원가입/로그아웃/탈퇴 |
| `NotificationContext` | `context/NotificationContext.tsx` | 알림 목록, unread count, 읽음/삭제, push listener |
| `IngredientMasterContext` | `context/IngredientMasterContext.tsx` | 식재료 마스터 snapshot, 로딩/에러 상태 |
| `RecipeRecommendationContext` | `context/RecipeRecommendationContext.tsx` | AI 추천 요청/결과/스와이프 상태와 캐시 |
| `ToastContext` | `components/Toast.tsx` | toast와 인앱 알림 드롭다운 |

## 저장소 사용

SecureStore:

- `services/tokenStorage.ts`: access token, refresh token

AsyncStorage:

- `context/RecipeRecommendationContext.tsx`: 최근 AI 추천 결과, 24시간 TTL
- `services/ingredientMaster.ts`: 식재료 마스터 snapshot과 ETag
- `services/recentIngredients.ts`: 식재료 선택기 최근 검색
- `components/PushPermissionPrompt.tsx`: push 권한 사전 안내를 이미 보여줬는지 여부

In-memory handoff:

- `services/ocr.ts`의 `ocrPending`: crop 화면에서 add-confirm 화면으로 OCR 후보를 넘긴다. 프로세스 재시작을 견디지 않는다.

## 화면 로컬 상태 패턴

확인된 패턴:

- 탭 화면은 `useFocusEffect`로 focus 시 데이터를 다시 불러온다.
- 삭제/반응 같은 즉시 피드백은 optimistic update 후 실패 시 rollback한다.
- 검색은 화면별 로컬 상태와 debounce를 사용한다.
- 바텀시트/모달 visible 상태는 각 화면 또는 컴포넌트 로컬 상태로 관리한다.

예시:

- 냉장고 홈: `ingredients`, `searchResults`, filter/search/select mode 상태.
- 내 레시피: `recipes`, search/filter/sort/selection 상태.
- 알림 팝업: 확장/선택/삭제 확인 상태.
- 레시피 상세: 상세 DTO, 인분, 추가 모달 draft 상태.

## 서버 상태 캐싱

공식 서버 상태 캐시 라이브러리는 없다. 확인된 캐시:

- 식재료 마스터: ETag와 AsyncStorage 캐시.
- AI 추천 결과: AsyncStorage 24시간 TTL.
- 최근 식재료 검색: AsyncStorage LRU.

일반 목록 데이터는 focus 시 refetch하는 방식이다.

## TODO / 확인 필요

- 서버 상태 라이브러리 도입 계획.
- 목록별 stale time, refetch 정책의 제품 기준.
- optimistic update 실패 후 재동기화 표준 규칙.
- `IngredientMasterContext` 전환 완료 여부와 `constants/ingredients-master.ts` 직접 사용 잔여 위치.
