# KeepEat 알림·피드백 시스템 감사 (2026-07)

## 감사 범위와 방법

- 기준: 현재 브랜치의 정적 코드와 문서
- 조사 대상:
  - `components/Toast.tsx`
  - `context/NotificationContext.tsx`
  - `context/RecipeRecommendationContext.tsx`
  - OS push 등록, 수신, 탭, 라우팅 코드
  - 앱 전체 `showTopToast`, `showNotification`, `showSnackbar`, legacy `showToast`
  - inline validation, `ErrorScreen`, 확인 `Modal`/`BottomSheet`, native `Alert`
  - `ARCHITECTURE.md`, `docs/frontend/*`, `docs/product/notification.md`,
    `docs/flows/recipe-recommendation.md`, 기존 품질 감사 문서
- 실행 환경이나 서버 동작은 확인하지 않았다. 특히 백엔드가 같은 AI 완료 사건에
  `RECIPE_READY` push를 언제 보내는지는 코드만으로 확정할 수 없다.
- 코드 호출 수:
  - `showTopToast(`: 42건
  - `showNotification(`: 3건
  - 앱 호출부의 `showSnackbar(`: 0건
  - 앱 호출부의 legacy `showToast(`: 0건
- 이번 작업에서는 이 문서 외 코드를 수정하지 않았다.

## 1. 현재 구조

### 1.1 OS Push

| 상태 | 표시 주체 | 앱 코드 역할 | 탭 처리 |
| --- | --- | --- | --- |
| Background | iOS/Android OS | 원격 notification payload를 앱 밖에서 표시한다. 현재 local notification scheduling 호출은 없다. | 실행 중 listener인 `addNotificationResponseReceivedListener`가 payload `type`을 해석한다. |
| Terminated | iOS/Android OS | 원격 notification payload를 앱 밖에서 표시한다. | 인증 복구 후 `getLastNotificationResponseAsync()`를 한 번 읽어 라우팅한다. |
| Foreground | OS 배너를 의도적으로 억제 | `setNotificationHandler()`가 banner/list/sound/badge를 모두 `false`로 반환한다. | `addNotificationReceivedListener`가 `NotificationDropdown`을 표시하고 자체 탭 콜백을 연결한다. |

근거:

- foreground OS 표시 억제:
  `context/RecipeRecommendationContext.tsx:117-135`
- foreground 수신:
  `context/NotificationContext.tsx:360-386`
- 실행 중 OS push 탭:
  `context/NotificationContext.tsx:388-403`
- cold-start push 탭:
  `context/NotificationContext.tsx:405-428`
- local notification scheduling 호출 없음:
  `context/RecipeRecommendationContext.tsx:244-249`
- push token 발급/서버 등록:
  `services/pushNotifications.ts:33-84`,
  `context/AuthContext.tsx:136-179`

타입별 라우팅:

| Payload type | Route | 읽음 처리 | 현재 제한 |
| --- | --- | --- | --- |
| `EXPIRY_SOON` | `/` | 진입 시 타입 전체 읽음 | `targetId`를 사용하지 않아 특정 식재료로 이동하지 않는다. |
| `RECIPE_READY` | `/recipe-swipe` | swipe 화면에 실제 결과가 있을 때 타입 전체 읽음 | OS/dropdown/popup 진입부는 readiness와 기존 read 상태를 모두 고정값으로 우회한다. 결과가 없으면 swipe의 no-results 화면이 최종 방어한다. |
| `NOTICE` | 없음 | OS/dropdown 탭은 타입 전체 읽음, 알림함 카드는 개별 읽음 후 펼침 | 알림함을 닫으면 2.5초 뒤 모든 `NOTICE`를 읽음 처리한다. |
| 알 수 없음/누락 | 없음 | 없음 | foreground에서는 body가 있으면 action 없는 dropdown을 표시한다. OS push 탭은 무시한다. API 목록의 알 수 없는 enum은 별도로 `notice`로 매핑한다. |

근거:

- 결정 함수: `utils/notificationRouting.ts:16-117`
- 모든 외부 진입부가 `isRead: false`,
  `isRecommendationReady: true`를 전달:
  `context/NotificationContext.tsx:338-358`,
  `components/NotificationPopup.tsx:183-201`
- swipe 결과 존재 시 읽음:
  `app/recipe-swipe.tsx:497-506`
- 알림함 `NOTICE` 닫기 후 읽음:
  `components/AppHeaderRight.tsx:20-23,74-89`

### 1.2 Foreground Notification

foreground push는 OS 배너 대신 `components/Toast.tsx`의
`NotificationView`를 사용한다.

- 위치: top safe area 아래
- 표시 시간: 4,000ms
- 제목: push title, 없으면 `KeepEat`
- 본문: 최대 2줄
- 알려진 타입: 탭 시 읽음 처리와 타입별 라우팅
- 알 수 없는 타입: callback은 없지만 카드 자체는 여전히 `Pressable`
- AI 로컬 생성 완료도 같은 `showNotification()`을 사용

근거:

- 표시/Pressable:
  `components/Toast.tsx:161-166,283-286,443-485`
- push 수신 호출:
  `context/NotificationContext.tsx:368-383`
- 로컬 AI 완료 호출:
  `app/(tabs)/recipe.tsx:130-139`

### 1.3 In-app Transient Feedback

`TopToast`의 현재 규칙:

| 항목 | 현재 구현 |
| --- | --- |
| 위치 | top safe area + `Feedback.topOffsetGap` |
| 폭 | 최대 360, 본문 최대 2줄 |
| 표시 시간 | 3,200ms |
| variant | success, error, warning, info |
| 애니메이션 | in 300ms, out 250ms |
| 사용자 action | 타입에는 존재하지만 현재 앱 호출은 0건 |
| TopToast 연속 호출 | 새 호출이 현재 항목과 timer를 즉시 교체 |
| Notification 중 TopToast | 한 칸짜리 `queuedTopToastRef`에 보류 |
| 보류 중 TopToast 추가 | 앞의 보류 항목을 마지막 항목이 덮어씀 |
| TopToast 중 Notification | Notification이 즉시 TopToast를 교체 |
| Notification 연속 호출 | 새 Notification이 이전 Notification을 즉시 교체 |

근거:

- theme token:
  `constants/theme.ts:198-241`
- 단일 state/timer/한 칸 queue:
  `components/Toast.tsx:168-178`
- 교체:
  `components/Toast.tsx:211-237`
- Notification 우선 및 단일 보류:
  `components/Toast.tsx:203-207,245-258,283-286`

### 1.4 Inline Feedback

현재 inline feedback은 공통 Provider가 아니라 각 화면 state와
`IngredientEditCard`의 공통 validation helper로 구현되어 있다.

- 입력 필드 validation:
  로그인, 회원가입, 비밀번호 변경, 식재료 등록, OCR crop
- 카드 validation:
  `getIngredientDraftFieldErrors()`
- 화면 상태 error:
  공통 `ErrorScreen`
- 일부 API error:
  form 아래에 `getErrorMessage()` 결과를 표시

