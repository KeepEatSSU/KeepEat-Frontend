/**
 * KeepEat — domain types & UI constants.
 *
 * Single source of truth for the app's domain shapes. Persists past the
 * mock-data era — when the backend is wired up, only `mocks/index.ts`
 * should disappear; the types and constants here stay.
 */

import { CATEGORIES } from "@/constants/ingredients-master";

// ─── Shared Types ─────────────────────────────────────────────────────────────

export type StorageType = "room" | "fridge" | "frozen";
export type Unit = "g" | "개" | "ml";

export interface Ingredient {
  id: string;
  category: string;
  name: string; // 소분류 (예: "양파", "우유", "스팸")
  nickname: string; // 유저 입력 별명 (예: "햇양파", "매일 소화잘되는 우유")
  storageType: StorageType;
  quantity: string;
  purchaseDate: string;
  expirationDate: string | Date | null;
  /** Server-computed days until expiry. Optional because mocks may omit it. */
  daysLeft?: number;
  /** Master ingredient ID echoed from the backend. Null/undefined for custom items. */
  ingredientId?: number | null;
  /** True when the user added this item outside the master catalog ("내 재료"). */
  isCustom?: boolean;
}

export interface Category {
  id: string;
  label: string;
  type: "all" | "storageType" | "category";
}

export interface IngredientDraft {
  id: string;
  /** Master ingredient ID from the backend. Required for create requests. */
  ingredientId?: number;
  name: string;
  nickname: string;
  quantity: number | null;
  unit: Unit;
  /** Null = 미선택. Forced explicit pick before submit. */
  storage: StorageType | null;
  expirationDate: Date | null;
  /**
   * 사용자가 만료일을 직접 수정했는지. true면 보관 변경 시 만료일이 마스터
   * 평균으로 자동 갱신되지 않음. 새 마스터를 picker로 선택하면 false로 리셋.
   */
  expirationManuallySet?: boolean;
  /** 사용자가 마스터 DB 외에 직접 등록한 "내 재료" 여부. 레시피 추천에 사용 안 됨. */
  isCustom?: boolean;
  /** isCustom ON 시 ingredientId 백업. OFF 시 복원에 사용. UI에 노출되지 않는 내부 필드. */
  _backupIngredientId?: number;
  /** isCustom ON 시 nickname 백업. OFF 시 복원에 사용. */
  _backupNickname?: string;
  /** isCustom ON 시 name 백업. OFF 시 이름이 변경됐는지 판단해 ingredientId 복원 여부 결정. */
  _backupName?: string;
}

export type ReactionType = "LIKE" | "DISLIKE";

export interface Recipe {
  id: string;
  title: string;
  matchCount: number;
  totalCount: number;
  difficulty: string;
  time: string;
  kcal: string;
  method?: string;
  ingredients?: string[];
  /** Simple cooking-order list for the swipe card's flip-back face. */
  steps?: string[];
  // ─── Backend-echoed fields (optional — older fixtures may omit) ─────
  description?: string;
  likeCount?: number;
  dislikeCount?: number;
  myReaction?: ReactionType | null;
  isRegisteredMyRecipe?: boolean;
  createdAt?: string;
}

export interface RecipeIngredient {
  name: string;
  /** Backend-shaped display string ("200g", "2큰술", "적당량"). */
  amount: string;
  /** True when the user already has this ingredient in their fridge. */
  isOwned?: boolean;
  /** Backend status — PENDING means the item is still being onboarded and
   *  blocks entry to the cooking flow. */
  status?: "ACTIVE" | "PENDING";
}

export interface RecipeDetail {
  id: string;
  title: string;
  description?: string;
  difficulty: string;
  time: string;
  kcal: string;
  method?: string;
  ingredients: RecipeIngredient[];
  /** Plain string instructions in cooking order. Timer hints, if any,
   *  are extracted from the instruction text downstream (regex). */
  steps: string[];
  createdAt?: string;
  likeCount?: number;
  dislikeCount?: number;
  myReaction?: ReactionType | null;
  isRegisteredMyRecipe?: boolean;
}

/** GET /api/v1/recipes 응답의 한 행 (공용 검색·페이징). */
export interface RecipeListItem {
  recipeId: number;
  recipeName: string;
  difficulty: "상" | "중" | "하";
  cookingMethod: string;
  cookingTime: string;
  calories: number;
  createdAt: string;
  likeCount: number;
  dislikeCount: number;
  myReaction: ReactionType | null;
}

export interface ManagementTip {
  title: string;
  body: string;
  highlight: string;
}

// ─── In-app notifications ─────────────────────────────────────────────────────

export type NotificationType =
  | "notice"
  | "expiry_soon"
  | "recipe_ready";

export interface AppNotification {
  id: number;
  type: NotificationType;
  title: string;
  body: string;
  /**
   * 알림 탭 시 이동할 대상 ID(예: 식재료 ID, 레시피 ID). 백엔드 응답에 같이
   * 옴. A-2에서 라우팅에 활용 예정 — 현재 mock에선 비워둠.
   */
  targetId?: number | string;
  isRead: boolean;
  /** ISO 8601 timestamp (e.g. "2026-05-10T09:30:00Z"). */
  createdAt: string;
}

// ─── Shared Constants ─────────────────────────────────────────────────────────

export const UNITS: Unit[] = ["g", "개", "ml"];

// Single source of truth for CapacityInput tap-step increments (per-unit).
export const CAPACITY_STEP: Record<Unit, number> = {
  g: 10,
  ml: 50,
  "개": 1,
};

export const STORAGE_OPTIONS: { key: StorageType; label: string }[] = [
  { key: "room", label: "실온" },
  { key: "fridge", label: "냉장" },
  { key: "frozen", label: "냉동" },
];

// ─── Fridge Filter Chips ─────────────────────────────────────────────────────
// Drives the home tab's filter row: "전체" + 3 storage types + the 10 master
// categories. Every backend ingredient is guaranteed to map into one of the
// 10 master categories, so no fallback bucket is needed.
//
// Intentionally still reads `CATEGORIES` directly from the local seed (not
// `getMasterSnapshot().categories`) — this is a module-scope const consumed
// at app start, before the master fetch can complete. The category set is
// stable enough that a one-launch lag on rename/addition is acceptable; if
// that ever changes, convert this to a function and call it per render.

export const FRIDGE_FILTER_CHIPS: Category[] = [
  { id: "all", label: "전체", type: "all" },
  { id: "room", label: "실온", type: "storageType" },
  { id: "fridge", label: "냉장", type: "storageType" },
  { id: "frozen", label: "냉동", type: "storageType" },
  ...CATEGORIES.map((c) => ({
    id: `cat-${c.id}`,
    label: c.name,
    type: "category" as const,
  })),
];
