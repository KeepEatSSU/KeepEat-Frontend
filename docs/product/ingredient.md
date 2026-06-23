# 식재료 도메인

## 확인된 현재 구조

식재료/냉장고 기능은 다음 파일들이 중심이다.

- 목록/검색/필터/삭제: `app/(tabs)/index.tsx`
- 식재료 상세 수정/삭제: `app/detail.tsx`
- 등록 확인: `app/add-confirm.tsx`
- 이미지 crop/OCR 진입: `app/crop.tsx`
- 식재료 선택 UI: `components/IngredientPickerSheet.tsx`
- 개별 등록 카드: `components/IngredientEditCard.tsx`
- 빠른 유통기한 선택: `components/QuickExpiryPicker.tsx`
- API/DTO 매핑: `services/userIngredients.ts`
- 마스터 카탈로그: `services/ingredientMaster.ts`, `context/IngredientMasterContext.tsx`, `constants/ingredients-master.ts`
- 도메인 타입: `constants/domain.ts`

## 도메인 타입

`constants/domain.ts` 기준:

- `StorageType`: `room`, `fridge`, `frozen`
- `Unit`: `g`, `개`, `ml`
- `Ingredient`: 냉장고에 등록된 식재료 표시 모델
- `IngredientDraft`: 등록 전 편집 모델

코드상 보관 타입은 프론트 내부에서 영어 key를 사용하고, API 경계에서 한국어 값으로 변환한다.

| 프론트 | API |
| --- | --- |
| `room` | `실온` |
| `fridge` | `냉장` |
| `frozen` | `냉동` |

## API와 매핑

`services/userIngredients.ts`에서 확인된 엔드포인트:

- `GET /api/v1/user-ingredients`
- `GET /api/v1/user-ingredients/search?q=...`
- `POST /api/v1/user-ingredients`
- `PATCH /api/v1/user-ingredients/{id}`
- `DELETE /api/v1/user-ingredients/{id}`
- `DELETE /api/v1/user-ingredients`
- `GET /api/v1/user-ingredients/by-recipe/{recipeId}`

확인된 매핑 규칙:

- API의 `quantity`와 `unit`은 프론트 `Ingredient.quantity` 문자열로 합쳐 표시한다.
- API의 `purchaseDate`는 `MM.DD` 표시 문자열로 변환한다.
- API의 `expiryDate`는 `Date`로 파싱한다.
- 커스텀 식재료는 `ingredientId: null`과 `customName`을 사용한다.
- 등록 요청은 `{ items: [...] }` 형태로 감싼다.
- 벌크 삭제는 axios `DELETE`의 `data: { ids }` body를 사용한다.

## 마스터 카탈로그

`IngredientMasterContext`는 인증 상태 이후 `fetchMaster()`를 호출한다.

`services/ingredientMaster.ts`에서 확인된 fallback 순서:

1. 메모리 snapshot
2. AsyncStorage 캐시
3. `constants/ingredients-master.ts` 로컬 seed

ETag를 `If-None-Match`로 보내고, `200`이면 snapshot을 갱신하며 `304`면 기존 snapshot을 유지한다.

주의:

- `services/ingredientMaster.ts` 상단 주석에는 Stage 1/Stage 2 전환 중이라고 적혀 있다.
- 현재 여러 화면과 컴포넌트는 이미 `useIngredientMaster()`를 사용한다.
- 전환 완료 여부는 확인 필요다.

## 화면 동작

냉장고 홈 `app/(tabs)/index.tsx`:

- focus될 때 `fetchAllIngredients(snapshot)`로 목록을 다시 불러온다.
- 식재료 검색어는 300ms debounce 후 `searchIngredients()`를 호출한다.
- 보관 위치 필터는 단일 선택이다.
- 카테고리 필터는 다중 선택이고 보관 위치 필터와 mutex로 동작한다.
- long press 또는 삭제 칩으로 선택 삭제 모드에 진입한다.
- 삭제는 현재 단건 API를 여러 번 호출하는 방식으로 확인된다.

상세 `app/detail.tsx`:

- route param `id`로 식재료를 찾는다.
- 저장 시 `updateIngredient(Number(id), mapIngredientToUpdateRequest(patch))`를 호출한다.
- 삭제 시 `deleteIngredient(Number(id))`를 호출한다.

등록 `app/add-confirm.tsx`:

- 수동 등록은 `mode=manual`일 때 빈 draft 1개로 시작한다.
- OCR 등록은 `ocrPending.consume()` 결과를 `mapOcrCandidateToDraft()`로 변환해 시작한다.
- 이름, 수량, 보관 위치가 비어 있으면 확인 버튼을 막는다.
- non-custom draft는 `ingredientId`가 필요하다.
- `mapIngredientToCreateRequest()`가 등록 요청 DTO를 만든다.
- 만료일이 비어 있으면 구매일 + 7일 fallback을 사용한다.

## TODO / 확인 필요

- 백엔드의 정확한 `UserIngredientResponse` 최신 DTO와 필수/선택 필드.
- 같은 식재료 중복 등록 허용 여부와 병합 정책.
- 커스텀 식재료가 레시피 추천에 사용되지 않는다는 주석의 현재 백엔드 정책 확인.
- 유통기한 fallback `+7일`이 제품 정책인지 임시 안전망인지 확인.
- 마스터 카탈로그 Stage 전환 완료 여부.
- 삭제 실패 일부 성공 시 서버와 클라이언트 일관성 정책.
