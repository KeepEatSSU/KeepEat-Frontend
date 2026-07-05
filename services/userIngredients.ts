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
import type { ApiStorageType } from "@/constants/ingredients-master";
import {
  getMasterSnapshot,
  type ResolvedSnapshot,
} from "@/services/ingredientMaster";
import {
  mapStorageTypeFromApi,
  mapStorageTypeToApi,
} from "@/utils/ingredientEntryRules";

export { mapStorageTypeFromApi, mapStorageTypeToApi };

// ─── Backend DTOs (kept private to this module) ──────────────────────────────

interface UserIngredientResponse {
  id: number;
  /** Master ingredient ID — null/absent for custom ("내 재료") items. */
  ingredientId?: number | null;
  /** True when this row was added outside the master catalog. */
  isCustom?: boolean;
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
  /** Master ID for catalog items. **Null** for custom ("내 재료") items —
   * the server differentiates the two branches on this field, and the
   * accompanying `customName` becomes the item's display name. */
  ingredientId: number | null;
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
//
// Lookups are rebuilt when the master snapshot reference changes (seed →
// server hand-off), keyed by identity so we don't pay the build cost per call.

let cachedSnapshotRef: ResolvedSnapshot | null = null;
let cachedCategoryNames: Set<string> = new Set();
let cachedSubcategoryToCategory: Map<string, string> = new Map();

function getCategoryLookups(snapshot?: ResolvedSnapshot): {
  names: Set<string>;
  subToCat: Map<string, string>;
} {
  const snap = snapshot ?? getMasterSnapshot();
  if (snap !== cachedSnapshotRef) {
    cachedSnapshotRef = snap;
    cachedCategoryNames = new Set(snap.categories.map((c) => c.name));
    cachedSubcategoryToCategory = new Map(
      snap.subCategories.flatMap((sc) => {
        const parent = snap.categories.find((c) => c.id === sc.categoryId);
        return parent ? [[sc.name, parent.name] as [string, string]] : [];
      }),
    );
  }
  return { names: cachedCategoryNames, subToCat: cachedSubcategoryToCategory };
}

export function categoryFromApi(
  apiName: string | undefined,
  snapshot?: ResolvedSnapshot,
): string {
  if (!apiName) return "";
  const { names, subToCat } = getCategoryLookups(snapshot);
  if (names.has(apiName)) return apiName;
  const viaSub = subToCat.get(apiName);
  if (viaSub) return viaSub;
  if (__DEV__) {
    console.warn(
      `[categoryFromApi] unrecognized category "${apiName}" — passing through`,
    );
  }
  return apiName;
}

// ─── Ingredient mappers ──────────────────────────────────────────────────────

export function mapIngredientFromApi(
  dto: UserIngredientResponse,
  snapshot?: ResolvedSnapshot,
): Ingredient {
  const quantityDisplay = dto.unit
    ? `${dto.quantity}${dto.unit}`
    : `${dto.quantity}`;

  // Normalize whatever the backend returns (category or sub-category name)
  // into one of the 10 master categories. See `categoryFromApi`.
  const canonical = categoryFromApi(
    dto.subCategoryName ?? dto.categoryName,
    snapshot,
  );

  // Master vs custom name semantics:
  //   Master items — `dto.name` holds the catalog display name; `customName`
  //     (if set) is the user's optional nickname. Map straight through.
  //   Custom items — there is no catalog row, so `dto.name` is empty/absent
  //     and the user-typed display name lives in `customName`. We mirror it
  //     into both `name` (so the card's heroName + detail title show it) AND
  //     `nickname` (so the card's "nickname !== name" guard suppresses the
  //     subtitle row, and detail's nickname TextInput pre-fills with the
  //     editable display name — patching it back through the existing
  //     `nickname → customName` update path).
  const customName = dto.customName ?? "";
  const isCustomRow = dto.isCustom === true || dto.ingredientId == null;

  return {
    id: String(dto.id),
    category: canonical,
    name: isCustomRow ? customName : dto.name,
    nickname: customName,
    storageType: mapStorageTypeFromApi(dto.storageType),
    quantity: quantityDisplay,
    purchaseDate: toShortPurchaseDate(dto.purchaseDate),
    expirationDate: parseExpiryDate(dto.expiryDate),
    daysLeft: dto.daysLeft,
    ingredientId: dto.ingredientId ?? null,
    isCustom: dto.isCustom ?? false,
  };
}

/**
 * Build a create request from a draft. Two shapes:
 *   - Master item: `ingredientId` set, `customName` carries the optional
 *     nickname (the user's pet name on top of the master display name).
 *   - Custom item ("내 재료"): `ingredientId` is null, `customName` is the
 *     user-typed display name (lives in `draft.name` on the draft side).
 * We branch on `isCustom || ingredientId == null` so either signal flips the
 * payload — the picker's "직접 추가" path and the toggle ON path both work.
 */
export function mapIngredientToCreateRequest(
  draft: IngredientDraft,
  /**
   * 화면 단위 구매일 — add-confirm은 사용자가 직접 고른 값을 넘긴다.
   * 미전달 시 today. expirationDate 폴백의 anchor로도 쓰여 두 값이 항상
   * 같은 기준에서 계산되도록 한다.
   */
  purchaseDate?: Date,
): UserIngredientCreateRequest {
  if (draft.storage == null) {
    throw new Error(
      `IngredientDraft "${draft.name}" is missing storage — pick a storage type before submitting`,
    );
  }

  const isCustomItem = draft.isCustom === true || draft.ingredientId == null;
  if (isCustomItem && draft.name.trim() === "") {
    throw new Error(
      `Custom IngredientDraft is missing a name — type one before submitting`,
    );
  }

  const purchase = purchaseDate ?? new Date();
  const req: UserIngredientCreateRequest = {
    ingredientId: isCustomItem ? null : (draft.ingredientId as number),
    storageType: mapStorageTypeToApi(draft.storage),
    purchaseDate: toIsoDate(purchase),
  };

  if (draft.expirationDate) {
    req.expiryDate = toIsoDate(draft.expirationDate);
  } else {
    // 안전망: 커스텀 재료(보관별 자동계산 없음)나 OCR 누락 경로 등 어떤
    // 이유로든 expirationDate가 비어있으면 purchaseDate + 7일로 폴백.
    // 사용자가 직접 입력한 경우엔 위 if 가지로 들어가 폴백 안 탐.
    const fallback = new Date(purchase);
    fallback.setDate(fallback.getDate() + 7);
    req.expiryDate = toIsoDate(fallback);
  }
  if (draft.quantity != null) req.quantity = draft.quantity;
  if (draft.unit) req.unit = draft.unit;

  if (isCustomItem) {
    // Required: server uses customName as the display name for the row.
    req.customName = draft.name.trim();
  } else if (draft.nickname) {
    req.customName = draft.nickname;
  }

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
export async function fetchAllIngredients(
  snapshot?: ResolvedSnapshot | null,
): Promise<Ingredient[]> {
  const res = await api.get<UserIngredientResponse[]>(BASE);
  if (res.status === 204 || !res.data) return [];
  return res.data.map((dto) =>
    mapIngredientFromApi(dto, snapshot ?? undefined),
  );
}

/** GET /api/v1/user-ingredients/search?q=... — 204 returns []. */
export async function searchIngredients(
  query: string,
  snapshot?: ResolvedSnapshot | null,
): Promise<Ingredient[]> {
  const res = await api.get<UserIngredientResponse[]>(`${BASE}/search`, {
    params: { q: query },
  });
  if (res.status === 204 || !res.data) return [];
  return res.data.map((dto) =>
    mapIngredientFromApi(dto, snapshot ?? undefined),
  );
}

/** POST /api/v1/user-ingredients — wraps `items` per the backend contract. */
export async function createIngredients(
  items: UserIngredientCreateRequest[],
): Promise<Ingredient[]> {
  const res = await api.post<UserIngredientResponse[]>(BASE, { items });
  return (res.data ?? []).map((dto) => mapIngredientFromApi(dto));
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

/**
 * DELETE /api/v1/user-ingredients — 벌크. 백엔드 스펙상 ids 배열은
 * **body**로 전달 (axios는 DELETE도 `data`로 body를 실어보낼 수 있음).
 * 빈 배열은 호출 자체를 skip.
 */
export async function deleteUserIngredients(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await api.delete(BASE, { data: { ids } });
}

/**
 * 보유 식재료 중 특정 레시피의 재료와 매칭되는 항목 (서버측 계산).
 * GET /api/v1/user-ingredients/by-recipe/{recipeId} — 204 → 빈 배열.
 *
 * cooking-complete의 "다 쓴 재료 삭제" 카드가 표시할 정보를 한 번에
 * 받아오기 위해 모든 보조 필드를 포함. 백엔드가 일부 필드를 누락해도
 * 화면이 작동하도록 name/id 외에는 옵셔널.
 */
export interface OwnedRecipeIngredientDto {
  /** user-ingredient row id — 삭제 키. 백엔드가 항상 제공. */
  id: number;
  name: string;
  /** 사용자 별명("customName"). 마스터 항목의 사용자 별명 + 커스텀 항목의
   *  표시 이름 둘 다 이 필드로 들어온다. */
  customName?: string;
  storageType?: "실온" | "냉장" | "냉동";
  /** "YYYY-MM-DD" 구매일. */
  purchaseDate?: string;
  /** 양수 = 남은 일자, 0 = 오늘, 음수 = 지남. */
  daysLeft?: number;
  /** "내 재료"(마스터 외 사용자 직접 추가) 여부. */
  isCustom?: boolean;
}

export async function getOwnedIngredientsByRecipe(
  recipeId: number,
): Promise<OwnedRecipeIngredientDto[]> {
  const res = await api.get<OwnedRecipeIngredientDto[]>(
    `${BASE}/by-recipe/${recipeId}`,
  );
  if (res.status === 204 || !res.data) return [];
  return res.data;
}