이 역할 분리는 최종 정책과 대체로 맞다. 다만 같은 validation을 카드와 sheet
하단에 중복 표시하거나, 입력 모달의 수정 가능한 오류를 TopToast로 보내는 예외가
남아 있다.

### 1.5 Blocking Feedback

삭제, 탈퇴, 입력 이탈, 요리 중단처럼 명시적 판단이 필요한 사건은 주로
`ConfirmModal` 또는 입력 전용 native `Modal`을 사용한다. 일반 picker/filter
BottomSheet는 feedback이 아니라 선택 UI이므로 blocking feedback 목록에서
제외했다.

예외:

- 냉장고 다중 삭제는 확인 Modal이나 Undo 없이 즉시 실행한다.
- 알림 단건 삭제도 즉시 실행한다.
- 카메라/갤러리 권한 오류는 native `Alert`를 사용하지만 설정 앱으로 이동하는
  action은 제공하지 않는다.

## 2. 호출부 전수 목록

### 2.1 메시지 정책 표기

- `G("fallback")`: `getErrorMessage(error, fallback)` 사용
- `getErrorMessage()`는 Axios `response.data.message`가 비어 있지 않은 문자열이면
  status와 무관하게 그대로 사용하고, 아니면 fallback을 사용한다.
  근거: `services/api.ts:38-45`
- 이 함수는 raw response object를 노출하지 않지만, 서버 message의 사용자 친화성,
  길이, 내부 문구 여부를 검사하지 않는다.
- `server plain`: API가 반환한 문자열을 직접 사용한다.
- `raw Error`: 일반 `Error.message`를 직접 사용할 수 있다.

### 2.2 TopToast 42건

모든 행의 Toast 자체 action 버튼은 없다.

