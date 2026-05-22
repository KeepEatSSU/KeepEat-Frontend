/**
 * KeepEat — user-ingredients API + domain mapping.
 *
 * Wraps the backend's 5 user-ingredient endpoints behind functions that
 * speak the frontend's domain types (`Ingredient` / `IngredientDraft`).
 * All HTTP goes through the shared `api` axios instance, so auth tokens,
 * 401-refresh, and dev logging come for free.
 *
 * Mapping policy
 *   Backend storageType is Korean ("실온"/"냉장"/"냉동") but the entire
 *   frontend (mocks, screens, filters) uses English keys ("room"/"fridge"
 *   /"frozen"). We translate at the boundary so the rest of the app
 *   stays insulated from server-shape changes.
 *
 *   Likewise, backend `quantity` + `unit` are separate fields, but the
 *   frontend's `Ingredient.quantity` is a pre-formatted display string
 *   (e.g. "500g"). We compose it in the mapper.
 *
 * Usage:
 *   const items = await fetchAllIngredients();
 *   const updated = await updateIngredient(42, { quantity: 200 });
 */

import { api } from "@/services/api";
import type {
  Ingredient,
  IngredientDraft,
  StorageType,
} from "@/constants/domain";
import {
  CATEGORIES,
  SUB_CATEGORIES,
} from "@/constants/ingredients-master";

// ─── Backend DTOs (kept private to this module) ──────────────────────────────

type ApiStorageType = "실온" | "냉장" | "냉동";

interface UserIngredientResponse {
  id: number;
  name: string;
  customName?: string;
  categoryName: string;
  subCategoryName?: string;
  storageType: ApiStorageType;
  quantity: number;
  unit: string;
  purchaseDate: string; // YYYY-MM-DD
  expiryDate: string;   // YYYY-MM-DD
  daysLeft: number;
}

export interface UserIngredientCreateRequest {
  ingredientId: number;
  storageType: ApiStorageType;
  purchaseDate: string;
  expiryDate?: string;
  quantity?: number;
  unit?: string;
  customName?: string;
}

export interface UserIngredientRequest {
  storageType?: ApiStorageType;
  quantity?: number;
  unit?: string;
  expiryDate?: string;
  purchaseDate?: string;
  customName?: string;
}

// ─── Storage-type mapping ────────────────────────────────────────────────────

const STORAGE_API_TO_DOMAIN: Record<ApiStorageType, StorageType> = {
  실온: "room",
  냉장: "fridge",
  냉동: "frozen",
};

const STORAGE_DOMAIN_TO_API: Record<StorageType, ApiStorageType> = {
  room: "실온",
  fridge: "냉장",
  frozen: "냉동",
};

export function mapStorageTypeFromApi(api: ApiStorageType): StorageType {
  return STORAGE_API_TO_DOMAIN[api];
}

export function mapStorageTypeToApi(domain: StorageType): ApiStorageType {
  return STORAGE_DOMAIN_TO_API[domain];
}

// ─── Date helpers ────────────────────────────────────────────────────────────

/** "YYYY-MM-DD" → "MM.DD" to match the existing display format used by mocks. */
function toShortPurchaseDate(iso: string): string {
  // iso is expected as YYYY-MM-DD; defensive parse keeps display sane on bad input.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[2]}.${m[3]}`;
}

/** "YYYY-MM-DD" → Date at local midnight. Returns null on bad input. */
function parseExpiryDate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Date → "YYYY-MM-DD". */
function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ─── Category normalization ──────────────────────────────────────────────────
// Resolves whatever `categoryName` / `subCategoryName` the backend returns
// into one of the 10 master categories. Every ingredient in the master is
// guaranteed to belong to one of these, so an unmatched value is a data
// drift signal — we log it in dev and pass the raw string through so the
// item still appears under "전체" rather than getting silently dropped.

const CATEGORY_NAMES = new Set(CATEGORIES.map((c) => c.name));
const SUBCATEGORY_TO_CATEGORY = new Map<string, string>(
  SUB_CATEGORIES.flatMap((sc) => {
    const parent = CATEGORIES.find((c) => c.id === sc.categoryId);
    return parent ? [[sc.name, parent.name] as [string, string]] : [];
  }),
);

export function categoryFromApi(apiName: string | undefined): string {
  if (!apiName) return "";
  if (CATEGORY_NAMES.has(apiName)) return apiName;
  const viaSub = SUBCATEGORY_TO_CATEGORY.get(apiName);
  if (viaSub) return viaSub;
  if (__DEV__) {
    console.warn(
      `[categoryFromApi] unrecognized category "${apiName}" — passing through`,
    );
  }
  return apiName;
}

// ─── Ingredient mappers ──────────────────────────────────────────────────────

