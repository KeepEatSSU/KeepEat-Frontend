import { AppHeaderLogo } from "@/components/AppHeaderLogo";
import { AppHeaderRight } from "@/components/AppHeaderRight";
import {
  AppSearchChipsHeader,
  type ChipConfig,
} from "@/components/AppSearchChipsHeader";
import { ErrorScreen } from "@/components/ErrorScreen";
import { useToast } from "@/components/Toast";
import {
  FRIDGE_FILTER_CHIPS,
  type Ingredient,
  type StorageType,
} from "@/constants/domain";
import {
  Colors,
  FontSize,
  FontWeight,
  LetterSpacing,
  Radius,
  Shadows,
  Spacing,
} from "@/constants/theme";
import {
  deleteIngredient,
  fetchAllIngredients,
  searchIngredients,
} from "@/services/userIngredients";
import { getDDayInfo } from "@/utils/dateUtils";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDDayBadgeColor(status: string): string {
  switch (status) {
    case "expired":
    case "urgent":
      return Colors.error;
    case "caution":
      return "#F9A825";
    default:
      return Colors.primary;
  }
}


// ─── Grid Card ────────────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get("window").width;

const GRID_GAP = Spacing.md;
const GRID_PADDING = Spacing.xl;
const CARD_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;


const STORAGE_CHIP_STYLE: Record<
  StorageType,
  { label: string; bg: string; text: string }
> = {
  fridge: { label: "냉장", bg: "#E8F5E9", text: "#166534" },
  frozen: { label: "냉동", bg: "#E0F2FE", text: "#0369A1" },
  room: { label: "실온", bg: "#F5F5F4", text: "#44403C" },
};

function IngredientGridCard({
  item,
  selectMode,
  isSelected,
  onToggle,
  onEnterSelect,
}: {
  item: Ingredient;
  selectMode: boolean;
  isSelected: boolean;
  onToggle: (id: string) => void;
  onEnterSelect: (id: string) => void;
}) {
  const router = useRouter();
  const ddayInfo = getDDayInfo(item.expirationDate);
  const badgeColor = getDDayBadgeColor(ddayInfo.status);
  const storageChip = STORAGE_CHIP_STYLE[item.storageType];

  const handlePress = () => {
    if (selectMode) {
      onToggle(item.id);
    } else {
      router.push({ pathname: "/detail", params: { id: item.id } } as never);
    }
  };

  const handleLongPress = () => {
    if (!selectMode) onEnterSelect(item.id);
  };

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      delayLongPress={280}
      accessibilityLabel={item.name}
      accessibilityState={{ selected: selectMode && isSelected }}
      style={({ pressed }) => [
        gridStyles.card,
        selectMode && isSelected && gridStyles.cardSelected,
        pressed && { opacity: 0.95, transform: [{ scale: 0.97 }] },
      ]}
    >
      <View style={gridStyles.cardTop}>
        <View
          style={[
            gridStyles.storageChip,
            { backgroundColor: storageChip.bg },
          ]}
        >
          <Text
            style={[gridStyles.storageChipText, { color: storageChip.text }]}
          >
            {storageChip.label}
          </Text>
        </View>
        <View style={[gridStyles.badge, { backgroundColor: badgeColor }]}>
          <Text style={gridStyles.badgeText}>{ddayInfo.text}</Text>
        </View>
      </View>

      <Text style={gridStyles.heroName} numberOfLines={2}>
        {item.name}
      </Text>

      {/* Nickname slot — fixed height so card heights stay identical
          regardless of whether a nickname exists. */}
      <View style={gridStyles.nicknameSlot}>
        {item.nickname !== "" && item.nickname !== item.name && (
          <Text style={gridStyles.nickname} numberOfLines={1}>
            {item.nickname}
          </Text>
        )}
      </View>

      {selectMode && (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(120)}
          style={[
            gridStyles.checkbox,
            isSelected && gridStyles.checkboxActive,
          ]}
          pointerEvents="none"
        >
          {isSelected && (
            <Ionicons name="checkmark" size={14} color={Colors.onPrimary} />
          )}
        </Animated.View>
      )}
    </Pressable>
  );
}