| # | 메시지 / variant | 호출 위치 | 발생 사건 | 행동 가능 여부 | 화면 전환 전후 | 적절성 | 중복·불필요 여부 | 서버 message 정책 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 다음 페이지를 불러오지 못했어요 / error | `app/(tabs)/explore.tsx:142` | 공용 레시피 pagination 실패 | 다시 스크롤해 재호출 가능 | 같은 화면 | 적절 | 없음 | `G` |
| 2 | 반응 처리에 실패했어요 / error | `app/(tabs)/explore.tsx:218` | 공용 레시피 좋아요/싫어요 실패 및 rollback | 다시 탭 가능 | 같은 화면 | 적절 | 없음 | `G` |
| 3 | 삭제하지 못했어요. 잠시 후 다시 시도해 주세요 / error | `app/(tabs)/index.tsx:394` | 선택한 냉장고 항목 전체 삭제 실패 | 다시 선택해야 함 | 선택 모드 종료 후 | 결과 피드백은 적절 | 삭제 자체에 확인/Undo가 없음 | fixed |
| 4 | N개 삭제, M개 실패 / warning | `app/(tabs)/index.tsx:399` | 냉장고 항목 부분 삭제 | 실패 대상을 다시 찾아야 함 | 선택 모드 종료 후 | 부분 결과 표시는 적절 | 실패 항목 식별은 안 됨 | fixed |
| 5 | N개를 비웠어요 / success | `app/(tabs)/index.tsx:404` | 냉장고 항목 전체 삭제 성공 | 없음 | 선택 모드 종료 후 | 적절 | 삭제 확인/Undo 부재는 별도 문제 | fixed |
| 6 | 설정 앱을 열 수 없어요 / error | `app/(tabs)/mypage.tsx:81` | OS 설정 열기 실패 | 재탭 가능 | 같은 화면 | 적절 | 없음 | fixed |
| 7 | 탈퇴가 완료되었어요 / success | `app/(tabs)/mypage.tsx:135` | 계정 탈퇴 성공 | 없음 | AuthGate의 로그인 전환과 겹침 | 적절 | 명시적 탈퇴 확인 뒤라 생략 가능 후보 | fixed |
| 8 | 탈퇴에 실패했어요 / error | `app/(tabs)/mypage.tsx:146` | Google 계정 탈퇴 실패 | modal에서 재시도 가능 | 확인 modal 유지 | 대체로 적절 | 없음 | `G` |
| 9 | 탈퇴에 실패했어요 / error | `app/(tabs)/mypage.tsx:163` | LOCAL 계정 탈퇴 실패 | 비밀번호 수정/재시도 필요 | 비밀번호 modal 유지 | 혼합 정책 필요 | 비밀번호 불일치는 modal inline이 더 적절 | `G` |
| 10 | 반응 처리에 실패했어요 / error | `app/(tabs)/recipe.tsx:208` | 내 레시피 좋아요/싫어요 실패 및 rollback | 다시 탭 가능 | 같은 화면 | 적절 | #2와 문구/정책 일관 | `G` |
| 11 | N개 삭제되었어요 / success | `app/(tabs)/recipe.tsx:267` | 내 레시피 일괄 제거 성공 | 없음 | 확인 modal 닫힌 후 | 적절 | 없음 | fixed |
| 12 | 삭제에 실패했어요 / error | `app/(tabs)/recipe.tsx:272` | 내 레시피 일괄 제거 실패 | modal에서 재시도 가능 | 확인 modal 유지 | 적절 | 없음 | `G` |
| 13 | N개를 냉장고에 담았어요 / success | `app/add-confirm.tsx:170` | 수동/OCR 식재료 등록 성공 | 없음 | stack reset 직전 | 적절 | 없음 | fixed |
| 14 | 등록하지 못했어요. 잠시 후 다시 시도해 주세요 / error | `app/add-confirm.tsx:176` | 유효한 draft의 API 등록 실패 | CTA 재시도 가능 | 같은 fullScreenModal | 정책상 적절 | iOS modal 위 표시 여부 확인 필요 | `G` |
| 15 | 비밀번호가 변경되었어요 / success | `app/change-password.tsx:80` | 비밀번호 변경 성공 | 없음 | `router.back()` 직전 | 적절 | 없음 | fixed |
| 16 | 요리 기록 저장에 실패했어요 / error | `app/cooking-complete.tsx:136` | 조리 완료 기록 실패 | 화면에서 재시도 불가 | 이후 작업 계속, 곧 홈 reset | 부적절 | #18 success가 나중에 교체할 수 있음 | `G` |
| 17 | 재료 삭제에 실패했어요 / error | `app/cooking-complete.tsx:149` | 선택한 냉장고 재료 삭제 실패 | 화면에서 재시도 불가 | 이후 홈 reset | 부적절 | #16 또는 #18과 연속 교체 가능 | `G` |
| 18 | 맛있는 식사 되세요! / success | `app/cooking-complete.tsx:158` | 조리 완료 흐름 tail message | 없음 | 1.8초 후 홈 reset | 성공 때만 적절 | #16/#17 실패 뒤에도 무조건 표시 | fixed |
| 19 | 이미지 크기를 불러오는데 실패했습니다. / error | `app/crop.tsx:110` | crop 원본 크기 조회 실패 | 사진 재선택이 필요 | 같은 fullScreenModal | inline이 더 적절 | 기존 crop inline 영역과 역할 중복 가능 | fixed |
| 20 | OCR parse message 또는 OCR을 처리하지 못했어요... / error | `app/crop.tsx:293` | OCR 처리 실패 | crop 재시도 가능 | 같은 fullScreenModal | 대체로 적절 | 지속 inline error 후보 | `raw Error` |
| 21 | 변경된 정보가 저장됐어요 / success | `app/detail.tsx:346` | 식재료 상세 변경 저장 | 없음 | `router.back()` 직전 | 적절 | 없음 | fixed |
| 22 | 저장 중 문제가 생겼어요... / error | `app/detail.tsx:353` | 식재료 상세 저장 실패 | 재시도 가능 | 같은 fullScreenModal | 정책상 적절 | iOS modal 위 표시 여부 확인 필요 | `G` |
| 23 | 삭제되었어요 / success | `app/detail.tsx:376` | 식재료 상세 삭제 성공 | 없음 | `router.back()` 직전 | 적절 | 확인 modal은 이미 있음 | fixed |
| 24 | 삭제하지 못했어요... / error | `app/detail.tsx:379` | 식재료 상세 삭제 실패 | 재시도 가능 | 같은 fullScreenModal | 정책상 적절 | iOS modal 위 표시 여부 확인 필요 | `G` |
| 25 | 서버 응답 또는 임시 비밀번호가 이메일로 발송되었어요 / success | `app/login.tsx:59` | 비밀번호 찾기 성공 | 없음 | 입력 modal 닫힌 후 | 적절 | 없음 | server plain |
| 26 | 요청에 실패했어요 / error | `app/login.tsx:67` | 비밀번호 찾기 실패 | 이메일 수정/재시도 필요 | 입력 modal 유지 | 부적절 | modal field inline이 더 적절 | `G` |
| 27 | 구글 로그인에 실패했어요... / error | `app/login.tsx:110` | Google OAuth/login 실패 | 로그인 재시도 가능 | 로그인 화면 유지 | 적절 | 사용자가 취소한 경우는 별도로 silent 처리 | `G` |
| 28 | 재료명을 냉장고에 추가했어요 / success | `app/recipe-detail.tsx:461` | 부족 재료 추가 성공 | 없음 | add sheet 닫힌 뒤 | 적절 | 없음 | fixed |
| 29 | 냉장고 추가에 실패했어요 / error | `app/recipe-detail.tsx:467` | 유효한 부족 재료 API 추가 실패 | CTA 재시도 가능 | add sheet 유지 | 적절 | 입력 validation은 API 전에 차단됨 | `G` |
| 30 | 반응 처리에 실패했어요 / error | `app/recipe-detail.tsx:486` | 상세 좋아요/싫어요 실패 및 rollback | 다시 탭 가능 | 같은 화면 | 적절 | #2/#10과 일관 | `G` |
| 31 | 내 레시피에 추가되었어요 / success | `app/recipe-detail.tsx:503` | 내 레시피 추가 성공 | 없음 | 같은 화면, CTA 상태 변경 | 적절 | CTA 변화만으로 충분한지 검토 가능 | fixed |
| 32 | 내 레시피 추가에 실패했어요 / error | `app/recipe-detail.tsx:508` | 내 레시피 추가 실패 | 다시 탭 가능 | 같은 화면 | 적절 | 없음 | `G` |
| 33 | 내 레시피에서 제거되었어요 / success | `app/recipe-detail.tsx:528` | 내 레시피 제거 성공 | 없음 | 확인 modal 닫힌 후 | 적절 | 없음 | fixed |
| 34 | 제거에 실패했어요 / error | `app/recipe-detail.tsx:533` | 내 레시피 제거 실패 | modal에서 재시도 가능 | 확인 modal 유지 | 대체로 적절 | modal 내부 error가 더 안정적일 수 있음 | `G` |
| 35 | N개 레시피가 내 레시피에 저장되었어요 / success | `app/recipe-swipe.tsx:482` | swipe 선택 레시피 batch 저장 성공 | 없음 | completion 또는 화면 이탈 전후 | 적절 | 없음 | fixed |
| 36 | 레시피 저장에 실패했어요... / error | `app/recipe-swipe.tsx:487` | swipe batch 저장 실패 | 실제 retry 경로 없음 | completion 또는 화면 이탈 전후 | 부적절 | buffer를 먼저 비워 복구도 불가 | `G` |
| 37 | 회원가입이 완료되었습니다! / success | `app/signup-profile.tsx:107` | 최종 회원가입/자동 로그인 성공 | 없음 | tabs 전환 직전 | 적절 | 가입 흐름 success 3회 중 마지막 | fixed |
| 38 | 인증번호를 전송했어요 / success | `app/signup.tsx:73` | 이메일 코드 전송 성공 | 코드 입력 가능 | 같은 화면 | 생략 가능 | 코드 입력 영역 등장과 중복 | fixed |
| 39 | 이메일 인증이 완료되었어요 / success | `app/signup.tsx:107` | 코드 검증 성공 | 다음 가입 단계 진행 | 다음 route push 400ms 뒤 | 생략 가능 | 화면 전환 자체와 중복 | fixed |
| 40 | 레시피 생성에 최대 2분이 소요됩니다... / info | `context/RecipeRecommendationContext.tsx:274` | AI 추천 요청 시작 | 완료 notification을 기다림 | 레시피 탭 유지 | 적절 | loading UI와 일부 중복이나 기대시간 전달 가치 있음 | fixed |
| 41 | 식재료가 부족해요. 냉장고를 더 채워주세요! / warning | `context/RecipeRecommendationContext.tsx:307` | AI 추천 400 실패 | 냉장고를 채운 뒤 재시도 | 레시피 탭 유지 | 현재 정책상 적절 | 부족 재료 식별 UI는 없음 | `G` |
| 42 | 레시피를 생성하는 중에 오류가 발생했어요. / error | `context/RecipeRecommendationContext.tsx:315` | AI 추천 비-400 실패 | 재요청 가능 | 레시피 탭 유지 | 적절 | 없음 | `G` |

Variant 합계:

| success | error | warning | info |
| ---: | ---: | ---: | ---: |
| 16 | 23 | 2 | 1 |

### 2.3 NotificationDropdown 3건

| 메시지 | 호출 위치 | 사건 | 탭 행동 | 전환 | 적절성 / 중복 |
| --- | --- | --- | --- | --- | --- |
| 원격 push body, push title | `context/NotificationContext.tsx:380` | 알려진 타입의 foreground remote push | `EXPIRY_SOON`은 홈, `RECIPE_READY`는 swipe, `NOTICE`는 읽음만 | 탭 후 | 실제 알림이므로 적절 |
| 원격 push body, push title | `context/NotificationContext.tsx:382` | 알 수 없거나 누락된 타입의 foreground remote push | callback 없음. 카드 탭은 닫기만 함 | 없음 | Pressable affordance와 실제 행동 불일치 |
| AI 셰프가 레시피를 완성했어요! | `app/(tabs)/recipe.tsx:133` | 프론트의 AI 생성 Promise 완료 | `markSwiping()` 후 `/recipe-swipe` | 탭 후 | 적절하지만 같은 사건의 backend `RECIPE_READY` push와 이중 producer 가능 |

