# 테스트 식별자

## 현재 상태

`app/`, `components/`에서 `testID` 사용은 확인되지 않았다.

확인 명령:

```bash
rg -n "testID|accessibilityLabel|accessibilityRole" app components -g "*.tsx"
```

결과:

- `testID`: 확인되지 않음.
- `accessibilityLabel`, `accessibilityRole`: 일부 화면과 컴포넌트에 존재함.

## 접근성 라벨이 확인된 예

- 날짜 선택: `components/ExpandableDatePicker.tsx`
- 용량 입력: `components/CapacityInput.tsx`
- 알림 벨/팝업: `components/NotificationBell.tsx`, `components/NotificationPopup.tsx`
- 냉장고 검색/삭제 버튼: `app/(tabs)/index.tsx`
- 레시피 추천 설명 버튼: `app/(tabs)/recipe.tsx`
- 마이페이지 알림 행: `app/(tabs)/mypage.tsx`

## 제안 규칙

E2E 테스트를 추가할 때는 다음 규칙을 우선 검토한다.

- 사용자에게 보이는 stable label이 있으면 접근성 쿼리를 우선한다.
- 텍스트가 자주 바뀌거나 아이콘만 있는 제어는 `testID`를 추가한다.
- `testID`는 화면/영역/역할 순으로 작성한다.

예시:

```tsx
testID="fridge.search.open-button"
testID="ingredient-registration.confirm-button"
testID="recipe-swipe.save-card"
```

## TODO / 확인 필요

- 사용할 E2E 도구. Detox, Maestro, Appium 등 아직 확인되지 않았다.
- `testID` naming convention 확정.
- 접근성 라벨을 테스트 selector로 사용할지 정책 결정.
- 핵심 플로우별 최소 selector 목록 작성.
