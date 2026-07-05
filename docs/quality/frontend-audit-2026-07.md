# KeepEat 프론트엔드 품질 감사 2026-07

감사 기준: 현재 브랜치 `feature/FE/init`, 2026-07-05.

범위:

- 사용자 피드백 체계: `TopToast`, inline validation, foreground notification dropdown, modal/bottom sheet, `BottomSnackbar` 잔여 참조
- 화면 상태: 주요 route의 loading / empty / error / retry 처리와 조용히 무시되는 API 실패
- 접근성/테스트 안정성: 핵심 selector 후보, 텍스트 selector 의존, 버튼 라벨
- 문서-코드 정합성: `AGENTS.md`, `ARCHITECTURE.md`, `docs/frontend`, `docs/quality`, 관련 product/flow 문서

코드 수정은 하지 않았고, 이 문서만 새로 작성했다.

## 요약

Critical은 발견하지 못했다. 다만 사용자가 막힐 수 있는 High 항목이 3개 있다.

| Severity | 개수 | 요약 |
| --- | ---: | --- |
| Critical | 0 | 즉시 서비스 중단급 문제는 확인되지 않음 |
| High | 3 | 레시피 상세 오류 중복 피드백, 조리 단계 빈 instructions 무한 로딩, 레시피 상세 재료 추가 validation 부재 |
| Medium | 7 | 일부 API 실패 silent 처리, Toast queue 한계, 문서/주석 불일치, 직접 진입 edge case |
| Low | 6 | 과도한 성공 Toast 후보, BottomSnackbar 예약 코드, 접근성/testID 부족, 문서 TODO 노후화 |

## 피드백 사용처 전수

### TopToast

현재 앱/컨텍스트 호출부 기준 `showTopToast(` 호출은 43건이다. 일반 비차단 피드백은 대부분 최종 정책과 맞게 TopToast로 이동해 있다.

| 파일 | 호출 위치 | 사용자 행동/상황 | 메시지/variant | 판정 |
| --- | --- | --- | --- | --- |
| `app/(tabs)/index.tsx` | 394, 399, 404 | 냉장고 선택 삭제 전체 실패/부분 실패/성공 | error, warning, success | 적합 |
| `app/(tabs)/explore.tsx` | 142 | 공용 레시피 다음 페이지 실패 | error | 적합 |
| `app/(tabs)/explore.tsx` | 218 | 좋아요/싫어요 실패 rollback | error | 적합 |
| `app/(tabs)/recipe.tsx` | 208 | 내 레시피 좋아요/싫어요 실패 rollback | error | 적합 |
| `app/(tabs)/recipe.tsx` | 267, 272 | 내 레시피 벌크 삭제 성공/실패 | success, error | 적합 |
| `app/(tabs)/mypage.tsx` | 81 | OS 설정 앱 열기 실패 | error | 적합 |
| `app/(tabs)/mypage.tsx` | 135, 146, 163 | 회원 탈퇴 성공/실패 | success, error | 적합 |
| `app/add-confirm.tsx` | 172, 178 | 식재료 등록 성공/실패 | success, error | 적합 |
| `app/change-password.tsx` | 80 | 비밀번호 변경 성공 | success | 적합, 단 서버 검증 실패는 inline 유지 |
| `app/cooking-complete.tsx` | 136, 149, 158 | 조리 기록 저장 실패, 재료 삭제 실패, 완료 성공 | error, error, success | 부분 검토 필요 |
| `app/crop.tsx` | 110, 293 | 이미지 크기 로딩 실패, OCR 실패 | error | 적합. 버튼 전 validation은 inline 사용 |
| `app/detail.tsx` | 346, 353, 376, 379 | 식재료 저장/삭제 성공/실패 | success, error | 적합 |
| `app/login.tsx` | 59, 67, 110 | 비밀번호 찾기 성공/실패, Google 로그인 실패 | success, error | 적합. 로그인 실패는 inline 유지 |
| `app/recipe-detail.tsx` | 337 | 레시피 상세 초기 로드 실패 | error | 정책 불일치 후보. ErrorScreen과 중복 |
| `app/recipe-detail.tsx` | 438, 444 | 부족 재료 냉장고 추가 성공/실패 | success, error | validation 보강 필요 |
| `app/recipe-detail.tsx` | 462 | 상세 좋아요/싫어요 실패 rollback | error | 적합 |
| `app/recipe-detail.tsx` | 479, 484, 504, 509 | 내 레시피 추가/제거 성공/실패 | success, error | 적합 |
| `app/recipe-swipe.tsx` | 482, 487 | AI 추천 저장 성공/실패 | success, error | 적합 |
| `app/signup.tsx` | 73, 107 | 인증번호 전송, 이메일 인증 완료 | success | 과도한 성공 Toast 후보 |
| `app/signup-profile.tsx` | 107 | 회원가입 완료 | success | 적합 |
| `context/RecipeRecommendationContext.tsx` | 274, 307, 315 | AI 추천 시작 안내, 식재료 부족, 생성 실패 | info, warning, error | 적합 |

