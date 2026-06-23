# Navigation

## 라우팅 방식

KeepEat은 `expo-router` 파일 기반 라우팅을 사용한다. `app/` 아래 파일이 route가 되고, `app/(tabs)/`는 URL에 표시되지 않는 탭 그룹이다.

루트 layout:

- `app/_layout.tsx`: Stack과 인증 게이트
- `app/(tabs)/_layout.tsx`: 하단 Tabs와 중앙 FAB sheet

## 인증 게이트

`app/_layout.tsx`의 `AuthGate`:

- `isLoading` 중에는 native splash를 유지하고 children을 렌더하지 않는다.
- 비로그인 상태에서 auth route가 아니면 `/login`으로 replace한다.
- 로그인 상태에서 auth route면 `/(tabs)`로 replace한다.

auth route로 확인된 segment:

- `login`
- `signup`
- `signup-profile`

## 탭 라우트

| 파일 | route | 역할 |
| --- | --- | --- |
| `app/(tabs)/index.tsx` | `/` 또는 `/(tabs)` | 냉장고 |
| `app/(tabs)/explore.tsx` | `/(tabs)/explore` | 공용 레시피 |
| `app/(tabs)/add.tsx` | `/(tabs)/add` | 중앙 FAB placeholder |
| `app/(tabs)/recipe.tsx` | `/(tabs)/recipe` | 내 레시피 |
| `app/(tabs)/mypage.tsx` | `/(tabs)/mypage` | 마이페이지 |

중앙 FAB는 실제로 `add` 화면으로 이동하지 않고 `AddMenuSheet`를 연다.

## 주요 스택 라우트와 파라미터

| route | 파일 | params | 확인된 진입 |
| --- | --- | --- | --- |
| `/login` | `app/login.tsx` | 없음 | 비인증 gate, 로그아웃 후 |
| `/signup` | `app/signup.tsx` | 없음 | 로그인 화면 |
| `/signup-profile` | `app/signup-profile.tsx` | `email?: string` | 이메일 인증 성공 |
| `/change-password` | `app/change-password.tsx` | 없음 | 마이페이지 |
| `/detail` | `app/detail.tsx` | `id: string` | 냉장고 식재료 카드 |
| `/crop` | `app/crop.tsx` | `uri: string` | 갤러리/카메라 선택 후 |
| `/add-confirm` | `app/add-confirm.tsx` | `mode?: string` | OCR 후 또는 `mode=manual` |
| `/recipe-detail` | `app/recipe-detail.tsx` | `id: string` | 공용/내 레시피 카드 |
| `/recipe-swipe` | `app/recipe-swipe.tsx` | 없음 | AI 추천 완료/알림 |
| `/cooking-ready` | `app/cooking-ready.tsx` | `id: string`, `servings?: string` | 레시피 상세 |
| `/cooking-step` | `app/cooking-step.tsx` | `id: string` | 조리 준비 |
| `/cooking-complete` | `app/cooking-complete.tsx` | `id: string` | 상세 shortcut 또는 마지막 조리 단계 |

## 알림 라우팅

`utils/notificationRouting.ts` 기준:

- `expiry_soon` -> `/`
- `recipe_ready` -> `/recipe-swipe`
- `notice` -> route 없음

알림 라우팅은 `NotificationContext`와 `NotificationPopup`에서 같은 결정 함수를 공유한다.

## 화면 전환 특이점

- `detail`, `crop`, `add-confirm`, `cooking-ready`는 루트 stack에서 fullScreenModal 또는 하단 slide animation으로 설정되어 있다.
- `recipe-swipe`는 card presentation이며 gesture가 꺼져 있다.
- `recipe-swipe` 완료/나가기/재시도는 `router.replace("/(tabs)/recipe")`를 사용한다.
- `cooking-step` 마지막 단계는 `router.dismissAll()` 후 `/cooking-complete`로 push한다.
- `add-confirm` 성공 시 navigation stack을 `(tabs)`로 reset한다.

## TODO / 확인 필요

- 딥링크 URL 정책. `app.json` scheme은 `keepeat`로 설정되어 있다.
- `targetId`가 있는 알림의 상세 라우팅 정책.
- `app/(tabs)/add.tsx` placeholder 유지 이유와 향후 처리.
- auth route 목록에 `change-password`를 포함하지 않는 것이 의도인지 확인.
