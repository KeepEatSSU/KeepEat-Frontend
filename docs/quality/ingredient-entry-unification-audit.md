# 식재료 추가/편집 UI 공통화 감사

- 작성일: 2026-07-05
- 범위: OCR 등록, 수동 등록, 식재료 상세 수정, 레시피 상세 부족 재료 추가 BottomSheet, `IngredientEditCard`, draft/소비기한 계산, `IngredientMasterContext`
- 원칙: 코드 수정 없이 현재 구현 기준으로 조사했다. 기존 미커밋 변경은 되돌리거나 정리하지 않았다.

## 요약

식재료 입력 UI는 이미 `IngredientDraft`와 `IngredientEditCard`를 중심으로 공통화될 수 있는 구조에 가깝다. 다만 실제 정책은 `app/add-confirm.tsx`, `app/detail.tsx`, `app/recipe-detail.tsx`, `components/IngredientEditCard.tsx`, `components/QuickExpiryPicker.tsx`, `services/ocr.ts`, `services/userIngredients.ts`에 나뉘어 있어 보관 방법 선택, 소비기한 자동 계산, 필수값 검증이 화면마다 조금씩 다르다.

가장 큰 차이는 식재료 상세 수정 화면이다. 등록 계열 화면은 `IngredientEditCard`와 `IngredientDraft`를 사용하지만, 상세 수정은 `CapacityInput`, `ExpandableDatePicker`, `QuickExpiryPicker`, 자체 `StorageChips`와 로컬 primitive state를 직접 조합한다. 그래서 보관 방법 변경 시 소비기한 자동 계산 정책도 상세 수정 화면에는 적용되지 않는다.

공통화 방향은 화면 전체를 하나의 거대한 컴포넌트로 합치는 것이 아니라, 식재료 입력 도메인 규칙을 먼저 순수 함수와 hook으로 추출하고, `IngredientEditCard`를 "등록/편집 공통 입력 폼"으로 확장하는 방식이 적합하다. API 호출, 라우팅, BottomSheet 열고 닫기, 다중 항목 목록 제어는 각 화면 책임으로 남겨야 한다.

## 화면별 입력 상태와 컴포넌트

| 흐름 | 상태 소유자 | 이름 | 수량/단위 | 보관 방법 | 소비기한 | 검증/제출 |
| --- | --- | --- | --- | --- | --- | --- |
| OCR -> add-confirm | `app/add-confirm.tsx`의 `items: IngredientDraft[]`, `purchaseDate` | `services/ocr.ts`의 `mapOcrCandidateToDraft()`가 후보를 draft로 변환하고 `IngredientEditCard`에서 선택/직접 입력 | `IngredientEditCard` 내부 `CapacityInput` | `IngredientEditCard` storage chip, OCR 후보가 단일 보관 옵션이면 초기값 설정 | OCR mapper 또는 카드 내부 자동 계산, 직접 수정 시 `expirationManuallySet` | `hasAnyError`, 매칭 필요 검사, `mapIngredientToCreateRequest()` 후 `createIngredients()` |
| 수동 추가 -> add-confirm | `app/add-confirm.tsx`의 `items`, `purchaseDate` | `createEmptyDraft()`로 빈 항목 생성 후 첫 항목 picker 자동 오픈 | `IngredientEditCard` 내부 `CapacityInput`, 기본 `1개` | 선택 전 `null`, master 선택 후 단일 옵션이면 자동 선택 | 기본 +7일, master 선택/보관 변경 시 평균 소비기한 자동 계산 | `hasAnyError`로 CTA disabled, 매칭 필요 시 inline error |
| 식재료 상세 수정 | `app/detail.tsx`의 `category`, `name`, `nickname`, `capacity`, `unit`, `purchaseDate`, `storage`, `expirationDate` | 기존 ingredient의 `name`은 사실상 고정, picker는 카테고리 표시/선택용 | 직접 `CapacityInput` 사용 | 자체 `StorageChips` 사용 | `QuickExpiryPicker` 또는 `ExpandableDatePicker`; 보관 방법 변경만으로 자동 재계산하지 않음 | `isDirty && !submitting`일 때 저장 가능, `updateIngredient()` |
| recipe-detail 부족 재료 BottomSheet | `app/recipe-detail.tsx`의 `draftItem`, `addSubmitting`, validation message | 부족 재료명을 master에서 조회해 draft 생성, `IngredientEditCard` 표시 | `IngredientEditCard` 내부 `CapacityInput`, 초기 수량은 `null` | master options에서 초기 storage 결정 | 초기 expiry는 `null`, 이후 `IngredientEditCard` 보관 변경/날짜 선택 경로 사용 | `getAddToFridgeValidationMessage()`로 CTA disabled 및 InlineValidation, `createIngredients()` |

