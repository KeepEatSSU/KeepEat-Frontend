/**
 * KeepEat — recent ingredient searches.
 *
 * Tiny LRU on top of AsyncStorage so the picker can show "최근 검색"
 * across sessions. Not security-sensitive (no tokens, no PII), so we
 * use AsyncStorage instead of expo-secure-store.
 *
 * Usage:
 *   const recents = await getRecentIngredients();
 *   await pushRecentIngredient({ id: 42, name: "양파" });
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { IngredientMasterEntry } from "@/constants/ingredients-master";

const STORAGE_KEY = "keepeat:recentIngredients";
const MAX_RECENTS = 10;

export type RecentEntry = Pick<IngredientMasterEntry, "id" | "name">;

export async function getRecentIngredients(): Promise<RecentEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Defensive: drop anything that doesn't look right.
    return parsed.filter(
      (e): e is RecentEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as RecentEntry).id === "number" &&
        typeof (e as RecentEntry).name === "string",
    );
  } catch {
    return [];
  }
}

/**
 * Push an entry to the front of the list, deduping by id.
 * Caps the list at MAX_RECENTS (10).
 */
export async function pushRecentIngredient(entry: RecentEntry): Promise<void> {
  const current = await getRecentIngredients();
  const deduped = current.filter((e) => e.id !== entry.id);
  const next = [entry, ...deduped].slice(0, MAX_RECENTS);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Non-fatal — picker still functions without persistence.
  }
}

export async function clearRecentIngredients(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