export function mapIngredientFromApi(dto: UserIngredientResponse): Ingredient {
  const quantityDisplay = dto.unit
    ? `${dto.quantity}${dto.unit}`
    : `${dto.quantity}`;

  // Normalize whatever the backend returns (category or sub-category name)
  // into one of the 10 master categories. See `categoryFromApi`.
  const canonical = categoryFromApi(dto.subCategoryName ?? dto.categoryName);

  return {
    id: String(dto.id),
    category: canonical,
    name: dto.name,
    nickname: dto.customName ?? "",
    storageType: mapStorageTypeFromApi(dto.storageType),
    quantity: quantityDisplay,
    purchaseDate: toShortPurchaseDate(dto.purchaseDate),
    expirationDate: parseExpiryDate(dto.expiryDate),
    daysLeft: dto.daysLeft,
  };
}

/**
 * Build a create request from a draft. The draft must carry `ingredientId`
 * (set when the user picks from the master ingredient list). We throw early
 * here rather than letting the server reject with a confusing 404.
 */
export function mapIngredientToCreateRequest(
  draft: IngredientDraft,
): UserIngredientCreateRequest {
  if (draft.ingredientId == null) {
    throw new Error(
      `IngredientDraft "${draft.name}" is missing ingredientId — pick a master ingredient before submitting`,
    );
  }
  if (draft.storage == null) {
    throw new Error(
      `IngredientDraft "${draft.name}" is missing storage — pick a storage type before submitting`,
    );
  }

  const req: UserIngredientCreateRequest = {
    ingredientId: draft.ingredientId,
    storageType: mapStorageTypeToApi(draft.storage),
    // Drafts don't track purchase date; default to today.
    purchaseDate: toIsoDate(new Date()),
  };

  if (draft.expirationDate) req.expiryDate = toIsoDate(draft.expirationDate);
  if (draft.quantity != null) req.quantity = draft.quantity;
  if (draft.unit) req.unit = draft.unit;
  if (draft.nickname) req.customName = draft.nickname;

  return req;
}

/**
 * Translate a partial domain-shaped patch into the backend's update DTO.
 * Only fields present on the input are forwarded — undefined keys are dropped
 * so the server doesn't interpret them as "set to null".
 */
export type IngredientUpdate = Partial<{
  storageType: StorageType;
  quantity: number;
  unit: string;
  expiryDate: Date | null;
  purchaseDate: Date;
  nickname: string;
}>;

export function mapIngredientToUpdateRequest(
  patch: IngredientUpdate,
): UserIngredientRequest {
  const req: UserIngredientRequest = {};
  if (patch.storageType !== undefined) {
    req.storageType = mapStorageTypeToApi(patch.storageType);
  }
  if (patch.quantity !== undefined) req.quantity = patch.quantity;
  if (patch.unit !== undefined) req.unit = patch.unit;
  if (patch.expiryDate !== undefined) {
    req.expiryDate = patch.expiryDate ? toIsoDate(patch.expiryDate) : undefined;
  }
  if (patch.purchaseDate !== undefined) {
    req.purchaseDate = toIsoDate(patch.purchaseDate);
  }
  if (patch.nickname !== undefined) req.customName = patch.nickname;
  return req;
}

// ─── Service functions ───────────────────────────────────────────────────────

const BASE = "/api/v1/user-ingredients";

/** GET /api/v1/user-ingredients — 204 returns []. */
export async function fetchAllIngredients(): Promise<Ingredient[]> {
  const res = await api.get<UserIngredientResponse[]>(BASE);
  if (res.status === 204 || !res.data) return [];
  return res.data.map(mapIngredientFromApi);
}

/** GET /api/v1/user-ingredients/search?q=... — 204 returns []. */
export async function searchIngredients(query: string): Promise<Ingredient[]> {
  const res = await api.get<UserIngredientResponse[]>(`${BASE}/search`, {
    params: { q: query },
  });
  if (res.status === 204 || !res.data) return [];
  return res.data.map(mapIngredientFromApi);
}

/** POST /api/v1/user-ingredients — wraps `items` per the backend contract. */
export async function createIngredients(
  items: UserIngredientCreateRequest[],
): Promise<Ingredient[]> {
  const res = await api.post<UserIngredientResponse[]>(BASE, { items });
  return (res.data ?? []).map(mapIngredientFromApi);
}

/** PATCH /api/v1/user-ingredients/{id} — partial update, returns the updated row. */
export async function updateIngredient(
  id: number,
  patch: UserIngredientRequest,
): Promise<Ingredient> {
  const res = await api.patch<UserIngredientResponse>(`${BASE}/${id}`, patch);
  return mapIngredientFromApi(res.data);
}

/** DELETE /api/v1/user-ingredients/{id} — 204 success. */
export async function deleteIngredient(id: number): Promise<void> {
  await api.delete(`${BASE}/${id}`);
}
