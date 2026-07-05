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
import type { StorageOptionEntry } from "@/constants/ingredients-master";
import { useIngredientMaster } from "@/context/IngredientMasterContext";
import {
  findStorageOptionForStorage,
  getAutoExpiryForStorageChange,
  getDraftStorageOptions,
  getIngredientDraftFieldErrors,
  isStorageSelectable,
} from "@/utils/ingredientEntryRules";

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
  const { snapshot } = useIngredientMaster();
  const fieldErrors = useMemo(
    () => getIngredientDraftFieldErrors(item, snapshot),
    [item, snapshot],
  );
  const nameErrorText = fieldErrors.name ?? "";
  const quantityErrorText = fieldErrors.quantity ?? "";
  const storageErrorText = fieldErrors.storage ?? "";
  const expiryErrorText = fieldErrors.expirationDate ?? "";
  const hasError = quantityErrorText !== "";
  const [infoOpen, setInfoOpen] = useState(false);
  const nameNeedsAction = nameErrorText !== "";
  const storageNeedsAction = storageErrorText !== "";
  const cardNeedsAction =
    hasError || nameNeedsAction || storageNeedsAction || expiryErrorText !== "";

  // Master storage options for the currently picked ingredient (if any).
  const masterOptions = useMemo<StorageOptionEntry[] | undefined>(() => {
    return getDraftStorageOptions(item, snapshot);
  }, [item, snapshot]);

  // Whether the quick-expiry chips will actually render. Mirrors
  // QuickExpiryPicker's internal `match` check so we can decide whether to
  // wrap the date area in a group container before the picker renders.
  const hasQuickExpiry = useMemo(() => {
    const { isCustom, ingredientId, storage } = item;
    if (isCustom) return false;
    if (ingredientId == null || storage == null) return false;
    return findStorageOptionForStorage(masterOptions, storage) !== undefined;
  }, [item, masterOptions]);

  const storageHasOption = (storage: StorageType): boolean => {
    return isStorageSelectable(masterOptions, storage);
  };

  const handleStorageChange = (newStorage: StorageType) => {
    if (newStorage === item.storage) return;

    const autoExpiry = getAutoExpiryForStorageChange({
      options: masterOptions,
      storage: newStorage,
      purchaseDate: purchaseDate ?? new Date(),
      expirationManuallySet: item.expirationManuallySet,
    });

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
            testID="ingredient-registration.custom-name.input"
            value={item.name}
            onChangeText={(v) => onUpdate({ name: v })}
            placeholder="재료 이름 입력"
            placeholderTextColor={Colors.outline}
            style={[
              styles.customNameInput,
              nameNeedsAction && styles.customNameInputNeedsAction,
            ]}
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
          <Text style={styles.errorText}>{nameErrorText}</Text>
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
          <Text style={styles.errorText}>{quantityErrorText}</Text>
        </View>
      )}

      {/* Storage chips */}
      <View style={styles.storageGroup}>
        <View style={styles.storageLabelRow}>
          <Text
            style={[
              styles.storageLabel,
              storageNeedsAction && styles.storageLabelError,
            ]}
          >
            보관 방법
          </Text>
          <Text
            style={[
              styles.storageRequiredText,
              storageNeedsAction && styles.storageRequiredTextError,
            ]}
          >
            필수
          </Text>
        </View>
        <View style={styles.storageRow}>
          {STORAGE_OPTIONS.map(({ key, label }) => {
            const isActive = item.storage === key;
            const supported = storageHasOption(key);
            let accessibilityHint: string | undefined;
            if (!supported) {
              accessibilityHint =
                "선택한 식재료에서 지원하지 않는 보관 방법입니다";
            } else if (storageNeedsAction) {
              accessibilityHint = "필수 입력입니다";
            }
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={`${label} 보관 방법`}
                accessibilityHint={accessibilityHint}
                accessibilityState={{
                  selected: isActive,
                  disabled: !supported,
                }}
                onPress={() => supported && handleStorageChange(key)}
                disabled={!supported}
                style={[
                  styles.storageChip,
                  storageNeedsAction && styles.storageChipNeedsAction,
                  isActive && styles.storageChipActive,
                  !supported && styles.storageChipDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.storageChipText,
                    storageNeedsAction && styles.storageChipTextNeedsAction,
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
      </View>

      {storageNeedsAction && (
        <View style={styles.errorRow}>
          <Ionicons name="information-circle" size={14} color={Colors.error} />
          <Text style={styles.errorText}>{storageErrorText}</Text>
        </View>
      )}

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
            onPick={(d) =>
              onUpdate({ expirationDate: d, expirationManuallySet: true })
            }
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
      {expiryErrorText !== "" && (
        <View style={styles.errorRow}>
          <Ionicons name="information-circle" size={14} color={Colors.error} />
          <Text style={styles.errorText}>{expiryErrorText}</Text>
        </View>
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
  customNameInputNeedsAction: {
    backgroundColor: "rgba(255, 218, 214, 0.20)",
    color: Colors.error,
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
  storageGroup: {
    gap: Spacing.sm,
  },
  storageLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  storageLabel: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    letterSpacing: LetterSpacing.wide,
  },
  storageLabelError: {
    color: Colors.error,
  },
  storageRequiredText: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.bold,
    color: Colors.onSurfaceVariant,
    opacity: 0.55,
  },
  storageRequiredTextError: {
    color: Colors.error,
    opacity: 1,
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
  storageChipNeedsAction: {
    backgroundColor: "rgba(255, 218, 214, 0.20)",
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
  storageChipTextNeedsAction: {
    color: Colors.error,
    opacity: 0.85,
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
