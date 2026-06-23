# 식재료 등록 흐름

## 진입점

`app/(tabs)/_layout.tsx`의 중앙 FAB가 `AddMenuSheet`를 연다.

확인된 선택지:

- 갤러리: `ImagePicker.launchImageLibraryAsync()` 후 `/crop?uri=...`
- 카메라: 권한 확인/요청 후 `ImagePicker.launchCameraAsync()` 후 `/crop?uri=...`
- 직접 추가: `/add-confirm?mode=manual`

`app/(tabs)/add.tsx`는 실제 입력 화면이 아니라 중앙 FAB를 위한 탭 라우트로 보인다.

## 수동 등록

경로:

1. FAB
2. 직접 추가
3. `/add-confirm?mode=manual`

`app/add-confirm.tsx`에서 확인된 동작:

- 빈 `IngredientDraft` 1개로 시작한다.
- 첫 draft의 식재료 선택기를 자동으로 연다.
- 사용자는 식재료, 수량, 단위, 보관 위치, 만료일을 편집한다.
- `hasAnyError`가 true면 확인 버튼을 막는다.
- non-custom draft는 `ingredientId`가 필요하다.
- 확인 시 `mapIngredientToCreateRequest(draft, purchaseDate)`로 DTO를 만들고 `createIngredients(requests)`를 호출한다.
- 성공 시 navigation stack을 `"(tabs)"`로 reset한다.

## OCR 등록

경로:

1. FAB
2. 갤러리 또는 카메라
3. `/crop?uri=...`
4. crop 후 `parseReceiptImage()`
5. `ocrPending.set(candidates)`
6. `/add-confirm`
7. `ocrPending.consume()` 후 draft 목록으로 변환

자세한 OCR 처리는 `ocr-flow.md`를 읽는다.

## 자동 보관/만료일 보정

`app/add-confirm.tsx`에서 확인된 규칙:

- 식재료 마스터의 보관 옵션을 확인한다.
- 가능한 보관 타입이 하나뿐이면 해당 storage를 자동 선택한다.
- 선택된 storage의 `(min + max) / 2` 일수를 평균으로 사용해 만료일을 잡는다.
- 여러 보관 타입이 가능하면 storage를 비워 사용자가 선택하게 한다.
- 새 마스터를 선택하면 `expirationManuallySet`을 false로 리셋한다.

`services/userIngredients.ts`에서 확인된 fallback:

- 등록 요청 생성 시 만료일이 없으면 구매일 + 7일을 사용한다.

## 검증된 실패/차단 조건

- 이름이 비어 있음.
- 수량이 null이거나 1 미만.
- 보관 위치가 null.
- non-custom인데 `ingredientId`가 없음.
- API 실패 시 `getErrorMessage()` fallback으로 toast를 보여준다.

## TODO / 확인 필요

- 직접 추가 커스텀 식재료의 최종 제품 정책.
- 등록 성공 후 항상 탭 루트로 reset하는 UX가 의도된 정책인지 확인.
- OCR 후보가 0개일 때의 제품 UX.
- 만료일 fallback `+7일`의 정책 소유자.
- 같은 화면에서 여러 draft 중 일부만 실패할 수 있는지, 백엔드가 원자적으로 처리하는지.
