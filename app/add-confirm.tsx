import { IngredientPickerSheet } from "@/components/IngredientPickerSheet";
import { IngredientEditCard } from "@/components/IngredientEditCard";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ExpandableDatePicker } from "@/components/ExpandableDatePicker";
import { useToast } from "@/components/Toast";
import { Ionicons } from "@expo/vector-icons";
import {
  Colors,
  FontSize,
  FontWeight,
  Radius,
  Shadows,
  Spacing,
} from "@/constants/theme";
import type { IngredientDraft } from "@/constants/domain";
import { METRIC_TO_DAYS } from "@/constants/ingredients-master";
import { getMasterSnapshot } from "@/services/ingredientMaster";
import {
  createIngredients,
  mapIngredientToCreateRequest,
  mapStorageTypeFromApi,
} from "@/services/userIngredients";
import { ocrPending, mapOcrCandidateToDraft } from "@/services/ocr";
import { CommonActions } from "@react-navigation/native";
import { useNavigation, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─── Screen ───────────────────────────────────────────────────────────────────

function createEmptyDraft(): IngredientDraft {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 7);
  return {
    id: String(Date.now()),
    name: "",
    nickname: "",
    quantity: 1,
    unit: "개",
    storage: null,
    expirationDate: expiry,
  };
}

