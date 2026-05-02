import { useState, useMemo, useRef, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Linking,
  Modal,
  Animated,
  StyleSheet,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  Radius,
  Shadows,
  LetterSpacing,
} from "@/constants/theme";
import type {
  RecipeDetail,
  RecipeIngredient,
  IngredientDraft,
} from "@/constants/domain";
import { MOCK_RECIPE_DETAILS } from "@/mocks";
import { IngredientEditCard } from "@/components/IngredientEditCard";
import { useToast } from "@/components/Toast";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(amount: number): string {
  return amount % 1 === 0 ? String(amount) : amount.toFixed(1);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/* ── Portions Stepper ── */

function PortionsStepper({
  portions,
  onChange,
}: {
  portions: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.stepperTrack}>
      <Pressable
        onPress={() => onChange(Math.max(1, portions - 1))}
        style={({ pressed }) => [
          styles.stepperBtn,
          pressed && styles.stepperBtnPressed,
        ]}
      >
        <Ionicons name="remove" size={18} color={Colors.onSurface} />
      </Pressable>
      <Text style={styles.stepperValue}>{portions}인분</Text>
      <Pressable
        onPress={() => onChange(portions + 1)}
        style={({ pressed }) => [
          styles.stepperBtn,
          pressed && styles.stepperBtnPressed,
        ]}
      >
        <Ionicons name="add" size={18} color={Colors.onSurface} />
      </Pressable>
    </View>
  );
}

/* ── Owned Ingredient Row ── */

function OwnedRow({
  item,
  portions,
}: {
  item: RecipeIngredient;
  portions: number;
}) {
  const scaled = item.amount * portions;
  return (
    <View style={styles.ingredientRow}>
      <View style={styles.ingredientLeft}>
        <Ionicons
          name="checkmark-circle"
          size={22}
          color={Colors.primaryContainer}
        />
        <Text style={styles.ingredientName}>{item.name}</Text>
      </View>
      <Text style={styles.ingredientAmount}>
        {formatAmount(scaled)}
        {item.unit}
      </Text>
    </View>
  );
}

/* ── Missing Ingredient Row ── */

