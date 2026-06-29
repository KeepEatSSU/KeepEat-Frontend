import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  type LayoutChangeEvent,
} from "react-native";
import PagerView from "react-native-pager-view";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  Radius,
  LetterSpacing,
} from "@/constants/theme";
import { useIngredientMaster } from "@/context/IngredientMasterContext";
import { IngredientIcon } from "@/components/IngredientIcon";
import {
  getRecentIngredients,
  pushRecentIngredient,
  type RecentEntry,
} from "@/services/recentIngredients";

const MAX_RESULTS = 50;

type PickerCategory = { id: number; name: string };
type PickerIngredient = { id: number; subCategoryId: number; name: string };

interface IngredientPickerSheetProps {
  visible: boolean;
  /** Currently selected ingredient name (for the active checkmark). */
  selected: string;
  /** Returns the picked master ingredient — id is the value the API needs. */
  onSelect: (entry: { id: number; name: string }) => void;
  onClose: () => void;
  /** 검색 결과 빈 상태에서 "직접 추가하기" 누름. name은 검색어. */
  onPickCustom?: (name: string) => void;
  /** picker 열릴 때 검색창에 자동 입력될 초기값. 빈 문자열이면 prefill 없음. */
  initialQuery?: string;
}

export function IngredientPickerSheet({
  visible,
  selected,
  onSelect,
  onClose,
  onPickCustom,
  initialQuery,
}: IngredientPickerSheetProps) {
  const insets = useSafeAreaInsets();
  const { snapshot } = useIngredientMaster();
  const [search, setSearch] = useState("");
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  // Stage-3 anchor: when set, the placeholder category modal is open and
  // will eventually host the per-category ingredient grid.
  const [activeCategory, setActiveCategory] = useState<PickerCategory | null>(
    null,
  );
  const inputRef = useRef<TextInput>(null);

  // Master categories (10 of them) for the right pane grid.
  const categories = useMemo<PickerCategory[]>(
    () => snapshot?.categories ?? [],
    [snapshot],
  );

  // Representative thumbnail per category — the smallest-id ingredient in
  // that category (ingredients link to subCategory which links to category,
  // so we walk via a sub→cat index).
  const categoryIconIds = useMemo<Map<number, number>>(() => {
    if (!snapshot) return new Map();
    const subToCat = new Map<number, number>();
    for (const sc of snapshot.subCategories) subToCat.set(sc.id, sc.categoryId);
    const minByCat = new Map<number, number>();
    for (const ing of snapshot.ingredients) {
      const catId = subToCat.get(ing.subCategoryId);
      if (catId == null) continue;
      const cur = minByCat.get(catId);
      if (cur == null || ing.id < cur) minByCat.set(catId, ing.id);
    }
    return minByCat;
  }, [snapshot]);

  // Full ingredient list per category — drives the modal's per-category
  // grid. Same sub→cat traversal as `categoryIconIds`; each bucket sorted
  // by ingredient id so the grid order stays stable across launches.
  const ingredientsByCategory = useMemo<
    Map<number, PickerIngredient[]>
  >(() => {
    if (!snapshot) return new Map();
    const subToCat = new Map<number, number>();
    for (const sc of snapshot.subCategories) subToCat.set(sc.id, sc.categoryId);
    const map = new Map<number, PickerIngredient[]>();
    for (const ing of snapshot.ingredients) {
      const catId = subToCat.get(ing.subCategoryId);
      if (catId == null) continue;
      let arr = map.get(catId);
      if (!arr) {
        arr = [];
        map.set(catId, arr);
      }
      arr.push(ing);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.id - b.id);
    return map;
  }, [snapshot]);

  // Prefill query + reload recents whenever the sheet opens. The query is
  // seeded from `initialQuery` (e.g. the calling card's current name) so an
  // UNMATCHED card lands the user straight on the relevant search.
  useEffect(() => {
    if (!visible) {
      setSearch("");
      return;
    }
    setSearch(initialQuery ?? "");
    getRecentIngredients().then(setRecents);
    // Autofocus once the modal has had a chance to render.
    const handle = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(handle);
  }, [visible, initialQuery]);

  const handlePick = useCallback(
    (entry: PickerIngredient | RecentEntry) => {
      const payload = { id: entry.id, name: entry.name };
      // Persist to recents asynchronously; UX should not block on storage.
      pushRecentIngredient(payload).catch(() => {});
      Keyboard.dismiss();
      onClose();
      onSelect(payload);
    },
    [onClose, onSelect],
  );

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const handleRequestClose = useCallback(() => {
    if (activeCategory) {
      setActiveCategory(null);
      return;
    }
    handleClose();
  }, [activeCategory, handleClose]);

  const handlePickCustom = useCallback(() => {
    if (!onPickCustom) return;
    const name = search.trim();
    if (name === "") return;
    Keyboard.dismiss();
    onClose();
    onPickCustom(name);
  }, [onClose, onPickCustom, search]);

  const trimmed = search.trim();

  // Substring match against the full master. ~613 entries is fine to scan on
  // every keystroke; we cap the rendered results at MAX_RESULTS.
  const searchResults = useMemo<PickerIngredient[]>(() => {
    if (trimmed === "" || !snapshot) return [];
    const q = trimmed.toLowerCase();
    const hits: PickerIngredient[] = [];
    for (const entry of snapshot.ingredients) {
      if (entry.name.toLowerCase().includes(q)) {
        hits.push(entry);
        if (hits.length >= MAX_RESULTS) break;
      }
    }
    return hits;
  }, [trimmed, snapshot]);

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleRequestClose}
    >
      <View style={styles.modalRoot}>
        <KeyboardAvoidingView
          testID="ingredient-picker.sheet.root"
          style={styles.container}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View
            style={[
              styles.header,
              { paddingTop: Math.max(insets.top, Spacing.lg) },
            ]}
          >
            <Pressable
              testID="ingredient-picker.close-button"
              onPress={handleClose}
              style={({ pressed }) => [
                styles.backButton,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Ionicons name="chevron-back" size={28} color={Colors.onSurface} />
            </Pressable>
            <Text style={styles.headerTitle}>식재료 선택</Text>
            <View style={styles.headerRight} />
          </View>

          <View style={styles.searchContainer}>
            <View style={styles.searchBar}>
              <Ionicons
                name="search"
                size={20}
                color={Colors.outline}
                style={{ marginRight: Spacing.sm }}
              />
              <TextInput
                ref={inputRef}
                value={search}
                onChangeText={setSearch}
                placeholder="식재료 이름을 검색해 보세요"
                placeholderTextColor={Colors.outline}
                style={styles.searchInput}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch("")}>
                  <Ionicons
                    name="close-circle"
                    size={20}
                    color={Colors.outline}
                  />
                </Pressable>
              )}
            </View>
          </View>

          <View style={styles.listContainer}>
            {trimmed === "" ? (
              // ── Default: split layout. Left = recents column, right =
              // 10-category grid. Each pane scrolls on its own so a long
              // recent list never pushes the category grid out of view.
              <View style={styles.splitContainer}>
                <View style={styles.leftPane}>
                  <Text style={styles.paneLabel}>최근 선택</Text>
                  {recents.length > 0 ? (
                    <ScrollView
                      style={styles.paneScroll}
                      contentContainerStyle={{
                        gap: 10,
                        paddingBottom: Math.max(insets.bottom, Spacing.lg),
                      }}
                      showsVerticalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                    >
                      {recents.map((entry) => (
                        <Pressable
                          key={`recent-${entry.id}`}
                          onPress={() => handlePick(entry)}
                          style={({ pressed }) => [
                            styles.recentRow,
                            pressed && { opacity: 0.6 },
                          ]}
                        >
                          <IngredientIcon
                            ingredientId={entry.id}
                            size={44}
                          />
                          <Text style={styles.recentName} numberOfLines={1}>
                            {entry.name}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  ) : (
                    <View style={styles.recentEmpty}>
                      <Text style={styles.recentEmptyText}>
                        최근 선택한{"\n"}재료가 없어요
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.rightPane}>
                  <Text style={styles.paneLabel}>카테고리</Text>
                  <ScrollView
                    style={styles.paneScroll}
                    contentContainerStyle={{
                      paddingBottom: Math.max(insets.bottom, Spacing.lg),
                    }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                  >
                    <View style={styles.categoryGrid}>
                      {categories.map((cat) => {
                        const iconId = categoryIconIds.get(cat.id) ?? null;
                        return (
                          <Pressable
                            key={cat.id}
                            onPress={() => setActiveCategory(cat)}
                            style={({ pressed }) => [
                              styles.categoryCell,
                              pressed && { opacity: 0.7 },
                            ]}
                          >
                            <IngredientIcon
                              ingredientId={iconId}
                              size={44}
                            />
                            <Text
                              style={styles.categoryCellName}
                              numberOfLines={1}
                            >
                              {cat.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              </View>
            ) : (
              // ── Search mode: full-width result list (unchanged from before)
              <ScrollView
                style={styles.list}
                contentContainerStyle={[
                  styles.listContent,
                  { paddingBottom: Math.max(insets.bottom, Spacing.xl) },
                ]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {searchResults.length > 0 ? (
                  searchResults.map((entry) => (
                    <PickerRow
                      key={`hit-${entry.id}`}
                      id={entry.id}
                      name={entry.name}
                      isSelected={selected === entry.name}
                      onPress={() => handlePick(entry)}
                    />
                  ))
                ) : (
                  <View style={styles.placeholderBlock}>
                    <Ionicons
                      name="leaf-outline"
                      size={40}
                      color={Colors.outlineVariant}
                    />
                    <Text style={styles.placeholderText}>
                      찾으시는 식재료가 없나요?
                    </Text>
                    {trimmed.length > 0 && onPickCustom && (
                      <Pressable
                        testID="ingredient-picker.custom-add.button"
                        onPress={handlePickCustom}
                        style={({ pressed }) => [
                          styles.customAddButton,
                          pressed && { opacity: 0.8 },
                        ]}
                      >
                        <Text style={styles.customAddText}>
                          {`"${trimmed}" 직접 추가하기`}
                        </Text>
                      </Pressable>
                    )}
                    <Text style={styles.placeholderRequest}>
                      KeepEat 팀에 알리기
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>

        {/* Category overlay stays inside the picker Modal. Closing a nested
            native Modal and its parent in the same selection tick leaves iOS
            Simulator on a black window in this flow. */}
        {activeCategory && (
          <View style={styles.categoryOverlay}>
            <CategoryGridModal
              activeCategory={activeCategory}
              categories={categories}
              ingredientsByCategory={ingredientsByCategory}
              onChangeCategory={setActiveCategory}
              onPickIngredient={(ing) => {
                // Same path as recents/search picks: persists to recents,
                // closes the outer picker, fires onSelect upward.
                setActiveCategory(null);
                handlePick(ing);
              }}
              onClose={() => setActiveCategory(null)}
              insets={insets}
            />
          </View>
        )}
      </View>
    </Modal>
  );
}

// ─── Category modal body ─────────────────────────────────────────────────────
// Lives in its own component so it mounts/unmounts with the modal session —
// that way `<PagerView initialPage>` reads the correct starting index every
// time the user opens a new category from the grid.

function CategoryGridModal({
  activeCategory,
  categories,
  ingredientsByCategory,
  onChangeCategory,
  onPickIngredient,
  onClose,
  insets,
}: {
  activeCategory: PickerCategory;
  categories: PickerCategory[];
  ingredientsByCategory: Map<number, PickerIngredient[]>;
  onChangeCategory: (cat: PickerCategory) => void;
  onPickIngredient: (ing: PickerIngredient) => void;
  onClose: () => void;
  insets: { top: number; bottom: number; left: number; right: number };
}) {
  const [search, setSearch] = useState("");
  const pagerRef = useRef<PagerView>(null);
  const tabScrollRef = useRef<ScrollView>(null);
  const tabLayouts = useRef<{ x: number; width: number }[]>([]);
  const tabContainerWidth = useRef(0);

  // Captured once at mount; PagerView only reads initialPage on first mount.
  const initialPageIndex = useRef(
    Math.max(0, categories.findIndex((c) => c.id === activeCategory.id)),
  ).current;
  const activeIndex = categories.findIndex((c) => c.id === activeCategory.id);

  const centerTab = useCallback((idx: number) => {
    const layout = tabLayouts.current[idx];
    const scrollView = tabScrollRef.current;
    if (!layout || !scrollView || tabContainerWidth.current === 0) return;
    const scrollX =
      layout.x - tabContainerWidth.current / 2 + layout.width / 2;
    scrollView.scrollTo({ x: Math.max(0, scrollX), animated: true });
  }, []);

  const handleTabPress = useCallback(
    (idx: number) => {
      pagerRef.current?.setPage(idx);
      onChangeCategory(categories[idx]);
      centerTab(idx);
    },
    [categories, onChangeCategory, centerTab],
  );

  const handlePageSelected = useCallback(
    (e: { nativeEvent: { position: number } }) => {
      const idx = e.nativeEvent.position;
      onChangeCategory(categories[idx]);
      centerTab(idx);
    },
    [categories, onChangeCategory, centerTab],
  );

  // Center the initial active tab once layout completes — onLayout callbacks
  // populate tabLayouts asynchronously, so a 0-tick delay after mount is the
  // simplest way to wait for them without an additional state machine.
  useEffect(() => {
    const handle = setTimeout(() => centerTab(initialPageIndex), 80);
    return () => clearTimeout(handle);
  }, [centerTab, initialPageIndex]);

  const onTabLayout = (idx: number) => (e: LayoutChangeEvent) => {
    tabLayouts.current[idx] = {
      x: e.nativeEvent.layout.x,
      width: e.nativeEvent.layout.width,
    };
  };

  const trimmedSearch = search.trim().toLowerCase();

  return (
    <View style={styles.categoryModal}>
      {/* Header: X | "식재료 선택" | spacer */}
      <View
        style={[
          styles.header,
          { paddingTop: Math.max(insets.top, Spacing.lg) },
        ]}
      >
        <Pressable
          onPress={onClose}
          style={({ pressed }) => [
            styles.backButton,
            pressed && { opacity: 0.6 },
          ]}
        >
          <Ionicons name="close" size={28} color={Colors.onSurface} />
        </Pressable>
        <Text style={styles.modalHeaderTitle}>식재료 선택</Text>
        <View style={styles.headerRight} />
      </View>

      {/* In-modal search (scoped to active category — placeholder updates
          with the page so the user knows what they're filtering). */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons
            name="search"
            size={20}
            color={Colors.outline}
            style={{ marginRight: Spacing.sm }}
          />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={`${activeCategory.name}에서 검색`}
            placeholderTextColor={Colors.outline}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <Ionicons
                name="close-circle"
                size={20}
                color={Colors.outline}
              />
            </Pressable>
          )}
        </View>
      </View>

      {/* Horizontal tab bar */}
      <View style={styles.tabBarContainer}>
        <ScrollView
          ref={tabScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onLayout={(e) => {
            tabContainerWidth.current = e.nativeEvent.layout.width;
          }}
          contentContainerStyle={styles.tabBarContent}
        >
          {categories.map((cat, idx) => {
            const isActive = idx === activeIndex;
            return (
              <Pressable
                key={cat.id}
                onPress={() => handleTabPress(idx)}
                onLayout={onTabLayout(idx)}
                style={styles.tab}
              >
                <Text
                  style={[styles.tabText, isActive && styles.tabTextActive]}
                >
                  {cat.name}
                </Text>
                {isActive && <View style={styles.tabUnderline} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Pager — one page per category, 3-col ingredient grid each */}
      <PagerView
        ref={pagerRef}
        style={{ flex: 1 }}
        initialPage={initialPageIndex}
        onPageSelected={handlePageSelected}
      >
        {categories.map((cat) => {
          const all = ingredientsByCategory.get(cat.id) ?? [];
          const filtered =
            trimmedSearch === ""
              ? all
              : all.filter((i) =>
                  i.name.toLowerCase().includes(trimmedSearch),
                );
          return (
            <View key={cat.id} style={{ flex: 1 }}>
              <ScrollView
                contentContainerStyle={[
                  styles.gridContent,
                  {
                    paddingBottom: Math.max(insets.bottom, Spacing.xl),
                  },
                ]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {filtered.length > 0 ? (
                  <View style={styles.itemsGrid}>
                    {filtered.map((ing) => (
                      <Pressable
                        key={ing.id}
                        onPress={() => onPickIngredient(ing)}
                        style={({ pressed }) => [
                          styles.itemCell,
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <IngredientIcon ingredientId={ing.id} size={56} />
                        <Text style={styles.itemName} numberOfLines={1}>
                          {ing.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <View style={styles.emptyGrid}>
                    <Text style={styles.emptyGridText}>
                      검색 결과가 없어요
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>
          );
        })}
      </PagerView>
    </View>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function PickerRow({
  id,
  name,
  isSelected,
  onPress,
}: {
  id: number;
  name: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.categoryItem,
        isSelected && styles.categoryItemSelected,
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={styles.rowLeft}>
        <IngredientIcon ingredientId={id} size={32} />
        <Text
          style={[
            styles.categoryText,
            isSelected && styles.categoryTextSelected,
          ]}
        >
          {name}
        </Text>
      </View>
      {isSelected && (
        <Ionicons
          name="checkmark-circle"
          size={22}
          color={Colors.primary}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
  },
  backButton: {
    padding: Spacing.xs,
    justifyContent: "center",
    alignItems: "center",
    width: 48,
    height: 48,
  },
  headerTitle: {
    fontSize: FontSize.titleLg,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
    letterSpacing: LetterSpacing.tight,
  },
  headerRight: {
    width: 48,
  },
  searchContainer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
    padding: 0,
    margin: 0,
  },
  listContainer: {
    flex: 1,
    backgroundColor: Colors.surfaceContainerLowest,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
  },

  // ── Split layout (default state, search empty) ──
  // Hairline divider on the left pane's right edge separates the two
  // columns — clearer at a glance than the tonal-only contrast we had.
  splitContainer: {
    flex: 1,
    flexDirection: "row",
  },
  leftPane: {
    width: 100,
    paddingTop: Spacing.md,
    paddingHorizontal: 10,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.outlineVariant,
  },
  rightPane: {
    flex: 1,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  paneScroll: {
    flex: 1,
  },
  paneLabel: {
    fontSize: 11,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
    letterSpacing: 0.5,
    marginBottom: 10,
    paddingHorizontal: Spacing.xs,
  },
  // Vertical stack: circular icon on top, name below. Centered so the
  // column reads as a tidy thumbnail list rather than a row-cramped sidebar.
  recentRow: {
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.md,
  },
  recentName: {
    fontSize: 11,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
    textAlign: "center",
  },
  recentEmpty: {
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.xs,
  },
  recentEmptyText: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
    textAlign: "center",
    lineHeight: 18,
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  categoryCell: {
    // ~half the right-pane content width minus the gap. 48% keeps two
    // cells per row across phone widths without overflowing.
    width: "48%",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    // Tighter vertical padding so all 10 categories fit in the visible
    // pane on common phone sizes — no scroll needed.
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceContainerLow,
  },
  categoryCellName: {
    fontSize: 12,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
    textAlign: "center",
  },

  // ── Category grid modal ──────────────────────────────────────────────
  categoryModal: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  categoryOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.surface,
    zIndex: 1,
  },
  // The modal's title sits flat (no LetterSpacing.tight) and uses regular
  // body weight — the spec calls for a quieter header than the picker's own.
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
  },

  // Horizontal tab bar — text-only tabs with a 2pt underline on the active
  // one. A hairline along the bottom separates the bar from the grid.
  tabBarContainer: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outlineVariant,
  },
  tabBarContent: {
    paddingHorizontal: Spacing.base,
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: Spacing.base,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  tabText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.regular,
    color: Colors.onSurfaceVariant,
  },
  tabTextActive: {
    color: Colors.onSurface,
    fontWeight: FontWeight.medium,
  },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: Spacing.base,
    right: Spacing.base,
    height: 2,
    borderRadius: 1,
    backgroundColor: Colors.primary,
  },

  // Per-page 3-column grid
  gridContent: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
  },
  itemsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 12,
    columnGap: 8,
  },
  itemCell: {
    // 31% × 3 columns + 2 × 8pt columnGap ≈ 100% of page content width
    // across phone widths — keeps three cells per row without overflow.
    width: "31%",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
  },
  itemName: {
    fontSize: 12,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
    textAlign: "center",
  },
  emptyGrid: {
    width: "100%",
    alignItems: "center",
    paddingTop: Spacing.xxl,
  },
  emptyGridText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
  },
  sectionLabel: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.bold,
    color: Colors.onSurfaceVariant,
    textTransform: "uppercase",
    letterSpacing: LetterSpacing.wide,
    marginBottom: Spacing.sm,
  },
  categoryItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.base,
    borderRadius: Radius.lg,
    minHeight: 56,
    marginBottom: Spacing.xs,
  },
  rowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  categoryItemSelected: {
    backgroundColor: "rgba(0, 109, 55, 0.07)",
  },
  categoryText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
  },
  categoryTextSelected: {
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  placeholderBlock: {
    alignItems: "center",
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.sm,
  },
  placeholderText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.semiBold,
    color: Colors.onSurfaceVariant,
    textAlign: "center",
  },
  placeholderHint: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
    textAlign: "center",
  },
  placeholderRequest: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  customAddButton: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  customAddText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.bold,
    color: Colors.onPrimary,
  },
});
