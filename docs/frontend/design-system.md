# Design System

## 현재 소스

디자인 시스템의 실제 소스는 두 곳이다.

- `constants/theme.ts`: 앱에서 import하는 색상, 타이포, radius, spacing, shadow 토큰.
- `DESIGN_SYSTEM.md`: "The Digital Curator" 디자인 방향과 규칙.

UI 작업 전에는 이 문서를 읽은 뒤, 세부 토큰은 `constants/theme.ts`, 디자인 철학은 `DESIGN_SYSTEM.md`를 확인한다.

## 확인된 토큰 구조

`constants/theme.ts`:

- `Colors`
- `PrimaryGradient`
- `Fonts`
- `FontSize`
- `FontWeight`
- `LetterSpacing`
- `Shadows`
- `GhostBorder`
- `Glass`
- `Radius`
- `Spacing`
- `StatusGlow`
- `PillTokens`

주요 색상 방향:

- primary: `#006D37`
- primaryContainer: `#2ECC71`
- surface 계열: `#F8F9FA`, `#FFFFFF`, `#F3F4F5` 등
- error: `#BA1A1A`

## 컴포넌트 위치

공용 UI는 `components/`에 있다.

확인된 주요 컴포넌트:

- 헤더: `AppHeaderLogo`, `AppHeaderRight`, `AppSearchChipsHeader`
- 알림: `NotificationBell`, `NotificationPopup`, `PushPermissionPrompt`
- 모달: `ConfirmModal`, `InfoModal`, `FindPasswordModal`, `DeletePasswordModal`
- 시트: `AddMenuSheet`, `RecipeFilterSheet`, `RecipeSortSheet`, `FridgeCategorySheet`, `IngredientPickerSheet`
- 카드/입력: `RecipeListCard`, `IngredientEditCard`, `CapacityInput`, `ExpandableDatePicker`, `QuickExpiryPicker`
- 피드백: `Toast`, `ErrorScreen`

## 확인된 UI 규칙

`DESIGN_SYSTEM.md`와 코드 주석에서 확인:

- 단순 구분선보다 배경 레이어와 여백을 우선한다.
- primary CTA는 초록 계열 gradient를 사용한다.
- floating/tab bar 계열은 glassmorphism 방향을 사용한다.
- 순수 검정 대신 `Colors.onSurface`를 사용한다.
- 카드/칩/바텀시트는 `constants/theme.ts`의 radius/spacing/shadow 토큰을 따른다.

예외:

- checkbox affordance 같은 일부 UI는 의도적으로 border를 사용한다는 코드 주석이 있다.

## 아이콘

현재 앱은 `@expo/vector-icons`의 `Ionicons` 사용이 많이 확인된다. 새 아이콘도 기존 화면 패턴과 맞춰 우선 `Ionicons`를 검토한다.

## TODO / 확인 필요

- 실제 font asset 로딩 위치와 Plus Jakarta Sans/Manrope 적용 완료 여부.
- 디자인 시스템 문서와 현재 구현이 어긋난 부분 목록.
- 컴포넌트별 variant 규격.
- 다크 모드 지원 범위. `app.json`은 `userInterfaceStyle: automatic`이지만 코드의 다크 토큰 정책은 확인 필요.