### InlineValidation

| 파일 | 위치 | 역할 | 판정 |
| --- | --- | --- | --- |
| `app/login.tsx` | 89, 214-222 | 로그인 실패를 폼 내부 에러로 표시 | 적합 |
| `app/signup.tsx` | 78-80, 114, 197-207, 267-269 | 이메일 형식/전송/인증번호 검증 | 적합 |
| `app/signup-profile.tsx` | 115-120, 310-325 | 비밀번호 불일치/가입 실패 | 적합. route param edge case 있음 |
| `app/change-password.tsx` | 85-90, 265-280 | 새 비밀번호 불일치/서버 검증 실패 | 적합 |
| `app/add-confirm.tsx` | 155-160, 304-314 | 매칭 필요 항목 | 적합 |
| `components/IngredientEditCard.tsx` | 287-318 | 식재료 선택 필요/수량 확인 | 적합 |
| `app/crop.tsx` | 181-186, 380-384 | 이미지 미선택/이미지 로딩 중 | 적합 |

### NotificationDropdown

`components/Toast.tsx`의 `showNotification(message, onTap?, title?)`가 foreground push와 AI 완료 알림에 쓰인다.

| 파일 | 위치 | 상황 | 판정 |
| --- | --- | --- | --- |
| `context/NotificationContext.tsx` | 380 | 유효한 foreground push. tap 시 `resolveNotificationAction` 기반 이동 | 적합 |
| `context/NotificationContext.tsx` | 382 | 알 수 없는 타입의 foreground push. tap action 없음 | 적합 |
| `app/(tabs)/recipe.tsx` | 133-136 | AI 레시피 완료. tap 시 `/recipe-swipe` 이동 | 적합 |

### Modal / BottomSheet

확인/판단이 필요한 액션은 대체로 modal/bottom sheet에 남아 있다.

| 파일 | 위치 | 역할 | 판정 |
| --- | --- | --- | --- |
| `app/detail.tsx` | 568, 578 | 저장하지 않고 나가기, 식재료 삭제 확인 | 적합 |
| `app/add-confirm.tsx` | 378 | 등록 취소 확인 | 적합 |
| `app/recipe-detail.tsx` | 794, 808 | 내 레시피 제거 확인, 부족 재료 추가 bottom sheet | 적합. 추가 sheet validation 보강 필요 |
| `app/(tabs)/recipe.tsx` | 589, 600 | 내 레시피 벌크 삭제 확인, AI 추천 안내 | 적합 |
| `app/(tabs)/mypage.tsx` | 290, 303 | 회원 탈퇴 확인/비밀번호 입력 | 적합 |
| `app/recipe-swipe.tsx` | 692 | 스와이프 화면 나가기 확인 | 적합 |
| `app/cooking-ready.tsx` | 249 | 요리 중단 확인 | 적합 |
| `app/cooking-step.tsx` | 415 | 요리 중단 확인 | 적합 |
| `components/NotificationPopup.tsx` | 407 | 알림 벌크 삭제 확인 | 적합 |
| `components/PushPermissionPrompt.tsx` | 86 | push 권한 soft ask | 적합 |

### BottomSnackbar / dead code 후보

