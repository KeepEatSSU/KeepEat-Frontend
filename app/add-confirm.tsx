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
import {
  createIngredients,
  mapIngredientToCreateRequest,
} from "@/services/userIngredients";
import { ocrPending, mapOcrCandidateToDraft } from "@/services/ocr";
import { CommonActions } from "@react-navigation/native";
import { useNavigation, useLocalSearchParams } from "expo-router";
import { useState } from "react";
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
    storage: "fridge",
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

  const updateItem = (id: string, patch: Partial<IngredientDraft>) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );
  };

  const deleteItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const addEmpty = () => {
    setItems((prev) => [...prev, createEmptyDraft()]);
  };

  const hasAnyError = items.some(
    (it) => it.name.trim() === "" || it.quantity === null || it.quantity < 1,
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

    // Every draft must be linked to a master ingredient before submit. OCR
    // can return UNMATCHED rows that look filled but have no `ingredientId`,
    // and the manual-entry empty case is already caught by `hasAnyError`.
    const unmatched = items.some((it) => it.ingredientId == null);
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
    if (editingItemId) {
      updateItem(editingItemId, {
        name: entry.name,
        ingredientId: entry.id,
      });
    }
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
        onSelect={handleCategorySelect}
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
