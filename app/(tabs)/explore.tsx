/**
 * 레시피 탭 — 공용 레시피 검색·탐색 화면.
 *
 * 흐름:
 *   1. 마운트 시 `searchRecipes()`로 첫 페이지 (size 20) 로드.
 *   2. 검색어 변경 → 300ms 디바운스 → cursor 초기화 + 처음부터 로드.
 *   3. FlatList `onEndReached` → `hasNext`면 다음 cursor 페이지 append.
 *   4. Pull-to-refresh → cursor 초기화 + 첫 페이지 재요청.
 *   5. 카테고리 칩(전체 + 9개 조리법) → 클라이언트 측 `cookingMethod` 필터.
 *
 * 좋아요/싫어요는 카드에서 인라인 토글, 낙관적 업데이트 + 실패 시 원본 롤백.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AppHeaderRight } from "@/components/AppHeaderRight";
import { ErrorScreen } from "@/components/ErrorScreen";
import {
  EMPTY_FILTERS,
  RecipeFilterSheet,
  countActiveFilters,
  type RecipeFilters,
} from "@/components/RecipeFilterSheet";
import { RecipeListCard, applyReaction } from "@/components/RecipeListCard";
import { useToast } from "@/components/Toast";
import {
  Colors,
  FontSize,
  FontWeight,
  Radius,
  Spacing,
} from "@/constants/theme";
import type { ReactionType, RecipeListItem } from "@/constants/domain";
import { getErrorMessage } from "@/services/api";
import { searchRecipes, toggleReaction } from "@/services/recipes";

const PAGE_SIZE = 20;
// Calories sentinel — slider at this value means "no limit" (filter inactive).
// Mirrors RecipeFilterSheet's CAL_MAX. Inlined here so the filter pipeline
// doesn't depend on a re-exported constant.
const CAL_NO_LIMIT = 1500;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [recipes, setRecipes] = useState<RecipeListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Filter state — applied client-side over the loaded `recipes` pages.
  // Pagination still fires for the underlying server result; the filter is
  // just a post-processing step in `displayedRecipes`. Sort is server-fixed
  // (latest = createdAt DESC) so no sort state lives here.
  const [filters, setFilters] = useState<RecipeFilters>(EMPTY_FILTERS);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);

  // Latest request token — bumps on every new search/refresh so out-of-order
  // responses (slower previous fetch resolving after a newer one) get dropped.
  const requestIdRef = useRef(0);

  const loadFirstPage = useCallback(
    async (keyword: string, opts: { refreshing?: boolean } = {}) => {
      const myRequestId = ++requestIdRef.current;
      if (opts.refreshing) setRefreshing(true);
      else setLoading(true);
      try {
        const trimmed = keyword.trim();
        const res = await searchRecipes({
          keyword: trimmed === "" ? undefined : trimmed,
          size: PAGE_SIZE,
        });
        if (requestIdRef.current !== myRequestId) return;
        setRecipes(res.recipes);
        setCursor(res.nextCursor);
        setHasNext(res.hasNext);
        setError(null);
      } catch (e) {
        if (requestIdRef.current !== myRequestId) return;
        setError(e);
      } finally {
        if (requestIdRef.current === myRequestId) {
          setLoading(false);
          setRefreshing(false);
          setHasLoadedOnce(true);
        }
      }
    },
    [],
  );

  const loadNextPage = useCallback(async () => {
    if (!hasNext || loadingMore || loading) return;
    if (cursor == null) return;
    const myRequestId = requestIdRef.current; // pin to current search session
    setLoadingMore(true);
    try {
      const trimmed = searchQuery.trim();
      const res = await searchRecipes({
        keyword: trimmed === "" ? undefined : trimmed,
        cursor,
        size: PAGE_SIZE,
      });
      // Discard stale paged responses if a new search started mid-flight.
      if (requestIdRef.current !== myRequestId) return;
      setRecipes((prev) => [...prev, ...res.recipes]);
      setCursor(res.nextCursor);
      setHasNext(res.hasNext);
    } catch (e) {
      if (requestIdRef.current !== myRequestId) return;
      showToast(getErrorMessage(e, "다음 페이지를 불러오지 못했어요"));
    } finally {
      if (requestIdRef.current === myRequestId) setLoadingMore(false);
    }
  }, [hasNext, loadingMore, loading, cursor, searchQuery, showToast]);

  // Debounced search-on-typing. Also drives the initial mount load (empty
  // query → first page without keyword). Cleanup cancels pending fires
  // when the keyword changes again within the debounce window.
  useEffect(() => {
    const handle = setTimeout(() => {
      loadFirstPage(searchQuery);
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Refresh on tab focus so reactions/cooks done elsewhere reflect quickly.
  // Guarded by hasLoadedOnce so the initial mount's debounce-driven load
  // isn't immediately stomped by a focus fire that produces an identical
  // request.
  useFocusEffect(
    useCallback(() => {
      if (hasLoadedOnce) loadFirstPage(searchQuery);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasLoadedOnce]),
  );

  const handleRefresh = () => loadFirstPage(searchQuery, { refreshing: true });

  // Apply filters over whatever pages have been loaded so far. The pipeline
  // is read-only — it never mutates `recipes`, so subsequent pages append
  // cleanly underneath. No sort step: server already returns latest first.
  const displayedRecipes = useMemo(() => {
    let list = recipes;
    if (filters.cookingMethods.length > 0) {
      const set = new Set(filters.cookingMethods);
      list = list.filter((r) => set.has(r.cookingMethod));
    }
    if (filters.difficulty !== null) {
      list = list.filter((r) => r.difficulty === filters.difficulty);
    }
    if (filters.myReaction !== null) {
      list = list.filter((r) => r.myReaction === filters.myReaction);
    }
    if (filters.maxCalories < CAL_NO_LIMIT) {
      const cap = filters.maxCalories;
      list = list.filter((r) => r.calories <= cap);
    }
    return list;
  }, [recipes, filters]);

  const activeFilterCount = countActiveFilters(filters);
  const hasActiveFilters = activeFilterCount > 0;

  // Optimistic reaction toggle. Snapshot the original row so a failed PATCH
  // restores the exact pre-tap state instead of trying to compute an inverse
  // operation (which would be brittle if multiple toggles raced).
  const handleReact = async (recipeId: number, type: ReactionType) => {
    const original = recipes.find((r) => r.recipeId === recipeId);
    if (!original) return;

    setRecipes((prev) =>
      prev.map((r) => (r.recipeId === recipeId ? applyReaction(r, type) : r)),
    );

    try {
      await toggleReaction(recipeId, type);
    } catch (e) {
      setRecipes((prev) =>
        prev.map((r) => (r.recipeId === recipeId ? original : r)),
      );
      showToast(getErrorMessage(e, "반응 처리에 실패했어요"));
    }
  };

  if (error && !hasLoadedOnce) {
    return (
      <ErrorScreen
        message="레시피를 불러오지 못했어요"
        subMessage="네트워크 상태를 확인하고 다시 시도해 주세요"
        onRetry={() => {
          setError(null);
          loadFirstPage(searchQuery);
        }}
      />
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header row: search bar takes the logo's old spot (flex:1) so the
          search is the primary entry point. AppHeaderRight (bell + profile)
          stays pinned on the right. */}
      <View style={styles.header}>
        <View style={styles.headerSearch}>
          <Ionicons
            name="search"
            size={18}
            color={Colors.outline}
            style={{ marginRight: Spacing.sm }}
          />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="레시피를 검색해 보세요"
            placeholderTextColor={Colors.outline}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable
              onPress={() => setSearchQuery("")}
              hitSlop={8}
            >
              <Ionicons
                name="close-circle"
                size={18}
                color={Colors.outline}
              />
            </Pressable>
          )}
        </View>
        <AppHeaderRight />
      </View>

      {/* Filter-only controls row. Sort was removed — server always returns
          latest first. Button flips to primary tint when any filter is
          active and shows the active count inline. */}
      <View style={styles.controlsRow}>
        <Pressable
          onPress={() => setFilterSheetVisible(true)}
          style={({ pressed }) => [
            styles.filterBtn,
            hasActiveFilters && styles.filterBtnActive,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Ionicons
            name="options-outline"
            size={16}
            color={hasActiveFilters ? Colors.onPrimary : Colors.onSurface}
          />
          <Text
            style={[
              styles.filterBtnText,
              hasActiveFilters && styles.filterBtnTextActive,
            ]}
          >
            필터{hasActiveFilters ? ` ${activeFilterCount}` : ""}
          </Text>
        </Pressable>
      </View>

      {loading && !hasLoadedOnce ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={displayedRecipes}
          keyExtractor={(item) => String(item.recipeId)}
          renderItem={({ item }) => (
            <RecipeListCard
              item={item}
              onReact={handleReact}
              onPress={() =>
                router.push({
                  pathname: "/recipe-detail",
                  params: { id: item.recipeId },
                } as never)
              }
            />
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onEndReached={loadNextPage}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            hasLoadedOnce ? (
              <View style={styles.emptyContainer}>
                <Ionicons
                  name={
                    searchQuery.trim() === "" && !hasActiveFilters
                      ? "restaurant-outline"
                      : "search-outline"
                  }
                  size={48}
                  color={Colors.outlineVariant}
                />
                <Text style={styles.emptyText}>
                  {searchQuery.trim() === "" && !hasActiveFilters
                    ? "아직 레시피가 없어요"
                    : "검색 결과가 없어요"}
                </Text>
              </View>
            ) : null
          }
        />
      )}

      <RecipeFilterSheet
        visible={filterSheetVisible}
        value={filters}
        onApply={setFilters}
        onClose={() => setFilterSheetVisible(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.md,
  },
  // Header-embedded search bar — takes the logo's old flex:1 slot so the
  // bell/profile cluster stays pinned right. Same visual token (pill +
  // surfaceContainerLow) as the picker's search.
  headerSearch: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
    padding: 0,
    margin: 0,
  },

  // Filter button row. Right-aligned so the affordance sits where the user
  // expects a "tune the list" control.
  controlsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceContainerLow,
  },
  filterBtnActive: {
    backgroundColor: Colors.primary,
  },
  filterBtnText: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.semiBold,
    color: Colors.onSurface,
  },
  filterBtnTextActive: {
    color: Colors.onPrimary,
  },

  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 120,
    gap: Spacing.base,
  },
  footerLoader: {
    paddingVertical: Spacing.xl,
    alignItems: "center",
  },

  // Empty
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.base,
    paddingTop: 80,
  },
  emptyText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
    textAlign: "center",
  },
});
