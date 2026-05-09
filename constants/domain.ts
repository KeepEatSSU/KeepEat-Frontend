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
  storage: StorageType;
  expirationDate: Date | null;
}

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
}

export interface RecipeIngredient {
  name: string;
  amount: number;
  unit: string;
  owned: boolean;
}

export interface RecipeStep {
  order: number;
  instruction: string;
  timerSeconds?: number;
}

export interface RecipeDetail {
  id: string;
  title: string;
  matchCount: number;
  totalCount: number;
  difficulty: string;
  time: string;
  kcal: string;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
}

export interface ManagementTip {
  title: string;
  body: string;
  highlight: string;
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
