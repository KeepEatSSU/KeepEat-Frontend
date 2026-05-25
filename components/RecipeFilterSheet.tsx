/**
 * 레시피 필터 바텀시트.
 *
 * 4개 섹션 — 조리법(다중), 난이도(단일), 내 반응(단일), 칼로리(슬라이더).
 * 시트 내부에서 임시 상태를 유지하다 "적용하기" 누르면 onApply로 부모에
 * 전달. "초기화"는 모두 기본값으로 되돌림. 시트 외부의 부모는 적용된
 * 시점의 값만 반영하므로, 시트 열고 닫으면 미적용 변경은 폐기됨 (시트가
 * 열릴 때마다 부모 value로 다시 동기화).
 *
 * 애니메이션·제스처 레이어는 useSheetGesture(reanimated + gesture-handler)
 * 로 통일 — useNativeDriver 한계로 핸들바 드래그가 안 되던 문제 해결.
 * RN Modal은 별도 native window라 Modal 내부를 다시 GestureHandlerRootView로
 * wrap해야 제스처가 작동.
 */

import type { ReactionType } from "@/constants/domain";
import {
  Colors,
  FontSize,
  FontWeight,
  LetterSpacing,
  Radius,
  Shadows,
  Spacing,
} from "@/constants/theme";
import { useSheetGesture } from "@/hooks/useSheetGesture";
import Slider from "@react-native-community/slider";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type DifficultyKey = "상" | "중" | "하";

export interface RecipeFilters {
  /** 빈 배열 = 전체. */
  cookingMethods: string[];
  /** null = 전체. */
  difficulty: DifficultyKey | null;
  /** null = 전체. */
  myReaction: ReactionType | null;
  /** 1500(=CAL_MAX)이 sentinel for "제한 없음". */
  maxCalories: number;
}

const CAL_MIN = 0;
const CAL_MAX = 1500;
const CAL_STEP = 50;

export const EMPTY_FILTERS: RecipeFilters = {
  cookingMethods: [],
  difficulty: null,
  myReaction: null,
  maxCalories: CAL_MAX,
};

/** 기본값에서 벗어난 필터 개수. 부모의 활성 표시 뱃지에 사용. */
export function countActiveFilters(f: RecipeFilters): number {
  let n = 0;
  if (f.cookingMethods.length > 0) n += 1;
  if (f.difficulty !== null) n += 1;
  if (f.myReaction !== null) n += 1;
  if (f.maxCalories < CAL_MAX) n += 1;
  return n;
}

const COOKING_METHODS = [
  "볶음",
  "국/찌개/탕",
  "찜/조림",
  "구이/전",
  "무침/샐러드",
  "면/만두",
  "오븐/베이킹",
  "기타",
];

const DIFFICULTY_OPTIONS: { key: DifficultyKey; label: string }[] = [
  { key: "하", label: "쉬움" },
  { key: "중", label: "중간" },
  { key: "상", label: "어려움" },
];

const REACTION_OPTIONS: { key: ReactionType; label: string }[] = [
  { key: "LIKE", label: "좋아요" },
  { key: "DISLIKE", label: "싫어요" },
];

/** 결과 카운트 계산에 필요한 최소 필드. `RecipeListItem` /
 *  `MyRecipeListEntryDto` 양쪽에 그대로 호환. */
export interface FilterableRecipeItem {
  cookingMethod?: string;
  difficulty?: string;
  myReaction?: ReactionType | null;
  calories?: number;
}

interface Props {
  visible: boolean;
  value: RecipeFilters;
  onApply: (filters: RecipeFilters) => void;
  onClose: () => void;
  /**
   * 전체 데이터셋. 넘기면 시트 안에서 draft 필터가 변할 때마다 매칭 개수를
   * 실시간 계산해 "적용하기" 라벨에 노출. 페이징(explore) 등 전체 데이터가
   * 메모리에 없는 화면은 안 넘기면 됨 — 기존 라벨 그대로 표시.
   */
  items?: FilterableRecipeItem[];
}

