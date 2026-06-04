# KeepEat — Frontend

냉장고 속 식재료를 관리하고, AI가 추천하는 레시피로 식재료를 알뜰하게 소비할 수 있게 돕는 모바일 앱.

React Native + Expo로 만든 iOS / Android 크로스플랫폼 앱.

## 기술 스택

- **런타임**: Expo SDK 54, React Native 0.81, React 19
- **언어**: TypeScript 5.9
- **라우팅**: [expo-router](https://docs.expo.dev/router/introduction) 6 (file-based)
- **상태**: React Context (인증 / 알림 / 레시피 추천)
- **애니메이션**: react-native-reanimated 4, react-native-gesture-handler
- **네트워크**: axios
- **스토리지**: AsyncStorage, expo-secure-store
- **푸시**: expo-notifications

## 디렉토리 구조

```
app/                  expo-router 라우트 (file-based)
  (tabs)/             탭 그룹
    index.tsx         냉장고 (홈)
    explore.tsx       레시피 (공용 검색)
    add.tsx           식재료 추가 진입
    recipe.tsx        내 레시피
    mypage.tsx        마이페이지
  recipe-swipe.tsx    AI 추천 스와이프
  recipe-detail.tsx   레시피 상세
  cooking-*.tsx       조리 모드 (ready/step/complete)
  login.tsx           로그인
  signup*.tsx         회원가입
  _layout.tsx         루트 스택

components/           재사용 UI
constants/            theme, domain 타입
context/              AuthContext, NotificationContext, RecipeRecommendationContext
services/             API 클라이언트, recipes/ingredients/notifications/auth
utils/                날짜 포맷, 라우팅 헬퍼 등
hooks/                커스텀 훅
mocks/                개발용 목 데이터
assets/               아이콘 / 스플래시 이미지
```

## 시작하기

### 1. 의존성 설치
```bash
npm install
```

### 2. 개발 빌드 실행

Expo Go에선 동작하지 않는 네이티브 모듈(expo-notifications, expo-haptics, gesture-handler 등)을 쓰므로 **dev-client 빌드 필요**.

```bash
# iOS 시뮬레이터
npm run ios

# 안드로이드 에뮬레이터 또는 연결된 기기
npm run android
```

처음 한 번은 네이티브 빌드가 돌아 몇 분 걸린다. 이후엔 JS 변경만 hot reload.

### 3. Metro 단독 실행 (네이티브 빌드 이미 설치된 경우)
```bash
npm start
```

## 주요 스크립트

| 명령 | 설명 |
|---|---|
| `npm start` | Metro 번들러 시작 |
| `npm run ios` | iOS 시뮬레이터 빌드 + 실행 |
| `npm run android` | 안드로이드 빌드 + 실행 |
| `npm run lint` | expo-lint (eslint-config-expo) |

## 빌드 / 배포

### 네이티브 폴더 재생성 (app.json 변경 후)
```bash
npx expo prebuild --clean --platform android
npx expo prebuild --clean --platform ios
```

### 릴리스 빌드 (Android)
```bash
cd android && ./gradlew assembleRelease
```

`android/app/build/outputs/apk/release/`에 APK 생성.

### EAS Build
`eas.json` 설정 기준. EAS 프로젝트 ID는 `app.json`의 `extra.eas.projectId`.

```bash
eas build --platform android
eas build --platform ios
```

## 라우팅 규칙

- 파일 기반 라우팅. `app/` 아래 파일이 그대로 라우트가 됨.
- 탭 그룹: `app/(tabs)/` — URL 경로엔 `(tabs)` 표기 안 들어감.
- 탭 외 화면(예: recipe-swipe): 루트 `app/` 직속, 모달/풀스크린 push 용도.
- 명시적 탭 이동은 `/(tabs)/recipe` 같이 그룹 prefix로.

## 푸시 / 알림

- 백엔드가 EXPIRY_SOON / RECIPE_READY / NOTICE 3종 푸시 송신.
- 포어그라운드: OS 배너 표시 정책을 `RecipeRecommendationContext.setNotificationHandler`에서 타입별 분기. RECIPE_READY는 인앱 토스트로 대체.
- 탭 라우팅: `utils/notificationRouting.ts` — type → path 매핑 단일 소스.

## 디자인 시스템

색상, 타이포, 간격, 그림자 등 토큰은 `constants/theme.ts`. 디자인 가이드와 컴포넌트 패턴은 [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) 참고.

## 환경 / 비밀값

- `google-services.json` — Android FCM 설정 (커밋 주의).
- API base URL 및 환경별 분기는 `services/api.ts` 참고.

## 트러블슈팅

- **네이티브 모듈이 인식 안 됨**: `npx expo prebuild --clean` 후 다시 `npm run ios/android`.
- **iOS Pods 깨짐**: `cd ios && pod install`.
- **Android 빌드 실패**: `cd android && ./gradlew clean` 후 재빌드.
- **타입 라우트 캐시 꼬임**: `.expo/types/router.d.ts` 삭제 후 `npm start`로 재생성.

## 브랜치

- `dev` — 통합 브랜치 (PR 기본 target)
- `feature/FE/*` — 기능 단위 작업 브랜치