`RecipeRecommendationContext`는 backend가 같은 사건에 remote push를 보낸다고
명시하면서도 foreground local callback을 유지한다
(`context/RecipeRecommendationContext.tsx:244-252`). 따라서 서버가 실제로 같은
완료 사건에 push를 보내면 두 dropdown이 연속 표시되거나 서로 교체될 수 있다.
현재 payload/event id나 dedupe key가 없어 클라이언트에서 중복을 판별할 수 없다.

### 2.4 Inline Validation과 ErrorScreen

#### 입력·카드 inline

| 메시지 | 위치 | 사건 | 서버 정책 | 판정 |
| --- | --- | --- | --- | --- |
| 로그인에 실패했어요 또는 서버 message | `app/login.tsx:79-89,213-223` | 이메일 로그인 실패 | `G` | 같은 form 안에서 수정 가능하므로 적절 |
| 올바른 이메일 형식을 입력하세요 | `app/signup.tsx:197-200` | 이메일 형식 오류 | local | 적절 |
| 인증번호 전송에 실패했어요... 또는 서버 message | `app/signup.tsx:74-80,205-207` | 코드 전송 실패 | `G` | 이메일 field inline이라 적절 |
| 인증번호가 일치하지 않아요 또는 서버 message | `app/signup.tsx:113-115,267-269` | 코드 검증 실패 | `G` | 코드 field inline이라 적절 |
| 8자리 이상 16자리 미만 | `app/signup-profile.tsx:254` | password 길이 조건 | local | 실시간 조건 표시, 적절 |
| 영문, 숫자, 특수기호 포함 | `app/signup-profile.tsx:271` | password 복잡도 조건 | local | 실시간 조건 표시, 적절 |
| 비밀번호가 일치하지 않아요 | `app/signup-profile.tsx:310-314` | confirm mismatch | local | 적절 |
| 가입 중 문제가 발생했어요... 또는 서버 message | `app/signup-profile.tsx:112-120,317-325` | 최종 가입 실패 | `G` | form summary로 적절 |
| 8자리 이상 16자리 미만 | `app/change-password.tsx:210` | 새 password 길이 조건 | local | 적절 |
| 영문, 숫자, 특수기호 포함 | `app/change-password.tsx:227` | 새 password 복잡도 조건 | local | 적절 |
| 새 비밀번호가 일치하지 않아요 | `app/change-password.tsx:265-269` | confirm mismatch | local | 적절 |
| 비밀번호 변경에 실패했어요... 또는 서버 message | `app/change-password.tsx:82-90,272-280` | 현재 password/서버 검증 실패 | `G` | form inline이라 적절 |
| 사진을 다시 선택해주세요 | `app/crop.tsx:181` | uri 없음 | local | 적절 |
| 이미지 로딩 중입니다. 잠시만 기다려주세요. | `app/crop.tsx:185` | image size 미준비 | local | 적절 |
| 식재료명을 입력해주세요 | `utils/ingredientEntryRules.ts:196-199` | custom name 없음 | local | field/card inline, 적절 |
| 식재료를 선택해주세요 | `utils/ingredientEntryRules.ts:198-200` | master 미선택 | local | field/card inline, 적절 |
| 수량을 입력해주세요 | `utils/ingredientEntryRules.ts:202-205` | quantity null/비정상 | local | field/card inline, 적절 |
| 0보다 큰 수량을 입력해주세요 | `utils/ingredientEntryRules.ts:204-206` | quantity 0 이하 | local | field/card inline, 적절 |
| 단위를 선택해주세요 | `utils/ingredientEntryRules.ts:208-210` | unit enum 불일치 | local | helper에는 있으나 `IngredientEditCard`는 unit error를 직접 표시하지 않음 |
| 보관 방법을 선택해주세요 | `utils/ingredientEntryRules.ts:212-215` | storage null | local | field/card inline, 적절 |
| 지원되는 보관 방식을 선택해주세요 | `utils/ingredientEntryRules.ts:215-221` | master가 지원하지 않는 storage | local | field/card inline, 적절 |
| 소비기한을 선택해주세요 | `utils/ingredientEntryRules.ts:223-228` | invalid Date | local | field/card inline, 적절 |
| 매칭이 필요한 항목이 있어요. 식재료를 선택해주세요 | `app/add-confirm.tsx:144-159,283-294` | non-custom draft의 master 미연결 | local | 앞의 `hasAnyError` return이 같은 상태를 먼저 막아 현재 도달 불가 |
| 위 validation의 첫 문구 반복 | `app/recipe-detail.tsx:377-381,872-883` | 부족 재료 sheet draft가 invalid | local | `IngredientEditCard` field error와 sheet 하단 summary가 같은 문구를 중복 표시 |

`IngredientEditCard`는 `unit`을 제외한 name/quantity/storage/expiry error를
필드 가까이에 표시한다
(`components/IngredientEditCard.tsx:63-76,262-297,365-413`).
`isIngredientDraftValid()`과 CTA disabled가 같은 helper를 사용한다는 점은 좋은
구조다.

#### 화면 상태 ErrorScreen

| 메시지 | 위치 | retry/back | 중복 Toast | 판정 |
| --- | --- | --- | --- | --- |
| 식재료 정보를 불러오지 못했어요 | `app/detail.tsx:192-198` | 냉장고로 복귀 | 없음 | 적절, retry는 없음 |
| 레시피 정보를 불러오지 못했어요 | `app/cooking-ready.tsx:104-112` | 이전 화면 | 없음 | 적절 |
| 레시피 정보를 불러오지 못했어요 | `app/cooking-step.tsx:253-261` | 이전 화면 | 없음 | 적절 |
| 조리 단계를 불러오지 못했어요 | `app/cooking-step.tsx:274-282` | 이전 화면 | 없음 | 빈 instructions 무한 loading 대신 명시 상태, 적절 |
| 레시피 정보를 불러오지 못했어요 | `app/cooking-complete.tsx:168-176` | 이전 화면 | 없음 | 적절 |
| 레시피 정보를 불러오지 못했어요 | `app/recipe-detail.tsx:542-550` | 이전 화면 | 없음 | 초기 load error의 기존 Toast 중복은 현재 제거됨 |
| 냉장고를 열지 못했어요 | `app/(tabs)/index.tsx:564-576` | retry + 냉장고 | 없음 | 의도는 적절하나 첫 실패 후 `hasLoadedOnce=true`라 최종 state에서 branch가 유지되지 않음 |
| 레시피를 불러오지 못했어요 | `app/(tabs)/explore.tsx:225-235` | retry + 냉장고 | 없음 | 위와 같은 `hasLoadedOnce` 문제 |
| 레시피를 불러오지 못했어요 | `app/(tabs)/recipe.tsx:305-315` | retry + 냉장고 | 없음 | 위와 같은 `hasLoadedOnce` 문제 |
| 페이지를 찾을 수 없어요 | `app/+not-found.tsx:8-12` | 냉장고 | 없음 | 적절 |
| 추천 결과를 불러올 수 없어요 | `app/recipe-swipe.tsx:430-446` | 내 레시피 탭 | 없음 | expired/missing cache guard로 적절 |