일반 앱 호출부에서 `showSnackbar(` 호출은 없다. 남은 참조는 모두 `components/Toast.tsx`의 예약 API와 bottom placement 스타일이다.

근거:

- `components/Toast.tsx:80-81`: `showSnackbar`를 future action snackbar로 주석 처리
- `components/Toast.tsx:273-279`: action이 있으면 bottom, action이 없으면 top으로 normalize
- `components/Toast.tsx:520-560`: `snackbar`, `snackbarText`, `snackbarAction` 스타일 잔존
- `docs/frontend/design-system.md:60`: BottomSnackbar는 일반 피드백 미사용, 향후 action snackbar 검토라고 문서화

판정: 정책 위반은 아니지만 현재 product flow에서 action snackbar 사용처가 없으므로 Low dead-code 후보로 유지한다.

## 화면 상태 감사

| 화면 | Loading | Empty | Error | Retry | 관찰 |
| --- | --- | --- | --- | --- | --- |
| 냉장고 `app/(tabs)/index.tsx` | 603-608 | 659-686 | 566-576 | 있음 | 검색 실패는 551-556에서 silent |
| 공용 레시피 `app/(tabs)/explore.tsx` | 305-308 | 343-361 | 225-235 | 있음 | 최초 실패만 ErrorScreen. 이후 refresh/search 실패는 조용히 남을 수 있음 |
| 내 레시피 `app/(tabs)/recipe.tsx` | 496-499 | 544-570 | 305-315 | 있음 | 최초 실패만 ErrorScreen. 이후 refresh 실패는 별도 안내 없음 |
| 마이페이지 `app/(tabs)/mypage.tsx` | 없음 | 해당 없음 | 권한 API 실패 fallback | 없음 | 권한 API 실패는 설정 앱 fallback 또는 행 숨김 |
| 로그인 `app/login.tsx` | 버튼 spinner | 해당 없음 | inline error | 폼 재시도 | 적합 |
| 회원가입 `app/signup.tsx` | 버튼 spinner | 해당 없음 | inline error | 폼 재시도 | 성공 Toast가 많음 |
| 회원가입 프로필 `app/signup-profile.tsx` | 버튼 spinner | 해당 없음 | inline error | 폼 재시도 | email param 비어도 폼 진행 가능 |
| 비밀번호 변경 `app/change-password.tsx` | 버튼 spinner | 해당 없음 | inline error | 폼 재시도 | 적합 |
| 식재료 상세 `app/detail.tsx` | 201-211 | 없음 | 192-198 | 없음 | ErrorScreen에 retry 없음 |
| 식재료 등록 `app/add-confirm.tsx` | 제출 spinner | 빈 draft | inline + TopToast | 폼 재시도 | 적합 |
| OCR crop `app/crop.tsx` | processing overlay | 이미지 placeholder | inline + TopToast | 버튼 재시도 | 적합 |
| 레시피 상세 `app/recipe-detail.tsx` | 529-534 | 없음 | 518-525 | 뒤로가기만 | 초기 로드 실패가 Toast+ErrorScreen 중복 |
| AI swipe `app/recipe-swipe.tsx` | 626-631 | no-results 430-445 | 저장 실패 TopToast | retry 있음 | 적합 |
| 조리 준비 `app/cooking-ready.tsx` | 115-126 | 부족 재료 섹션 | 104-112 | 뒤로가기만 | owned fetch 실패는 빈 배열로 fallback |
| 조리 단계 `app/cooking-step.tsx` | 256-263 | 없음 | 245-253 | 뒤로가기만 | instructions가 빈 배열이면 무한 spinner |
| 조리 완료 `app/cooking-complete.tsx` | 179-186 | 재료 선택 없음 허용 | 168-176 | 뒤로가기만 | 조리 기록/재료 삭제 실패 후에도 완료 success가 이어질 수 있음 |
| 알림 팝업 `components/NotificationPopup.tsx` | 204-210 | 387-397 | 없음 | 없음 | context mutation 실패는 rollback/silent |

## Findings

### Critical

없음.

### High

