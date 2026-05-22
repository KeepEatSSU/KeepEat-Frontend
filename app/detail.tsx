import { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  StyleSheet,
  BackHandler,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ConfirmModal } from "@/components/ConfirmModal";
import { IngredientPickerSheet } from "@/components/IngredientPickerSheet";
import { ExpandableDatePicker } from "@/components/ExpandableDatePicker";
import { QuickExpiryPicker } from "@/components/QuickExpiryPicker";
import { ErrorScreen } from "@/components/ErrorScreen";
import { useToast } from "@/components/Toast";
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  Radius,
  Shadows,
  LetterSpacing,
} from "@/constants/theme";
import {
  UNITS,
  STORAGE_OPTIONS,
  type Ingredient,
  type Unit,
  type StorageType,
} from "@/constants/domain";
import {
  fetchAllIngredients,
  updateIngredient,
  deleteIngredient,
  mapIngredientToUpdateRequest,
  type IngredientUpdate,
} from "@/services/userIngredients";
import { INGREDIENT_BY_NAME } from "@/constants/ingredients-master";
import { CapacityInput } from "@/components/CapacityInput";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/* ── Storage Chips ── */

function StorageChips({
  selected,
  onSelect,
}: {
  selected: StorageType;
  onSelect: (v: StorageType) => void;
}) {
  return (
    <View style={styles.storageRow}>
      {STORAGE_OPTIONS.map(({ key, label }) => {
        const isActive = selected === key;
        return (
          <Pressable
            key={key}
            onPress={() => onSelect(key)}
            style={({ pressed }) => [
              styles.storageChip,
              isActive && styles.storageChipActive,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text
              style={[
                styles.storageChipText,
                isActive && styles.storageChipTextActive,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── Tip Card ── */


// ─── Detail Screen ────────────────────────────────────────────────────────────

type DetailInit = {
  category: string;
  name: string;
  nickname: string;
  capacity: number;
  unit: Unit;
  purchaseDate: Date;
  storage: StorageType;
  expirationDate: Date;
};

function deriveInit(found: Ingredient): DetailInit {
  // Backend gives us "200" + "g" pre-joined as "200g" in the display field.
  const qtyMatch = found.quantity.match(/^(\d+(?:\.\d+)?)(.*)$/);
  const capacity = qtyMatch ? Number(qtyMatch[1]) : 0;
  const unitRaw = qtyMatch?.[2]?.trim() ?? "g";
  const unit: Unit = (UNITS as readonly string[]).includes(unitRaw)
    ? (unitRaw as Unit)
    : "g";

  // Mapper produces "MM.DD" — re-attach current year for editing.
  const [mm, dd] = found.purchaseDate.split(".").map(Number);
  const now = new Date();
  const purchaseDate = new Date(now.getFullYear(), (mm || 1) - 1, dd || 1);

  const expirationDate =
    found.expirationDate instanceof Date
      ? found.expirationDate
      : found.expirationDate
        ? new Date(found.expirationDate)
        : new Date(now.getFullYear(), (mm || 1) - 1, (dd || 1) + 14);

  return {
    category: found.category,
    name: found.name,
    nickname: found.nickname,
    capacity,
    unit,
    purchaseDate,
    storage: found.storageType,
    expirationDate,
  };
}

export default function DetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();

  // ── Async resolution from server ──
  const [init, setInit] = useState<DetailInit | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const all = await fetchAllIngredients();
        const found = all.find((i) => i.id === id);
        if (!found) {
          if (!cancelled) setLoadError(true);
          return;
        }
        if (!cancelled) setInit(deriveInit(found));
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loadError) {
    return (
      <ErrorScreen
        message="식재료 정보를 불러오지 못했어요"
        subMessage="잠시 후 다시 시도해 주세요"
      />
    );
  }

  if (!init) {
    return (
      <View
        style={[
          styles.screen,
          { paddingTop: insets.top, alignItems: "center", justifyContent: "center" },
        ]}
      >
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return <DetailEditor id={id} init={init} router={router} insets={insets} showToast={showToast} />;
}

function DetailEditor({
  id,
  init,
  router,
  insets,
  showToast,
}: {
  id: string;
  init: DetailInit;
  router: ReturnType<typeof useRouter>;
  insets: ReturnType<typeof useSafeAreaInsets>;
  showToast: (msg: string) => void;
}) {
  // ── State ──
  const [category, setCategory] = useState(init.category);
  const [name] = useState(init.name);
  const [nickname, setNickname] = useState(init.nickname);
  const [nicknameFocused, setNicknameFocused] = useState(false);
  const [capacity, setCapacity] = useState(init.capacity);
  const [unit, setUnit] = useState<Unit>(init.unit);
  const [purchaseDate, setPurchaseDate] = useState(init.purchaseDate);
  const [storage, setStorage] = useState<StorageType>(init.storage);
  const [expirationDate, setExpirationDate] = useState(init.expirationDate);
  const [submitting, setSubmitting] = useState(false);

  // Reverse-lookup the master ingredient ID from the saved name. Backend
  // doesn't echo this on the user-ingredient row, so falling back to the
  // name index is the simplest path. Undefined if the user typed a custom
  // name we can't map — quick-pick stays hidden in that case.
  const masterIngredientId = useMemo(
    () => INGREDIENT_BY_NAME.get(name)?.id,
    [name],
  );

  const handleStorageChange = (newStorage: StorageType) => {
    setStorage(newStorage);
  };

  // ── Modal visibility ──
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);

  // ── Dirty check ──
  const isDirty = useMemo(
    () =>
      category !== init.category ||
      nickname !== init.nickname ||
      capacity !== init.capacity ||
      unit !== init.unit ||
      !sameDay(purchaseDate, init.purchaseDate) ||
      storage !== init.storage ||
      !sameDay(expirationDate, init.expirationDate),
    [category, nickname, capacity, unit, purchaseDate, storage, expirationDate],
  );

  const tryClose = () => {
    if (isDirty) {
      setSaveModalVisible(true);
    } else {
      router.back();
    }
  };

  // Intercept Android back button
  useEffect(() => {
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      tryClose();
      return true;
    });
    return () => handler.remove();
  });

  // ── Handlers ──
  // Single save path used by both the bottom "수정 완료" button and the
  // back-navigation modal's "저장하고 나가기" branch. The modal-visibility
  // reset at the top is a no-op when the button is the trigger, which keeps
  // the call sites identical and avoids a duplicate patch-building block.
  const handleSaveAndExit = async () => {
    setSaveModalVisible(false);
    if (submitting) return;
    setSubmitting(true);
    try {
      const patch: IngredientUpdate = {};
      if (nickname !== init.nickname) patch.nickname = nickname;
      if (capacity !== init.capacity) patch.quantity = capacity;
      if (unit !== init.unit) patch.unit = unit;
      if (storage !== init.storage) patch.storageType = storage;
      if (!sameDay(purchaseDate, init.purchaseDate)) {
        patch.purchaseDate = purchaseDate;
      }
      if (!sameDay(expirationDate, init.expirationDate)) {
        // Frozen sentinel year 9999 is treated as "no expiry".
        patch.expiryDate =
          expirationDate.getFullYear() === 9999 ? null : expirationDate;
      }

      if (Object.keys(patch).length > 0) {
        await updateIngredient(Number(id), mapIngredientToUpdateRequest(patch));
        showToast("변경된 정보가 저장됐어요");
      }
      router.back();
    } catch {
      showToast("저장 중 문제가 생겼어요. 잠시 후 다시 시도해주세요");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDiscardAndExit = () => {
    setSaveModalVisible(false);
    router.back();
  };

  const handleConfirmDelete = async () => {
    setDeleteModalVisible(false);
    if (submitting) return;
    setSubmitting(true);
    try {
      await deleteIngredient(Number(id));
      showToast("삭제되었어요");
      router.back();
    } catch {
      showToast("삭제하지 못했어요. 잠시 후 다시 시도해 주세요");
    } finally {
      setSubmitting(false);
    }
  };

  const cycleUnit = () => {
    setUnit((prev) => UNITS[(UNITS.indexOf(prev) + 1) % UNITS.length]);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable
          onPress={tryClose}
          style={({ pressed }) => [
            styles.headerBtn,
            pressed && { opacity: 0.6 },
          ]}
        >
          <Ionicons name="close" size={24} color={Colors.onSurface} />
        </Pressable>

        {/* Tappable name title */}
        <Pressable
          onPress={() => setCategoryPickerVisible(true)}
          style={({ pressed }) => [
            styles.headerTitleBtn,
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text style={styles.headerTitle}>{name}</Text>
          <Ionicons
            name="chevron-down"
            size={16}
            color={Colors.outline}
            style={{ marginLeft: 4 }}
          />
        </Pressable>

        <Pressable
          onPress={() => setDeleteModalVisible(true)}
          style={({ pressed }) => [
            styles.deleteBtn,
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text style={styles.deleteBtnText}>삭제</Text>
        </Pressable>
      </View>

      {/* ── Content ── */}
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero — inline editable nickname */}
        <View style={styles.hero}>
          <View
            style={[
              styles.heroInputWrap,
              nicknameFocused && styles.heroInputWrapFocused,
            ]}
          >
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              onFocus={() => setNicknameFocused(true)}
              onBlur={() => setNicknameFocused(false)}
              style={styles.heroInput}
              multiline
              returnKeyType="done"
              blurOnSubmit
              placeholder="이름을 입력하세요"
              placeholderTextColor={Colors.outline}
            />
          </View>
          <View style={styles.heroUnderline} />
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <CapacityInput
            label="수량"
            value={capacity}
            unit={unit}
            onValueChange={setCapacity}
            onUnitPress={cycleUnit}
          />

          <ExpandableDatePicker
            label="구매일자"
            value={purchaseDate}
            onChange={setPurchaseDate}
            suffix="구매"
          />

          <StorageChips selected={storage} onSelect={handleStorageChange} />

          <QuickExpiryPicker
            ingredientId={masterIngredientId}
            storage={storage}
            purchaseDate={purchaseDate}
            expirationDate={expirationDate}
            onPick={setExpirationDate}
          />

          <ExpandableDatePicker
            label="소비기한"
            value={expirationDate}
            onChange={setExpirationDate}
            suffix="까지"
          />

        </View>

      </ScrollView>

      {/* ── Bottom-fixed save action ── */}
      <View
        style={[
          styles.saveBtnArea,
          { paddingBottom: Math.max(insets.bottom, Spacing.md) },
        ]}
      >
        <Pressable
          onPress={handleSaveAndExit}
          disabled={!isDirty || submitting}
          accessibilityRole="button"
          accessibilityLabel="수정 완료"
          accessibilityState={{ disabled: !isDirty || submitting }}
          style={({ pressed }) => [
            styles.saveBtn,
            isDirty && !submitting
              ? styles.saveBtnActive
              : styles.saveBtnDisabled,
            pressed && isDirty && !submitting && { opacity: 0.9 },
          ]}
        >
          <Text
            style={[
              styles.saveBtnText,
              (!isDirty || submitting) && styles.saveBtnTextDisabled,
            ]}
          >
            수정 완료
          </Text>
        </Pressable>
      </View>

      {/* ── Unsaved-changes Modal — surfaces on back when there are pending edits ── */}
      <ConfirmModal
        visible={saveModalVisible}
        title="변경사항이 사라져요"
        confirmLabel="저장하기"
        cancelLabel="나가기"
        onConfirm={handleSaveAndExit}
        onCancel={handleDiscardAndExit}
      />

      {/* ── Delete Confirm Modal ── */}
      <ConfirmModal
        visible={deleteModalVisible}
        message="삭제하시겠습니까?"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteModalVisible(false)}
      />

      {/* ── Category Picker ── */}
      {/* Detail edit can't change the master ingredientId via the API yet,
          so picking here only updates the visible category label. */}
      <IngredientPickerSheet
        visible={categoryPickerVisible}
        selected={category}
        onSelect={(entry) => setCategory(entry.name)}
        onClose={() => setCategoryPickerVisible(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.surface,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.base,
    height: 56,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitleBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: FontSize.titleLg,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
    letterSpacing: LetterSpacing.tight,
  },
  deleteBtn: {
    backgroundColor: Colors.surfaceContainerHigh,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
  },
  deleteBtnText: {
    fontSize: FontSize.titleSm,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
  },

  // Scroll — flex:1 so the save-action area sticks to the bottom even when
  // content is short. ScrollView fills the gap between header and save area.
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },

  // ── Bottom save action ──
  // Normal-flow last child of the screen (not absolute) so the ScrollView
  // above can flex into the remaining space without an explicit bottom-pad.
  saveBtnArea: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    backgroundColor: Colors.surface,
  },
  saveBtn: {
    height: 56,
    borderRadius: Radius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnActive: {
    backgroundColor: Colors.primary,
    ...Shadows.fab,
  },
  saveBtnDisabled: {
    backgroundColor: Colors.surfaceContainerHigh,
  },
  saveBtnText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onPrimary,
    letterSpacing: LetterSpacing.tight,
  },
  saveBtnTextDisabled: {
    color: Colors.outline,
  },

  // Hero
  hero: {
    alignItems: "center",
    marginTop: Spacing.xl,
    marginBottom: 40,
  },
  heroInputWrap: {
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: 6,
  },
  heroInputWrapFocused: {
    backgroundColor: "rgba(0, 109, 55, 0.06)",
  },
  heroInput: {
    fontSize: 28,
    fontWeight: FontWeight.extraBold,
    color: Colors.onSurface,
    letterSpacing: LetterSpacing.tight,
    textAlign: "center",
    padding: 0,
    margin: 0,
  },
  heroUnderline: {
    height: 4,
    width: "80%",
    backgroundColor: "rgba(46, 204, 113, 0.25)",
    borderRadius: Radius.full,
  },

  // Controls container
  controls: {
    gap: Spacing.xl,
  },

  // ── Storage Chips ──
  storageRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  storageChip: {
    flex: 1,
    // Match ExpandableDatePicker header paddingVertical (Spacing.md) for identical field height
    paddingVertical: Spacing.md,
    borderRadius: Radius.xl,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceContainerHigh,
  },
  storageChipActive: {
    backgroundColor: Colors.primary,
    ...Shadows.fab,
    borderWidth: 3,
    borderColor: "rgba(46, 204, 113, 0.20)",
  },
  storageChipText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onSurfaceVariant,
  },
  storageChipTextActive: {
    color: Colors.onPrimary,
  },

});