탭 3곳은 `catch`에서 error를 설정한 뒤 `finally`에서 성공 여부와 무관하게
`hasLoadedOnce=true`를 설정한다
(`app/(tabs)/index.tsx:352-365`,
`app/(tabs)/explore.tsx:93-118`,
`app/(tabs)/recipe.tsx:106-117`).
따라서 첫 실패의 최종 state에서도 `error && !hasLoadedOnce`가 false가 되어
ErrorScreen이 유지되지 않는다. 빈/기존 목록이 오류 설명 없이 표시될 수 있다.

### 2.5 Blocking Modal / BottomSheet / Alert

| UI와 위치 | 메시지 / 사건 | 사용자 선택 | 판정 |
| --- | --- | --- | --- |
| `ConfirmModal`, `components/PushPermissionPrompt.tsx:86` | 알림을 받아볼까요? | 허용 / 나중에 | OS permission 전 soft ask로 적절 |
| `ConfirmModal`, `components/NotificationPopup.tsx:407` | 선택한 N개 알림을 삭제할까요? | 삭제 / 취소 | 적절 |
| `ConfirmModal`, `app/recipe-swipe.tsx:692` | 안 본 레시피가 남은 상태에서 나가기 | 나가기 / 계속 | 적절 |
| `ConfirmModal`, `app/detail.tsx:568` | 저장하지 않은 변경사항 이탈 | 저장 / 나가기 | 적절 |
| `ConfirmModal`, `app/detail.tsx:578` | 삭제하시겠습니까? | 예 / 아니요 | 확인은 적절하나 destructive 색/구체적 대상 문구가 없음 |
| `ConfirmModal`, `app/cooking-ready.tsx:249` | 요리 중단 | 나가기 / 계속 | 적절 |
| `ConfirmModal`, `app/cooking-step.tsx:434` | 요리 중단 | 나가기 / 계속 | 적절 |
| `ConfirmModal`, `app/signup-profile.tsx:357` | 가입 중단, 입력 정보 삭제 | 그만두기 / 계속 | 적절 |
| `ConfirmModal`, `app/add-confirm.tsx:357` | 식재료 등록 취소 | 나가기 / 계속 작성 | 적절 |
| `ConfirmModal`, `app/(tabs)/recipe.tsx:589` | N개 내 레시피 제거 | 삭제 / 취소 | 적절 |
| `ConfirmModal`, `app/(tabs)/mypage.tsx:290` | Google 계정 영구 탈퇴 | 탈퇴 / 취소 | 적절 |
| `DeletePasswordModal`, `app/(tabs)/mypage.tsx:303` | LOCAL 계정 영구 탈퇴 + password 재확인 | 탈퇴 / 취소 | blocking 역할은 적절, password 오류 inline 부재 |
| `ConfirmModal`, `app/recipe-detail.tsx:818` | 내 레시피 제거 | 제거 / 취소 | 적절 |
| `FindPasswordModal`, `app/login.tsx:306` | 이메일 입력 후 임시 password 요청 | 요청 / 취소 | 입력 modal은 적절, 실패 표시 위치는 부적절 |
| `InfoModal`, `components/IngredientEditCard.tsx:415` | 내 재료 설명 | 닫기 | 정보성 modal로 적절 |
| `InfoModal`, `app/(tabs)/recipe.tsx:600` | AI 레시피 추천 설명 | 닫기 | 정보성 modal로 적절 |
| native `Alert`, `app/(tabs)/_layout.tsx:176` | 갤러리를 열 수 없음 | 확인 | blocking은 가능하나 설정 바로가기 없음 |
| native `Alert`, `app/(tabs)/_layout.tsx:195` | 카메라 권한 영구 거부 | 확인 | 행동이 필요한데 설정 바로가기 없음 |
| native `Alert`, `app/(tabs)/_layout.tsx:205,224` | 카메라 실행 불가/권한 없음 | 확인 | 원인 구분과 후속 action 부족 |
| input sheet, `app/recipe-detail.tsx:832-923` | 부족 재료를 냉장고에 추가 | 취소 / 추가 | 결정 확인이 아니라 입력 form이며 inline validation 역할이 맞음 |

Blocking 정책의 빈틈:

- 냉장고 다중 삭제:
  `app/(tabs)/index.tsx:370-412`에서 확인/Undo 없이 즉시 삭제
- 알림 단건 삭제:
  `components/NotificationPopup.tsx:501-516`에서 확인/Undo 없이 즉시 삭제

## 3. 확인된 복잡성과 문제점

### High

#### H-1. Swipe 저장 실패가 자동 소멸 Toast로만 끝나고 복구 데이터도 사라진다

- 근거:
  `app/recipe-swipe.tsx:474-494`
- 저장 전에 `savedDtosRef.current = []`로 비운다.
- 실패하면 error TopToast만 표시하고 buffer를 복원하지 않는다.
- completion이나 `beforeRemove`에서 실행될 수 있어 사용자가 이미 화면을 떠난 뒤
  실패할 수 있다.
- 영향:
  사용자가 저장했다고 생각한 레시피가 유실되며 retry할 수 없다.
- 권장:
  buffer를 성공 뒤 비우고, 실패 시 화면 상태 또는 retry action을 제공한다.

#### H-2. 알림함 네트워크 실패가 빈 목록 또는 "모든 알림 확인"으로 오인된다

- 근거:
  `context/NotificationContext.tsx:136-187`,
  `components/NotificationPopup.tsx:204-219,387-397`
- 첫 refresh의 page/count가 실패해도 error state가 없다. 기존 items가 비어 있으면
  popup은 "아직 알림이 없어요"를 표시한다.
- loadMore 실패는 `hasNext=false`로 바꾸므로 footer가
  "모든 알림을 확인했어요"라고 잘못 안내한다.
- 영향:
  서버 오류를 정상 empty/end로 오인한다.
- 권장:
  popup용 `initialError`/`paginationError`와 retry를 분리한다.

#### H-3. 주요 탭의 초기 ErrorScreen 분기가 최종 실패 state에서 유지되지 않는다

- 근거:
  `app/(tabs)/index.tsx:352-365,564-576`,
  `app/(tabs)/explore.tsx:93-118,225-235`,
  `app/(tabs)/recipe.tsx:106-117,305-315`
- 세 화면 모두 실패해도 `finally`에서 `hasLoadedOnce=true`를 설정한다.
- 영향:
  첫 API 실패가 empty state나 빈 목록으로 보이며 retry surface가 사라진다.
- 권장:
  성공한 첫 load만 `hasLoadedOnce`로 기록하거나
  `hasResolvedInitialRequest`와 `hasSuccessfulData`를 분리한다.

### Medium

#### M-1. 한 슬롯과 한 칸 queue 때문에 피드백이 교체·유실된다

