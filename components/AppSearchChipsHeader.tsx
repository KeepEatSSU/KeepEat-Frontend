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
   */
  variant?: "default" | "trigger";
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
   *   `"scroll"` (default): single-row horizontal ScrollView. Currently used
   *     by both tabs — the fridge tab pairs it with an expand-to-grid
   *     trigger, the recipe tab leans on horizontal paging since users
   *     typically have small (<50) saved-recipe libraries where the category
   *     filter is a secondary tool.
   *   `"grid"`: flex-wrap multi-row grid that shows all chips at once.
   *     No current callers — kept for the case where a screen has a fixed,
   *     fully-visible category set worth surfacing without scrolling.
   */
  chipsLayout?: "scroll" | "grid";
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
  const chipsMarginBottom = belowChipsSlot ? Spacing.xs : Spacing.lg;

  const renderChip = (chip: ChipConfig) => {
    const showBadge = chip.count !== undefined && chip.count > 0;
    const isFaint = chip.count === 0 && !chip.isSelected;
    return (
      <Pressable
        key={chip.key}
        onPress={chip.onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: chip.isSelected }}
        style={[styles.chip, chip.isSelected && styles.chipSelected]}
      >
        <Text
          style={[
            styles.chipText,
            isFaint && styles.chipTextFaint,
            chip.isSelected && styles.chipTextSelected,
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
      {/* ── Search row ── */}
      {showSearch && (
        <View style={styles.searchRow}>
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
        </View>
      )}

      {/* ── Chip row ── */}
      {chipsLayout === "grid" ? (
        <View
          style={[styles.chipsGrid, { marginBottom: chipsMarginBottom }]}
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
});
