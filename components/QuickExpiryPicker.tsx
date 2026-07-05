import { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  Radius,
} from "@/constants/theme";
import { type StorageType } from "@/constants/domain";
import { useIngredientMaster } from "@/context/IngredientMasterContext";
import { toISODate, formatDaysApprox } from "@/utils/dateUtils";
import {
  addDays,
  findStorageOptionForStorage,
  getStorageWindowDays,
} from "@/utils/ingredientEntryRules";

// ─── Props ────────────────────────────────────────────────────────────────────

interface QuickExpiryPickerProps {
  /** Master ingredient ID. Undefined when the user's item isn't in the catalog. */
  ingredientId: number | undefined;
  /** Null = 보관 미선택. 칩이 어떤 룩업을 해야 하는지 모르므로 렌더 안 됨. */
  storage: StorageType | null;
  /** Anchor used to compute the expiry date (purchase + window). */
  purchaseDate: Date;
  /**
   * 현재 만료일. 어느 칩 값과 정확히 일치하는지 비교해 해당 칩을 강조.
   * Null이면 어떤 칩도 강조되지 않음.
   */
  expirationDate: Date | null;
  onPick: (date: Date) => void;
  /** "소비기한 빠른 선택" 라벨 표시 여부. 그룹 wrapping 안에서는 false. */
  showLabel?: boolean;
  /**
   * 그룹 wrapping 안에 있을 때 true. 칩 배경을 wrapping과 대비되는 흰색으로
   * 바꿔서 wrapping 안에 떠 있는 느낌을 살림.
   */
  inGroup?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────
// Renders nothing if we don't have a master record for the current
// (ingredient, storage) pair — caller doesn't need to guard.

export function QuickExpiryPicker({
  ingredientId,
  storage,
  purchaseDate,
  expirationDate,
  onPick,
  showLabel = true,
  inGroup = false,
}: QuickExpiryPickerProps) {
  const { snapshot } = useIngredientMaster();

  const match = useMemo(() => {
    if (ingredientId == null || storage == null) return undefined;
    const opts = snapshot?.optionsByIngredientId.get(ingredientId);
    if (!opts) return undefined;
    return findStorageOptionForStorage(opts, storage);
  }, [ingredientId, storage, snapshot]);

  if (!match) return null;

  const apply = (days: number) => {
    onPick(addDays(purchaseDate, days));
  };

  // Day counts used by both the label formatter and the date calculation
  // — same source so the chip's label and its onPick result can never drift.
  // For API-sourced data `metric` is always "Days" (multiplier 1); for seed
  // fallback the multiplier converts to days.
  const { min: minDays, avg: avgDays, max: maxDays } =
    getStorageWindowDays(match);

  // Derive the active chip from the current expirationDate. Uses the *same*
  // formula as `apply` so clicking a chip and then comparing back hits 1-1.
  // Order matters on ties (min == max): min wins → then avg → then max.
  const activeMetric: "min" | "avg" | "max" | null = (() => {
    if (!expirationDate) return null;
    const expIso = toISODate(expirationDate);
    if (expIso === toISODate(addDays(purchaseDate, minDays))) return "min";
    if (expIso === toISODate(addDays(purchaseDate, avgDays))) return "avg";
    if (expIso === toISODate(addDays(purchaseDate, maxDays))) return "max";
    return null;
  })();

  return (
    <View style={styles.row}>
      {showLabel && <Text style={styles.label}>소비기한 빠른 선택</Text>}
      <View style={styles.buttons}>
        <Btn
          prefix="최소"
          days={minDays}
          active={activeMetric === "min"}
          inGroup={inGroup}
          onPress={() => apply(minDays)}
        />
        <Btn
          prefix="평균"
          days={avgDays}
          active={activeMetric === "avg"}
          inGroup={inGroup}
          onPress={() => apply(avgDays)}
        />
        <Btn
          prefix="최대"
          days={maxDays}
          active={activeMetric === "max"}
          inGroup={inGroup}
          onPress={() => apply(maxDays)}
        />
      </View>
    </View>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────

function Btn({
  prefix,
  days,
  active,
  inGroup,
  onPress,
}: {
  prefix: string;
  /** Raw day count — used only for the approximate-unit label. */
  days: number;
  active: boolean;
  inGroup: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        inGroup && styles.btnInGroup,
        active && styles.btnActive,
        pressed && (active ? styles.btnActivePressed : styles.btnPressed),
      ]}
    >
      <Text style={[styles.btnPrefix, active && styles.btnPrefixActive]}>
        {prefix}
      </Text>
      <Text style={[styles.btnValue, active && styles.btnValueActive]}>
        {formatDaysApprox(days)}
      </Text>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    gap: Spacing.sm,
  },
  label: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.semiBold,
    color: Colors.onSurfaceVariant,
  },
  buttons: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  btn: {
    flex: 1,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.fieldBackground,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  btnInGroup: {
    backgroundColor: Colors.surfaceContainerLowest,
  },
  btnPressed: {
    backgroundColor: Colors.surfaceContainerHigh,
  },
  btnActive: {
    backgroundColor: Colors.primary,
  },
  btnActivePressed: {
    opacity: 0.85,
  },
  btnPrefix: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
  },
  btnPrefixActive: {
    color: Colors.onPrimary,
    opacity: 0.8,
  },
  btnValue: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
  },
  btnValueActive: {
    color: Colors.onPrimary,
  },
});
