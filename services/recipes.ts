import { api } from "@/services/api";
import type { ReactionType, RecipeListItem } from "@/constants/domain";

// ─── DTO Types ───────────────────────────────────────────────────────────────

export interface RecipeIngredientDto {
  name: string;
  amount: string; // e.g. "200g", "1/2개", "적당량"
  /** Present on detail responses — whether the user already has the item. */
  isOwned?: boolean;
  /** PENDING blocks "요리하기" entry until the ingredient is fully onboarded. */
  status?: "ACTIVE" | "PENDING";
}

/** AI 생성 응답 — calories/cookingTime은 서버가 string으로 줌. */
export interface GeneratedRecipeDto {
  recipeName: string;
  difficulty: string;
  cookingMethod: string;
  cookingTime: string;
  calories: string;
  requiredIngredients: RecipeIngredientDto[];
  instructions: string[];
}

/** 내 레시피 목록 한 행. */
export interface MyRecipeListEntryDto {
  recipeId: number;
  recipeName: string;
  description?: string;
  cookingTime: string;
  difficulty: "상" | "중" | "하";
  /** kcal 정수. 없을 수도 있어 폴백 처리. */
  calories: number;
  cookingMethod?: string;
  likeCount: number;
  dislikeCount: number;
  myReaction: ReactionType | null;
  createdAt?: string;
}

/** 레시피 상세 — 공용/내 레시피 동일 엔드포인트, isRegisteredMyRecipe로 구분. */
export interface RecipeDetailDto {
  recipeId: number;
  recipeName: string;
  description?: string;
  difficulty: "상" | "중" | "하";
  cookingTime: string;
  calories: number;
  cookingMethod?: string;
  requiredIngredients: RecipeIngredientDto[];
  instructions: string[];
  createdAt?: string;
  isRegisteredMyRecipe: boolean;
  likeCount: number;
  dislikeCount: number;
  myReaction: ReactionType | null;
}