export default function AddConfirmScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { mode } = useLocalSearchParams<{ mode?: string }>();

  const isManual = mode === "manual";
  // OCR flow: crop screen stashes parsed candidates in `ocrPending`. Consume
  // (read + clear) on mount so a later focus doesn't re-seed stale data.
  const [items, setItems] = useState<IngredientDraft[]>(() => {
    if (isManual) return [createEmptyDraft()];
    const candidates = ocrPending.consume();
    if (candidates && candidates.length > 0) {
      return candidates.map(mapOcrCandidateToDraft);
    }
    return [createEmptyDraft()];
  });
  const [purchaseDate, setPurchaseDate] = useState(new Date());
  const [submitting, setSubmitting] = useState(false);

  // Modal state
  const [isCancelModalVisible, setIsCancelModalVisible] = useState(false);
  const [categoryPickerVisible, setCategoryPickerVisible] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Manual entry (메인 → + → 직접 추가하기) lands here with one blank card.
  // Auto-open the picker on it so the user doesn't have to tap the card's
  // name area as a second step. OCR flow lands with pre-matched cards, so
  // it deliberately skips this — guarded by `isManual`.
  useEffect(() => {
    if (!isManual) return;
    const first = items[0];
    if (!first || first.ingredientId != null || first.isCustom) return;
    setEditingItemId(first.id);
    setCategoryPickerVisible(true);
    // Mount-only; later additions go through addEmpty which opens the
    // picker itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateItem = (id: string, patch: Partial<IngredientDraft>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  };

  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const addEmpty = () => {
    // Add a new empty draft and immediately open the ingredient picker on
    // it — saves the user a second tap. If they back out of the picker the
    // empty card remains (deletable via the card's own 삭제하기 button), so
    // no data is lost either way.
    const draft = createEmptyDraft();
    setItems((prev) => [...prev, draft]);
    setEditingItemId(draft.id);
    setCategoryPickerVisible(true);
  };

  const hasAnyError = items.some(
    (it) =>
      it.name.trim() === "" ||
      it.quantity === null ||
      it.quantity < 1 ||
      it.storage == null,
  );

  const resetToHome = () => {
    // Hard reset the entire navigation stack — no history remains
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: "(tabs)" }],
      }),
    );
  };

  const goHome = () => {
    // Wait for modal dismiss animation, then reset stack
    setTimeout(resetToHome, 200);
  };

  const handleConfirm = async () => {
    if (hasAnyError || submitting) return;

    // Every non-custom draft must be linked to a master ingredient before
    // submit. OCR can return UNMATCHED rows that look filled but have no
    // `ingredientId`; the manual-entry empty case is already caught by
    // `hasAnyError`. Custom cards are intentionally excluded — they have no
    // master link by design and travel through the customName branch in
    // mapIngredientToCreateRequest.
    const unmatched = items.some(
      (it) => !it.isCustom && it.ingredientId == null,
    );
    if (unmatched) {
      showToast("매칭이 필요한 항목이 있어요. 식재료를 선택해주세요");
      return;
    }

    setSubmitting(true);
    try {
      const requests = items.map((draft) => {
        const req = mapIngredientToCreateRequest(draft);
        // Override the per-item purchaseDate with the screen-wide picker.
        return {
          ...req,
          purchaseDate: toIsoDate(purchaseDate),
        };
      });
      await createIngredients(requests);
      showToast(`${items.length}개를 냉장고에 담았어요`);
      resetToHome();
    } catch {
      showToast("등록하지 못했어요. 잠시 후 다시 시도해 주세요");
    } finally {
      setSubmitting(false);
    }
  };

  function toIsoDate(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const openCategoryPicker = (itemId: string) => {
    setEditingItemId(itemId);
    setCategoryPickerVisible(true);
  };

  const handleCategorySelect = (entry: { id: number; name: string }) => {
    if (!editingItemId) return;

    // Inspect the picked master's storage options to decide whether storage
    // can be auto-selected. Unambiguous masters (즉석밥 → 실온만) auto-fill;
    // ambiguous ones (삼겹살 → 냉장/냉동) leave it null so the user picks
    // deliberately. When auto-filling, also seed the expiry from the master's
    // (min+max)/2 days for that storage.
    const options =
      getMasterSnapshot().optionsByIngredientId.get(entry.id) ?? [];
    const uniqueDomains = Array.from(
      new Set(options.map((o) => mapStorageTypeFromApi(o.storageType))),
    );

    // Picking a new master is treated as a fresh context — reset the
    // manually-edited flag so storage changes can auto-update the expiry
    // again against the new master's averages.
    const patch: Partial<IngredientDraft> = {
      name: entry.name,
      ingredientId: entry.id,
      expirationManuallySet: false,
    };

    if (uniqueDomains.length === 1) {
      const storage = uniqueDomains[0];
      patch.storage = storage;
      const opt = options.find(
        (o) => mapStorageTypeFromApi(o.storageType) === storage,
      );
      if (opt) {
        const avgDays = Math.max(
          1,
          Math.round(((opt.min + opt.max) / 2) * METRIC_TO_DAYS[opt.metric]),
        );
        const expiry = new Date(purchaseDate);
        expiry.setDate(expiry.getDate() + avgDays);
        patch.expirationDate = expiry;
      }
    } else {
      patch.storage = null;
    }

    updateItem(editingItemId, patch);
  };

  const handlePickCustom = (name: string) => {
    if (!editingItemId) return;
    const target = items.find((it) => it.id === editingItemId);
    if (!target) return;
    // Mirror IngredientEditCard's toggle-ON logic: back up the current master
    // link + nickname + name so the user can toggle back to OFF later, and
    // overwrite `name` with the picker's search query.
    updateItem(editingItemId, {
      isCustom: true,
      _backupIngredientId: target.ingredientId,
      _backupNickname: target.nickname,
      _backupName: target.name,
      ingredientId: undefined,
      nickname: "",
      name,
    });
  };

  const editingItem = items.find((it) => it.id === editingItemId);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* No header — removed per spec */}

      {/* ── Content ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Purchase date — compact variant since it's the page anchor. */}
        <ExpandableDatePicker
          label="구매일자"
          value={purchaseDate}
          onChange={setPurchaseDate}
          variant="compact"
        />

        {/* Ingredient cards */}
        {items.map((item) => (
          <IngredientEditCard
            key={item.id}
            item={item}
            purchaseDate={purchaseDate}
            onUpdate={(patch) => updateItem(item.id, patch)}
            onDelete={() => deleteItem(item.id)}
            onCategoryPress={() => openCategoryPicker(item.id)}
          />
        ))}

        {/* Add more */}
        <Pressable
          onPress={addEmpty}
          style={({ pressed }) => [
            styles.addMoreBtn,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="add-circle" size={24} color={Colors.primary} />
          <Text style={styles.addMoreText}>식재료 직접 추가하기</Text>
        </Pressable>
      </ScrollView>

      {/* ── Bottom Actions ── */}
      <View
        style={[
          styles.bottomBar,
          { paddingBottom: Math.max(insets.bottom, 16) + 8 },
        ]}
      >
        <Pressable
          onPress={() => setIsCancelModalVisible(true)}
          style={({ pressed }) => [
            styles.cancelBtn,
            pressed && { opacity: 0.7, transform: [{ scale: 0.96 }] },
          ]}
        >
          <Text style={styles.cancelBtnText}>취소</Text>
        </Pressable>

        <Pressable
          onPress={handleConfirm}
          disabled={hasAnyError || submitting}
          style={({ pressed }) => [
            styles.confirmBtn,
            (hasAnyError || submitting) && styles.confirmBtnDisabled,
            !hasAnyError &&
              !submitting &&
              pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
          ]}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.onPrimary} />
          ) : (
            <>
              <Text
                style={[
                  styles.confirmBtnText,
                  hasAnyError && styles.confirmBtnTextDisabled,
                ]}
              >
                완료
              </Text>
              {hasAnyError && (
                <Text style={styles.confirmHint}>(입력 확인 필요)</Text>
              )}
            </>
          )}
        </Pressable>
      </View>

      {/* ── Cancel Confirm Modal ── */}
      <ConfirmModal
        visible={isCancelModalVisible}
        title="등록 취소"
        subtitle={"입력 중인 식재료 정보가 사라집니다.\n정말 나가시겠습니까?"}
        confirmLabel="나가기"
        cancelLabel="계속 작성"
        destructive
        onConfirm={() => {
          setIsCancelModalVisible(false);
          goHome();
        }}
        onCancel={() => setIsCancelModalVisible(false)}
      />

      {/* ── Category Picker Modal ── */}
      <IngredientPickerSheet
        visible={categoryPickerVisible}
        selected={editingItem?.name ?? ""}
        initialQuery={editingItem?.name ?? ""}
        onSelect={handleCategorySelect}
        onClose={() => setCategoryPickerVisible(false)}
        onPickCustom={handlePickCustom}
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

  // Scroll
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: 120,
    gap: Spacing.xl,
  },

  // Add more
  addMoreBtn: {
    paddingVertical: Spacing.xxl,
    borderRadius: Radius.xl,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "rgba(187, 203, 187, 0.30)",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  addMoreText: {
    fontSize: FontSize.titleSm,
    fontWeight: FontWeight.bold,
    color: Colors.onSurfaceVariant,
  },

  // Bottom bar
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.base,
    backgroundColor: Colors.glassBackground,
    ...Shadows.ambient,
  },
  cancelBtn: {
    height: 56,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.xl,
    backgroundColor: Colors.secondaryContainer,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onSecondaryContainer,
  },
  confirmBtn: {
    flex: 1,
    height: 56,
    borderRadius: Radius.xl,
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  confirmBtnDisabled: {
    backgroundColor: Colors.surfaceContainerHighest,
  },
  confirmBtnText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onPrimary,
  },
  confirmBtnTextDisabled: {
    color: Colors.onSurfaceVariant,
    opacity: 0.4,
  },
  confirmHint: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
    opacity: 0.5,
  },
});
