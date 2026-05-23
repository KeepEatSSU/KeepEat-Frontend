/**
 * KeepEat — ingredient master catalog (server-backed, with seed fallback).
 *
 * Stage 1 of the local-master → server-master transition: this module owns
 * the in-memory + AsyncStorage cache and the `GET /api/v1/ingredients/master`
 * fetch, but screens have NOT been migrated yet — they still read from
 * `constants/ingredients-master.ts` directly. Stage 2 swaps each call site
 * to `getMasterSnapshot()`.
 *
 * Three-tier fallback (in order):
 *   1. Memory snapshot (built from latest server response or AsyncStorage)
 *   2. AsyncStorage cache (persisted across launches)
 *   3. Local seed (`constants/ingredients-master.ts`) — last resort if both
 *      memory and cache are empty (first launch + no network, etc.)
 *
 * ETag handling
 *   We persist the server's ETag and send it as `If-None-Match` on the next
 *   fetch. axios's default `validateStatus` rejects 304, so we widen it to
 *   `s === 200 || s === 304` and branch on status.
 *
 * Why bypass `services/api.ts`?
 *   We use the shared `api` instance to inherit the Bearer-token + refresh
 *   interceptor — masters live behind auth on the current backend. If the
 *   endpoint goes public later, the interceptor stays no-op for it.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  CATEGORIES,
  SUB_CATEGORIES,
  INGREDIENT_MASTER,
  STORAGE_OPTIONS_MASTER,
  INGREDIENT_BY_NAME,
  INGREDIENT_BY_ID,
  STORAGE_OPTIONS_BY_INGREDIENT_ID,
  type ApiStorageType,
  type CategoryEntry,
  type IngredientMasterEntry,
  type StorageOptionEntry,
  type SubCategoryEntry,
} from "@/constants/ingredients-master";
import { api } from "@/services/api";

// ─── Storage keys + URL ──────────────────────────────────────────────────────

const ETAG_KEY = "keepeat:ingredientMaster:etag";
const DATA_KEY = "keepeat:ingredientMaster:data";
const MASTER_URL = "/api/v1/ingredients/master";

// ─── DTOs + snapshot shapes ──────────────────────────────────────────────────

interface RawStorageOption {
  storageType: ApiStorageType;
  minDays: number;
  maxDays: number;
}

interface RawIngredient {
  id: number;
  subCategoryId: number;
  name: string;
  storageOptions: RawStorageOption[];
}

interface RawMasterResponse {
  categories: { id: number; name: string }[];
  subCategories: { id: number; categoryId: number; name: string }[];
  ingredients: RawIngredient[];
}

/** Plain serializable shape — what we persist to AsyncStorage. */
interface PersistedSnapshot {
  categories: CategoryEntry[];
  subCategories: SubCategoryEntry[];
  ingredients: IngredientMasterEntry[];
  storageOptions: StorageOptionEntry[];
}