| ID | 파일/위치 | 문제 설명 | 사용자 영향 | 권장 조치 | 예상 작업량 |
| --- | --- | --- | --- | --- | --- |
| H-1 | `app/recipe-detail.tsx:335-345`, `app/recipe-detail.tsx:518-525` | 레시피 상세 초기 로드 실패에서 `showTopToast`를 띄운 뒤 같은 오류를 `ErrorScreen`으로 다시 보여준다. 화면 진입 실패는 transient feedback보다 화면 상태에 가깝다. | 같은 오류가 상단 Toast와 본문 ErrorScreen에 중복 노출되어 소란스럽고, header/safe area를 가릴 수 있다. | 초기 load failure에서는 TopToast를 제거하고 ErrorScreen에 메시지와 retry/back action을 단일화한다. | S |
| H-2 | `app/cooking-step.tsx:201-205`, `app/cooking-step.tsx:256-263` | `totalSteps === 0`일 때 loading 화면을 계속 반환한다. API가 빈 instructions를 주면 영구 spinner가 된다. | 사용자가 조리 단계에서 빠져나갈 이유나 재시도 방법을 알 수 없다. | 빈 steps를 ErrorScreen 또는 empty state로 분리하고, 뒤로가기/레시피 상세로 돌아가기 액션을 제공한다. | S |
| H-3 | `app/recipe-detail.tsx:364-371`, `app/recipe-detail.tsx:433-448`, `app/recipe-detail.tsx:860-870` | 부족 재료 추가 bottom sheet의 draft 기본 `quantity`가 `null`인데 확인 버튼이 항상 활성이고, inline validation 없이 바로 `mapIngredientToCreateRequest`/API 호출로 간다. | 사용자가 현재 화면에서 고쳐야 하는 입력 오류를 TopToast/API 실패로 받는다. 정책상 inline validation 대상이다. | `IngredientEditCard`의 수량/이름/storage 검증과 동일 기준으로 CTA disabled, inline validation, submitting gate를 추가한다. | M |

### Medium

| ID | 파일/위치 | 문제 설명 | 사용자 영향 | 권장 조치 | 예상 작업량 |
| --- | --- | --- | --- | --- | --- |
| M-1 | `context/NotificationContext.tsx:181-183`, `197-199`, `210-212`, `243-245`, `274-299` | 알림 loadMore/read/delete 실패가 대부분 silent rollback 또는 `hasNext=false` 처리만 한다. `docs/product/notification.md`도 삭제/읽음 실패 UX를 TODO로 둔다. | 알림이 다시 나타나거나 더 불러오기가 중단되어도 사용자가 원인을 모른다. | 알림 popup 내부 inline/TopToast 정책을 정하고, 적어도 삭제/읽음 실패에는 짧은 error TopToast 또는 row-level 상태를 제공한다. | M |
| M-2 | `app/(tabs)/index.tsx:551-556` | 냉장고 검색 실패가 prior results 유지 + silent catch다. | 네트워크 실패 시 사용자가 검색어와 맞지 않는 오래된 결과를 새 결과로 오인할 수 있다. | 검색 실패 시 검색 row 아래 inline hint 또는 TopToast error를 추가하고 stale result 표시 기준을 정한다. | S |
| M-3 | `app/(tabs)/explore.tsx:109-116`, `225-235`; `app/(tabs)/recipe.tsx:112-116`, `305-315` | 공용/내 레시피는 최초 실패만 ErrorScreen을 보여주고, 이미 로드된 뒤 focus/refresh 실패는 `error` state만 남고 화면에는 노출되지 않는다. | pull-to-refresh나 tab 복귀 시 데이터 갱신 실패가 조용히 지나가 stale list를 최신으로 착각할 수 있다. | `hasLoadedOnce` 이후 실패에는 TopToast error 또는 list 상단 inline stale banner를 표준화한다. | S |
| M-4 | `components/Toast.tsx:177`, `245-253`, `203-207` | NotificationDropdown이 떠 있는 동안 TopToast는 `queuedTopToastRef` 한 개만 저장한다. 알림 표시 중 여러 TopToast가 오면 마지막 하나만 남는다. | 연속 액션 결과 중 일부 피드백이 사라질 수 있다. | 단일 ref를 queue 배열로 바꾸거나, 교체 정책을 문서에 명시하고 중요도 높은 error를 우선한다. | M |
| M-5 | `components/Toast.tsx:1-21`, `295-298`; `app/_layout.tsx:121-180` | Toast 파일 상단 주석은 iOS `fullScreenModal` 위 Toast가 표시되지 않는 known issue라고 쓰지만, 아래 구현 주석은 Portal로 우회한다고 설명한다. 실제 fullScreenModal 화면들도 TopToast를 호출한다. | 향후 작업자가 오류 상태를 잘못 이해해 불필요한 우회나 회귀를 만들 수 있다. | 주석을 현재 검증 결과 기준으로 갱신하고, fullScreenModal 대표 화면 Toast QA 문서를 남긴다. | S |
| M-6 | `app/signup-profile.tsx:53-54`, `80-81`, `106` | `/signup-profile`이 `email` param 없이 직접 열리면 readonly email이 빈 문자열이어도 canSubmit이 true가 될 수 있다. | 사용자가 수정할 수 없는 빈 이메일로 가입 요청을 보내고 서버 오류만 보게 된다. | email param 누락 시 ErrorScreen/로그인 복귀 또는 submit disabled + inline 안내를 추가한다. | S |
| M-7 | `context/IngredientMasterContext.tsx:18-25`, `61-65`; `components/IngredientPickerSheet.tsx:61-182`; `components/IngredientEditCard.tsx:67-117` | Ingredient master context는 `status/error/isReady`를 제공하지만 picker/card 사용처는 대부분 `snapshot` null을 빈 목록/기본값처럼 다룬다. | 마스터 로드 실패나 초기 로딩이 “검색 결과 없음/자동 보관 불가”처럼 보일 수 있다. | master loading/error UI 기준을 정하고 picker 진입 시 로딩/재시도/seed fallback 여부를 명확히 표시한다. | M |