근거 파일:

- `app/add-confirm.tsx`: `createEmptyDraft()`, `hasAnyError`, `handleCategorySelect()`, `IngredientEditCard` 렌더링, `mapIngredientToCreateRequest()` 호출
- `services/ocr.ts`: `resolveStorageAndExpiry()`, `mapOcrCandidateToDraft()`
- `app/detail.tsx`: `DetailInit`, `deriveInit()`, `CapacityInput`, `StorageChips`, `QuickExpiryPicker`, `ExpandableDatePicker`, `updateIngredient()`
- `app/recipe-detail.tsx`: `getAddToFridgeValidationMessage()`, `openAddModal()`, `IngredientEditCard` BottomSheet 렌더링
- `components/IngredientEditCard.tsx`: 이름 선택/직접 입력, 수량, 보관 방법, 빠른 소비기한, 직접 날짜 수정

## IngredientMasterContext와 master 데이터 사용

`context/IngredientMasterContext.tsx`는 인증 이후 `fetchMaster()`를 호출하고, `getMasterSnapshot()` 결과를 `snapshot`으로 제공한다. context 값은 `status`, `snapshot`, `error`, `refresh`, `isReady`를 포함한다.

`services/ingredientMaster.ts`의 `ResolvedSnapshot`은 `categories`, `subCategories`, `ingredients`, `storageOptions` 외에 세 개의 lookup을 제공한다.

| lookup | 사용 목적 |
| --- | --- |
| `byName` | recipe-detail 부족 재료명이나 API display name에서 master ingredient를 찾는다. |
| `byId` | ingredientId로 master 이름/카테고리 정보를 복원한다. |
| `optionsByIngredientId` | 보관 방법 후보, 평균 소비기한, 빠른 소비기한 picker 노출 여부를 결정한다. |

현재 등록/편집 관련 사용처는 대부분 `snapshot`을 직접 읽는다. `app/add-confirm.tsx`, `app/detail.tsx`, `app/recipe-detail.tsx`, `components/IngredientEditCard.tsx`, `components/IngredientPickerSheet.tsx`, `components/QuickExpiryPicker.tsx`가 `useIngredientMaster()`를 사용한다. 다만 master loading/error 상태를 입력 UI에서 별도 UX로 분기하는 코드는 제한적이다. 공통화 시에는 "master snapshot 없음"을 빈 검색 결과나 보관 옵션 없음으로 조용히 처리할지, 로딩/재시도 상태로 표시할지 정책을 같이 정해야 한다.

## 보관 방법 선택과 소비기한 자동 계산