/** GET /api/v1/recipes 페이징 응답. */
export interface RecipeSearchResponse {
  recipes: RecipeListItem[];
  nextCursor: string | null;
  hasNext: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function mapDifficulty(difficulty?: string): string {
  switch (difficulty) {
    case "상":
      return "어려움";
    case "중":
      return "중간";
    case "하":
      return "쉬움";
    default:
      return difficulty || "쉬움";
  }
}

export function mapDifficultyToBackend(difficulty?: string): string {
  switch (difficulty) {
    case "어려움":
    case "고급":
      return "상";
    case "중간":
    case "중급":
      return "중";
    case "쉬움":
    case "초급":
      return "하";
    default:
      return "하";
  }
}

// ─── API Functions ───────────────────────────────────────────────────────────

/**
 * AI 레시피 생성 작업 접수 (POST /api/v1/recipes/generate).
 * 202 응답에는 결과나 job ID가 없으며, 결과는 사용자별 /result에서 조회한다.
 */
export async function requestAiRecipeGeneration(): Promise<void> {
  await api.post("/api/v1/recipes/generate");
}

interface GeneratedRecipeResultDto {
  recipes: GeneratedRecipeDto[];
}

/**
 * 현재 사용자의 AI 레시피 생성 결과 (GET /api/v1/recipes/result).
 * 409는 아직 생성 중이며 호출자가 순차 polling한다.
 */
export async function getAiRecipeResult(
  timeoutMs?: number,
): Promise<GeneratedRecipeDto[]> {
  const { data } = await api.get<GeneratedRecipeResultDto>(
    "/api/v1/recipes/result",
    timeoutMs === undefined ? undefined : { timeout: timeoutMs },
  );
  return data.recipes ?? [];
}

/**
 * 레시피 DB 저장 (POST /api/v1/recipes) — 벌크.
 * 스와이프 화면 등에서 유저가 '저장'을 선택한 레시피를 백엔드에 등록합니다.
 */
export async function saveRecipes(recipes: GeneratedRecipeDto[]): Promise<void> {
  await api.post("/api/v1/recipes", { recipes });
}

/**
 * 공용 레시피 검색 (GET /api/v1/recipes)
 * 커서 페이징 — 처음 요청은 cursor 미지정, 이후 응답의 nextCursor를 그대로 전달.
 * 검색어 미지정 시 전체 목록 페이지 단위로 반환.
 */
export async function searchRecipes(params: {
  keyword?: string;
  cursor?: string;
  size?: number;
}): Promise<RecipeSearchResponse> {
  const { data } = await api.get<RecipeSearchResponse>("/api/v1/recipes", {
    params: {
      keyword: params.keyword,
      cursor: params.cursor,
      size: params.size,
    },
  });
  return data;
}

/**
 * 레시피 상세 (GET /api/v1/recipes/detail/{recipeId})
 * 공용 상세 — 응답의 isRegisteredMyRecipe로 내 레시피 여부를 분기. 별도
 * "내 레시피 전용" 엔드포인트는 없음 (이전 /my-recipes/detail/{id} 경로는
 * 폐기됨, 이 한 함수로 통합).
 */
export async function getRecipeDetail(recipeId: number): Promise<RecipeDetailDto> {
  const { data } = await api.get<RecipeDetailDto>(
    `/api/v1/recipes/detail/${recipeId}`,
  );
  return data;
}

/** `getRecipeDetail`의 명시적 별칭 — 호출 의도(공용 상세)를 코드에 드러낼 때. */
export const getPublicRecipeDetail = getRecipeDetail;

/**
 * 좋아요/싫어요 토글 (POST /api/v1/recipes/{recipeId}/reaction)
 * 같은 reactionType을 다시 보내면 해제, 다른 종류로 보내면 전환.
 * 응답 본문은 사용하지 않음 (성공/실패만 try-catch로 구분).
 */
export async function toggleReaction(
  recipeId: number,
  reactionType: ReactionType,
): Promise<void> {
  await api.post(`/api/v1/recipes/${recipeId}/reaction`, { reactionType });
}

/**
 * 요리 완료 (POST /api/v1/recipes/{recipeId}/cook)
 * 서버가 plain-string 메시지를 응답하며, 이를 토스트로 그대로 노출 권장.
 */
export async function completeCooking(recipeId: number): Promise<string> {
  const { data } = await api.post<string>(
    `/api/v1/recipes/${recipeId}/cook`,
  );
  return data;
}

/**
 * 내 레시피 추가 (POST /api/v1/my-recipes) — 벌크.
 * 공용 레시피를 보관함에 등록. body는 ID 배열 하나.
 */
export async function addToMyRecipes(recipeIds: number[]): Promise<void> {
  await api.post("/api/v1/my-recipes", { recipeIds });
}

/**
 * 내 레시피 목록 조회 (GET /api/v1/my-recipes)
 * 내 보관함에 저장된 레시피 목록을 최신순으로 가져옵니다.
 *
 * 서버가 현재 `{ myRecipes: [...] }`로 한 단 감싸 응답한다. 과거/다른
 * 환경에서는 배열을 그대로 줄 수도 있으므로 양쪽을 모두 받아내고 호출처는
 * 항상 평탄한 배열을 받도록 정리.
 */
type MyRecipesResponse =
  | MyRecipeListEntryDto[]
  | { myRecipes: MyRecipeListEntryDto[] };

export async function getMyRecipes(): Promise<MyRecipeListEntryDto[]> {
  const { data } = await api.get<MyRecipesResponse>("/api/v1/my-recipes");
  if (Array.isArray(data)) return data;
  return data?.myRecipes ?? [];
}

/**
 * 내 레시피 삭제 (DELETE /api/v1/my-recipes?recipeIds=…) — 벌크.
 * 단건이라도 배열에 담아 전달. axios의 paramsSerializer 기본 동작이
 * 배열을 `recipeIds=1&recipeIds=2`로 직렬화하지만 백엔드가 콤마 구분을
 * 요구하므로 명시적으로 `recipeIds=1,2,3` 형태로 보냄.
 */
export async function deleteMyRecipes(recipeIds: number[]): Promise<void> {
  await api.delete("/api/v1/my-recipes", {
    params: { recipeIds: recipeIds.join(",") },
  });
}