/** In-memory shape — adds the Map indexes for O(1) lookups. */
export interface ResolvedSnapshot extends PersistedSnapshot {
  byName: Map<string, IngredientMasterEntry>;
  byId: Map<number, IngredientMasterEntry>;
  optionsByIngredientId: Map<number, StorageOptionEntry[]>;
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

/**
 * API → local shape. Server returns storageOptions nested per ingredient and
 * always in day-units. The local schema has a flat `STORAGE_OPTIONS_MASTER`
 * array with a `metric` field, so we flatten + force `metric: "Days"` (which
 * makes `min * METRIC_TO_DAYS[metric]` evaluate to `min` exactly — preserves
 * every existing call site without changes).
 */
function persistedFromRaw(raw: RawMasterResponse): PersistedSnapshot {
  const storageOptions: StorageOptionEntry[] = [];
  const ingredients: IngredientMasterEntry[] = [];
  for (const ing of raw.ingredients) {
    ingredients.push({
      id: ing.id,
      subCategoryId: ing.subCategoryId,
      name: ing.name,
    });
    for (const opt of ing.storageOptions) {
      storageOptions.push({
        ingredientId: ing.id,
        storageType: opt.storageType,
        min: opt.minDays,
        max: opt.maxDays,
        metric: "Days",
      });
    }
  }
  return {
    categories: raw.categories,
    subCategories: raw.subCategories,
    ingredients,
    storageOptions,
  };
}

/** Builds the in-memory Maps from arrays. Run once per snapshot load. */
function resolve(persisted: PersistedSnapshot): ResolvedSnapshot {
  const byName = new Map<string, IngredientMasterEntry>();
  const byId = new Map<number, IngredientMasterEntry>();
  for (const ing of persisted.ingredients) {
    byName.set(ing.name, ing);
    byId.set(ing.id, ing);
  }
  const optionsByIngredientId = new Map<number, StorageOptionEntry[]>();
  for (const opt of persisted.storageOptions) {
    const list = optionsByIngredientId.get(opt.ingredientId);
    if (list) list.push(opt);
    else optionsByIngredientId.set(opt.ingredientId, [opt]);
  }
  return { ...persisted, byName, byId, optionsByIngredientId };
}

/** Last-resort fallback when no memory and no cache are available. */
function localSeedSnapshot(): ResolvedSnapshot {
  return {
    categories: CATEGORIES,
    subCategories: SUB_CATEGORIES,
    ingredients: INGREDIENT_MASTER,
    storageOptions: STORAGE_OPTIONS_MASTER,
    byName: INGREDIENT_BY_NAME,
    byId: INGREDIENT_BY_ID,
    optionsByIngredientId: STORAGE_OPTIONS_BY_INGREDIENT_ID,
  };
}

// ─── In-memory cache + accessor ──────────────────────────────────────────────

let memorySnapshot: ResolvedSnapshot | null = null;

/**
 * Returns the current master snapshot synchronously. Screens will call this
 * in stage 2. Tier order:
 *   memory → (caller responsible for warming via fetchMaster()) → local seed.
 */
export function getMasterSnapshot(): ResolvedSnapshot {
  return memorySnapshot ?? localSeedSnapshot();
}

// ─── Fetch ───────────────────────────────────────────────────────────────────

export type FetchMasterSource =
  | "server"           // 200 — new data, snapshot replaced + persisted
  | "no-change"        // 304 — kept current snapshot
  | "cached"           // network failed but a previous snapshot exists
  | "local-fallback";  // nothing in memory or storage; using the seed file

/**
 * Loads the master into memory. Stale-while-revalidate:
 *   1. Hydrate from AsyncStorage immediately (if memory is empty).
 *   2. Fire GET with the saved ETag (if any).
 *   3. On 200: replace + persist + save new ETag.
 *   4. On 304: keep current.
 *   5. On error: keep current; return "cached" / "local-fallback".
 *
 * Safe to call multiple times — re-entry only triggers a network round trip,
 * never invalidates a healthy memory snapshot.
 */
export async function fetchMaster(): Promise<FetchMasterSource> {
  // Hydrate memory from AsyncStorage on the first call so the very first
  // `getMasterSnapshot()` after launch already has server-cached data.
  if (!memorySnapshot) {
    try {
      const cached = await AsyncStorage.getItem(DATA_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as PersistedSnapshot;
        memorySnapshot = resolve(parsed);
      }
    } catch {
      // Storage / parse failure — proceed to network attempt.
    }
  }

  let etag: string | null = null;
  try {
    etag = await AsyncStorage.getItem(ETAG_KEY);
  } catch {
    // Storage failure — proceed without conditional request.
  }

  try {
    const { status, data, headers } = await api.get<RawMasterResponse>(
      MASTER_URL,
      {
        headers: etag ? { "If-None-Match": etag } : undefined,
        // axios's default validateStatus rejects 304. Widen so we can handle
        // both branches in the success path.
        validateStatus: (s: number) => s === 200 || s === 304,
      },
    );

    if (status === 304) {
      return memorySnapshot ? "no-change" : "local-fallback";
    }

    const persisted = persistedFromRaw(data);
    memorySnapshot = resolve(persisted);

    // Persist body + new ETag for the next launch. Failures here are
    // non-fatal — memory snapshot is enough for this session.
    const newEtag =
      (headers["etag"] as string | undefined) ??
      (headers["ETag"] as string | undefined);
    try {
      await AsyncStorage.setItem(DATA_KEY, JSON.stringify(persisted));
      if (newEtag) await AsyncStorage.setItem(ETAG_KEY, newEtag);
    } catch {
      // ignore — caching is best-effort
    }

    return "server";
  } catch {
    // Network / server error. Whatever's in memory (hydrated from cache or
    // null) stays the source of truth.
    return memorySnapshot ? "cached" : "local-fallback";
  }
}