| 위치 | 자동 계산되는 경로 | 자동 계산되지 않는 경로 | 정책 차이 |
| --- | --- | --- | --- |
| `services/ocr.ts` | OCR 후보가 master에 매칭되고 보관 옵션이 하나로 좁혀지면 평균 소비기한을 오늘 기준으로 계산 | 미매칭, 옵션 없음, 여러 보관 방법 가능 | 미매칭 draft는 storage `null`이지만 expiration은 +7일 fallback |
| `app/add-confirm.tsx` | picker에서 master를 선택했을 때 보관 방법이 하나면 `purchaseDate` 기준 평균 소비기한 계산 | 여러 보관 방법 가능 시 storage `null`; 사용자가 직접 storage를 골라야 함 | 새 master 선택 시 `expirationManuallySet`을 `false`로 리셋 |
| `components/IngredientEditCard.tsx` | storage chip 변경 시 master option이 있고 사용자가 날짜를 직접 수정하지 않았으면 평균 소비기한 자동 계산 | custom, master id 없음, option 없음, 수동 수정 이후 | 수동 수정 이후 storage 변경은 날짜를 보존 |
| `components/QuickExpiryPicker.tsx` | 사용자가 최소/평균/최대 버튼을 탭하면 `purchaseDate` 기준으로 계산 | 보관 방법에 맞는 master option이 없으면 picker 자체를 숨김 | 계산식과 option match 로직이 카드와 중복 |
| `app/detail.tsx` | QuickExpiryPicker를 직접 탭할 때만 계산 | storage chip만 바꿀 때는 expirationDate를 유지 | 상세 수정에는 `expirationManuallySet` 상태가 없음 |
| `app/recipe-detail.tsx` | BottomSheet 안에서 이후 storage를 바꾸면 `IngredientEditCard` 정책 적용 | modal open 시에는 평균 expiry를 계산하지 않음 | 여러 보관 방법 중 fridge가 있으면 `fridge`를 초기 선택하는 정책이 add-confirm과 다름 |
| `services/userIngredients.ts` | 없음 | draft에 expirationDate가 없으면 create request에서 purchaseDate +7일 fallback | UI 검증과 별도로 마지막 안전장치처럼 동작하지만, 정책 위치가 불명확 |

현재 평균 소비기한 공식은 대체로 `(min + max) / 2 * METRIC_TO_DAYS[metric]`를 반올림해 anchor date에 더하는 방식이다. 다만 OCR은 `minDays/maxDays`, master snapshot은 `min/max/metric`을 사용하므로 normalize 계층이 필요하다.

## 자동 계산 로직 중복과 서로 다른 정책

| 주제 | 중복/불일치 위치 | 현재 영향 |
| --- | --- | --- |
| storage API/domain 매핑 | `services/userIngredients.ts`, `components/QuickExpiryPicker.tsx`, `app/detail.tsx`, `components/IngredientEditCard.tsx` 주변 | Korean API 값과 domain key 변환이 여러 곳에서 반복된다. 새 storage type이 생기면 누락 위험이 있다. |
| 평균 소비기한 계산 | `services/ocr.ts`, `app/add-confirm.tsx`, `components/IngredientEditCard.tsx`, `components/QuickExpiryPicker.tsx` | 같은 공식을 각자 구현한다. anchor date와 반올림 정책이 화면별로 어긋날 수 있다. |
| storage option narrowing | OCR mapper, add-confirm picker 선택, recipe-detail modal open, IngredientEditCard storage change | 보관 방법이 여러 개인 경우 add-confirm은 미선택으로 두지만 recipe-detail은 fridge를 우선 선택한다. |
| 필수값 검증 | `app/add-confirm.tsx`의 `hasAnyError`, `app/recipe-detail.tsx`의 validation helper, `IngredientEditCard`의 부분 field error, `services/userIngredients.ts`의 throw | 어떤 오류는 CTA disabled, 어떤 오류는 InlineValidation, 어떤 오류는 service throw나 API 실패로 흐를 수 있다. |
| 수동 소비기한 보존 | `IngredientDraft.expirationManuallySet`과 `IngredientEditCard` | 등록/BottomSheet는 보존 의도가 구현되어 있지만 상세 수정은 플래그가 없고 항상 날짜를 유지한다. |
| 기본 expiration fallback | `createEmptyDraft()`, OCR 미매칭, `mapIngredientToCreateRequest()` | +7일 fallback이 여러 계층에 존재해 "UI 기본값"인지 "API 안전장치"인지 흐려진다. |

