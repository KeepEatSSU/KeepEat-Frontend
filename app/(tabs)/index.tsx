import { AppHeaderLogo } from "@/components/AppHeaderLogo";
import { AppHeaderRight } from "@/components/AppHeaderRight";
import {
  AppSearchChipsHeader,
  type ChipConfig,
} from "@/components/AppSearchChipsHeader";
import { FridgeCategorySheet } from "@/components/FridgeCategorySheet";
import { ErrorScreen } from "@/components/ErrorScreen";
import { IngredientIcon } from "@/components/IngredientIcon";
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
import { getErrorMessage } from "@/services/api";
import { useIngredientMaster } from "@/context/IngredientMasterContext";
import { getDDayBadgeColor, getDDayInfo } from "@/utils/dateUtils";
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

// ─── Grid Card ────────────────────────────────────────────────────────────────

const SCREEN_WIDTH = Dimensions.get("window").width;

const GRID_GAP = Spacing.sm;
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

      <View style={gridStyles.iconSlot}>
        <IngredientIcon
          ingredientId={item.ingredientId}
          isCustom={item.isCustom}
          size={80}
        />
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
    borderRadius: Radius.lg,
    padding: Spacing.md,
    // `stretch` so children fill the card width — lets textAlign:"center"
    // actually center within the full row instead of around the text's
    // intrinsic box. cardTop already overrode this; explicit is cleaner.
    alignItems: "stretch",
    ...Shadows.floatingCard,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    // 0 — the ingredient webps have a built-in 6% padding ring (convert
    // script PADDING_RATIO=0.06), so we let that ring serve as the natural
    // gap to the chips row instead of stacking margin on top.
    marginBottom: 0,
  },
  iconSlot: {
    alignItems: "center",
    // Same reasoning — webp ring absorbs the gap to the heroName below.
    marginBottom: 0,
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
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.extraBold,
    color: Colors.onSurface,
    letterSpacing: LetterSpacing.tight,
    textAlign: "center",
    marginBottom: 2,
  },
  nickname: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.medium,
    color: Colors.onSecondaryContainer,
    textAlign: "center",
    lineHeight: 14,
  },
  // Reserves a fixed 16pt row so cards without a nickname keep the same
  // height as cards with one. Slightly taller than the 14pt lineHeight so
  // the nickname row gets a hair of breathing space; both empty and text
  // states render at 16pt → height-stable.
  nicknameSlot: {
    minHeight: 16,
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
  const insets = useSafeAreaInsets();
  const { showTopToast } = useToast();
  const { snapshot } = useIngredientMaster();

  // ── Async data state ──
  // `ingredients` = full fridge (refetched on focus). `searchResults` is the
  // server-side search hit list, only consulted when query is non-empty.
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [searchResults, setSearchResults] = useState<Ingredient[] | null>(null);
  const categories = FRIDGE_FILTER_CHIPS;
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  // 보관위치 단일 선택 — 카테고리와 mutex. 카테고리가 활성이면 storage는
  // 항상 "전체"로 강제 리셋되고, 반대로 storage 선택 시 카테고리는 비워진다.
  const [selectedFilter, setSelectedFilter] = useState<
    "전체" | "실온" | "냉장" | "냉동"
  >("전체");
  // 카테고리 다중 선택 (OR). 빈 배열 = 카테고리 필터 미적용.
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  // 카테고리 다중 선택은 바텀시트로 — 이전 아코디언/categoryExpanded는 폐기.
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);

  // ── Search toggle + select-mode state ──
  // searchOpen drives the (now hidden by default) search input row. The
  // top-right search icon toggles it; the in-row × button closes + clears.
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<TextInput>(null);
  const hasLoadedOnceRef = useRef(false);

  const handleOpenSearch = () => {
    setSearchOpen(true);
    // 다음 프레임에 포커스를 줘서 TextInput가 마운트된 뒤 키보드를 띄운다.
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const handleCloseSearch = () => {
    setSearchQuery("");
    setSearchOpen(false);
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
      // 선택 모드 진입 시 열려 있던 검색은 닫는다 — 칩 줄의 "삭제" 칩이
      // 현재 모드의 주체이므로 두 UI가 동시에 살아 있으면 헷갈린다.
      setSearchOpen(false);
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

  const fetchFridgeData = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent && !hasLoadedOnceRef.current) setIsLoading(true);
      try {
        const data = await fetchAllIngredients(snapshot);
        setIngredients(data);
        setError(null);
      } catch (e) {
        setError(e);
      } finally {
        setIsLoading(false);
        hasLoadedOnceRef.current = true;
        setHasLoadedOnce(true);
      }
    },
    [snapshot],
  );

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
      showTopToast({
        message: "삭제하지 못했어요. 잠시 후 다시 시도해 주세요",
        variant: "error",
      });
    } else if (failed > 0) {
      showTopToast({
        message: `${succeeded}개 삭제, ${failed}개 실패`,
        variant: "warning",
      });
    } else {
      showTopToast({
        message: `${succeeded}개를 비웠어요`,
        variant: "success",
      });
    }

    // Refetch to re-sync with server (cleans up any drift).
    fetchFridgeData({ silent: true });
  };

  // The list shown to the user — server-search results take precedence over
  // the full list when the user has typed something.
  const displayedIngredients = searchResults ?? ingredients;

  // 카테고리별 식재료 수 — 시트의 카테고리 칩에 표시/비활성화 판단에 쓰임.
  // searchResults가 아닌 전체 ingredients 기준 (시트는 카테고리 필터 전용이고
  // 검색어와 무관해야 함). 아이템 추가/삭제 시 자연스럽게 재계산.
  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of ingredients) {
      if (item.category) {
        map[item.category] = (map[item.category] ?? 0) + 1;
      }
    }
    return map;
  }, [ingredients]);

  // 칩 줄을 [전체][실온][냉장][냉동][필터][삭제] 6개로 고정. 카테고리는
  // mutex로 묶음 — selectedCategories.length>0이면 "필터" 칩만 활성으로 보이고
  // storage/전체 칩은 모두 unselected로 죽인다 (한 axis만 가시화).
  const hasCategoryFilter = selectedCategories.length > 0;

  const fridgeChips = useMemo<ChipConfig[]>(() => {
    const allChip: ChipConfig = {
      key: "all",
      label: "전체",
      isSelected: selectedFilter === "전체" && !hasCategoryFilter,
      onPress: () => {
        setSelectedFilter("전체");
        setSelectedCategories([]);
      },
    };

    const storageChips: ChipConfig[] = categories
      .filter((c) => c.type === "storageType")
      .map((cat) => ({
        key: cat.id,
        label: cat.label,
        isSelected: selectedFilter === cat.label && !hasCategoryFilter,
        onPress: () => {
          // 보관위치 선택 시 카테고리는 비워서 mutex 유지.
          setSelectedFilter(cat.label as "실온" | "냉장" | "냉동");
          setSelectedCategories([]);
        },
      }));

    const filterChip: ChipConfig = {
      key: "filter",
      label: "필터",
      isSelected: hasCategoryFilter,
      // 선택된 카테고리 수를 chip의 count 뱃지로 표시 — 0이면 자동 숨김.
      count: hasCategoryFilter ? selectedCategories.length : undefined,
      onPress: () => setFilterSheetVisible(true),
      variant: "trigger",
      trailingIcon: (
        <Ionicons
          name="options-outline"
          size={14}
          color={
            hasCategoryFilter ? Colors.onPrimary : Colors.onSurfaceVariant
          }
        />
      ),
    };

    const deleteChip: ChipConfig = {
      key: "delete-mode",
      label: selectMode ? "취소" : "삭제",
      isSelected: selectMode,
      variant: "destructive",
      onPress: handleToggleSelectMode,
      trailingIcon: !selectMode ? (
        <Ionicons name="trash-outline" size={14} color={Colors.primary} />
      ) : undefined,
    };

    return [allChip, ...storageChips, filterChip, deleteChip];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, selectedFilter, hasCategoryFilter, selectedCategories.length, selectMode]);

  // ── Filtered ingredients (category OR / storage 단일, mutex) ──
  const filteredIngredients = useMemo(() => {
    const storageMap: Record<string, StorageType> = {
      실온: "room",
      냉장: "fridge",
      냉동: "frozen",
    };
    return displayedIngredients
      .filter((item) => {
        // 카테고리 axis가 활성이면 OR 매칭만 본다 — mutex 덕에 storage는
        // 이미 "전체"로 강제된 상태라 더 볼 게 없음.
        if (selectedCategories.length > 0) {
          // `item.category` is already canonicalized to one of the 10 master
          // categories via `categoryFromApi` in the mapper.
          return selectedCategories.includes(item.category);
        }
        if (selectedFilter === "전체") return true;
        return item.storageType === storageMap[selectedFilter];
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
  }, [displayedIngredients, selectedFilter, selectedCategories]);

  // Refetch every time the home tab is focused (covers post-add, post-edit,
  // post-delete flows without a separate event bus).
  useFocusEffect(
    useCallback(() => {
      fetchFridgeData();
    }, [fetchFridgeData]),
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
        const hits = await searchIngredients(trimmed, snapshot);
        if (!cancelled) setSearchResults(hits);
      } catch {
        // Keep prior results on transient failure — interceptor logs the error.
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [searchQuery, snapshot]);

  // Show the dedicated error page only when we have nothing to display —
  // a refetch failure on top of an existing list shouldn't blank out the UI.
  if (error && !hasLoadedOnce) {
    return (
      <ErrorScreen
        message={getErrorMessage(error, "냉장고를 열지 못했어요")}
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
      {/* Header — 로고(좌) / 알림 + 검색 아이콘(우) 한 줄 */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <AppHeaderLogo />
        </View>
        <View style={styles.headerRight}>
          <AppHeaderRight />
          <Pressable
            onPress={handleOpenSearch}
            accessibilityRole="button"
            accessibilityLabel="검색 열기"
            hitSlop={8}
            style={({ pressed }) => [
              styles.headerIconBtn,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Ionicons name="search" size={22} color={Colors.onSurface} />
          </Pressable>
        </View>
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
            showSearch={searchOpen}
            chips={fridgeChips}
            chipsLayout="fitted"
            searchRightSlot={
              <Pressable
                onPress={handleCloseSearch}
                accessibilityRole="button"
                accessibilityLabel="검색 닫기"
                hitSlop={8}
                style={({ pressed }) => [
                  styles.searchCloseBtn,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color={Colors.onSurfaceVariant}
                />
              </Pressable>
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
              {(() => {
                // 진짜 "냉장고 텅 빔" = 검색 없음 + 모든 필터 미적용.
                const isTrulyEmpty =
                  searchQuery.trim() === "" &&
                  selectedFilter === "전체" &&
                  selectedCategories.length === 0;
                return (
                  <>
                    <Ionicons
                      name={isTrulyEmpty ? "cube-outline" : "search-outline"}
                      size={48}
                      color={Colors.outlineVariant}
                    />
                    <Text style={styles.emptyText}>
                      {isTrulyEmpty
                        ? "냉장고가 비어있어요"
                        : "검색된 식재료가 없습니다."}
                    </Text>
                    {isTrulyEmpty && (
                      <Text style={styles.emptySubText}>
                        아래 + 버튼을 눌러 식재료를 등록해보세요
                      </Text>
                    )}
                  </>
                );
              })()}
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

      <FridgeCategorySheet
        visible={filterSheetVisible}
        value={selectedCategories}
        counts={categoryCounts}
        onApply={(categories) => {
          setSelectedCategories(categories);
          // 비어있지 않으면 mutex로 storage 강제 리셋. 빈 배열이면 storage는
          // 그대로 둠 — 사용자가 시트에서 카테고리만 비웠다고 보관위치까지
          // 풀어버리면 의도와 어긋남.
          if (categories.length > 0) setSelectedFilter("전체");
        }}
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

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.sm,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },

  // Content area (below header, when loaded)
  contentArea: {
    flex: 1,
  },

  // 검색 닫기 (×) — 펼쳐진 검색 입력창 오른쪽에 붙는 toggle-off.
  searchCloseBtn: {
    marginLeft: Spacing.xs,
    paddingHorizontal: Spacing.xs,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
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
  emptySubText: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.regular,
    color: Colors.outline,
    textAlign: "center",
    marginTop: -Spacing.xs,
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

  // Ingredient Grid — paddingHorizontal + gap MUST match the constants used
  // in the CARD_WIDTH formula. Hardcoding them separately let them drift and
  // pushed the row total past available width → flexWrap collapsed to 1
  // column. Reference the constants directly so future tweaks stay in sync.
  gridContent: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 120,
    gap: GRID_GAP,
  },
});