- 근거:
  `components/Toast.tsx:168-178,203-237,245-286`
- Notification 중 여러 TopToast는 마지막 한 건만 남는다.
- Notification이 들어오면 이미 보이는 TopToast는 즉시 사라진다.
- 연속 Notification도 앞 항목이 사라진다.
- cooking complete처럼 error-error-success가 연속되는 실제 호출부가 있다.
- 권장:
  FIFO queue, priority, dedupe, coalescing 규칙 중 하나를 명시적으로 구현한다.

#### M-2. AI 완료 사건에 local callback과 remote push라는 두 producer가 있다

- 근거:
  `context/RecipeRecommendationContext.tsx:244-252`,
  `app/(tabs)/recipe.tsx:130-139`,
  `context/NotificationContext.tsx:360-383`
- 코드 주석은 backend가 `RECIPE_READY` remote push를 보낸다고 명시한다.
- 동시에 foreground local completion도 dropdown을 발생시킨다.
- 서버 발송 시점에 따라 중복 표시 가능성이 있으나 event id/dedupe key가 없다.
- 권장:
  완료 UX의 단일 source를 정하거나 같은 recommendation id로 dedupe한다.

#### M-3. 알림 read/delete 실패가 silent rollback이다

- 근거:
  `context/NotificationContext.tsx:189-303`
- mark read/all/type, 단건/일괄 삭제 실패가 모두 사용자 안내 없이 rollback된다.
- 삭제한 카드가 다시 나타나거나 읽음 dot이 돌아와도 원인을 알 수 없다.
- unread count도 mutation 직후 직접 보정하지 않아 다음 refresh까지 stale할 수 있다
  (`context/NotificationContext.tsx:122-125`).
- 권장:
  읽음은 silent retry 허용, 삭제는 최소 error feedback과 retry를 제공한다.

#### M-4. 수정 가능한 modal 입력 오류가 TopToast로 분리된다

- 비밀번호 찾기:
  `app/login.tsx:63-70`, `components/FindPasswordModal.tsx:44-115`
- LOCAL 탈퇴 password:
  `app/(tabs)/mypage.tsx:155-169`,
  `components/DeletePasswordModal.tsx:45-135`
- 서버 message가 잘못된 이메일/password를 뜻해도 modal 내부 error state가 없다.
- 권장:
  field validation/credential mismatch는 inline, network/5xx만 TopToast로 분리한다.

#### M-5. destructive 확인 정책이 화면별로 다르다

- 냉장고 다중 삭제는 확인/Undo 없음:
  `app/(tabs)/index.tsx:370-412`
- 내 레시피 다중 삭제는 ConfirmModal 사용:
  `app/(tabs)/recipe.tsx:589-598`
- 알림 일괄 삭제는 ConfirmModal, 단건 삭제는 즉시 실행:
  `components/NotificationPopup.tsx:80-83,407-416,501-516`
- 식재료 상세 삭제 modal은 destructive variant가 아니다:
  `app/detail.tsx:578-583`
- 권장:
  데이터 복구 가능성과 비용을 기준으로 confirmation/Undo 정책을 표로 고정한다.

#### M-6. 연속 success와 상충 success가 중요 error를 희석한다

- 회원가입:
  코드 전송, 이메일 인증, 가입 완료까지 success 3회
  (`app/signup.tsx:73,107`, `app/signup-profile.tsx:107`)
- 조리 완료:
  기록/삭제 실패 뒤에도 "맛있는 식사 되세요!"를 무조건 표시
  (`app/cooking-complete.tsx:131-165`)
- 권장:
  화면 상태 변화로 충분한 중간 success는 제거하고 최종 결과만 남긴다.

#### M-7. 서버 message 신뢰 정책이 모든 surface에서 너무 넓다

- 근거:
  `services/api.ts:38-45`
- 모든 Axios status의 `data.message`를 Toast, inline, ErrorScreen에 그대로 쓸 수 있다.
- 사용자 친화성, 길이, 내부 오류 문구 여부를 검사하지 않는다.
- TopToast는 최대 2줄이어서 긴 서버 문구가 잘릴 수 있다
  (`components/Toast.tsx:411-419`).
- 권장:
  4xx의 알려진 사용자 message만 우선하고, 5xx/unknown은 앱 fallback을 사용한다.

#### M-8. Notification의 시각적 affordance와 라우팅 guard가 실제 입력과 다르다

- action 없는 unknown foreground push도 `Pressable`로 렌더:
  `components/Toast.tsx:472-482`,
  `context/NotificationContext.tsx:381-383`
- `resolveNotificationAction()`은 read/readiness guard를 제공하지만 모든 실제 caller가
  `false/true`를 고정 전달:
  `utils/notificationRouting.ts:81-100`,
  `context/NotificationContext.tsx:344-349`,
  `components/NotificationPopup.tsx:188-191`
- 영향:
  사용자에게 눌리는 것처럼 보이지만 이동하지 않거나, 오래된 recipe 알림도 swipe로
  이동한 뒤 no-results가 될 수 있다.
- 권장:
  callback 없는 banner는 non-Pressable로 렌더하고 guard 책임을 한 계층에 둔다.

#### M-9. 피드백 없이 degraded 또는 stale 상태로 남는 경로가 있다

| 위치 | silent failure | 사용자 영향 |
| --- | --- | --- |
| `context/IngredientMasterContext.tsx:61-66` 및 모든 consumer | context에는 error가 있지만 consumer는 `snapshot`만 읽음 | picker/storage rule이 master 없이 동작해도 원인을 알 수 없음 |
| `app/(tabs)/index.tsx:541-556` | 검색 실패 시 이전 결과 유지 | 새 검색 결과로 오인 가능 |
| `app/(tabs)/index.tsx:352-365` | 성공 후 focus refetch 실패 | stale 냉장고 목록 |
| `app/(tabs)/explore.tsx:93-118` | 성공 후 검색/refresh 실패 | stale 공용 레시피 목록 |
| `app/(tabs)/recipe.tsx:106-117` | 성공 후 refresh 실패 | stale 내 레시피 목록 |
| `app/(tabs)/mypage.tsx:113-121` | logout 실패를 console.warn만 함 | 로그아웃 버튼이 무반응처럼 보일 수 있음 |
| `services/pushNotifications.ts:75-101` | push token 등록/삭제 실패를 best-effort 처리 | 권한은 켜졌지만 실제 push 미수신 가능 |
| `components/PushPermissionPrompt.tsx:65-77` | OS permission 호출 실패 silent | 사용자는 허용을 눌렀지만 결과 설명 없음 |

push token과 cache의 best-effort는 앱 부팅을 막지 않는다는 장점이 있다. 다만
마이페이지에서 사용자가 명시적으로 알림을 허용한 직후의 sync 실패까지 완전히
silent인 것은 운영 진단과 사용자 기대 모두에 취약하다.

### Low / Dead Code 후보

#### L-1. BottomSnackbar와 legacy Toast API는 호출이 없다

- `showSnackbar`, bottom placement, bottom style, action plumbing:
  `components/Toast.tsx:60-81,105-153,273-280,342-440,500-560`
