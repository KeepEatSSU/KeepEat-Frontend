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
  storage: StorageType;
  /** Anchor used to compute the expiry date (purchase + window). */
  purchaseDate: Date;
  onPick: (date: Date) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────
// Renders nothing if we don't have a master record for the current
// (ingredient, storage) pair — caller doesn't need to guard.

export function QuickExpiryPicker({
  ingredientId,
  storage,
  purchaseDate,
  onPick,
}: QuickExpiryPickerProps) {
  const match = useMemo(() => {
    if (ingredientId == null) return undefined;
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

  return (
    <View style={styles.row}>
      <Text style={styles.label}>소비기한 빠른 선택</Text>
      <View style={styles.buttons}>
        <Btn prefix="최소" value={match.min} metric={match.metric} onPress={() => apply(match.min)} />
        <Btn
          prefix="평균"
          value={Math.round(avg)}
          metric={match.metric}
          onPress={() => apply(avg)}
        />
        <Btn prefix="최대" value={match.max} metric={match.metric} onPress={() => apply(match.max)} />
      </View>
    </View>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────

function Btn({
  prefix,
  value,
  metric,
  onPress,
}: {
  prefix: string;
  value: number;
  metric: StorageMetric;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
    >
      <Text style={styles.btnPrefix}>{prefix}</Text>
      <Text style={styles.btnValue}>{formatMetric(value, metric)}</Text>
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
  btnPressed: {
    backgroundColor: Colors.surfaceContainerHigh,
  },
  btnPrefix: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
  },
  btnValue: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
  },
});