function MissingRow({
  item,
  portions,
  onAddToFridge,
}: {
  item: RecipeIngredient;
  portions: number;
  onAddToFridge: () => void;
}) {
  const scaled = item.amount * portions;

  const handleBuy = () => {
    const url = `https://m.coupang.com/nm/search?q=${encodeURIComponent(item.name)}`;
    Linking.openURL(url);
  };

  return (
    <View style={styles.ingredientRow}>
      <View style={styles.ingredientLeft}>
        <View style={styles.missingDot} />
        <Text style={[styles.ingredientName, styles.missingName]}>
          {item.name}
        </Text>
      </View>
      <View style={styles.actionBtns}>
        <Text style={styles.ingredientAmountMissing}>
          {formatAmount(scaled)}
          {item.unit}
        </Text>
        <Pressable
          onPress={handleBuy}
          style={({ pressed }) => [
            styles.actionChip,
            styles.buyChip,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.buyChipText}>구매</Text>
        </Pressable>
        <Pressable
          onPress={onAddToFridge}
          style={({ pressed }) => [
            styles.actionChip,
            styles.addChip,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.addChipText}>추가</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ── Step Row ── */

function StepRow({
  order,
  instruction,
  timerSeconds,
  isLast,
}: {
  order: number;
  instruction: string;
  timerSeconds?: number;
  isLast: boolean;
}) {
  const timerLabel = timerSeconds
    ? timerSeconds >= 60
      ? `${Math.floor(timerSeconds / 60)}분`
      : `${timerSeconds}초`
    : null;

  return (
    <View style={styles.stepRow}>
      {/* Timeline */}
      <View style={styles.stepTimeline}>
        <View style={styles.stepCircle}>
          <Text style={styles.stepNumber}>
            {String(order).padStart(2, "0")}
          </Text>
        </View>
        {!isLast && <View style={styles.stepLine} />}
      </View>

      {/* Content */}
      <View style={styles.stepContent}>
        <Text style={styles.stepText}>{instruction}</Text>
        {timerLabel && (
          <View style={styles.timerBadge}>
            <Ionicons name="timer-outline" size={13} color={Colors.primary} />
            <Text style={styles.timerText}>{timerLabel}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

const SHEET_HEIGHT = 520;

export default function RecipeDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();

  const recipe = useMemo(
    () => MOCK_RECIPE_DETAILS.find((r) => r.id === id) ?? MOCK_RECIPE_DETAILS[0],
    [id],
  );

  const [portions, setPortions] = useState(1);
  const [isSaved, setIsSaved] = useState(true);

  // ── Add-to-fridge modal ──
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [draftItem, setDraftItem] = useState<IngredientDraft>({
    id: "new",
    name: "",
    nickname: "",
    quantity: null,
    unit: "g",
    storage: "fridge",
    expirationDate: null,
  });

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  const openAddModal = (ingredientName: string) => {
    setDraftItem({
      id: String(Date.now()),
      name: ingredientName,
      nickname: ingredientName,
      quantity: null,
      unit: "g",
      storage: "fridge",
      expirationDate: null,
    });
    setAddModalVisible(true);
    backdropOpacity.setValue(0);
    sheetTranslateY.setValue(SHEET_HEIGHT);
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(sheetTranslateY, {
        toValue: 0,
        damping: 20,
        stiffness: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeAddModal = useCallback(
    (callback?: () => void) => {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslateY, {
          toValue: SHEET_HEIGHT,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setAddModalVisible(false);
        callback?.();
      });
    },
    [backdropOpacity, sheetTranslateY],
  );

  const handleAddToFridge = () => {
    closeAddModal(() => {
      showToast(`${draftItem.name}이(가) 냉장고에 추가되었습니다`);
      // TODO: persist to fridge state
    });
  };

  const owned = recipe.ingredients.filter((i) => i.owned);
  const missing = recipe.ingredients.filter((i) => !i.owned);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.headerBtn,
            pressed && { opacity: 0.6 },
          ]}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.onSurface} />
        </Pressable>
        <Pressable
          onPress={() => {
            setIsSaved((v) => !v);
            // TODO: isSaved가 false로 변할 때 "찜 목록에서 제거되었습니다" Toast
          }}
          style={({ pressed }) => [
            styles.headerBtn,
            pressed && { opacity: 0.6 },
          ]}
        >
          <Ionicons
            name={isSaved ? "bookmark" : "bookmark-outline"}
            size={24}
            color={isSaved ? Colors.primary : Colors.onSurface}
          />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Hero ── */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>{recipe.title}</Text>
        </View>

        {/* ── Meta Chips ── */}
        <View style={styles.metaRow}>
          <View style={styles.metaChip}>
            <Ionicons name="nutrition-outline" size={15} color={Colors.primary} />
            <Text style={styles.metaChipHighlight}>
              {recipe.matchCount}/{recipe.totalCount}
            </Text>
            <Text style={styles.metaChipLabel}>보유</Text>
          </View>
          <View style={styles.metaChip}>
            <Ionicons name="flame-outline" size={15} color={Colors.outline} />
            <Text style={styles.metaChipText}>{recipe.kcal}</Text>
          </View>
          <View style={styles.metaChip}>
            <Ionicons name="speedometer-outline" size={15} color={Colors.outline} />
            <Text style={styles.metaChipText}>{recipe.difficulty}</Text>
          </View>
          <View style={styles.metaChip}>
            <Ionicons name="time-outline" size={15} color={Colors.outline} />
            <Text style={styles.metaChipText}>{recipe.time}</Text>
          </View>
        </View>

        {/* ── Portions Stepper ── */}
        <PortionsStepper portions={portions} onChange={setPortions} />

        {/* ── Ingredients ── */}
        <View style={styles.section}>
          {owned.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>있는 재료</Text>
              {owned.map((item) => (
                <OwnedRow key={item.name} item={item} portions={portions} />
              ))}
            </>
          )}

          {missing.length > 0 && (
            <View style={{ marginTop: owned.length > 0 ? Spacing.lg : 0 }}>
              <Text style={styles.sectionLabel}>없는 재료</Text>
              {missing.map((item) => (
                <MissingRow
                  key={item.name}
                  item={item}
                  portions={portions}
                  onAddToFridge={() => openAddModal(item.name)}
                />
              ))}
            </View>
          )}
        </View>

        {/* ── Steps ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>조리 순서</Text>
          {recipe.steps.map((step, idx) => (
            <StepRow
              key={step.order}
              order={step.order}
              instruction={step.instruction}
              timerSeconds={step.timerSeconds}
              isLast={idx === recipe.steps.length - 1}
            />
          ))}
        </View>
      </ScrollView>

      {/* ── Bottom CTA ── */}
      <View
        style={[
          styles.bottomCta,
          { paddingBottom: Math.max(insets.bottom, 12) },
        ]}
      >
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/cooking-ready",
              params: { id: recipe.id },
            } as never)
          }
          style={({ pressed }) => [
            styles.ctaButton,
            pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
          ]}
        >
          <Text style={styles.ctaText}>요리 시작하기</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/cooking-complete",
              params: { id: recipe.id },
            } as never)
          }
          style={({ pressed }) => [
            styles.shortcutBtn,
            pressed && { opacity: 0.5 },
          ]}
        >
          <Text style={styles.shortcutText}>바로 완성하기</Text>
        </Pressable>
      </View>

      {/* ── Add to Fridge Modal ── */}
      <Modal
        visible={addModalVisible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => closeAddModal()}
      >
        <View style={styles.modalContainer}>
          <Animated.View
            style={[styles.modalBackdrop, { opacity: backdropOpacity }]}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => closeAddModal()}
            />
          </Animated.View>

          <Animated.View
            style={[
              styles.modalSheet,
              { paddingBottom: Math.max(insets.bottom, 20) },
              { transform: [{ translateY: sheetTranslateY }] },
            ]}
          >
            <View style={styles.modalHandle}>
              <View style={styles.modalHandleBar} />
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={styles.modalScroll}
            >
              <IngredientEditCard
                item={draftItem}
                onUpdate={(patch) =>
                  setDraftItem((prev) => ({ ...prev, ...patch }))
                }
                hideDelete
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => closeAddModal()}
                style={({ pressed }) => [
                  styles.modalCancelBtn,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.modalCancelText}>취소</Text>
              </Pressable>
              <Pressable
                onPress={handleAddToFridge}
                style={({ pressed }) => [
                  styles.modalConfirmBtn,
                  pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                ]}
              >
                <Text style={styles.modalConfirmText}>
                  내 냉장고에 추가하기
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Spacing.base,
    height: 56,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  // Scroll
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 100,
  },

  // Hero
  hero: {
    marginBottom: Spacing.lg,
  },
  heroTitle: {
    fontSize: FontSize.headlineMd,
    fontWeight: FontWeight.extraBold,
    color: Colors.onSurface,
    letterSpacing: LetterSpacing.tight,
    lineHeight: 32,
  },

  // Meta chips
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.surfaceContainerLow,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
  },
  metaChipHighlight: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  metaChipLabel: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
  },
  metaChipText: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
  },

  // Portions stepper
  stepperTrack: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.lg,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.full,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.xxl,
  },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceContainerHighest,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBtnPressed: {
    transform: [{ scale: 0.9 }],
    opacity: 0.7,
  },
  stepperValue: {
    fontSize: FontSize.titleLg,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
    minWidth: 60,
    textAlign: "center",
  },

  // Sections
  section: {
    marginBottom: Spacing.xxl,
  },
  sectionTitle: {
    fontSize: FontSize.titleLg,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
    letterSpacing: LetterSpacing.tight,
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    textTransform: "uppercase",
    letterSpacing: LetterSpacing.wide,
    marginBottom: Spacing.md,
  },

  // Ingredient rows
  ingredientRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    minHeight: 48,
  },
  ingredientLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    flex: 1,
  },
  ingredientName: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
  },
  missingName: {
    color: Colors.onSurfaceVariant,
  },
  ingredientAmount: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.semiBold,
    color: Colors.onSurfaceVariant,
  },
  ingredientAmountMissing: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
    marginRight: Spacing.sm,
  },
  missingDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.errorContainer,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  actionChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.sm,
  },
  buyChip: {
    backgroundColor: Colors.surfaceContainerHigh,
  },
  buyChipText: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.bold,
    color: Colors.onSurfaceVariant,
  },
  addChip: {
    backgroundColor: Colors.secondaryContainer,
  },
  addChipText: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.bold,
    color: Colors.onSecondaryContainer,
  },

  // Steps (timeline)
  stepRow: {
    flexDirection: "row",
    gap: Spacing.base,
  },
  stepTimeline: {
    alignItems: "center",
    width: 40,
  },
  stepCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumber: {
    fontSize: FontSize.labelMd,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  stepLine: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.surfaceContainerHighest,
    marginVertical: Spacing.xs,
  },
  stepContent: {
    flex: 1,
    paddingBottom: Spacing.xl,
  },
  stepText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
    lineHeight: 24,
  },
  timerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: Spacing.sm,
    backgroundColor: Colors.surfaceContainerLow,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    alignSelf: "flex-start",
  },
  timerText: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.semiBold,
    color: Colors.primary,
  },

  // Bottom CTA
  bottomCta: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    alignItems: "center",
    backgroundColor: Colors.glassBackground,
    ...Shadows.ambient,
  },
  ctaButton: {
    width: "100%",
    backgroundColor: Colors.primary,
    borderRadius: Radius.xl,
    paddingVertical: Spacing.base,
    alignItems: "center",
    justifyContent: "center",
    ...Shadows.fab,
  },
  ctaText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onPrimary,
  },
  shortcutBtn: {
    alignItems: "center",
    paddingVertical: Spacing.xs,
    marginTop: Spacing.sm,
  },
  shortcutText: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
    textDecorationLine: "underline",
  },

  // Add-to-fridge modal
  modalContainer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(25, 28, 29, 0.40)",
  },
  modalSheet: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Spacing.xl,
    maxHeight: "80%",
    ...Shadows.ambient,
  },
  modalHandle: {
    alignItems: "center",
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  modalHandleBar: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceContainerHighest,
  },
  modalScroll: {
    flexGrow: 0,
  },
  modalActions: {
    flexDirection: "row",
    gap: Spacing.md,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.sm,
  },
  modalCancelBtn: {
    height: 52,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.xl,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.bold,
    color: Colors.onSurfaceVariant,
  },
  modalConfirmBtn: {
    flex: 1,
    height: 52,
    borderRadius: Radius.xl,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...Shadows.fab,
  },
  modalConfirmText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.bold,
    color: Colors.onPrimary,
  },
});