- `showToast` compatibility API:
  `components/Toast.tsx:75-79,260-265`
- 현재 action 전달 호출도 0건이다.
- 가까운 시일 내 Action Snackbar 계획이 없다면 삭제 가능하다.

#### L-2. 도달하지 않거나 사용되지 않는 상태/분기가 있다

- AI recommendation `status: "error"`는 union과 caller guard에만 있고 실제 catch는
  `idle`을 설정:
  `context/RecipeRecommendationContext.tsx:85-90,298-324`,
  `app/(tabs)/recipe.tsx:298`
- notification `blockedReason`은 실제 caller 고정값 때문에 도달하지 않음:
  `utils/notificationRouting.ts:60-100`
- add-confirm의 별도 unmatched `validationError`는 공통 validation의 선행 return에
  막힘:
  `app/add-confirm.tsx:125-159`
- `mocks/notifications.ts`는 서비스 주석상 미참조:
  `services/notifications.ts:14-15`

#### L-3. iOS fullScreenModal Toast 상태를 코드 주석만으로 확정할 수 없다

- 파일 상단은 Portal도 iOS 문제를 해결하지 못했다고 기록:
  `components/Toast.tsx:1-31`
- 렌더 부분 주석은 Portal이 native presentation boundary를 우회한다고 기록:
  `components/Toast.tsx:295-298`
- 실제 TopToast caller인 `detail`, `crop`, `add-confirm`은 fullScreenModal:
  `app/_layout.tsx:121-135,174-180`
- 이는 확정 버그라기보다 현재 문서/주석 충돌이다. iOS runtime 회귀 검증 전에는
  "해결됨"과 "미해결" 어느 쪽도 단정하면 안 된다.

## 4. 문서와 코드 정합성

| 문서/주석 | 현재 코드와의 관계 | 조치 |
| --- | --- | --- |
| `docs/frontend/design-system.md:51-60` | TopToast/inline/NotificationDropdown/Modal 역할과 Snackbar 미사용은 대체로 일치 | queue의 교체·유실·dedupe 정책을 추가해야 함 |
| `docs/product/notification.md:69-107` | 타입, API, 라우팅, silent mutation TODO가 코드와 일치 | foreground local AI completion과 remote push 이중 producer를 명시해야 함 |
| `docs/flows/recipe-recommendation.md:51-58` | local completion dropdown과 remote push 경로를 둘 다 기록 | 단일 source/dedupe 정책은 TODO 상태 |
| `docs/frontend/state-management.md:11-18` | Context 책임 표는 현재 구조와 일치 | ToastContext가 두 transient surface를 arbitration한다는 설명 부족 |
| `docs/quality/verification.md:71-77` | 필요한 알림 QA 항목은 나열됨 | 실제 regression flow, payload fixture, expected route가 없음 |
| `docs/quality/frontend-audit-2026-07.md:29,139` | 43건 및 recipe-detail Toast+ErrorScreen 중복을 기록 | 현재는 42건이고 해당 중복은 제거되어 과거 snapshot임을 표시할 필요 |
| `context/NotificationContext.tsx:1-18` | 주석은 foreground listener 등이 "다음 round"라고 설명 | 기능이 이미 구현되어 오래된 주석 |
| `components/NotificationPopup.tsx:1-16` | state가 AppHeaderRight에 있고 예전 route 규칙을 쓴다고 설명 | state는 Provider 소유이고 실제 공통 resolver 사용 |
| `services/notifications.ts:8-15` | unread-count를 future, mock을 임시 보존으로 설명 | unread-count는 구현 완료 |
| `services/pushNotifications.ts:8-10` | token issue-only이며 server 등록은 future라고 설명 | 같은 파일에 server 등록/삭제 wrapper가 구현됨 |
| `app/_layout.tsx:65-73` | server upload는 later, token log로만 검증한다고 설명 | AuthContext는 이미 로그인/복구 시 server sync 수행 |

추가 보안/운영 후보:

- `app/_layout.tsx:69-72`는 발급된 Expo push token을 그대로 console에 남긴다.
  통합 검증이 끝났다면 개발 로그도 제거하거나 마스킹하는 편이 안전하다.

## 5. 단순화 대안

### A. 현재 구조 유지, 규칙만 명확화

| 항목 | 평가 |
| --- | --- |
| 장점 | 파일 이동이 거의 없고 기존 UI 회귀 위험이 가장 낮다. |
| 단점 | 한 Provider/한 슬롯 구조, dual AI producer, push와 feedback의 비대칭 queue가 그대로 남는다. |
| 변경 범위 | 문서, 호출부 몇 곳의 inline 전환, queue 배열화, silent failure 보완 |
| 회귀 위험 | 낮음 |
| KeepEat 적합성 | 단기 hotfix에는 적합, 최종 구조로는 부족 |

필수 최소 조치:

1. `ToastProvider`에 명시적 FIFO 또는 priority queue를 둔다.
2. AI 완료 source를 하나로 고정한다.
3. modal field error를 inline으로 이동한다.
4. 알림함 initial/pagination error를 분리한다.
5. Snackbar/legacy API는 reserved가 아니라 deprecated 여부를 명시한다.

### B. TopToast와 NotificationDropdown을 하나의 typed TopBanner로 통합

예시 모델:

```ts
type TopBannerItem =
  | {
      kind: "feedback";
      variant: "success" | "error" | "warning" | "info";
      message: string;
      dedupeKey?: string;
    }
  | {
      kind: "notification";
      title: string;
      message: string;
      onPress?: () => void;
      dedupeKey: string;
    };
```

| 항목 | 평가 |
| --- | --- |
| 장점 | safe area, animation, z-index, queue, dedupe를 한 host에서 해결한다. 현재 `ToastProvider`가 이미 두 UI를 그리므로 이동 거리가 짧다. |
| 단점 | 타입 구분을 느슨하게 만들면 일반 feedback까지 tappable notification처럼 보일 수 있다. Provider 이름과 API를 명확히 바꿔야 한다. |
| 변경 범위 | `components/Toast.tsx`를 `TopBannerHost` 성격으로 정리, 두 호출 API migration, queue/dedupe test |
| 회귀 위험 | 중간 |
| KeepEat 적합성 | 현재 규모에 가장 적합 |

권장 queue:

- 화면에는 항상 한 개만 표시
- notification은 feedback보다 우선하되 기존 feedback을 삭제하지 않고 보류
- error는 success/info보다 먼저 표시
- 같은 `dedupeKey`는 마지막 내용으로 합침
- 최대 queue 길이를 정하고 drop 시 success/info부터 제거
- `onPress`가 없으면 `Pressable`을 렌더하지 않음

### C. 앱 Feedback과 실제 Notification을 Provider부터 완전히 분리

