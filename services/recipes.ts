import { api } from "@/services/api";

// ─── DTO Types ───────────────────────────────────────────────────────────────

export interface RecipeIngredientDto {
  name: string;
  amount: string; // e.g. "200g", "1/2개"
  isOwned?: boolean; // Only present in detail response
}

export interface GeneratedRecipeDto {
  recipeName: string;
  difficulty: string;
  cookingMethod: string;
  cookingTime: string;
  calories: string;
  requiredIngredients: RecipeIngredientDto[];
  instructions: string[];
}

export interface MyRecipeListEntryDto {
  recipeId: number;
  recipeName: string;
  description: string;
  cookingTime: string;
  difficulty: string;
  calories: string;
}

export interface RecipeDetailDto {
  recipeId: number;
  recipeName: string;
  description: string;
  difficulty: string;
  cookingTime: string;
  requiredIngredients: RecipeIngredientDto[];
  instructions: string[];
  createdAt: string;
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
 * AI 레시피 생성 (POST /api/v1/recipes/generate)
 * 사용자의 냉장고 재료를 바탕으로 5개의 추천 레시피를 생성합니다.
 * 식재료/조미료가 부족할 경우 400 에러가 발생할 수 있습니다.
 */
export async function generateAiRecipes(): Promise<GeneratedRecipeDto[]> {
  const { data } = await api.post<{ recipes: GeneratedRecipeDto[] }>("/api/v1/recipes/generate", undefined, {
    timeout: 120000,
  });
  return data.recipes || [];
}

/**
 * 레시피 DB 저장 (POST /api/v1/recipes)
 * 스와이프 화면 등에서 유저가 '저장'을 선택한 레시피를 백엔드에 등록합니다.
 */
export async function saveRecipes(recipes: GeneratedRecipeDto[]): Promise<void> {
  await api.post("/api/v1/recipes", { recipes });
}

/**
 * 내 레시피 목록 조회 (GET /api/v1/my-recipes)
 * 내 보관함에 저장된 레시피 목록을 최신순으로 가져옵니다.
 */
export async function getMyRecipes(): Promise<MyRecipeListEntryDto[]> {
  const { data } = await api.get<MyRecipeListEntryDto[]>("/api/v1/my-recipes");
  return data;
}

/**
 * 내 레시피 상세 조회 (GET /api/v1/my-recipes/detail/{recipeId})
 * 특정 레시피의 전체 정보(재료, 조리 순서)와 보유 여부(isOwned)를 가져옵니다.
 */
export async function getRecipeDetail(recipeId: number): Promise<RecipeDetailDto> {
  const { data } = await api.get<RecipeDetailDto>(`/api/v1/my-recipes/detail/${recipeId}`);
  return data;
}

/**
 * 내 레시피 삭제 (DELETE /api/v1/my-recipes/{recipeId})
 * 내 보관함에서 레시피를 삭제합니다.
 */
export async function deleteMyRecipe(recipeId: number): Promise<void> {
  await api.delete(`/api/v1/my-recipes/${recipeId}`);
}
