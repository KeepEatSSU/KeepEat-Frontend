# AI 레시피 추천 흐름

## 관련 파일

- 추천 시작 UI: `app/(tabs)/recipe.tsx`
- 추천 상태: `context/RecipeRecommendationContext.tsx`
- 스와이프 화면: `app/recipe-swipe.tsx`
- 레시피 API: `services/recipes.ts`
- 알림 라우팅: `utils/notificationRouting.ts`, `context/NotificationContext.tsx`

## 추천 요청

`app/(tabs)/recipe.tsx`의 추천 버튼은 `useRecipeRecommendation()` 상태에 따라 동작한다.

- `status === "ready"`이면 `markSwiping()` 후 `/recipe-swipe`로 이동한다.
- `status`가 `idle` 또는 `error`이면 `requestRecommendation()`을 호출한다.
- 그 외 상태에서는 중복 요청을 막는다.

`requestRecommendation()`:

- 상태를 `loading`으로 바꾼다.
- 안내 toast를 표시한다.
- `generateAiRecipes()`를 호출한다.
- 실패 시 400은 식재료 부족 메시지 fallback, 그 외는 일반 생성 오류 fallback을 사용한다.

`generateAiRecipes()`:

- `POST /api/v1/recipes/generate`
- timeout 120초
- 응답 `{ recipes: GeneratedRecipeDto[] }`

## 추천 결과 보관

`RecipeRecommendationContext`에서 확인된 상태:

- `status`: `idle`, `loading`, `ready`, `swiping`, `error`
- `recommendedRecipes`: 화면 표시용 domain `Recipe[]`
- `rawRecipes`: 저장용 원본 `GeneratedRecipeDto[]`
- `savedRecipes`
- `requestedAt`
- `completedAt`

추천 완료 시:

- AI DTO를 스와이프 UI용 `Recipe`로 매핑한다.
- 원본 DTO는 `rawRecipes`에 보관한다.
- 결과를 AsyncStorage에 저장한다.
- 캐시 key는 `keepeat:lastRecommendation`이다.
- TTL은 24시간이다.

## 완료 알림

`app/(tabs)/recipe.tsx`는 `onComplete()` 콜백을 등록한다.

- 앱이 foreground인 경우 인앱 드롭다운으로 `AI 셰프가 레시피를 완성했어요!`를 표시한다.
- 드롭다운을 누르면 `markSwiping()` 후 `/recipe-swipe`로 이동한다.

원격 Push의 `RECIPE_READY`는 `NotificationContext`와
`utils/notificationRouting.ts`에서 `/recipe-swipe`로 연결된다. Push 탭에
유효한 `notificationId`가 있으면 해당 알림 한 건만 읽고, 구형 Push처럼 ID가
없으면 읽음 처리 없이 route만 수행한다. `/recipe-swipe` 직접 진입이나 결과
표시 자체는 알림을 읽음 처리하지 않는다.

라우팅과 별개로 `RecipeRecommendationContext`가 같은 push를 받아
`recoverResultFromPush`로 결과를 복구한다. `RECIPE_READY`는 서버에 결과가
존재한다는 확정 신호로 취급한다: 기존 polling run의 2분 deadline이
background에서 만료됐더라도 poller를 신선한 deadline으로 재시작해
`GET /api/v1/recipes/result`를 최소 1회 보장한다 (409면 폴링 재개,
`POST /generate` 재발행은 없음). poller의 pause는 deadline 시계를 정지시켜
background 체류 시간이 polling 예산을 소진하지 않는다. deck이 이미
`ready`/`swiping`이면 지연 도착한 중복 push는 무시한다.
하네스: `scripts/test/recipe-result-poller.test.mjs`.

## 스와이프 저장

`app/recipe-swipe.tsx`:

- 오른쪽 swipe는 현재 index의 원본 `GeneratedRecipeDto`를 `savedDtosRef`에 쌓고, context의 `saveRecipe(recipe)`도 호출한다.
- 왼쪽 swipe는 `discardRecipe(recipe)`를 호출하고 다음 카드로 이동한다.
- deck이 끝나거나 화면을 벗어나기 전 `flushSaves()`가 `saveRecipes(dtos)`를 한 번 호출한다.
- 저장 후 toast를 보여준다.
- 완료/나가기/재시도는 명시적으로 `/(tabs)/recipe`로 replace한다.

## 빈 결과/복원 가드

`recipe-swipe`는 콜드스타트에서 AsyncStorage 복원을 기다리기 위해 짧은 grace 시간을 둔다. 복원 후에도 추천 결과가 없으면 `no-results` 상태로 본다.

## TODO / 확인 필요

- 서버의 "마지막 추천 결과 조회 GET" 도입 여부. 코드 주석에는 R2로 언급되어 있다.
- AI 추천 완료 push가 백엔드에서 어떤 시점에 발송되는지.
- foreground 안내와 remote push 중복 방지의 최종 정책.
- 사용자가 일부 레시피만 저장한 경우 서버 저장의 중복/실패 재시도 정책.
- `discardRecipe()`가 현재 no-op인 것이 의도된 최종 동작인지.
