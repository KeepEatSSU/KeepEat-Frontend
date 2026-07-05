// CapacityInput
// Unified input-field language for Capacity — single rounded-square (radius 16)
// container with [- stepNum] [value unit ▾] [stepNum +]. Tap-only (no long-press
// acceleration); step size is driven by unit via CAPACITY_STEP.

import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import {
  Colors,
  FontSize,
  FontWeight,
  LetterSpacing,
  Radius,
  Spacing,
} from "@/constants/theme";
import { CAPACITY_STEP, type Unit } from "@/constants/domain";

interface CapacityInputProps {
  value: number | null;
  unit: Unit;
  onValueChange: (v: number) => void;
  onUnitPress?: () => void;
  min?: number;
  hasError?: boolean;
  /** Optional label rendered above the field (matches ExpandableDatePicker label style). */
  label?: string;
}

const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

export function CapacityInput({
  value,
  unit,
  onValueChange,
  onUnitPress,
  min = 0,
  hasError = false,
  label,
}: CapacityInputProps) {
  const step = CAPACITY_STEP[unit];

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value != null ? String(value) : "");

  useEffect(() => {
    if (!editing) setDraft(value != null ? String(value) : "");
  }, [value, editing]);

  const commitDraft = () => {
    setEditing(false);
    const parsed = parseInt(draft, 10);
    if (!isNaN(parsed) && parsed >= min) {
      onValueChange(parsed);
    } else {
      setDraft(value != null ? String(value) : "");
    }
  };

  const tapAdjust = (direction: 1 | -1) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const next = Math.max(min, (value ?? 0) + direction * step);
    onValueChange(next);
  };

  const isMin = (value ?? 0) <= min;

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.field, hasError && styles.fieldError]}>
        <Pressable
          onPress={() => !isMin && tapAdjust(-1)}
          hitSlop={HIT_SLOP}
          disabled={isMin}
          accessibilityRole="button"
          accessibilityLabel={`${step}${unit} 줄이기`}
          accessibilityState={{ disabled: isMin }}
          style={({ pressed }) => [
            styles.sideBtn,
            isMin && styles.sideBtnDisabled,
            pressed && !isMin && styles.sideBtnPressed,
          ]}
        >
          <Ionicons
            name="remove"
            size={22}
            color={hasError ? Colors.error : Colors.onSurface}
          />
          <Text
            style={[
              styles.stepText,
              hasError && { color: Colors.error },
            ]}
          >
            {step}
          </Text>
        </Pressable>

        <View style={styles.center}>
          <TextInput
            value={editing ? draft : value != null ? String(value) : ""}
            placeholder="입력"
            placeholderTextColor={hasError ? Colors.error : Colors.outline}
            onFocus={() => {
              setEditing(true);
              setDraft(value != null ? String(value) : "");
            }}
            onBlur={commitDraft}
            onChangeText={setDraft}
            onSubmitEditing={commitDraft}
            keyboardType="numeric"
            returnKeyType="done"
            selectTextOnFocus
            accessibilityLabel={
              value == null
                ? `현재 수량 미입력, 단위 ${unit}`
                : `현재 수량 ${value} ${unit}`
            }
            style={[
              styles.valueText,
              value == null && styles.valuePlaceholder,
              hasError && { color: Colors.error },
            ]}
          />
          <Pressable
            onPress={onUnitPress}
            disabled={!onUnitPress}
            accessibilityRole="button"
            accessibilityLabel={`단위 ${unit}, 탭하여 변경`}
            style={({ pressed }) => [
              styles.unitChip,
              pressed && onUnitPress && { opacity: 0.6 },
            ]}
          >
            <Text
              style={[
                styles.unitText,
                hasError && { color: Colors.error },
              ]}
            >
              {unit}
            </Text>
            {onUnitPress && (
              <Ionicons
                name="chevron-down"
                size={14}
                color={hasError ? Colors.error : Colors.primary}
                style={{ marginLeft: 2 }}
              />
            )}
          </Pressable>
        </View>

        <Pressable
          onPress={() => tapAdjust(1)}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={`${step}${unit} 늘리기`}
          style={({ pressed }) => [
            styles.sideBtn,
            pressed && styles.sideBtnPressed,
          ]}
        >
          <Text
            style={[
              styles.stepText,
              hasError && { color: Colors.error },
            ]}
          >
            {step}
          </Text>
          <Ionicons
            name="add"
            size={22}
            color={hasError ? Colors.error : Colors.onSurface}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  label: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    letterSpacing: LetterSpacing.wide,
    marginBottom: Spacing.xs,
  },
  // single rounded-square container, radius 16, no border/shadow
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.fieldBackground,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.sm,
  },
  fieldError: {
    backgroundColor: "rgba(255, 218, 214, 0.30)",
  },
  // Side button: icon + step number, ≥44×44 tap area
  sideBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: Spacing.xs,
    borderRadius: Radius.lg,
  },
  sideBtnPressed: {
    opacity: 0.6,
    transform: [{ scale: 0.94 }],
  },
  sideBtnDisabled: {
    opacity: 0.4,
  },
  // Icon is primary; step number is secondary (smaller, muted)
  stepText: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
    marginHorizontal: Spacing.xs,
  },
  center: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  valueText: {
    fontSize: FontSize.headlineSm,
    fontWeight: FontWeight.bold,
    // Value is information, not an interaction target — use neutral dark text
    // (matches 구매일자/소비기한 value color). Primary green stays on label + unit chip.
    color: Colors.onSurface,
    textAlign: "right",
    minWidth: 40,
    padding: 0,
    margin: 0,
  },
  valuePlaceholder: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.semiBold,
    color: Colors.outline,
  },
  unitChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
  },
  unitText: {
    fontSize: FontSize.titleSm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
});