### Low

| ID | 파일/위치 | 문제 설명 | 사용자 영향 | 권장 조치 | 예상 작업량 |
| --- | --- | --- | --- | --- | --- |
| L-1 | `app/signup.tsx:73`, `app/signup.tsx:107`, `app/signup-profile.tsx:107` | 회원가입 흐름에 성공 Toast가 연속으로 세 번 발생할 수 있다. | 성공 피드백이 지나치게 잦아 “중요한 안내”의 밀도가 낮아진다. | 인증번호 전송은 버튼 상태/inline helper로 대체 가능한지 검토하고, 최종 가입 완료만 Toast로 남기는 안을 비교한다. | S |
| L-2 | `app/cooking-complete.tsx:131-165` | 조리 기록 저장 실패 또는 재료 삭제 실패 TopToast 후에도 1.8초 뒤 “맛있는 식사 되세요!” success가 항상 나온다. | 실패와 성공이 연속으로 보여 결과 해석이 어려울 수 있다. | 부분 실패 시 success 문구를 조건부로 바꾸거나, 완료 success를 화면 전환/상태로 대체한다. | S |
| L-3 | `components/Toast.tsx:80-81`, `273-279`, `520-560` | `showSnackbar`와 bottom snackbar 스타일이 예약 코드로 남아 있다. 일반 호출은 0건이다. | 지금은 영향 없음. 다만 새 호출자가 실수로 action snackbar를 도입할 여지가 있다. | public API에 deprecated/reserved 주석을 더 강하게 두거나, action snackbar 도입 시점까지 내부 export만 유지한다. | S |
| L-4 | `app/(tabs)/_layout.tsx:73-82`, `components/RecipeListCard.tsx:95-138`, `app/recipe-detail.tsx:620-676`, `app/crop.tsx:301-316` | FAB, reaction icon button, 일부 back/close icon button에 명시적 accessibility label/role이 없다. | screen reader와 Maestro selector 안정성이 떨어진다. | 아이콘 전용/상태형 Pressable에 label, role, selected/disabled state를 추가한다. | M |
| L-5 | `components/IngredientPickerSheet.tsx:194-205,367`, `components/IngredientEditCard.tsx:242`; `docs/quality/test-ids.md:18-31` | 현재 testID는 식재료 선택 하네스 4개에 집중되어 있다. 탭/FAB/AddMenu/등록 완료/레시피 상세 CTA/AI 추천/알림 popup에는 안정 selector가 없다. | Maestro 회귀 테스트가 텍스트/좌표 selector에 의존한다. | 아래 “testID 후보”를 우선순위대로 추가한다. | M |
| L-6 | `docs/quality/test-ids.md:40-46`, `docs/quality/verification.md:45-55`; `artifacts/*` | 품질 문서는 E2E 도구를 “확인 필요”로 두지만, repository에는 Maestro/Expo MCP 관찰 산출물이 이미 축적되어 있다. package script에는 E2E가 없다는 점은 맞다. | 새 작업자가 실제 QA 관례를 문서에서 찾기 어렵다. | “자동화 스크립트는 없음, 수동 UI QA는 Maestro MCP/Expo MCP 산출물 사용”처럼 현재 상태를 문서화한다. | S |