| 항목 | 평가 |
| --- | --- |
| 장점 | 피드백과 알림 domain 책임이 가장 명확하다. Notification Provider가 OS listener, tray, banner를 모두 소유하고 Feedback Provider는 Toast만 소유한다. |
| 단점 | 두 Provider가 같은 top 영역을 차지하므로 별도 z-order/priority coordinator가 필요하다. 파일과 테스트 이동이 가장 크다. |
| 변경 범위 | Provider tree, overlay host, NotificationContext, RecipeRecommendationContext, 모든 호출부 |
| 회귀 위험 | 중간에서 높음 |
| KeepEat 적합성 | 알림 action/type이 더 늘거나 inbox 기능이 커질 때 적합. 현재는 과한 편 |

## 6. 추천 정책과 리팩터링 단계

### 추천하는 가장 단순한 최종 정책

KeepEat 현재 규모에는 **B의 typed TopBanner 한 개**가 가장 단순하다.

| 사건 | 최종 surface | 규칙 |
| --- | --- | --- |
| 사용자가 즉시 수정할 수 있는 입력 오류 | InlineValidation | field/card/modal 안에 유지, CTA disabled와 같은 validation source 사용 |
| 초기 화면 load 실패 | ErrorScreen | retry 또는 back 제공, TopBanner 중복 금지 |
| 짧은 비차단 결과 | feedback TopBanner | non-Pressable, success/error/warning/info |
| 실제 foreground notification | actionable TopBanner | route가 있을 때만 Pressable, title/body 표시 |
| 파괴적이거나 되돌리기 어려운 결정 | ConfirmModal | 실행 전에 확인 |
| background/terminated remote push | OS Push | payload type을 검증하고 탭 route 적용 |
| BottomSnackbar | 사용하지 않음 | 실제 Undo/retry 요구가 생길 때 별도 product decision |

핵심은 시각 surface를 하나로 만들되 `feedback`과 `notification` 타입을 지우지 않는
것이다. `NotificationContext`는 OS 수신/라우팅을 계속 소유하고, TopBanner host는
오직 표시/queue/dedupe만 담당해야 한다.

### 실제 리팩터링 단계

1. **정확성 결함 먼저 수정**
   - swipe save buffer 복구/retry
   - 알림함 initial/pagination error
   - 탭 3곳의 initial ErrorScreen state
   - cooking complete partial failure 결과
2. **현재 정책 위반 호출 정리**
   - 비밀번호 찾기와 LOCAL 탈퇴 password 오류를 modal inline으로 이동
   - 가입 중간 success Toast 축소
   - recipe-detail sheet의 중복 validation summary 제거 또는 역할 명확화
3. **Typed TopBanner host 도입**
   - feedback/notification union
   - priority/FIFO/dedupe contract
   - callback 없는 banner는 non-Pressable
4. **AI 완료 source 단일화**
   - backend push를 source of truth로 정하거나
   - local fallback과 remote push에 동일 recommendation `dedupeKey` 부여
5. **Notification bootstrap 책임 이동**
   - `setNotificationHandler()`를 RecipeRecommendationContext 밖의 notification
     bootstrap/module로 이동
6. **Dead code 제거**
   - `showSnackbar`, bottom placement/style, legacy `showToast`
   - 사용되지 않는 recommendation `error` 상태
   - 도달하지 않는 blocked/unmatched 분기
7. **회귀 계약 추가**
   - queue ordering/dedupe unit test
   - foreground known/unknown payload
   - background/cold-start 타입별 route
   - 알림함 refresh/loadMore/delete 실패
   - fullScreenModal 위 feedback iOS UI test
8. **관련 문서와 오래된 주석 갱신**

## 7. 최종 한 장 요약

### 현재 시스템

| 계층 | 표시 주체 | 호출/진입점 | 위치·수명 | action | 현재 판정 |
| --- | --- | --- | --- | --- | --- |
| OS Push | iOS/Android | backend remote push | OS 결정 | payload type route | background/terminated 역할은 명확 |
| Foreground Notification | `ToastProvider.NotificationView` | push listener, local AI completion | top, 4초 | 선택적 route | 두 producer, action 없는 Pressable, dedupe 없음 |
| TopToast | `ToastProvider.FeedbackView` | 42개 호출 | top, 3.2초 | 현재 0건 | 일반 정책은 정착, single-slot 유실 위험 |
| InlineValidation | 각 화면 + `IngredientEditCard` | form/card state | field/card 내부, 지속 | 입력 수정 | 대체로 적절, 일부 modal Toast와 중복 |
| ErrorScreen | 공통 component | 초기 load/route error | 화면 전체, 지속 | retry/back | Toast 중복은 제거됐으나 탭 3곳 state bug |
| Blocking Modal | Confirm/native Modal/Alert | 삭제, 탈퇴, 이탈, 권한 | 결정할 때까지 지속 | confirm/cancel | 대체로 적절, 삭제 정책과 설정 action 불일치 |
| BottomSnackbar | 예약 코드만 | 호출 0건 | 미사용 | 미사용 | 제거 가능 |

### 가장 복잡하게 만드는 원인 3개

1. 일반 feedback과 실제 notification이 한 Provider, 한 state, 한 timer를 공유하면서
   우선순위와 queue를 ad-hoc ref 하나로 처리한다.
2. push lifecycle이 `NotificationContext`, `RecipeRecommendationContext`,
   recipe tab, Toast UI에 분산되고 AI 완료 사건에는 local/remote producer가 둘이다.
3. API 실패 정책이 화면마다 Toast, inline, ErrorScreen, silent catch로 흩어져 있고
   `getErrorMessage()`가 surface 구분 없이 서버 문자열을 전달한다.

### 제거 가능한 기능·코드

- 호출 0건인 `showSnackbar`와 bottom placement/style/token
- 호출 0건인 legacy `showToast`
- action 호출이 생기기 전까지의 unused action snackbar plumbing
- 실제로 설정되지 않는 recommendation `error` 상태
- 현재 caller 입력으로는 도달하지 않는 notification `blockedReason` 분기
- 공통 validation 선행 return 뒤의 add-confirm unmatched error branch
- 미참조 notification mock과 완료된 milestone을 future로 적은 주석
- 통합 검증이 끝난 Expo push token 원문 console log

### 유지해야 할 기능

- foreground에서 OS 배너를 억제하고 인앱 알림으로 전환하는 정책
- notification tray, unread count, 타입별 읽음, cold-start 라우팅
- `success/error/warning/info` feedback 의미 구분
- field/card inline validation과 CTA disabled의 공통 validation source
- 초기 load 실패의 지속형 ErrorScreen
- 삭제/탈퇴/이탈의 명시적 ConfirmModal
- push permission soft ask
- BottomSnackbar 미사용 정책

### 결론

현재 정책의 큰 방향은 맞지만 구현의 핵심 병목은 **표시 surface가 아니라
전달·queue·실패 복구 규칙**이다. TopToast를 더 늘리거나 Provider를 즉시 둘로
쪼개기보다, feedback과 notification 타입을 유지한 하나의 typed TopBanner host로
queue와 dedupe를 먼저 단일화하는 것이 KeepEat에 가장 단순하다. 그 전에 swipe
저장 유실, 알림함 false empty/end, 탭 초기 ErrorScreen의 세 정확성 문제를 우선
해결해야 한다.
