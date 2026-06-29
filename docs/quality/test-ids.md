# 테스트 식별자

## 현재 상태

`components/`에서 MCP 관찰 하네스용 최소 `testID`가 일부 확인된다.
대부분의 화면과 컴포넌트에는 아직 `testID`가 없다.

확인 명령:

```bash
rg -n "testID|accessibilityLabel|accessibilityRole" app components -g "*.tsx"
```

결과:

- `testID`: `IngredientPickerSheet`, `IngredientEditCard` 일부에 존재함.
- `accessibilityLabel`, `accessibilityRole`: 일부 화면과 컴포넌트에 존재함.

## 현재 testID 목록

| testID | 위치 | 의미 |
| --- | --- | --- |
| `ingredient-picker.sheet.root` | `components/IngredientPickerSheet.tsx` | 식재료 선택 시트 루트. 시트 렌더 여부 확인용. |
| `ingredient-picker.close-button` | `components/IngredientPickerSheet.tsx` | 식재료 선택 시트 닫기 버튼. 닫기 흐름 확인용. |
| `ingredient-picker.custom-add.button` | `components/IngredientPickerSheet.tsx` | 검색 결과가 없을 때 표시되는 직접 추가 버튼. 직접 추가 상태 전환 진입점. |
| `ingredient-registration.custom-name.input` | `components/IngredientEditCard.tsx` | 직접 추가 전환 후 표시되는 커스텀 재료명 입력 영역. |

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
- `testID` naming convention 최종 확정.
- 접근성 라벨을 테스트 selector로 사용할지 정책 결정.
- 핵심 플로우별 최소 selector 목록 작성.