## 접근성 및 테스트 안정성

### testID가 필요한 핵심 플로우 후보

| 우선순위 | 후보 testID | 근거/대상 | 이유 |
| --- | --- | --- | --- |
| P0 | `tab.fab.add-button`, `add-menu.sheet.root`, `add-menu.manual-button`, `add-menu.gallery-button`, `add-menu.camera-button` | `app/(tabs)/_layout.tsx:73-82`, `components/AddMenuSheet.tsx:103-151` | 식재료 등록의 공통 시작점인데 현재 텍스트/좌표 의존 |
| P0 | `ingredient-registration.confirm-button`, `ingredient-registration.cancel-button` | `app/add-confirm.tsx:336-374` | 등록 성공 Toast 검증의 핵심 CTA |
| P1 | `recipe-list.card`, `recipe-list.like-button`, `recipe-list.dislike-button` | `components/RecipeListCard.tsx:54-141` | 카드 텍스트가 동적이고 reaction 버튼이 아이콘+숫자라 selector 불안정 |
| P1 | `recipe-detail.add-my-recipe-button`, `recipe-detail.remove-my-recipe-button`, `recipe-detail.start-cooking-button` | `app/recipe-detail.tsx:561-575`, `749-788` | 저장/삭제/조리 진입 회귀 테스트 핵심 |
| P1 | `recipe-recommendation.request-button`, `recipe-recommendation.info-button` | `app/(tabs)/recipe.tsx:444-491` | AI 추천 상태별 버튼 텍스트가 바뀌어 안정 ID 필요 |
| P2 | `notification-popup.root`, `notification-popup.card`, `notification-popup.mark-all-read-button`, `notification-popup.delete-mode-button` | `components/NotificationPopup.tsx:223-418` | 알림 텍스트가 서버 데이터라 text selector 의존 위험 |
| P2 | `cooking-step.next-button`, `cooking-step.prev-button`, `cooking-step.complete-button` | `app/cooking-step.tsx:363-412` | 조리 단계 진행/완료 회귀 테스트 필요 |

### 텍스트 selector 의존이 큰 화면

- `components/AddMenuSheet.tsx:136-151`: 메뉴 항목 label만 안정 selector 역할을 한다.
- `components/RecipeListCard.tsx:54-141`: 카드 전체 accessible label/testID가 없고 recipe name이 서버 데이터다.
- `app/recipe-detail.tsx:749-788`: CTA 문구가 등록 상태에 따라 바뀐다.
- `components/NotificationPopup.tsx:450-518`: 알림 카드 label이 서버 title/body 조합이다.
- `app/cooking-step.tsx:401-403`: 마지막 단계에서 “다음 단계”가 “요리 완료”로 바뀐다.

### 접근성 라벨이 불명확한 버튼

- 중앙 FAB: `app/(tabs)/_layout.tsx:73-82`
- 레시피 카드 like/dislike: `components/RecipeListCard.tsx:95-138`
- 레시피 상세 reaction: `app/recipe-detail.tsx:620-676`
- crop 취소 버튼: `app/crop.tsx:301-316`
- 식재료 상세 close/delete: `app/detail.tsx:399-438`
- 비밀번호 보기/숨기기 토글: `app/login.tsx:203-209`, `app/signup-profile.tsx:231-237`, `app/change-password.tsx:153-159,187-193,257-263`

