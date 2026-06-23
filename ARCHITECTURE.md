# KeepEat 프론트엔드 아키텍처

이 문서는 현재 코드 기준의 앱 구조를 정리한다. 확인되지 않은 정책은 추측하지 않고 `확인 필요`로 남긴다.

## 앱 개요

- 프로젝트명: `keepeat_front`
- 앱 이름: `KeepEat`
- 런타임: Expo SDK 54, React Native 0.81, React 19
- 언어: TypeScript strict 모드
- 라우팅: `expo-router` 파일 기반 라우팅
- 네트워크: `axios` 기반 공용 클라이언트와 일부 `fetch` 직접 호출
- 상태 관리: React Context와 화면 로컬 상태
- 저장소: `expo-secure-store`, `AsyncStorage`
- 푸시: `expo-notifications`

## 주요 디렉터리

| 경로 | 역할 |
| --- | --- |
| `app/` | Expo Router 라우트. 루트 스택과 탭 화면, 상세/모달 화면이 위치한다. |
| `app/(tabs)/` | 하단 탭 그룹. 냉장고, 공용 레시피, 추가 FAB, 내 레시피, 마이페이지를 포함한다. |
| `components/` | 공용 UI 컴포넌트. 헤더, 모달, 바텀시트, 카드, 토스트, 입력 컴포넌트가 있다. |
| `context/` | 앱 전역 상태. 인증, 알림, 식재료 마스터, AI 레시피 추천 컨텍스트가 있다. |
| `services/` | API 클라이언트와 도메인별 서비스 래퍼. DTO 매핑도 대부분 여기서 처리한다. |
| `constants/` | 런타임 설정, 도메인 타입, 디자인 토큰, 필터, 식재료 마스터 seed. |
| `utils/` | 날짜 유틸, 알림 라우팅, 레시피 인분 계산 등 순수 헬퍼. |
| `hooks/` | 공용 커스텀 훅. 현재 `useSheetGesture.ts`가 있다. |
| `mocks/` | 개발용 목 데이터. 일부는 현재 미사용 상태로 남아 있다. |
| `assets/` | 이미지와 식재료 아이콘. |
| `ios/`, `android/` | Expo prebuild/native 프로젝트 산출물. |

## 앱 진입점과 Provider 구성

`package.json`의 `main`은 `expo-router/entry`다.

루트 레이아웃은 `app/_layout.tsx`이며 다음 역할을 한다.

- `GestureHandlerRootView`, `KeyboardProvider`, `PortalProvider`, `ToastProvider`를 앱 루트에 설치한다.
- `AuthProvider` 아래에 인증 게이트를 둔다.
- `NotificationProvider`, `RecipeRecommendationProvider`, `IngredientMasterProvider`를 조합한다.
- 앱 부팅 시 `registerForPushNotificationsAsync()`를 호출해 이미 권한이 있는 경우 Expo push token을 발급한다.
- Android navigation bar 색상을 설정한다.
- `AuthGate`에서 인증 상태에 따라 `/login` 또는 `/(tabs)`로 리다이렉트한다.

Provider 순서에서 확인된 제약:

- `RecipeRecommendationProvider`는 `useToast()`를 사용하므로 `ToastProvider` 안쪽에 있어야 한다.
- `IngredientMasterProvider`는 인증 이후 마스터 데이터를 로드하므로 `AuthGate` 안쪽에 있다.

## 라우팅 구조

라우팅은 `app/` 파일 구조를 따른다.

루트 스택 화면:

- `(tabs)`
- `login`
- `signup`
- `signup-profile`
- `change-password`
- `detail`
- `crop`
- `add-confirm`
- `recipe-detail`
- `recipe-swipe`
- `cooking-ready`
- `cooking-step`
- `cooking-complete`

탭 화면:

