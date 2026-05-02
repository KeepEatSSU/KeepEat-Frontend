import { useRef, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ExpandableDatePicker } from "@/components/ExpandableDatePicker";
import { CapacityInput } from "@/components/CapacityInput";
import { QuickExpiryPicker } from "@/components/QuickExpiryPicker";
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  Radius,
} from "@/constants/theme";
import {
  UNITS,
  STORAGE_OPTIONS,
  type IngredientDraft,
  type StorageType,
} from "@/constants/domain";
import {
  STORAGE_OPTIONS_BY_INGREDIENT_ID,
  type ApiStorageType,
  type StorageOptionEntry,
} from "@/constants/ingredients-master";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STORAGE_DOMAIN_TO_API: Record<StorageType, ApiStorageType> = {
  room: "실온",
  fridge: "냉장",
  frozen: "냉동",
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface IngredientEditCardProps {
  item: IngredientDraft;
  /** Screen-wide purchase date — used as the anchor for quick-pick expiry. */
  purchaseDate?: Date;
  onUpdate: (patch: Partial<IngredientDraft>) => void;
  onDelete?: () => void;
  onCategoryPress?: () => void;
  /** Hide the delete button (e.g. in single-item modal mode) */
  hideDelete?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function IngredientEditCard({
  item,
  purchaseDate,
  onUpdate,
  onDelete,
  onCategoryPress,
  hideDelete = false,
}: IngredientEditCardProps) {
  const hasError = item.quantity === null || item.quantity <= 0;
  const isFrozen = item.storage === "frozen";
  // OCR can return UNMATCHED items (rawName filled, no master link). The
  // empty-name placeholder already covers the never-picked case; this badge
  // covers the "name is filled but the picker step still needs to happen".
  const needsMatching = item.name !== "" && item.ingredientId == null;

  // Remember last non-frozen expiration date
  const lastNonFrozenDateRef = useRef<Date | null>(item.expirationDate);

  // Master storage options for the currently picked ingredient (if any).
  const masterOptions = useMemo<StorageOptionEntry[] | undefined>(() => {
    if (item.ingredientId == null) return undefined;
    return STORAGE_OPTIONS_BY_INGREDIENT_ID.get(item.ingredientId);
  }, [item.ingredientId]);

  const storageHasOption = (storage: StorageType): boolean => {
    if (!masterOptions) return true; // unknown master → don't restrict
    return masterOptions.some(
      (o) => o.storageType === STORAGE_DOMAIN_TO_API[storage],
    );
  };

  const handleStorageChange = (newStorage: StorageType) => {
    if (newStorage === item.storage) return;
    if (newStorage === "frozen" && item.storage !== "frozen") {
      lastNonFrozenDateRef.current = item.expirationDate;
      onUpdate({ storage: newStorage, expirationDate: null });
    } else if (newStorage !== "frozen" && item.storage === "frozen") {
      const restored =
        lastNonFrozenDateRef.current ??
        (() => {
          const d = new Date();
          d.setDate(d.getDate() + 7);
          return d;
        })();
      onUpdate({ storage: newStorage, expirationDate: restored });
    } else {
      onUpdate({ storage: newStorage });
    }
  };

  const cycleUnit = () => {
    const idx = UNITS.indexOf(item.unit);
    onUpdate({ unit: UNITS[(idx + 1) % UNITS.length] });
  };

  return (
    <View style={[styles.card, hasError && styles.cardError]}>
      {/* Header: tappable name (required) + delete */}
      <View style={styles.cardHeader}>
        <Pressable
          onPress={onCategoryPress}
          disabled={!onCategoryPress}
          style={({ pressed }) => [
            styles.cardNameBtn,
            item.name === "" && styles.cardNameBtnEmpty,
            pressed && onCategoryPress && { opacity: 0.6 },
          ]}
        >
          <Text
            style={[
              styles.cardName,
              item.name === "" && styles.cardNamePlaceholder,
            ]}
          >
            {item.name || "식재료 선택 (필수)"}
          </Text>
          {needsMatching && (
            <View style={styles.matchBadge}>
              <Text style={styles.matchBadgeText}>매칭 필요</Text>
            </View>
          )}
          {onCategoryPress && (
            <Ionicons
              name="chevron-down"
              size={16}
              color={
                item.name === "" || needsMatching
                  ? Colors.error
                  : Colors.outline
              }
              style={{ marginLeft: 4 }}
            />
          )}
        </Pressable>
        {!hideDelete && onDelete && (
          <Pressable onPress={onDelete} style={{ padding: Spacing.xs }}>
            <Text style={styles.deleteText}>삭제하기</Text>
          </Pressable>
        )}
      </View>

      {/* Name missing hint */}
      {item.name === "" && (
        <View style={styles.errorRow}>
          <Ionicons name="information-circle" size={14} color={Colors.error} />
          <Text style={styles.errorText}>식재료 종류를 선택해주세요</Text>
        </View>
      )}

      {/* Nickname input */}
      <TextInput
        value={item.nickname}
        onChangeText={(v) => onUpdate({ nickname: v })}
        placeholder="(선택) 상세 이름 입력"
        placeholderTextColor={Colors.outline}
        style={styles.nicknameInput}
      />

      {/* Quantity (Task 1: unified input-field grammar) */}
      <CapacityInput
        label="수량"
        value={item.quantity}
        unit={item.unit}
        onValueChange={(v) => onUpdate({ quantity: v })}
        onUnitPress={cycleUnit}
        hasError={hasError}
      />

      {/* Error hint */}
      {hasError && (
        <View style={styles.errorRow}>
          <Ionicons name="information-circle" size={14} color={Colors.error} />
          <Text style={styles.errorText}>수량을 확인해주세요</Text>
        </View>
      )}

      {/* Storage chips */}
      <View style={styles.storageRow}>
        {STORAGE_OPTIONS.map(({ key, label }) => {
          const isActive = item.storage === key;
          const supported = storageHasOption(key);
          return (
            <Pressable
              key={key}
              onPress={() => supported && handleStorageChange(key)}
              disabled={!supported}
              style={[
                styles.storageChip,
                isActive && styles.storageChipActive,
                !supported && styles.storageChipDisabled,
              ]}
            >
              <Text
                style={[
                  styles.storageChipText,
                  isActive && styles.storageChipTextActive,
                  !supported && styles.storageChipTextDisabled,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Quick-pick expiry — renders nothing if no master record matches. */}
      <QuickExpiryPicker
        ingredientId={item.ingredientId}
        storage={item.storage}
        purchaseDate={purchaseDate ?? new Date()}
        onPick={(d) => onUpdate({ expirationDate: d })}
      />

      {/* Expiration date */}
      <ExpandableDatePicker
        label="소비기한"
        value={item.expirationDate ?? new Date()}
        onChange={(d) => onUpdate({ expirationDate: d })}
        disabled={isFrozen}
        disabledText="무제한 (냉동)"
        suffix="까지"
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.base,
  },
  cardError: {
    backgroundColor: "rgba(255, 218, 214, 0.08)",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardNameBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardName: {
    fontSize: FontSize.titleLg,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
  },
  cardNameBtnEmpty: {
    backgroundColor: Colors.surfaceContainerLow,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  cardNamePlaceholder: {
    fontSize: FontSize.bodyMd,
    color: Colors.error,
    fontWeight: FontWeight.medium,
    opacity: 0.7,
  },
  matchBadge: {
    marginLeft: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.errorContainer,
  },
  matchBadgeText: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.bold,
    color: Colors.error,
  },
  deleteText: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.medium,
    color: Colors.error,
    opacity: 0.6,
  },
  nicknameInput: {
    backgroundColor: Colors.fieldBackground,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: -Spacing.sm,
  },
  errorText: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.medium,
    color: Colors.error,
  },
  storageRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  storageChip: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.xl,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceContainerHigh,
  },
  storageChipActive: {
    backgroundColor: Colors.primary,
  },
  storageChipDisabled: {
    backgroundColor: Colors.surfaceContainerLow,
    opacity: 0.5,
  },
  storageChipText: {
    fontSize: FontSize.labelMd,
    fontWeight: FontWeight.bold,
    color: Colors.onSurfaceVariant,
    opacity: 0.5,
  },
  storageChipTextActive: {
    color: Colors.onPrimary,
    opacity: 1,
  },
  storageChipTextDisabled: {
    color: Colors.outline,
  },
});