### Maestro 회귀 테스트 후보 5개

1. P0 수동 식재료 등록 성공
   - FAB -> AddMenu manual -> IngredientPicker -> 식재료 선택 -> 보관 위치 선택 -> 완료 -> TopToast success -> 냉장고 목록 반영.
2. P0 레시피 상세 저장/제거
   - 공용 레시피 카드 -> detail -> 내 레시피 추가 TopToast -> 제거 ConfirmModal -> 제거 TopToast -> CTA 상태 전환.
3. P1 AI 레시피 추천 상태
   - 내 레시피 탭 -> 추천 버튼 -> loading state -> 부족 재료 warning 또는 ready notification/dropdown -> `/recipe-swipe` 진입.
4. P1 알림 popup 읽음/삭제
   - bell -> NotificationPopup -> mark all read -> delete mode -> bulk delete ConfirmModal -> empty/footer 상태.
5. P2 조리 플로우
   - recipe-detail -> cooking-ready -> cooking-step next/prev/timer -> cooking-complete -> 선택 재료 삭제/완료 TopToast.

## 문서-코드 정합성

| 문서 | 현재 내용 | 코드 근거 | 판정/권장 |
| --- | --- | --- | --- |
| `docs/frontend/design-system.md:55-60` | TopToast/inline/NotificationDropdown/Modal 정책과 BottomSnackbar 미사용 정책 | `components/Toast.tsx:260-279`, 앱 호출부 `showSnackbar(` 0건 | 대체로 정합 |
| `docs/frontend/navigation.md:20-31` | AuthGate가 login/signup/signup-profile만 auth route로 취급 | `app/_layout.tsx:36-47` | 정합. `change-password` TODO는 유지 가능 |
| `docs/frontend/navigation.md:35-56` | route 목록과 params | `app/_layout.tsx:103-181` | 대체로 정합 |
| `docs/frontend/state-management.md:13-21` | Context 목록 | `context/*`, `components/Toast.tsx` | 정합 |
| `docs/frontend/api-contracts.md:17-20` | OCR은 fetch 직접 사용 | `services/ocr.ts` | 정합 |
| `docs/product/notification.md` | 알림 삭제/읽음 실패 UX TODO | `context/NotificationContext.tsx:181-299` | TODO가 실제 이슈로 남아 있음 |
| `docs/flows/recipe-recommendation.md` | 시작 안내 Toast, 400 부족 재료 warning, 완료 NotificationDropdown | `context/RecipeRecommendationContext.tsx:270-320`, `app/(tabs)/recipe.tsx:130-139` | 정합 |
| `docs/quality/test-ids.md` | 현재 testID 4개만 문서화 | `components/IngredientPickerSheet.tsx:194,205,367`, `components/IngredientEditCard.tsx:242` | 정합. 확장 필요 |
| `docs/quality/verification.md` | E2E 테스트 전용 script 없음 | `package.json` scripts | 정합 |
| `components/Toast.tsx` 내부 주석 | fullScreenModal 위 Toast known issue vs Portal 우회 설명 | `components/Toast.tsx:1-21`, `295-298` | 파일 내부 설명끼리 충돌. 갱신 필요 |

## 내일 바로 처리할 상위 3개

1. `app/cooking-step.tsx` 빈 instructions 무한 spinner 해결
   - 작고 위험 대비 효과가 크다. 빈 steps를 ErrorScreen/empty state로 분리하면 조리 플로우의 막힘을 바로 줄인다.
2. `app/recipe-detail.tsx` 초기 로드 실패 피드백 중복 제거
   - TopToast 정책과 화면 상태 정책을 동시에 바로잡을 수 있다. ErrorScreen에 retry/back을 명확히 넣는 방향이 좋다.
3. `app/recipe-detail.tsx` 부족 재료 추가 bottom sheet inline validation/disabled 처리
   - 현재 사용자가 바로 고칠 수 있는 입력 오류가 API error로 흐를 수 있다. 정책상 InlineValidation으로 옮기기 가장 명확한 항목이다.

