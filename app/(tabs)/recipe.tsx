/**
 * 내 레시피 탭 — 보관함에 추가한 레시피 목록.
 *
 * explore와 동일 카드 디자인을 공유하지만, 데이터 흐름이 다르다:
 *   • explore는 커서 페이징(서버 무한 스크롤). 여기는 한 번에 전체 목록을
 *     받아 클라이언트에서 필터/정렬/검색을 모두 처리.
 *   • 정렬은 클라이언트 — 데이터 전체가 메모리에 있어 latest/likes/dislikes
 *     세 모드 모두 즉시 가능.
 *   • 카드 길게 누르기 → ConfirmModal → DELETE /api/v1/my-recipes (벌크 API
 *     단건 호출). 성공 시 로컬 state에서 제거.
 *
 * "레시피 추천" 버튼 + RecipeRecommendationContext 연동은 기존 동작 유지.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AppHeaderRight } from "@/components/AppHeaderRight";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ErrorScreen } from "@/components/ErrorScreen";
import { InfoModal } from "@/components/InfoModal";
import {
  EMPTY_FILTERS,
  RecipeFilterSheet,
  countActiveFilters,
  type RecipeFilters,
} from "@/components/RecipeFilterSheet";
import { RecipeListCard, applyReaction } from "@/components/RecipeListCard";
import {
  RecipeSortSheet,
  type RecipeSortKey,
} from "@/components/RecipeSortSheet";
import { useToast } from "@/components/Toast";
import {
  Colors,
  FontSize,
  FontWeight,
  LetterSpacing,
  Radius,
  Shadows,
  Spacing,
} from "@/constants/theme";
import type { ReactionType } from "@/constants/domain";
import { useRecipeRecommendation } from "@/context/RecipeRecommendationContext";
import { getErrorMessage } from "@/services/api";
import {
  deleteMyRecipes,
  getMyRecipes,
  toggleReaction,
  type MyRecipeListEntryDto,
} from "@/services/recipes";

const CAL_NO_LIMIT = 1500;

const SORT_LABELS: Record<RecipeSortKey, string> = {
  latest: "최신순",
  mostLiked: "좋아요 많은순",
  mostDisliked: "싫어요 많은순",
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RecipeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showTopToast } = useToast();
  const { status, requestRecommendation, markSwiping } =
    useRecipeRecommendation();

  const [recipes, setRecipes] = useState<MyRecipeListEntryDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<RecipeSortKey>("latest");
  const [filters, setFilters] = useState<RecipeFilters>(EMPTY_FILTERS);

  const [sortSheetVisible, setSortSheetVisible] = useState(false);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);

  // Multi-select delete mode. `selectionMode` switches the header and hides
  // sort/filter/recommend rows; `selectedIds` accumulates recipe IDs as the
  // user taps cards. Bulk delete uses the single `deleteMyRecipes(ids[])`
  // endpoint regardless of count.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleteModalVisible, setBulkDeleteModalVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [recommendInfoVisible, setRecommendInfoVisible] = useState(false);

  const fetchRecipes = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setIsLoading(true);
    try {
      const list = await getMyRecipes();
      setRecipes(list);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
  }, []);

  // Re-fetch on every focus so reactions/deletes done elsewhere reflect.
  // Silent after the first load so the user doesn't see the full spinner
  // when switching tabs back.
  useFocusEffect(
    useCallback(() => {
      fetchRecipes({ silent: hasLoadedOnce });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasLoadedOnce]),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchRecipes({ silent: true });
    } finally {
      setRefreshing(false);
    }
  };

  // Filter + sort pipeline. Read-only over `recipes`, so subsequent fetches
  // replace the source list cleanly.
  const displayedRecipes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = recipes;

    if (q !== "") {
      list = list.filter((r) => r.recipeName.toLowerCase().includes(q));
    }
    if (filters.cookingMethods.length > 0) {
      const set = new Set(filters.cookingMethods);
      list = list.filter((r) =>
        r.cookingMethod ? set.has(r.cookingMethod) : false,
      );
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

    if (sortBy === "mostLiked") {
      list = [...list].sort((a, b) => b.likeCount - a.likeCount);
    } else if (sortBy === "mostDisliked") {
      list = [...list].sort((a, b) => b.dislikeCount - a.dislikeCount);
    }
    // `latest`: server already returns 최신순 (createdAt DESC).
    return list;
  }, [recipes, searchQuery, filters, sortBy]);

  const activeFilterCount = countActiveFilters(filters);
  const hasActiveFilters = activeFilterCount > 0;

  const handleReact = async (recipeId: number, type: ReactionType) => {
    // Suppress reactions while the user is selecting cards — taps that
    // happen to land on the heart/dislike icon should feel inert in
    // selection mode rather than mutating reaction state.
    if (selectionMode) return;
    const original = recipes.find((r) => r.recipeId === recipeId);
    if (!original) return;

    setRecipes((prev) =>
      prev.map((r) =>
        r.recipeId === recipeId ? applyReaction(r, type) : r,
      ),
    );

    try {
      await toggleReaction(recipeId, type);
    } catch (e) {
      setRecipes((prev) =>
        prev.map((r) => (r.recipeId === recipeId ? original : r)),
      );
      showTopToast({
        message: getErrorMessage(e, "반응 처리에 실패했어요"),
        variant: "error",
      });
    }
  };

  const enterSelectionMode = useCallback((firstId: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSelectionMode(true);
    setSelectedIds(new Set([firstId]));
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelection = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCardPress = useCallback(
    (id: number) => {
      if (selectionMode) {
        toggleSelection(id);
      } else {
        router.push({
          pathname: "/recipe-detail",
          params: { id },
        } as never);
      }
    },
    [selectionMode, toggleSelection, router],
  );

  const handleCardLongPress = useCallback(
    (id: number) => {
      if (!selectionMode) enterSelectionMode(id);
    },
    [selectionMode, enterSelectionMode],
  );

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || deleting) return;
    setDeleting(true);
    const targetIds = Array.from(selectedIds);
    try {
      await deleteMyRecipes(targetIds);
      // Drop locally — we know exactly what was removed, no refetch needed.
      const targetSet = new Set(targetIds);
      setRecipes((prev) => prev.filter((r) => !targetSet.has(r.recipeId)));
      setBulkDeleteModalVisible(false);
      exitSelectionMode();
      showTopToast({
        message: `${targetIds.length}개 삭제되었어요`,
        variant: "success",
      });
    } catch (e) {
      showTopToast({
        message: getErrorMessage(e, "삭제에 실패했어요"),
        variant: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  // Android hardware back exits selection mode instead of leaving the tab.
  // No-op when selection is inactive.
  useEffect(() => {
    if (!selectionMode) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      exitSelectionMode();
      return true;
    });
    return () => sub.remove();
  }, [selectionMode, exitSelectionMode]);

  const handleRecommendPress = () => {
    if (status === "ready") {
      markSwiping();
      router.push("/recipe-swipe" as never);
      return;
    }
    if (status !== "idle" && status !== "error") return;
    // 안내/에러 피드백은 context.requestRecommendation 안에서 결과 기반으로
    // enqueue한다. TopBanner queue가 연속 결과를 순서와 우선순위에 맞게 표시한다.
    requestRecommendation();
  };

  if (error && !hasLoadedOnce) {
    return (
      <ErrorScreen
        message={getErrorMessage(error, "레시피를 불러오지 못했어요")}
        subMessage="네트워크 상태를 확인하고 다시 시도해 주세요"
        onRetry={() => {
          setError(null);
          fetchRecipes();
        }}
      />
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {selectionMode ? (
        /* Selection-mode header: cancel · "N개 선택됨" · 삭제. Same row
            chrome dimensions as the normal header so the layout doesn't
            jump on entry/exit. */
        <View style={styles.header}>
          <Pressable
            onPress={exitSelectionMode}
            hitSlop={8}
            style={({ pressed }) => [
              styles.selectionHeaderBtn,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.selectionCancelText}>취소</Text>
          </Pressable>
          <Text style={styles.selectionCountText}>
            {selectedIds.size}개 선택됨
          </Text>
          <Pressable
            onPress={() => setBulkDeleteModalVisible(true)}
            disabled={selectedIds.size === 0}
            hitSlop={8}
            style={({ pressed }) => [
              styles.selectionHeaderBtn,
              pressed && selectedIds.size > 0 && { opacity: 0.6 },
            ]}
          >
            <Text
              style={[
                styles.selectionDeleteText,
                selectedIds.size === 0 && styles.selectionDeleteTextDisabled,
              ]}
            >
              삭제
            </Text>
          </Pressable>
        </View>
      ) : (
        /* Normal header: search bar takes the logo's old spot (flex:1) so
            the search is the primary entry point. AppHeaderRight (bell +
            profile) stays pinned on the right. */
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
              placeholder="내 레시피 검색"
              placeholderTextColor={Colors.outline}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
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
      )}

      {!selectionMode && (
        <>
      {/* Sort (좌) + Filter (우). Recipe tab can sort locally since the whole
          list is loaded at once. */}
      <View style={styles.controlsRow}>
        <Pressable
          onPress={() => setSortSheetVisible(true)}
          style={({ pressed }) => [
            styles.sortBtn,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.sortBtnText}>{SORT_LABELS[sortBy]}</Text>
          <Ionicons
            name="chevron-down"
            size={14}
            color={Colors.onSurfaceVariant}
          />
        </Pressable>

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

      {/* Recommend button — existing AI generation flow. Visibility/state
          driven by RecipeRecommendationContext, not touched here. The
          info button sits to the right as a quiet "what does this do?"
          hint; an invisible spacer of the same width sits on the left so
          the recommend button stays optically centered in the row. */}
      <View style={styles.recommendRow}>
        <View style={styles.infoBtn} />
        <Pressable
          onPress={handleRecommendPress}
          disabled={status === "loading" || status === "swiping"}
          style={({ pressed }) => [
            styles.recommendBtn,
            status === "loading" && styles.recommendBtnLoading,
            status === "ready" && styles.recommendBtnReady,
            status !== "loading" &&
              status !== "swiping" &&
              pressed &&
              styles.recommendBtnPressed,
          ]}
        >
          {status === "loading" ? (
            <>
              <ActivityIndicator size={16} color={Colors.primary} />
              <Text style={styles.recommendTextLoading}>
                AI 셰프가 요리 중...
              </Text>
            </>
          ) : status === "ready" ? (
            <>
              <Ionicons name="sparkles" size={18} color={Colors.onPrimary} />
              <Text style={styles.recommendText}>눌러서 레시피 확인하기</Text>
            </>
          ) : (
            <>
              <Ionicons name="sparkles" size={18} color={Colors.onPrimary} />
              <Text style={styles.recommendText}>레시피 추천</Text>
            </>
          )}
        </Pressable>
        <Pressable
          onPress={() => setRecommendInfoVisible(true)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="AI 레시피 추천 설명"
          style={({ pressed }) => [
            styles.infoBtn,
            pressed && { opacity: 0.6 },
          ]}
        >
          <Ionicons
            name="information-circle-outline"
            size={22}
            color={Colors.onSurfaceVariant}
          />
        </Pressable>
      </View>
        </>
      )}

      {isLoading && !hasLoadedOnce ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={displayedRecipes}
          keyExtractor={(item) => String(item.recipeId)}
          renderItem={({ item }) => {
            const isSelected =
              selectionMode && selectedIds.has(item.recipeId);
            return (
              <View>
                <RecipeListCard
                  item={item}
                  onReact={handleReact}
                  onPress={() => handleCardPress(item.recipeId)}
                  onLongPress={() => handleCardLongPress(item.recipeId)}
                />
                {selectionMode && (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.selectionCheckbox,
                      isSelected && styles.selectionCheckboxActive,
                    ]}
                  >
                    {isSelected && (
                      <Ionicons
                        name="checkmark"
                        size={14}
                        color={Colors.onPrimary}
                      />
                    )}
                  </View>
                )}
              </View>
            );
          }}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.primary}
            />
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
                {searchQuery.trim() === "" && !hasActiveFilters ? (
                  <>
                    <Text style={styles.emptyTitle}>
                      아직 내 레시피가 없어요
                    </Text>
                    <Text style={styles.emptyText}>
                      레시피 탭에서 마음에 드는 레시피를 추가하거나{"\n"}
                      위의 레시피 추천 버튼으로 AI 추천을 받아보세요
                    </Text>
                  </>
                ) : (
                  <Text style={styles.emptyText}>검색 결과가 없어요</Text>
                )}
              </View>
            ) : null
          }
        />
      )}

      <RecipeSortSheet
        visible={sortSheetVisible}
        value={sortBy}
        onChange={setSortBy}
        onClose={() => setSortSheetVisible(false)}
      />
      <RecipeFilterSheet
        visible={filterSheetVisible}
        value={filters}
        items={recipes}
        onApply={setFilters}
        onClose={() => setFilterSheetVisible(false)}
      />

      <ConfirmModal
        visible={bulkDeleteModalVisible}
        title="레시피 삭제"
        subtitle={`${selectedIds.size}개 레시피를\n내 레시피에서 제거할까요?`}
        confirmLabel="삭제하기"
        cancelLabel="취소"
        destructive
        onConfirm={handleBulkDelete}
        onCancel={() => !deleting && setBulkDeleteModalVisible(false)}
      />

      <InfoModal
        visible={recommendInfoVisible}
        title="AI 레시피 추천이란?"
        body={
          "냉장고 속 식재료를 분석해서 만들 수 있는\n레시피를 추천해드려요.\n\n" +
          "• 소비기한이 얼마 남지 않은 재료를 우선 활용해요\n" +
          "• 가진 재료만으로 만드는 레시피 3개\n" +
          "• 한두 가지만 더 사면 만들 수 있는 레시피 2개\n\n" +
          "총 5개의 맞춤 레시피를 제안해드립니다!"
        }
        onClose={() => setRecommendInfoVisible(false)}
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

  // Header — same shape as explore.tsx for visual continuity. In selection
  // mode the same row renders [취소][카운트][삭제] — `justifyContent:
  // space-between` distributes those three slots evenly.
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.md,
  },

  // Selection-mode header slots
  selectionHeaderBtn: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  selectionCancelText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
  },
  selectionCountText: {
    fontSize: 16,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
  },
  selectionDeleteText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.semiBold,
    color: Colors.error,
  },
  selectionDeleteTextDisabled: {
    color: Colors.outline,
    opacity: 0.6,
  },

  // Card overlay checkbox — absolute over the card so the card's own
  // dimensions (and the shared RecipeListCard component) stay unchanged.
  // pointerEvents:"none" on this view means the card's Pressable handles
  // all taps, including the implicit toggle while in selection mode.
  selectionCheckbox: {
    position: "absolute",
    top: Spacing.md,
    right: Spacing.md,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.outline,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  selectionCheckboxActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
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

  controlsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceContainerLow,
  },
  sortBtnText: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.semiBold,
    color: Colors.onSurface,
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

  // Recommend (existing — kept verbatim from prior version) + an inline
  // info-icon affordance to its right.
  recommendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
  },
  infoBtn: {
    // Explicit width so the matching left-side spacer can use the same
    // dimension to keep the recommend button optically centered. Icon (22)
    // + Spacing.xs padding × 2 (8) = 30.
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  recommendBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    ...Shadows.fab,
  },
  recommendBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.95 }],
  },
  recommendBtnLoading: {
    backgroundColor: Colors.surfaceContainerHigh,
  },
  recommendBtnReady: {
    backgroundColor: Colors.primaryContainer,
  },
  recommendText: {
    fontSize: FontSize.titleSm,
    fontWeight: FontWeight.bold,
    color: Colors.onPrimary,
    letterSpacing: LetterSpacing.tight,
  },
  recommendTextLoading: {
    fontSize: FontSize.titleSm,
    fontWeight: FontWeight.bold,
    color: Colors.onSurfaceVariant,
    letterSpacing: LetterSpacing.tight,
  },

  // List
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

  // Empty
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingTop: 80,
  },
  emptyTitle: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
    textAlign: "center",
    lineHeight: 22,
  },
});
