# OCR 흐름

## 관련 파일

- 이미지 crop 화면: `app/crop.tsx`
- OCR 서비스: `services/ocr.ts`
- 등록 확인 화면: `app/add-confirm.tsx`
- 식재료 draft 타입: `constants/domain.ts`

## 현재 흐름

1. 갤러리 또는 카메라에서 이미지 URI를 받는다.
2. `/crop?uri=...`로 이동한다.
3. `app/crop.tsx`에서 crop 영역을 실제 이미지 pixel 좌표로 계산한다.
4. `ImageManipulator.manipulateAsync()`로 crop 이미지를 JPEG로 만든다.
5. `parseReceiptImage(manipResult.uri)`를 호출한다.
6. OCR 후보를 `ocrPending.set(candidates)`에 저장한다.
7. `/add-confirm`으로 이동한다.
8. `add-confirm`에서 `ocrPending.consume()`으로 후보를 읽고 지운다.
9. `mapOcrCandidateToDraft()`로 `IngredientDraft[]`를 만든다.

## 업로드 방식

`services/ocr.ts`는 OCR 업로드에서 `fetch`를 직접 사용한다.

확인된 이유:

- multipart boundary 생성을 React Native `fetch`에 맡기기 위해 `Content-Type`을 직접 넣지 않는다.
- Bearer token은 `tokenStorage.getAccessToken()`으로 직접 읽어 header에 넣는다.
- 업로드 전 `ImageManipulator`로 JPEG 변환을 한 번 더 수행한다.

엔드포인트:

- `POST ${API_BASE_URL}/api/v1/ocr/parse`

## OCR DTO

`OcrIngredientCandidate`에서 확인된 필드:

- `rawName`
- `customName`
- `quantity`
- `unit`
- `matchStatus`: `MATCHED` 또는 `UNMATCHED`
- `ingredientId`
- `ingredientName`
- `storageOptions`

`storageOptions`:

- `storageType`
- `minDays`
- `maxDays`

## 후보 매핑

`mapOcrCandidateToDraft()`에서 확인된 규칙:

- 단위가 `g`, `개`, `ml`에 없으면 `g`로 fallback한다.
- local draft id는 `ocr-...` prefix와 random suffix를 사용한다.
- `UNMATCHED` 또는 `ingredientId == null`이면:
  - `ingredientId`를 비운다.
  - 이름은 `customName` 또는 `rawName`을 사용한다.
  - storage는 null로 둔다.
  - 만료일은 기본 7일 뒤로 채운다.
- `MATCHED`이면:
  - 가능한 storage가 하나일 때만 storage와 평균 만료일을 자동 선택한다.
  - 여러 storage면 storage/expirationDate를 null로 둔다.

## 에러 처리

`OcrParseError`가 사용자 친화적인 한국어 메시지를 담는다.

상태 코드별 메시지:

- 400: `사진을 다시 촬영해주세요`
- 422: `식재료를 인식할 수 없어요. 직접 추가해보세요`
- 502: `잠시 후 다시 시도해주세요`
- 기타: `OCR을 처리하지 못했어요. 잠시 후 다시 시도해주세요`

이미지 전처리 실패:

- `이미지 처리 중 문제가 발생했어요`

## TODO / 확인 필요

- 최신 OCR API 응답에서 `UNMATCHED`가 실제로 내려오는지 여부. 파일 상단 주석은 서버가 MATCHED를 전제로 한다고 설명하지만 코드에는 UNMATCHED 방어가 있다.
- OCR 후보가 빈 배열일 때 사용자에게 보여줄 최종 정책.
- OCR 업로드 파일 크기 제한과 압축 품질 정책.
- OCR 결과의 `customName` 의미와 사용 우선순위가 제품/서버 정책과 일치하는지.
- crop 영역 UI의 최종 요구사항.