- `app/(tabs)/index.tsx`: 냉장고 홈
- `app/(tabs)/explore.tsx`: 공용 레시피 검색/탐색
- `app/(tabs)/add.tsx`: 중앙 FAB용 더미 탭
- `app/(tabs)/recipe.tsx`: 내 레시피
- `app/(tabs)/mypage.tsx`: 마이페이지

상세 라우팅과 파라미터는 `docs/frontend/navigation.md`에 정리한다.

## 상태 관리

전역 상태는 React Context 기반이다.

- `AuthContext`: 사용자, 인증 여부, 로그인/회원가입/로그아웃/탈퇴, 토큰 기반 부팅 복구.
- `NotificationContext`: 알림 목록, 읽음 처리, 삭제, unread count, 푸시 수신/탭 라우팅.
- `IngredientMasterContext`: 서버/캐시/로컬 seed 기반 식재료 마스터 snapshot.
- `RecipeRecommendationContext`: AI 추천 요청 상태, 추천 결과, 스와이프 저장 상태, 24시간 AsyncStorage 캐시.
- `ToastProvider`: 토스트와 인앱 알림 드롭다운 표시.

Redux, Zustand, React Query 같은 외부 상태 관리 도구는 현재 사용하지 않는다.

## API 통신 위치

공용 설정:

- `constants/config.ts`: `API_BASE_URL`, `API_TIMEOUT_MS`, 인증 엔드포인트, `DEV_BYPASS_AUTH`.
- `services/tokenStorage.ts`: access/refresh token을 `expo-secure-store`에 저장.
- `services/api.ts`: axios 인스턴스, Bearer 토큰 자동 첨부, 401 refresh/retry, 로그아웃 이벤트, 인증 helper.

도메인별 서비스:

- `services/userIngredients.ts`: 냉장고 식재료 CRUD, 검색, 레시피별 보유 재료 조회.
- `services/ingredientMaster.ts`: 식재료 마스터 조회, ETag, AsyncStorage 캐시, seed fallback.
- `services/ocr.ts`: 이미지 전처리와 OCR 업로드. multipart 특성 때문에 `fetch`를 직접 사용한다.
- `services/recipes.ts`: AI 생성, 레시피 저장/검색/상세/반응/조리 완료/내 레시피.
- `services/notifications.ts`: 알림 목록, 읽음, 삭제, push token 등록/삭제, unread count.
- `services/pushNotifications.ts`: Expo push token 발급과 서버 동기화 래퍼.
- `services/googleAuth.ts`: 백엔드 Google OAuth 세션 시작과 deep link token 파싱.
- `services/recentIngredients.ts`: 식재료 선택기 최근 검색 AsyncStorage 캐시.

## UI와 디자인 시스템

- 실제 토큰은 `constants/theme.ts`에 있다.
- 디자인 방향 문서는 루트 `DESIGN_SYSTEM.md`에 있다.
- 공용 컴포넌트는 `components/`에 있으며, 카드/시트/모달/헤더/토스트/입력 계열로 나뉜다.
- 디자인 세부 참고는 `docs/frontend/design-system.md`를 먼저 읽고 필요 시 `DESIGN_SYSTEM.md`를 확인한다.

## 검증과 테스트 상태

- `package.json`에 확인된 스크립트: `npm start`, `npm run ios`, `npm run android`, `npm run web`, `npm run lint`.
- 테스트 스크립트는 현재 확인되지 않았다.
- `app/`, `components/`에서 `testID` 사용은 확인되지 않았다.
- 접근성 라벨과 역할은 일부 컴포넌트/화면에 존재한다.

## 확인 필요

- 백엔드 API의 최신 Swagger/OpenAPI 문서 위치.
- 배포 환경별 API base URL 관리 방식.
- 자동 테스트 도구 도입 여부.
- 현재 `services/ingredientMaster.ts` 주석의 Stage 1/Stage 2 전환이 완료됐는지 여부. 일부 화면은 `IngredientMasterContext`를 사용하지만 주석은 전환 중이라고 설명한다.
- 푸시 알림 `targetId` 기반 상세 이동 정책.