export function RecipeFilterSheet({
  visible,
  value,
  onApply,
  onClose,
  items,
}: Props) {
  const insets = useSafeAreaInsets();
  // Local draft state — only commits to parent on "적용하기".
  const [draft, setDraft] = useState<RecipeFilters>(value);
  const { pan, sheetStyle, backdropStyle, close } = useSheetGesture(
    visible,
    onClose,
  );

  // Re-seed the draft every time the sheet opens so reopens after a cancel
  // start from the currently-applied filter set rather than stale local edits.
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  const toggleMethod = (m: string) => {
    setDraft((prev) => {
      const has = prev.cookingMethods.includes(m);
      return {
        ...prev,
        cookingMethods: has
          ? prev.cookingMethods.filter((x) => x !== m)
          : [...prev.cookingMethods, m],
      };
    });
  };

  const setDifficulty = (d: DifficultyKey | null) =>
    setDraft((prev) => ({ ...prev, difficulty: d }));

  const setMyReaction = (r: ReactionType | null) =>
    setDraft((prev) => ({ ...prev, myReaction: r }));

  // Slider stores the raw number; CAL_MAX itself is the "no limit" sentinel.
  // The filter pipeline interprets `maxCalories >= CAL_MAX` as inactive.
  const setMaxCalories = (v: number) =>
    setDraft((prev) => ({ ...prev, maxCalories: v }));

  const reset = () => setDraft(EMPTY_FILTERS);
  const apply = () => {
    onApply(draft);
    close();
  };

  const caloriesLabel =
    draft.maxCalories >= CAL_MAX
      ? "제한 없음"
      : `최대 ${draft.maxCalories}kcal 이하`;

  // Live preview: count how many items would survive the draft filters.
  // Same filter logic as the consumers' useMemo pipelines — kept in sync by
  // re-deriving from the same `RecipeFilters` shape. Returns null when the
  // caller didn't pass `items` (e.g. explore tab — paginated, can't preview).
  const matchCount = useMemo<number | null>(() => {
    if (!items) return null;
    const methodSet =
      draft.cookingMethods.length > 0
        ? new Set(draft.cookingMethods)
        : null;
    return items.reduce((n, r) => {
      if (methodSet && !methodSet.has(r.cookingMethod ?? "")) return n;
      if (draft.difficulty && r.difficulty !== draft.difficulty) return n;
      if (draft.myReaction && r.myReaction !== draft.myReaction) return n;
      if (
        draft.maxCalories < CAL_MAX &&
        (r.calories ?? 0) > draft.maxCalories
      )
        return n;
      return n + 1;
    }, 0);
  }, [items, draft]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={close}
    >
      {/* Modal 내부 제스처용 root — Modal이 별도 native window라 앱 루트의
          GestureHandlerRootView가 닿지 않음. */}
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.container}>
          <Animated.View
            style={[styles.backdrop, backdropStyle]}
            pointerEvents={visible ? "auto" : "none"}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          </Animated.View>
          <Animated.View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 16) },
              sheetStyle,
            ]}
          >
            <GestureDetector gesture={pan}>
              <View style={styles.handleZone}>
                <View style={styles.handleBar} />
              </View>
            </GestureDetector>

            <View style={styles.titleRow}>
              <Text style={styles.title}>필터</Text>
              <Pressable
                onPress={reset}
                hitSlop={8}
                style={({ pressed }) => pressed && { opacity: 0.6 }}
              >
                <Text style={styles.resetText}>초기화</Text>
              </Pressable>
            </View>

            <ScrollView
              style={styles.body}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: Spacing.xl }}
            >
              {/* ── 조리법 (다중) ── */}
              <Text style={styles.sectionLabel}>조리법</Text>
              <View style={styles.chipsWrap}>
                <Chip
                  label="전체"
                  active={draft.cookingMethods.length === 0}
                  onPress={() =>
                    setDraft((prev) => ({ ...prev, cookingMethods: [] }))
                  }
                />
                {COOKING_METHODS.map((m) => (
                  <Chip
                    key={m}
                    label={m}
                    active={draft.cookingMethods.includes(m)}
                    onPress={() => toggleMethod(m)}
                  />
                ))}
              </View>

              {/* ── 난이도 (단일) ── */}
              <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
                난이도
              </Text>
              <View style={styles.chipsWrap}>
                <Chip
                  label="전체"
                  active={draft.difficulty === null}
                  onPress={() => setDifficulty(null)}
                />
                {DIFFICULTY_OPTIONS.map((d) => (
                  <Chip
                    key={d.key}
                    label={d.label}
                    active={draft.difficulty === d.key}
                    onPress={() => setDifficulty(d.key)}
                  />
                ))}
              </View>

              {/* ── 내 반응 (단일) ── */}
              <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
                내 반응
              </Text>
              <View style={styles.chipsWrap}>
                <Chip
                  label="전체"
                  active={draft.myReaction === null}
                  onPress={() => setMyReaction(null)}
                />
                {REACTION_OPTIONS.map((r) => (
                  <Chip
                    key={r.key}
                    label={r.label}
                    active={draft.myReaction === r.key}
                    onPress={() => setMyReaction(r.key)}
                  />
                ))}
              </View>

              {/* ── 칼로리 (슬라이더) ── */}
              <View style={styles.caloriesHeader}>
                <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
                  칼로리
                </Text>
                <Text style={styles.caloriesValue}>{caloriesLabel}</Text>
              </View>
              <Slider
                minimumValue={CAL_MIN}
                maximumValue={CAL_MAX}
                step={CAL_STEP}
                value={draft.maxCalories}
                minimumTrackTintColor={Colors.primary}
                maximumTrackTintColor={Colors.surfaceContainerHigh}
                thumbTintColor={Colors.primary}
                onValueChange={setMaxCalories}
              />
            </ScrollView>

            {/* ── Apply row ── */}
            <View style={styles.applyRow}>
              <Pressable
                onPress={close}
                style={({ pressed }) => [
                  styles.cancelBtn,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.cancelText}>취소</Text>
              </Pressable>
              <Pressable
                onPress={apply}
                style={({ pressed }) => [
                  styles.applyBtn,
                  pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                ]}
              >
                <Text style={styles.applyText}>
                  {matchCount !== null
                    ? `적용하기 (${matchCount})`
                    : "적용하기"}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(25, 28, 29, 0.45)",
  },
  sheet: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingTop: Spacing.md,
    maxHeight: "85%",
    ...Shadows.ambient,
  },
  // 드래그 hit zone — 작은 4px 바만으론 잡기 어려우니 시트 최상단 전체
  // 폭에 두툼한 padding으로 영역을 키운다. 시각은 동일(센터의 작은 바만 보임).
  handleZone: {
    alignItems: "center",
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.base,
    paddingHorizontal: Spacing.xl,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceContainerHighest,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.base,
  },
  title: {
    fontSize: FontSize.titleLg,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
  },
  resetText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
  },
  body: {
    paddingHorizontal: Spacing.xl,
  },
  sectionLabel: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    textTransform: "uppercase",
    letterSpacing: LetterSpacing.wide,
    marginBottom: Spacing.md,
  },
  sectionLabelSpaced: {
    marginTop: Spacing.lg,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceContainerLow,
  },
  chipActive: {
    backgroundColor: Colors.primary,
  },
  chipText: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
  },
  chipTextActive: {
    color: Colors.onPrimary,
    fontWeight: FontWeight.bold,
  },
  caloriesHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.sm,
  },
  caloriesValue: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.semiBold,
    color: Colors.onSurface,
    marginTop: Spacing.lg,
  },
  applyRow: {
    flexDirection: "row",
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.base,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: Spacing.base,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onSurfaceVariant,
  },
  applyBtn: {
    flex: 2,
    paddingVertical: Spacing.base,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...Shadows.fab,
  },
  applyText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onPrimary,
  },
});
