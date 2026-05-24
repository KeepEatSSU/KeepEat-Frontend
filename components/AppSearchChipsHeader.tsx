/**
 * KeepEat — shared search bar + horizontal chip row + dockable below-slot.
 *
 * Replaces the previously duplicated search/chips block in the fridge and
 * recipe tabs. The two tabs had drifted apart in subtle ways — the fridge
 * tab pinned `searchBar.minHeight: 44` while the recipe tab let the bar
 * size to TextInput intrinsics, and `chipsScroll.marginBottom` was a single
 * value regardless of whether anything docked below the chips — so chip
 * positions diverged by a handful of pixels between tabs and the gap above
 * the expanded-categories area felt over-wide.
 *
 * Layout stability rules baked in here
 *   1. Every chip is exactly `height: 36`. Selected vs. unselected differs
 *      only in `backgroundColor` (and text color) — no padding/border swap,
 *      so flipping selection cannot reflow the row.
 *   2. The chip ScrollView has no fixed `height`; it adopts the chip's 36px
 *      intrinsic height. Removing the cross-axis container height eliminates
 *      any centering ambiguity that could shift chips between states.
 *   3. `chipsScroll.marginBottom` is `Spacing.xs` when something docks under
 *      the chips and `Spacing.lg` when nothing does — so the gap reads as
 *      "tight sub-area" vs. "separator to the next section" appropriately.
 *
 * Optional search props (searchInputRef / onSearchFocus / onSearchBlur /
 * searchEditable) are pass-throughs the fridge tab needs to drive its
 * focus-aware right slot and select-mode editable lock. The recipe tab
 * passes none of them.
 */

import { Colors, FontSize, FontWeight, Radius, Spacing } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import type { ReactNode, Ref } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  LinearTransition,
  SlideInRight,
  SlideOutRight,
} from "react-native-reanimated";

export interface ChipConfig {
  key: string;
  label: string;
  isSelected: boolean;
  onPress: () => void;
  /**
   * Optional count rendered as a small badge next to the label.
   *   > 0  → badge with the number, normal label color.
   *   = 0  → no badge, label color softened (still tappable).
   *   undefined → no badge, normal label color (e.g. "전체" / "all" chips).
   */
  count?: number;
  /**
   * `trigger` is currently visually identical to `default` — the prop
   * exists so callers can mark trigger-style chips for future styling
   * differentiation without re-wiring the API.
   * `destructive` renders with a primary-color outline (idle) and primary
   * fill when selected — used by the fridge tab's "삭제" select-mode trigger
   * that needs to stand out from filter chips.
   */
  variant?: "default" | "trigger" | "destructive";
  /**
   * Rendered to the right of the label. The chip's `gap` handles spacing
   * automatically; the caller supplies a pre-styled node (color, size).
   */
  trailingIcon?: ReactNode;
}

interface Props {
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (text: string) => void;
  chips: ChipConfig[];
  /** Optional slot to the right of the search bar (e.g. a "선택" pill). */
  searchRightSlot?: ReactNode;
  /** Optional slot directly under the chip row (e.g. expanded categories
   *  or a recommend button). Presence tightens the chip-row's marginBottom. */
  belowChipsSlot?: ReactNode;
  /**
   * Chip layout strategy.
   *   `"scroll"` (default): single-row horizontal ScrollView.
   *   `"grid"`: flex-wrap multi-row grid that shows all chips at once.
   *   `"fitted"`: single row, no scroll, each chip `flex: 1` with tight
   *     padding so a fixed small chip count (e.g. 6) fits the screen width
   *     even on the narrowest phones. Tradeoff: chips share equal width
   *     regardless of label length — best when labels are short (2–3 chars).
   */
  chipsLayout?: "scroll" | "grid" | "fitted";
  /**
   * Whether to render the built-in search row. Defaults to `true`. Set to
   * `false` when the surrounding screen hoists the search bar somewhere else
   * (e.g. the recipe tab merges it into the top header for compactness) —
   * `searchPlaceholder` / `searchValue` / `onSearchChange` are then ignored.
   */
  showSearch?: boolean;
  // ── Optional TextInput pass-throughs (see header comment) ──
  searchInputRef?: Ref<TextInput>;
  onSearchFocus?: () => void;
  onSearchBlur?: () => void;
  searchEditable?: boolean;
}

