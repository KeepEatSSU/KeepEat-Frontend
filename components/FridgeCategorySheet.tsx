/**
 * 냉장고 — 카테고리 단일 선택 바텀시트.
 *
 * 칩 줄의 "필터" 칩이 트리거. 시트 내부에서 임시 상태(draft)를 유지하다
 * "적용하기" 누르면 onApply로 부모에 전달 — 미적용 변경은 취소/백드롭/뒤로
 * 어느 경로로 닫혀도 폐기 (시트가 열릴 때마다 value로 다시 동기화).
 *
 * 단일 선택만 다루므로 RecipeFilterSheet보다 단순하지만, Modal +
 * Animated backdrop/transform + 초기화/취소/적용하기 3-buttons 패턴은
 * 동일하게 가져가 두 시트가 같은 idiom으로 보이게 한다.
 */

import { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Animated,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CATEGORIES } from "@/constants/ingredients-master";
import {
  Colors,
  FontSize,
  FontWeight,
  LetterSpacing,
  Radius,
  Shadows,
  Spacing,
} from "@/constants/theme";

interface Props {
  visible: boolean;
  /** 현재 적용된 카테고리 라벨들. 빈 배열 = 카테고리 필터 미적용(전체). */
  value: string[];
  /** 카테고리 라벨 → 식재료 수. 0건이면 disabled로 렌더. */
  counts: Record<string, number>;
  /** 빈 배열이면 카테고리 필터 해제. 다중 선택은 OR로 매칭됨. */
  onApply: (categories: string[]) => void;
  onClose: () => void;
}

const SLIDE_DISTANCE = Dimensions.get("window").height;

export function FridgeCategorySheet({
  visible,
  value,
  counts,
  onApply,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<string[]>(value);

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(SLIDE_DISTANCE)).current;

  // 시트가 열릴 때마다 부모의 적용된 값으로 draft를 재시드 — 취소 후 재오픈
  // 시 stale local 편집이 남지 않도록.
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  useEffect(() => {
    if (visible) {
      backdropOpacity.setValue(0);
      sheetTranslateY.setValue(SLIDE_DISTANCE);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(sheetTranslateY, {
          toValue: 0,
          damping: 22,
          stiffness: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, backdropOpacity, sheetTranslateY]);

  // 모든 닫기 경로(취소/적용/백드롭/안드 뒤로)가 이 함수를 거치게 해서
  // 백드롭이 시트보다 먼저 사라지는 시각적 글리치를 막는다.
  const handleClose = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: SLIDE_DISTANCE,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  };

  const reset = () => setDraft([]);

  const apply = () => {
    onApply(draft);
    handleClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
          pointerEvents={visible ? "auto" : "none"}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={handleClose}
          />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 16) },
            { transform: [{ translateY: sheetTranslateY }] },
          ]}
        >
          <View style={styles.handleBar} />

          <View style={styles.titleRow}>
            <Text style={styles.title}>카테고리 필터</Text>
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
            <Text style={styles.sectionLabel}>카테고리</Text>
            <View style={styles.chipsWrap}>
              <Chip
                label="전체"
                active={draft.length === 0}
                onPress={() => setDraft([])}
              />
              {CATEGORIES.map((c) => {
                const count = counts[c.name] ?? 0;
                const isActive = draft.includes(c.name);
                return (
                  <Chip
                    key={c.id}
                    label={c.name}
                    count={count}
                    active={isActive}
                    disabled={count === 0}
                    onPress={() =>
                      setDraft((prev) =>
                        prev.includes(c.name)
                          ? prev.filter((x) => x !== c.name)
                          : [...prev, c.name],
                      )
                    }
                  />
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.applyRow}>
            <Pressable
              onPress={handleClose}
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
              <Text style={styles.applyText}>적용하기</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function Chip({
  label,
  count,
  active,
  disabled,
  onPress,
}: {
  label: string;
  count?: number;
  active: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityState={{ selected: active, disabled }}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        disabled && styles.chipDisabled,
        pressed && !disabled && { opacity: 0.7 },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          active && styles.chipTextActive,
          disabled && styles.chipTextDisabled,
        ]}
      >
        {label}
      </Text>
      {count !== undefined && (
        <Text
          style={[
            styles.chipCount,
            active && styles.chipCountActive,
            disabled && styles.chipCountDisabled,
          ]}
        >
          {count}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  handleBar: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceContainerHighest,
    marginBottom: Spacing.base,
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
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceContainerLow,
  },
  chipActive: {
    backgroundColor: Colors.primary,
  },
  // 0건 카테고리 — 시각적으로 분명히 죽이되 라벨/카운트는 보이게 (왜 못
  // 누르는지 사용자가 즉시 이해 가능).
  chipDisabled: {
    backgroundColor: Colors.surfaceContainerLowest,
    opacity: 0.5,
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
  chipTextDisabled: {
    color: Colors.outline,
  },
  chipCount: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.bold,
    color: Colors.onSurfaceVariant,
  },
  chipCountActive: {
    color: "rgba(255, 255, 255, 0.85)",
  },
  chipCountDisabled: {
    color: Colors.outline,
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
