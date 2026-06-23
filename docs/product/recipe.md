# 레시피 도메인

## 확인된 현재 구조

레시피 기능은 다음 파일들이 중심이다.

- 공용 레시피 탐색: `app/(tabs)/explore.tsx`
- 내 레시피: `app/(tabs)/recipe.tsx`
- 레시피 상세: `app/recipe-detail.tsx`
- AI 추천 스와이프: `app/recipe-swipe.tsx`
- 조리 준비: `app/cooking-ready.tsx`
- 조리 단계: `app/cooking-step.tsx`
- 조리 완료: `app/cooking-complete.tsx`
- API/DTO: `services/recipes.ts`
- 추천 전역 상태: `context/RecipeRecommendationContext.tsx`
- 인분 계산: `utils/recipeServings.ts`

## API와 DTO

`services/recipes.ts`에서 확인된 엔드포인트:

- `POST /api/v1/recipes/generate`
- `POST /api/v1/recipes`
- `GET /api/v1/recipes`
- `GET /api/v1/recipes/detail/{recipeId}`
- `POST /api/v1/recipes/{recipeId}/reaction`
- `POST /api/v1/recipes/{recipeId}/cook`
- `POST /api/v1/my-recipes`
- `GET /api/v1/my-recipes`
- `DELETE /api/v1/my-recipes?recipeIds=...`

확인된 DTO:

- `GeneratedRecipeDto`: AI 생성 응답. `recipeName`, `difficulty`, `cookingMethod`, `cookingTime`, `calories`, `requiredIngredients`, `instructions`.
- `RecipeListItem`: 공용 레시피 검색 행.
- `RecipeDetailDto`: 공용/내 레시피 상세 통합 응답. `isRegisteredMyRecipe`로 내 레시피 여부를 구분한다.
- `MyRecipeListEntryDto`: 내 레시피 목록 행.

난이도 매핑:

- API `상` -> 화면 `어려움`
- API `중` -> 화면 `중간`
- API `하` -> 화면 `쉬움`

## 공용 레시피

`app/(tabs)/explore.tsx`에서 확인된 동작:

- `searchRecipes({ keyword, cursor, size })`를 사용한다.
- 커서 페이징 기반이다.
- 카드에서 좋아요/싫어요를 누르면 `toggleReaction()`을 호출한다.
- 상세 이동은 `/recipe-detail?id={recipeId}`다.

## 내 레시피

`app/(tabs)/recipe.tsx`에서 확인된 동작:

- focus될 때 `getMyRecipes()`를 호출한다.
- 검색, 정렬, 필터는 현재 클라이언트의 `recipes` 배열 위에서 수행한다.
- 좋아요/싫어요는 optimistic update 후 실패 시 rollback한다.
- long press 또는 삭제 모드에서 여러 레시피를 선택하고 `deleteMyRecipes(ids[])`를 호출한다.
- AI 추천 버튼은 `RecipeRecommendationContext`의 상태에 따라 생성 요청 또는 `/recipe-swipe` 이동을 수행한다.

## 레시피 상세과 조리

`app/recipe-detail.tsx`:

- `id` route param으로 `getRecipeDetail(recipeId)`를 호출한다.
- `getOwnedIngredientsByRecipe(recipeId)`를 병렬 호출해 보유 재료 매칭을 보강한다.
- 내 레시피가 아니면 `addToMyRecipes([recipeId])` CTA를 보여준다.
- 내 레시피면 `cooking-ready` 또는 `cooking-complete`로 이동할 수 있다.
- 상세에서 부족한 재료를 냉장고에 추가할 때 `createIngredients([req])`를 호출한다.

조리 흐름:

- `cooking-ready`: 상세와 보유 재료를 불러와 보유/부족 재료를 분리한다. `servings` param을 받을 수 있다.
- `cooking-step`: 단계별 instructions를 보여주고, 시간 표현을 감지해 타이머를 제공한다.
- `cooking-complete`: `completeCooking(recipeId)`로 조리 완료를 기록하고, 선택한 보유 식재료를 `deleteUserIngredients(ids)`로 삭제할 수 있다.

## AI 추천

AI 추천 상세 흐름은 `docs/flows/recipe-recommendation.md`에 따로 정리한다.

확인된 핵심:

- 추천 요청은 `generateAiRecipes()`가 담당한다.
- 생성 timeout은 120초다.
- 결과는 `RecipeRecommendationContext`에서 24시간 AsyncStorage 캐시된다.
- 스와이프에서 저장한 원본 `GeneratedRecipeDto`는 `saveRecipes()`로 벌크 저장한다.

## TODO / 확인 필요

- AI 추천 생성 기준과 백엔드가 사용하는 식재료 범위.
- `GeneratedRecipeDto`의 `calories`, `cookingTime` 문자열 포맷 확정.
- `POST /api/v1/recipes` 저장의 중복/멱등 정책.
- 조리 완료가 서버에서 어떤 통계나 히스토리를 갱신하는지.
- `getOwnedIngredientsByRecipe`의 매칭 기준이 이름인지 master id인지.
- 공용 레시피 필터/정렬이 향후 서버 기반으로 이동할지 여부.
