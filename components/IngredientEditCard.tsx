import { useMemo, useState } from "react";
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
import { InfoModal } from "@/components/InfoModal";
import { IngredientIcon } from "@/components/IngredientIcon";
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  LetterSpacing,
  Radius,
} from "@/constants/theme";
import {
  UNITS,
  STORAGE_OPTIONS,
  type IngredientDraft,
  type StorageType,
} from "@/constants/domain";
import {
  METRIC_TO_DAYS,
  type ApiStorageType,
  type StorageOptionEntry,
} from "@/constants/ingredients-master";
import { getMasterSnapshot } from "@/services/ingredientMaster";

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
  const [infoOpen, setInfoOpen] = useState(false);
  // OCR can return UNMATCHED items (rawName filled, no master link). The
  // empty-name placeholder already covers the never-picked case; this flag
  // covers the "name is filled but the picker step still needs to happen".
  const needsMatching = item.name !== "" && item.ingredientId == null;
  // Unified "needs user action" signals — same visual language as the
  // quantity field. Name box turns red for both empty and UNMATCHED, and
  // the card-level tint fires for any unresolved input.
  const nameNeedsAction =
    !item.isCustom && (item.name === "" || needsMatching);
  const cardNeedsAction = hasError || nameNeedsAction;

  // Master storage options for the currently picked ingredient (if any).
  const masterOptions = useMemo<StorageOptionEntry[] | undefined>(() => {
    if (item.ingredientId == null) return undefined;
    return getMasterSnapshot().optionsByIngredientId.get(item.ingredientId);
  }, [item.ingredientId]);

  // Whether the quick-expiry chips will actually render. Mirrors
  // QuickExpiryPicker's internal `match` check so we can decide whether to
  // wrap the date area in a group container before the picker renders.
  const hasQuickExpiry = useMemo(() => {
    const { isCustom, ingredientId, storage } = item;
    if (isCustom) return false;
    if (ingredientId == null || storage == null) return false;
    const opts = getMasterSnapshot().optionsByIngredientId.get(ingredientId);
    if (!opts) return false;
    const apiStorage = STORAGE_DOMAIN_TO_API[storage];
    return opts.some((o) => o.storageType === apiStorage);
  }, [item.isCustom, item.ingredientId, item.storage]);

  const storageHasOption = (storage: StorageType): boolean => {
    if (!masterOptions) return true; // unknown master → don't restrict
    return masterOptions.some(
      (o) => o.storageType === STORAGE_DOMAIN_TO_API[storage],
    );
  };

  const handleStorageChange = (newStorage: StorageType) => {
    if (newStorage === item.storage) return;

    // Master-avg auto-expiry for the new storage. Skipped when the user
    // already edited the date by hand (preserve their intent) or no master
    // option is available. Frozen is treated like any other storage now —
    // it has its own (min, max) window in the master data.
    const autoExpiry = (() => {
      if (item.expirationManuallySet) return undefined;
      if (item.ingredientId == null) return undefined;
      const options = getMasterSnapshot().optionsByIngredientId.get(item.ingredientId);
      if (!options) return undefined;
      const opt = options.find(
        (o) => o.storageType === STORAGE_DOMAIN_TO_API[newStorage],
      );
      if (!opt) return undefined;
      const avgDays = Math.max(
        1,
        Math.round(((opt.min + opt.max) / 2) * METRIC_TO_DAYS[opt.metric]),
      );
      const anchor = purchaseDate ?? new Date();
      const d = new Date(anchor);
      d.setDate(d.getDate() + avgDays);
      return d;
    })();

    onUpdate({
      storage: newStorage,
      ...(autoExpiry ? { expirationDate: autoExpiry } : {}),
    });
  };

  const cycleUnit = () => {
    const idx = UNITS.indexOf(item.unit);
    onUpdate({ unit: UNITS[(idx + 1) % UNITS.length] });
  };

  return (
    <>
    <View style={[styles.card, cardNeedsAction && styles.cardError]}>
      {/* Top row: "내 재료" toggle + info + delete (moved here from cardHeader) */}
      <View style={styles.topRow}>
        <View style={styles.toggleGroup}>
          <Pressable
            onPress={() => {
              const next = !item.isCustom;
              if (next) {
                // ON: back up current master link + nickname + name so OFF can
                // restore them. Custom name lives in `name` while toggled on.
                onUpdate({
                  isCustom: true,
                  _backupIngredientId: item.ingredientId,
                  _backupNickname: item.nickname,
                  _backupName: item.name,
                  ingredientId: undefined,
                  nickname: "",
                });
              } else {
                // OFF: restore backup only if name is unchanged. If the user
                // edited the name in custom mode, the prior match is no longer
                // valid — force a fresh picker selection.
                const nameUnchanged = item.name === item._backupName;
                onUpdate({
                  isCustom: false,
                  ingredientId: nameUnchanged ? item._backupIngredientId : undefined,
                  nickname: nameUnchanged ? (item._backupNickname ?? "") : "",
                  _backupIngredientId: undefined,
                  _backupNickname: undefined,
                  _backupName: undefined,
                });
              }
            }}
            style={({ pressed }) => [
              styles.customToggle,
              pressed && { opacity: 0.7 },
            ]}
            hitSlop={6}
          >
            <View
              style={[
                styles.customCheckbox,
                item.isCustom && styles.customCheckboxOn,
              ]}
            >
              {item.isCustom && (
                <Ionicons
                  name="checkmark"
                  size={14}
                  color={Colors.onPrimary}
                />
              )}
            </View>
            <Text
              style={[
                styles.customToggleText,
                item.isCustom && styles.customToggleTextOn,
              ]}
            >
              내 재료
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setInfoOpen(true)}
            hitSlop={8}
            style={styles.infoButton}
          >
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={Colors.outline}
            />
          </Pressable>
        </View>
        {!hideDelete && onDelete && (
          <Pressable onPress={onDelete} style={{ padding: Spacing.xs }}>
            <Text style={styles.deleteText}>삭제하기</Text>
          </Pressable>
        )}
      </View>

      {/* Avatar — auto-switches to the pen glyph the moment isCustom flips
          on (toggle clears ingredientId in the same patch) or when the user
          hasn't picked a master item yet. */}
      <View style={styles.iconSlot}>
        <IngredientIcon
          ingredientId={item.ingredientId}
          isCustom={item.isCustom}
          size={56}
        />
      </View>

      {/* Header: tappable name (picker) or free text input (custom mode) */}
      <View style={styles.cardHeader}>
        {item.isCustom ? (
          <TextInput
            value={item.name}
            onChangeText={(v) => onUpdate({ name: v })}
            placeholder="재료 이름 입력"
            placeholderTextColor={Colors.outline}
            style={styles.customNameInput}
          />
        ) : (
          <Pressable
            onPress={onCategoryPress}
            disabled={!onCategoryPress}
            style={({ pressed }) => [
              styles.cardNameBtn,
              nameNeedsAction && styles.cardNameBtnNeedsAction,
              pressed && onCategoryPress && { opacity: 0.6 },
            ]}
          >
            {/* Invisible left spacer mirrors the chevron on the right so the
                text sits at the true horizontal center, not visually shifted
                by the chevron's width. */}
            {onCategoryPress && <View style={styles.cardNameChevronSpacer} />}
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={[
                styles.cardName,
                nameNeedsAction && styles.cardNamePlaceholder,
              ]}
            >
              {item.name || "식재료 선택"}
            </Text>
            {onCategoryPress && (
              <Ionicons
                name="chevron-down"
                size={16}
                color={nameNeedsAction ? Colors.error : Colors.outline}
                style={styles.cardNameChevron}
              />
            )}
          </Pressable>
        )}
      </View>

      {/* Name needs-action hint (empty OR OCR unmatched) */}
      {nameNeedsAction && (
        <View style={styles.errorRow}>
          <Ionicons name="information-circle" size={14} color={Colors.error} />
          <Text style={styles.errorText}>식재료를 선택해주세요</Text>
        </View>
      )}

      {/* Nickname input — hidden in custom mode */}
      {!item.isCustom && (
        <TextInput
          value={item.nickname}
          onChangeText={(v) => onUpdate({ nickname: v })}
          placeholder="(선택) 상세 이름 입력"
          placeholderTextColor={Colors.outline}
          style={styles.nicknameInput}
        />
      )}

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

      {/* Expiry group: chips + date picker wrapped in a single labeled
          container so the connection between them reads visually. When the
          chips can't render (no master / no storage / isCustom), fall back
          to the date picker standalone with its own label. */}
      {hasQuickExpiry ? (
        <View style={styles.expiryGroup}>
          <Text style={styles.expiryGroupLabel}>소비기한</Text>
          <QuickExpiryPicker
            ingredientId={item.ingredientId}
            storage={item.storage}
            purchaseDate={purchaseDate ?? new Date()}
            expirationDate={item.expirationDate}
            onPick={(d) => onUpdate({ expirationDate: d })}
            showLabel={false}
            inGroup
          />
          <ExpandableDatePicker
            value={item.expirationDate ?? new Date()}
            onChange={(d) =>
              onUpdate({ expirationDate: d, expirationManuallySet: true })
            }
            suffix="까지"
          />
        </View>
      ) : (
        <ExpandableDatePicker
          label="소비기한"
          value={item.expirationDate ?? new Date()}
          onChange={(d) =>
            onUpdate({ expirationDate: d, expirationManuallySet: true })
          }
          suffix="까지"
        />
      )}
    </View>
    <InfoModal
      visible={infoOpen}
      title="내 재료란?"
      body="KeepEat 식재료 목록에 없는 재료를 직접 추가할 수 있어요. 단, 레시피 추천에는 사용되지 않아요."
      onClose={() => setInfoOpen(false)}
    />
    </>
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
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  toggleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  customToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs + 2,
    paddingVertical: Spacing.xs,
  },
  customCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  customCheckboxOn: {
    backgroundColor: Colors.primary,
  },
  customToggleText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
  },
  customToggleTextOn: {
    color: Colors.primary,
  },
  infoButton: {
    padding: 2,
  },
  iconSlot: {
    alignItems: "center",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  cardNameBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  cardName: {
    fontSize: 22,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
    textAlign: "center",
    flexShrink: 1,
  },
  cardNameChevron: {
    marginLeft: 4,
  },
  cardNameChevronSpacer: {
    width: 16,
    marginRight: 4,
  },
  cardNameBtnNeedsAction: {
    backgroundColor: "rgba(255, 218, 214, 0.20)",
  },
  cardNamePlaceholder: {
    color: Colors.error,
    fontWeight: FontWeight.medium,
    opacity: 0.7,
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
  customNameInput: {
    width: "100%",
    backgroundColor: Colors.fieldBackground,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    fontSize: 22,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
    textAlign: "center",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
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
  expiryGroup: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  expiryGroupLabel: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    letterSpacing: LetterSpacing.wide,
  },
});