export function AppSearchChipsHeader({
  searchPlaceholder,
  searchValue,
  onSearchChange,
  chips,
  searchRightSlot,
  belowChipsSlot,
  chipsLayout = "scroll",
  showSearch = true,
  searchInputRef,
  onSearchFocus,
  onSearchBlur,
  searchEditable,
}: Props) {
  // 칩 줄과 다음 콘텐츠(그리드 등) 사이는 좁게 유지 — 이전 Spacing.lg(20)는
  // 시각적으로 떠 보였다. belowChipsSlot이 있건 없건 동일하게 xs로 통일.
  const chipsMarginBottom = Spacing.xs;

  const renderChip = (chip: ChipConfig) => {
    const showBadge = chip.count !== undefined && chip.count > 0;
    const isFaint = chip.count === 0 && !chip.isSelected;
    const isDestructive = chip.variant === "destructive";
    return (
      <Pressable
        key={chip.key}
        onPress={chip.onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: chip.isSelected }}
        style={[
          styles.chip,
          chipsLayout === "fitted" && styles.chipFitted,
          isDestructive && styles.chipDestructive,
          chip.isSelected &&
            (isDestructive ? styles.chipDestructiveSelected : styles.chipSelected),
        ]}
      >
        <Text
          style={[
            styles.chipText,
            isDestructive && styles.chipTextDestructive,
            isFaint && styles.chipTextFaint,
            chip.isSelected &&
              (isDestructive
                ? styles.chipTextDestructiveSelected
                : styles.chipTextSelected),
          ]}
          numberOfLines={1}
        >
          {chip.label}
        </Text>
        {showBadge && (
          <View
            style={[
              styles.countBadge,
              chip.isSelected && styles.countBadgeSelected,
            ]}
          >
            <Text
              style={[
                styles.countBadgeText,
                chip.isSelected && styles.countBadgeTextSelected,
              ]}
            >
              {chip.count}
            </Text>
          </View>
        )}
        {chip.trailingIcon}
      </Pressable>
    );
  };

  return (
    <>
      {/* ── Search row ──
          헤더 우측 검색 아이콘에서 풀려나오는 시각을 살리기 위해 우측
          off-screen → 제자리로 슬라이드 인/아웃. 칩 row는 자기 Y 위치 변경을
          LinearTransition으로 보간 → 두 축이 충돌 없이 동시에 부드럽게.
          (width 0→full 직접 애니메이션은 텍스트 reflow 위험이 있어 transform
          기반의 슬라이드로 회피.) */}
      {showSearch && (
        <Animated.View
          entering={SlideInRight.duration(250)}
          exiting={SlideOutRight.duration(180)}
          style={styles.searchRow}
        >
          <View style={styles.searchBar}>
            <Ionicons
              name="search"
              size={18}
              color={Colors.onSurfaceVariant}
              style={styles.searchIcon}
            />
            <TextInput
              ref={searchInputRef}
              value={searchValue}
              onChangeText={onSearchChange}
              onFocus={onSearchFocus}
              onBlur={onSearchBlur}
              editable={searchEditable}
              placeholder={searchPlaceholder}
              placeholderTextColor={Colors.outline}
              style={styles.searchInput}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searchValue.length > 0 && (
              <Pressable
                onPress={() => onSearchChange("")}
                accessibilityLabel="검색어 지우기"
                hitSlop={8}
              >
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={Colors.onSurfaceVariant}
                />
              </Pressable>
            )}
          </View>
          {searchRightSlot}
        </Animated.View>
      )}

      {/* ── Chip row ── */}
      <Animated.View layout={LinearTransition.duration(250)}>
        {chipsLayout === "grid" ? (
          <View
            style={[styles.chipsGrid, { marginBottom: chipsMarginBottom }]}
          >
            {chips.map(renderChip)}
          </View>
        ) : chipsLayout === "fitted" ? (
          <View
            style={[styles.chipsFitted, { marginBottom: chipsMarginBottom }]}
          >
            {chips.map(renderChip)}
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsContent}
            style={[styles.chipsScroll, { marginBottom: chipsMarginBottom }]}
          >
            {chips.map(renderChip)}
          </ScrollView>
        )}
      </Animated.View>

      {belowChipsSlot}
    </>
  );
}

const styles = StyleSheet.create({
  // ── Search row ──
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    minHeight: 44, // unified touch target across both tabs
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
    padding: 0,
    margin: 0,
  },

  // ── Chips ──
  // No `height` here on purpose — the chip's `height: 36` is the source of
  // truth; an outer wrapper height would only re-introduce the cross-axis
  // centering ambiguity we're trying to remove.
  chipsScroll: {
    flexGrow: 0,
  },
  chipsContent: {
    paddingHorizontal: Spacing.xl,
    // 4px breathing room so the chip's borderRadius AA isn't clipped by the
    // ScrollView's vertical bounds — selected chips with dark backgrounds
    // were rendering with squared-off corners without this.
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    alignItems: "center",
  },
  chip: {
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.base,
    gap: Spacing.xs,
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.md,
  },
  // Fitted mode override — chips share a fixed gap and split the leftover
  // width equally via `flexGrow: 1`. Each chip's natural content size is its
  // baseline (so trailing-icon chips stay a touch wider than 2-char ones) and
  // the extra room is added on top, evenly, for consistent breathing across
  // screen widths.
  chipFitted: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xs,
    gap: 2,
  },
  chipSelected: {
    backgroundColor: Colors.primary,
  },
  chipText: {
    fontSize: FontSize.bodySm,
    lineHeight: 20,
    fontWeight: FontWeight.semiBold,
    color: Colors.onSurfaceVariant,
  },
  chipTextSelected: {
    color: Colors.onPrimary,
  },
  // Empty-category cue — same chip background, just a softer label tone so
  // categories with zero recipes recede without becoming undiscoverable.
  chipTextFaint: {
    color: Colors.outline,
  },
  // Destructive variant — primary outline on white (idle) and primary fill
  // when selected, so it stands apart from neutral filter chips.
  chipDestructive: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  chipDestructiveSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipTextDestructive: {
    color: Colors.primary,
  },
  chipTextDestructiveSelected: {
    color: Colors.onPrimary,
  },

  // Count badge — same idiom as the fridge tab's expanded-category counts:
  // pill on `secondaryContainer`, translucent white when the parent chip is
  // selected so contrast stays on the chip's primary color.
  countBadge: {
    backgroundColor: Colors.secondaryContainer,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: Radius.full,
    minWidth: 18,
    alignItems: "center",
  },
  countBadgeSelected: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
  },
  countBadgeText: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.bold,
    color: Colors.onSecondaryContainer,
  },
  countBadgeTextSelected: {
    color: Colors.onPrimary,
  },

  // Grid layout — flex-wrap so every chip is visible at once. Matches the
  // ScrollView's vertical breathing room so swapping layouts doesn't shift
  // surrounding sections.
  chipsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  // Fitted single-row container — fixed `gap` between chips so spacing reads
  // consistently across phones; chips themselves carry `flexGrow: 1` to split
  // the leftover width.
  chipsFitted: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
});