const gridStyles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    alignItems: "flex-start",
    ...Shadows.floatingCard,
  },
  cardTop: {
    alignSelf: "stretch",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  storageChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  storageChipText: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  badgeText: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.bold,
    color: "#FFFFFF",
  },
  heroName: {
    fontSize: FontSize.headlineSm,
    fontWeight: FontWeight.extraBold,
    color: Colors.onSurface,
    letterSpacing: LetterSpacing.tight,
    textAlign: "left",
    marginBottom: Spacing.xs,
  },
  nickname: {
    fontSize: FontSize.labelMd,
    fontWeight: FontWeight.medium,
    color: Colors.onSecondaryContainer,
    textAlign: "left",
    lineHeight: 18,
  },
  // Reserves a fixed 18px row (matches nickname lineHeight) so cards without
  // a nickname keep the same height as cards with one. heroName's existing
  // marginBottom: xs provides the spacing above this slot — no marginTop here.
  nicknameSlot: {
    minHeight: 18,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  cardSelected: {
    backgroundColor: Colors.secondaryContainer,
  },
  // Absolute bottom-right inside the card — zero impact on card layout/height.
  // borderWidth is an intentional exception to the "no hard borders" rule
  // (standard checkbox affordance). Active state fills Primary solid.
  checkbox: {
    position: "absolute",
    bottom: Spacing.md,
    right: Spacing.md,
    width: 24,
    height: 24,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: Colors.outline,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function FridgeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  // ── Async data state ──
  // `ingredients` = full fridge (refetched on focus). `searchResults` is the
  // server-side search hit list, only consulted when query is non-empty.
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [searchResults, setSearchResults] = useState<Ingredient[] | null>(null);
  const categories = FRIDGE_FILTER_CHIPS;
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [selectedFilter, setSelectedFilter] = useState("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryExpanded, setCategoryExpanded] = useState(false);

  // ── Search focus + select-mode state ──
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<TextInput>(null);

  const handleSearchFocus = () => setIsSearchFocused(true);
  const handleSearchBlur = () => setIsSearchFocused(false);

  const handleCancelSearch = () => {
    setSearchQuery("");
    Keyboard.dismiss();
    searchInputRef.current?.blur();
  };

  const handleToggleSelectMode = () => {
    Haptics.selectionAsync().catch(() => {});
    if (selectMode) {
      setSelectedIds(new Set());
      setSelectMode(false);
    } else {
      setSelectMode(true);
      Keyboard.dismiss();
    }
  };

  const handleToggleCard = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleEnterSelectFromLongPress = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSelectMode(true);
    setSelectedIds(new Set([id]));
    Keyboard.dismiss();
  };

  const handleClearSelected = async () => {
    if (selectedIds.size === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    const targets = Array.from(selectedIds);
    const results = await Promise.allSettled(
      targets.map((id) => deleteIngredient(Number(id))),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    const succeeded = targets.length - failed;

    // Drop the items we know are gone, immediately.
    if (succeeded > 0) {
      const succeededIds = new Set(
        results.flatMap((r, i) =>
          r.status === "fulfilled" ? [targets[i]] : [],
        ),
      );
      setIngredients((prev) => prev.filter((it) => !succeededIds.has(it.id)));
    }
    setSelectedIds(new Set());
    setSelectMode(false);

    if (failed === targets.length) {
      showToast("삭제하지 못했어요. 잠시 후 다시 시도해 주세요");
    } else if (failed > 0) {
      showToast(`${succeeded}개 삭제, ${failed}개 실패`);
    } else {
      showToast(`${succeeded}개를 비웠어요`);
    }

    // Refetch to re-sync with server (cleans up any drift).
    fetchFridgeData({ silent: true });
  };

  // Per-category ingredient count for expanded chips
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    const cats = categories.filter((c) => c.type === "category");
    for (const cat of cats) {
      map[cat.label] = ingredients.filter(
        (i) => i.category === cat.label,
      ).length;
    }
    return map;
  }, [ingredients, categories]);

  // The list shown to the user — server-search results take precedence over
  // the full list when the user has typed something.
  const displayedIngredients = searchResults ?? ingredients;

  // Chip list for the search-and-chips header. Memoized so the chip array
  // identity is stable across re-renders triggered by unrelated state.
  const fridgeChips = useMemo<ChipConfig[]>(() => {
    const hasSelectedSubcategory = categories.some(
      (c) => c.type === "category" && c.label === selectedFilter,
    );
    const triggerSelected = categoryExpanded || hasSelectedSubcategory;

    const standard: ChipConfig[] = categories
      .filter((c) => c.type === "all" || c.type === "storageType")
      .map((cat) => ({
        key: cat.id,
        label: cat.label,
        isSelected: selectedFilter === cat.label && !categoryExpanded,
        onPress: () => {
          setCategoryExpanded(false);
          setSelectedFilter(cat.label);
        },
      }));

    const trigger: ChipConfig = {
      key: "category-trigger",
      label:
        !categoryExpanded && hasSelectedSubcategory
          ? selectedFilter
          : "상세 카테고리",
      isSelected: triggerSelected,
      onPress: () => setCategoryExpanded((v) => !v),
      variant: "trigger",
      trailingIcon: (
        <Ionicons
          name={categoryExpanded ? "chevron-up" : "grid-outline"}
          size={14}
          color={
            triggerSelected ? Colors.onPrimary : Colors.onSurfaceVariant
          }
        />
      ),
    };

    return [...standard, trigger];
  }, [categories, selectedFilter, categoryExpanded]);

  // ── Filtered ingredients (category/storage chip applied to base list) ──
  const filteredIngredients = useMemo(() => {
    return displayedIngredients
      .filter((item) => {
        if (selectedFilter === "전체") return true;
        const matchedCat = categories.find((c) => c.label === selectedFilter);
        if (!matchedCat) return true;
        if (matchedCat.type === "storageType") {
          const storageMap: Record<string, StorageType> = {
            실온: "room",
            냉장: "fridge",
            냉동: "frozen",
          };
          return item.storageType === storageMap[matchedCat.label];
        }
        if (matchedCat.type === "category") {
          // `item.category` is already canonicalized to one of the 10 master
          // categories via `categoryFromApi` in the mapper.
          return item.category === matchedCat.label;
        }
        return true;
      })
      .sort((a, b) => {
        const infoA = getDDayInfo(a.expirationDate);
        const infoB = getDDayInfo(b.expirationDate);
        // Infinity (no expiry) → always last
        if (infoA.daysLeft === Infinity && infoB.daysLeft === Infinity) return 0;
        if (infoA.daysLeft === Infinity) return 1;
        if (infoB.daysLeft === Infinity) return -1;
        return infoA.daysLeft - infoB.daysLeft;
      });
  }, [displayedIngredients, categories, selectedFilter]);

  async function fetchFridgeData(opts: { silent?: boolean } = {}) {
    if (!opts.silent && !hasLoadedOnce) setIsLoading(true);
    try {
      const data = await fetchAllIngredients();
      setIngredients(data);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
  }

  // Refetch every time the home tab is focused (covers post-add, post-edit,
  // post-delete flows without a separate event bus).
  useFocusEffect(
    useCallback(() => {
      fetchFridgeData({ silent: hasLoadedOnce });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  // Server-side search with 300ms debounce. Empty query → fall back to the
  // full list by clearing `searchResults`.
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed === "") {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const hits = await searchIngredients(trimmed);
        if (!cancelled) setSearchResults(hits);
      } catch {
        // Keep prior results on transient failure — interceptor logs the error.
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [searchQuery]);

  // Show the dedicated error page only when we have nothing to display —
  // a refetch failure on top of an existing list shouldn't blank out the UI.
  if (error && !hasLoadedOnce) {
    return (
      <ErrorScreen
        message="냉장고를 열지 못했어요"
        subMessage="네트워크 상태를 확인하고 다시 시도해 주세요"
        onRetry={() => {
          setError(null);
          fetchFridgeData();
        }}
      />
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <AppHeaderLogo />
        </View>
        <AppHeaderRight />
      </View>

      {isLoading ? (
        /* ── Loading state ── */
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryContainer} />
          <Text style={styles.loadingText}>냉장고 문을 여는 중...</Text>
        </View>
      ) : (
        <View style={styles.contentArea}>
          <AppSearchChipsHeader
            searchPlaceholder="식재료 검색"
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            searchInputRef={searchInputRef}
            onSearchFocus={handleSearchFocus}
            onSearchBlur={handleSearchBlur}
            searchEditable={!selectMode}
            chips={fridgeChips}
            searchRightSlot={
              <>
                {/*
                  Axis A: selectMode off ↔ on
                    → Same slot, same width, only text + bg color swap.
                  Axis B: search unfocused ↔ focused
                    → Right button unmounts; "취소" text slot fades in.
                    selectMode is gated by `searchEditable={!selectMode}` so
                    the two axes never overlap.
                */}
                {!isSearchFocused && (
                  <Animated.View
                    key="select-slot"
                    entering={FadeIn.duration(200)}
                    exiting={FadeOut.duration(180)}
                    style={styles.selectBtnSlot}
                  >
                    <Pressable
                      onPress={handleToggleSelectMode}
                      accessibilityRole="button"
                      accessibilityLabel={
                        selectMode ? "선택 모드 취소" : "선택 모드 진입"
                      }
                      style={({ pressed }) => [
                        styles.selectBtn,
                        selectMode && styles.selectBtnActive,
                        pressed && { opacity: 0.75 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.selectBtnText,
                          selectMode && styles.selectBtnTextActive,
                        ]}
                      >
                        {selectMode ? "취소" : "선택"}
                      </Text>
                    </Pressable>
                  </Animated.View>
                )}
                {isSearchFocused && (
                  <Animated.View
                    key="cancel-slot"
                    entering={FadeIn.duration(200)}
                    exiting={FadeOut.duration(140)}
                    style={styles.cancelSlot}
                  >
                    <Pressable
                      onPress={handleCancelSearch}
                      accessibilityRole="button"
                      accessibilityLabel="검색 취소"
                      style={({ pressed }) => [
                        styles.cancelTextBtn,
                        pressed && { opacity: 0.6 },
                      ]}
                    >
                      <Text style={styles.cancelTextBtnText}>취소</Text>
                    </Pressable>
                  </Animated.View>
                )}
              </>
            }
            belowChipsSlot={
              categoryExpanded ? (
                <View style={styles.expandedArea}>
                  {categories
                    .filter((c) => c.type === "category")
                    .map((cat) => {
                      const count = categoryCounts[cat.label] ?? 0;
                      const hasItems = count > 0;
                      const isSelected = selectedFilter === cat.label;

                      return (
                        <Pressable
                          key={cat.id}
                          onPress={() => {
                            setSelectedFilter(cat.label);
                            setCategoryExpanded(false);
                          }}
                          style={[
                            styles.expandedChip,
                            isSelected && styles.expandedChipSelected,
                            !hasItems && styles.expandedChipEmpty,
                          ]}
                        >
                          <Text
                            style={[
                              styles.expandedChipText,
                              isSelected && styles.expandedChipTextSelected,
                              !hasItems && styles.expandedChipTextEmpty,
                            ]}
                          >
                            {cat.label}
                          </Text>
                          {hasItems && (
                            <View
                              style={[
                                styles.chipBadge,
                                isSelected && styles.chipBadgeSelected,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.chipBadgeText,
                                  isSelected && styles.chipBadgeTextSelected,
                                ]}
                              >
                                {count}
                              </Text>
                            </View>
                          )}
                        </Pressable>
                      );
                    })}
                </View>
              ) : undefined
            }
          />

          {/* Ingredient Grid or Empty State */}
          {filteredIngredients.length > 0 ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.gridContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              {filteredIngredients.map((item) => (
                <IngredientGridCard
                  key={item.id}
                  item={item}
                  selectMode={selectMode}
                  isSelected={selectedIds.has(item.id)}
                  onToggle={handleToggleCard}
                  onEnterSelect={handleEnterSelectFromLongPress}
                />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons
                name={
                  searchQuery.trim() === "" && selectedFilter === "전체"
                    ? "cube-outline"
                    : "search-outline"
                }
                size={48}
                color={Colors.outlineVariant}
              />
              <Text style={styles.emptyText}>
                {searchQuery.trim() === "" && selectedFilter === "전체"
                  ? "냉장고가 비어있어요"
                  : "검색된 식재료가 없습니다."}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Select-mode bottom action bar */}
      {selectMode && (
        <Animated.View
          entering={FadeInDown.duration(220)}
          exiting={FadeOutDown.duration(160)}
          style={[
            styles.actionBar,
            { bottom: insets.bottom + 80 },
          ]}
        >
          <Text style={styles.actionCount}>
            {selectedIds.size}개 선택됨
          </Text>
          <Pressable
            onPress={handleClearSelected}
            disabled={selectedIds.size === 0}
            accessibilityRole="button"
            accessibilityLabel="선택한 식재료 비우기"
            accessibilityState={{ disabled: selectedIds.size === 0 }}
            style={({ pressed }) => [
              styles.actionBtn,
              selectedIds.size === 0 && styles.actionBtnDisabled,
              pressed && selectedIds.size > 0 && { opacity: 0.85 },
            ]}
          >
            <Ionicons
              name="trash-outline"
              size={16}
              color={
                selectedIds.size === 0 ? Colors.outline : Colors.onPrimary
              }
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.actionBtnText,
                selectedIds.size === 0 && styles.actionBtnTextDisabled,
              ]}
            >
              비우기
            </Text>
          </Pressable>
        </Animated.View>
      )}

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.surface,
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },

  // Content area (below header, when loaded)
  contentArea: {
    flex: 1,
  },

  // Axis A slot — holds the select/cancel pill when search is not focused.
  // Fixed width via pill padding keeps the search bar's flex width identical
  // whether selectMode is off or on (선택 ↔ 취소 = color swap only).
  selectBtnSlot: {
    marginLeft: Spacing.sm,
    justifyContent: "center",
  },
  // Axis B slot — external cancel text during search focus. Minimal padding
  // so the search bar absorbs the maximum width released by the select slot.
  cancelSlot: {
    marginLeft: Spacing.xs,
    justifyContent: "center",
  },
  selectBtn: {
    minHeight: 44,
    paddingHorizontal: Spacing.base,
    borderRadius: Radius.full,
    backgroundColor: Colors.fieldBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  selectBtnActive: {
    backgroundColor: Colors.primary,
  },
  selectBtnText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.semiBold,
    color: Colors.onSurface,
  },
  selectBtnTextActive: {
    color: Colors.onPrimary,
  },
  // iOS-style "Cancel" next to the focused search bar — no pill, minimal padding
  // so the search bar naturally expands to fill the released space.
  cancelTextBtn: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.md,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelTextBtnText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.primary,
  },

  // Bottom action bar (select mode)
  actionBar: {
    position: "absolute",
    left: Spacing.xl,
    right: Spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Shadows.floatingCard,
  },
  actionCount: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.semiBold,
    color: Colors.onSurface,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
  },
  actionBtnDisabled: {
    backgroundColor: Colors.surfaceContainerHigh,
  },
  actionBtnText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.bold,
    color: Colors.onPrimary,
  },
  actionBtnTextDisabled: {
    color: Colors.outline,
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.base,
    paddingBottom: 80,
  },
  emptyText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
  },

  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.base,
  },
  loadingText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
  },

  // Expanded category area (inline wrap, rendered via AppSearchChipsHeader's
  // belowChipsSlot when the user expands the trigger chip).
  expandedArea: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
    marginBottom: Spacing.base,
  },
  expandedChip: {
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.md,
    gap: Spacing.xs,
  },
  expandedChipSelected: {
    backgroundColor: Colors.primary,
  },
  expandedChipEmpty: {
    opacity: 0.45,
  },
  expandedChipText: {
    fontSize: FontSize.labelMd,
    lineHeight: 18,
    fontWeight: FontWeight.semiBold,
    color: Colors.onSurfaceVariant,
  },
  expandedChipTextSelected: {
    color: Colors.onPrimary,
  },
  expandedChipTextEmpty: {
    color: Colors.outline,
  },
  chipBadge: {
    backgroundColor: Colors.secondaryContainer,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: Radius.full,
  },
  chipBadgeSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  chipBadgeText: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.bold,
    color: Colors.onSecondaryContainer,
  },
  chipBadgeTextSelected: {
    color: Colors.onPrimary,
  },

  // Ingredient Grid
  gridContent: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: Spacing.xl,
    paddingBottom: 120,
    gap: Spacing.md,
  },
});