## 사용자가 소비기한을 직접 수정한 뒤 보관 방법을 변경할 때

등록 계열에서는 사용자의 직접 수정이 비교적 명확히 보호된다.

- `IngredientEditCard`의 `ExpandableDatePicker`에서 날짜를 바꾸면 `expirationManuallySet: true`가 설정된다.
- 이후 storage chip을 바꿔도 `handleStorageChange()`는 자동 소비기한을 계산하지 않고 기존 날짜를 유지한다.
- add-confirm에서 새 master 식재료를 선택하면 `expirationManuallySet`을 다시 `false`로 리셋한다. 이는 새 식재료의 master 평균값을 다시 적용할 수 있게 하려는 의도로 보인다.
- OCR에서 들어온 draft도 결국 `IngredientEditCard`를 거치므로 사용자가 날짜를 직접 바꾸면 같은 보존 정책을 따른다.
- recipe-detail 부족 재료 BottomSheet도 `IngredientEditCard`를 쓰므로 직접 수정 이후 보관 방법 변경 시 날짜를 보존한다.

상세 수정 화면은 다른 경로다. `app/detail.tsx`에는 `expirationManuallySet`이 없고, storage 변경 시 자동 계산을 하지 않는다. 따라서 사용자가 직접 수정했는지 여부와 무관하게 날짜가 보존된다. 결과적으로 "보관 방법 변경 시 자동 갱신하되 사용자가 고친 날짜는 보존한다"는 정책이 등록 화면에만 존재한다.

## IngredientEditCard를 공통 입력 폼으로 확장할 수 있는가

가능하다. 현재 `IngredientEditCard`는 이미 이름 선택/직접 입력, 별칭, 수량/단위, 보관 방법, 빠른 소비기한, 직접 날짜 선택, 삭제 버튼, custom/master 분기를 한 컴포넌트에 담고 있다. 수동 등록, OCR 등록, recipe-detail BottomSheet는 동일한 card를 사용한다.

다만 상세 수정 화면까지 포함하려면 지금 card에 그대로 모든 책임을 밀어 넣기보다 "식재료 입력 폼" 계층을 분리하는 편이 안전하다.

필요한 확장:

| 필요 기능 | 이유 |
| --- | --- |
| mode prop 또는 별도 wrapper | 등록 카드, BottomSheet compact 카드, 상세 편집 카드의 헤더/삭제/이름 변경 가능 여부가 다르다. |
| master 이름 변경 잠금 | 상세 수정 API는 현재 master ingredientId 변경을 지원하지 않는다. 공통 UI가 변경 가능한 것처럼 보이면 안 된다. |
| shared validation result 주입 | 카드 내부 field error와 화면 하단 InlineValidation이 같은 규칙을 써야 한다. |
| storage error 표시 | 현재 storage 미선택은 CTA disabled 외에 카드 내부에서 충분히 눈에 띄지 않는다. |
| purchaseDate 제어 | add-confirm은 화면 단위 purchaseDate를 여러 draft에 공유하고, detail은 개별 값으로 가진다. |
| adapter 계층 | `DetailInit` primitive state와 `IngredientDraft`는 shape가 다르다. 편집 화면을 공통화하려면 adapter가 필요하다. |

공통화하면 좋은 부분:

- draft 필수값 검증: 이름, master 매칭, 수량, 단위, 보관 방법, 소비기한
- master storage option 조회 및 지원 storage 산출
- 보관 방법 선택 시 평균 소비기한 계산
- 사용자가 날짜를 수정한 뒤 자동 계산을 막는 정책
- storage chip disabled/error 표시
- 빠른 소비기한 picker 노출 조건
- `CapacityInput`의 min/error 정책

화면별로 남겨야 하는 책임:

- OCR pending consume, OCR 후보 변환, OCR 실패/재시도 UX
- add-confirm의 다중 draft 목록, purchaseDate 일괄 적용, 등록 완료 후 라우팅
- 식재료 상세의 API update/delete, dirty checking, 삭제 확인, 뒤로가기 확인
- recipe-detail의 부족 재료 목록, BottomSheet 표시/닫기, 성공 후 refetch 또는 local state 갱신
- API 호출과 TopToast/InlineValidation 표시 위치

## 보관 방법 미선택 UX 평가

현재 "보관 방법 미선택"은 필수값이지만 충분히 눈에 띄지 않는 흐름이 있다.

| 화면 | 현재 표시 | 평가 |
| --- | --- | --- |
| add-confirm | CTA가 disabled 되고 하단에 `(입력 확인 필요)` 문구가 붙는다. storage chip 영역 자체에는 명시적 오류 문구가 없다. | 사용자가 어떤 필드 때문에 막혔는지 바로 찾기 어렵다. |
| IngredientEditCard | storage chip이 아무것도 선택되지 않은 상태로 보인다. name/quantity 오류는 일부 field error가 있지만 storage 전용 inline error는 없다. | 보관 방법이 필수라는 신호가 약하다. |
| recipe-detail BottomSheet | validation helper가 `보관 방식을 선택해주세요`를 sheet 내부 InlineValidation으로 보여줄 수 있다. | 메시지는 명확하지만 card의 storage row와 직접 연결된 시각적 강조는 약하다. |
| detail edit | 기존 항목은 storage가 항상 있다고 가정한다. storage chip 변경은 가능하지만 미선택 상태는 일반적으로 없다. | 등록 검증 문제와는 별도다. |

최소 UX 개선안:

- `IngredientEditCard`에 `storageErrorText` 또는 shared validation result를 전달해 storage chip 바로 아래에 `보관 방식을 선택해주세요`를 표시한다.
- storage group label 또는 chip row에 error tint를 적용한다.
- add-confirm의 disabled CTA 보조 문구만으로 끝내지 말고, 각 카드 내부에 첫 필드 오류를 표시한다.
- storage chip에 `accessibilityState.selected`와 명확한 접근성 라벨을 부여한다.
- recipe-detail BottomSheet는 현재 InlineValidation 메시지를 유지하되, 같은 메시지를 card field error와 공유하도록 정리한다.

## 리팩터링 제안

### 1단계: 순수 도메인 규칙 추출

예상 파일:

- 신규 `utils/ingredientEntryRules.ts` 또는 `services/ingredientDraft.ts`
- 수정 후보: `services/ocr.ts`, `app/add-confirm.tsx`, `components/IngredientEditCard.tsx`, `components/QuickExpiryPicker.tsx`, `app/recipe-detail.tsx`

추출 대상:

- API/domain storage mapping 단일화
- master option에서 지원 storage 목록 산출
- 단일 보관 방법 판정
- 평균 소비기한 계산
- 초기 storage/expiration 결정 정책
- `validateIngredientDraft()` 같은 공통 검증

### 2단계: draft form hook 도입

예상 파일:

- 신규 `hooks/useIngredientDraftForm.ts`
- 수정 후보: `app/add-confirm.tsx`, `app/recipe-detail.tsx`, `components/IngredientEditCard.tsx`

역할:

- draft update helper
- storage change 시 자동 소비기한 계산
- 직접 날짜 수정 플래그 관리
- custom/master 전환 정책
- validation result 제공

### 3단계: IngredientEditCard를 공통 입력 폼으로 확장

예상 파일:

- `components/IngredientEditCard.tsx`
- 필요하면 신규 `components/IngredientEntryForm.tsx`

방향:

- 기존 props를 무리하게 키우기보다 form 책임을 나누는 wrapper를 고려한다.
- add-confirm과 recipe-detail은 현재 시각 구조를 유지하면서 validation/error 표시만 공유한다.
- detail edit는 API 제약 때문에 master 변경을 잠그는 edit mode adapter가 필요하다.

### 4단계: 상세 수정 화면 편입 여부 결정

예상 파일:

- `app/detail.tsx`
- 공통 adapter/hook 파일

결정해야 할 정책:

- 상세 수정에서 storage 변경 시 평균 소비기한을 자동 갱신할지
- 자동 갱신한다면 기존 expirationDate가 API에서 온 값인지 사용자가 수정한 값인지 어떻게 구분할지
- master ingredientId 변경이 불가능한 상태에서 이름 picker를 어떤 UX로 유지할지

### 5단계: 문서와 회귀 테스트

예상 문서:

- `docs/product/ingredient.md`
- `docs/flows/ingredient-registration.md`
- `docs/frontend/design-system.md` 또는 입력 컴포넌트 정책 문서

회귀 테스트 후보:

- OCR 후보 중 단일 storage가 자동 선택되고 평균 소비기한이 들어가는지
- 수동 등록에서 여러 storage가 가능한 식재료는 storage 미선택 오류가 명확한지
- 사용자가 소비기한을 직접 수정한 뒤 storage를 바꿔도 날짜가 보존되는지
- recipe-detail BottomSheet에서 수량/storage 누락 시 API 요청이 나가지 않는지
- 상세 수정 저장이 기존처럼 동작하고, master 변경 불가 UX가 오해를 만들지 않는지

## 위험 요소

| 위험 | 설명 | 완화 |
| --- | --- | --- |
| 소비기한 자동 변경 회귀 | 공통 계산 로직을 적용하면서 사용자가 직접 설정한 날짜를 덮어쓸 수 있다. | `expirationManuallySet` 정책을 명시하고 테스트한다. |
| 상세 수정 API 제약 | 상세 수정은 현재 master ingredientId 변경을 지원하지 않는다. | 공통 폼 edit mode에서 이름/master 변경을 잠근다. |
| OCR DTO와 master DTO 차이 | OCR은 `minDays/maxDays`, master는 `min/max/metric`을 쓴다. | normalize helper를 만든 뒤 계산 함수 입력을 통일한다. |
| custom item 의미 혼동 | `isCustom === true || ingredientId == null`이면 create mapper는 custom으로 본다. | validation과 mapper가 같은 custom 판정을 사용한다. |
| recipe-detail 초기 storage 정책 차이 | 현재 여러 옵션 중 fridge를 우선 선택한다. add-confirm과 다르다. | 정책을 의도적으로 유지할지 제품 결정이 필요하다. |
| 기존 미커밋 변경 충돌 | 현재 `app/recipe-detail.tsx`, `components/IngredientEditCard.tsx`에 미커밋 변경이 있다. | 리팩터링 전 현재 변경의 의도와 테스트 상태를 먼저 확정한다. |

## 예상 변경 파일

공통화 작업을 실제 진행한다면 다음 파일이 변경될 가능성이 높다.

- `services/ocr.ts`
- `services/userIngredients.ts`
- `app/add-confirm.tsx`
- `app/detail.tsx`
- `app/recipe-detail.tsx`
- `components/IngredientEditCard.tsx`
- `components/QuickExpiryPicker.tsx`
- 신규 `utils/ingredientEntryRules.ts` 또는 `services/ingredientDraft.ts`
- 신규 `hooks/useIngredientDraftForm.ts`
- 관련 문서: `docs/product/ingredient.md`, `docs/flows/ingredient-registration.md`

## 권장 결론

1. 먼저 계산/검증/매핑을 순수 함수로 모아 중복 정책을 제거한다.
2. add-confirm과 recipe-detail BottomSheet를 같은 validation result로 묶는다. 두 화면은 이미 `IngredientEditCard`를 쓰므로 위험이 낮다.
3. 그 다음 detail edit를 공통 폼으로 편입할지 결정한다. 이 화면은 API 제약과 기존 local state가 달라 별도 단계로 다루는 것이 안전하다.
4. 보관 방법 미선택은 공통 card 내부 오류로 승격한다. CTA disabled만으로는 필수 입력임을 충분히 전달하지 못한다.
