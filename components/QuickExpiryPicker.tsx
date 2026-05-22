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
import {
  STORAGE_OPTIONS_BY_INGREDIENT_ID,
  METRIC_TO_DAYS,
  type ApiStorageType,
  type StorageMetric,
} from "@/constants/ingredients-master";
import { toISODate } from "@/utils/dateUtils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STORAGE_DOMAIN_TO_API: Record<StorageType, ApiStorageType> = {
  room: "실온",
  fridge: "냉장",
  frozen: "냉동",
};

function formatMetric(value: number, metric: StorageMetric): string {
  switch (metric) {
    case "Days":
      return `${value}일`;
    case "Weeks":
      return `${value}주`;
    case "Months":
      return `${value}개월`;
    case "Years":
      return `${value}년`;
  }
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

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
  const match = useMemo(() => {
    if (ingredientId == null || storage == null) return undefined;
    const opts = STORAGE_OPTIONS_BY_INGREDIENT_ID.get(ingredientId);
    if (!opts) return undefined;
    return opts.find(
      (o) => o.storageType === STORAGE_DOMAIN_TO_API[storage],
    );
  }, [ingredientId, storage]);

  if (!match) return null;

  const apply = (rawValue: number) => {
    const days = Math.round(rawValue * METRIC_TO_DAYS[match.metric]);
    onPick(addDays(purchaseDate, days));
  };

  const avg = (match.min + match.max) / 2;

  // Derive the active chip from the current expirationDate. Uses the *same*
  // formula as `apply` so clicking a chip and then comparing back hits 1-1.
  // Order matters on ties (min == max): min wins → then avg → then max.
  const activeMetric: "min" | "avg" | "max" | null = (() => {
    if (!expirationDate) return null;
    const expIso = toISODate(expirationDate);
    const minIso = toISODate(
      addDays(purchaseDate, Math.round(match.min * METRIC_TO_DAYS[match.metric])),
    );
    if (expIso === minIso) return "min";
    const avgIso = toISODate(
      addDays(purchaseDate, Math.round(avg * METRIC_TO_DAYS[match.metric])),
    );
    if (expIso === avgIso) return "avg";
    const maxIso = toISODate(
      addDays(purchaseDate, Math.round(match.max * METRIC_TO_DAYS[match.metric])),
    );
    if (expIso === maxIso) return "max";
    return null;
  })();

  return (
    <View style={styles.row}>
      {showLabel && <Text style={styles.label}>소비기한 빠른 선택</Text>}
      <View style={styles.buttons}>
        <Btn
          prefix="최소"
          value={match.min}
          metric={match.metric}
          active={activeMetric === "min"}
          inGroup={inGroup}
          onPress={() => apply(match.min)}
        />
        <Btn
          prefix="평균"
          value={Math.round(avg)}
          metric={match.metric}
          active={activeMetric === "avg"}
          inGroup={inGroup}
          onPress={() => apply(avg)}
        />
        <Btn
          prefix="최대"
          value={match.max}
          metric={match.metric}
          active={activeMetric === "max"}
          inGroup={inGroup}
          onPress={() => apply(match.max)}
        />
      </View>
    </View>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────

function Btn({
  prefix,
  value,
  metric,
  active,
  inGroup,
  onPress,
}: {
  prefix: string;
  value: number;
  metric: StorageMetric;
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
        {formatMetric(value, metric)}
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
