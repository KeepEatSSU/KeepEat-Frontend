import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Linking,
  Modal,
  Animated,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  Glass,
  GlassAction,
  Radius,
  Shadows,
  LetterSpacing,
} from "@/constants/theme";
import type {
  IngredientDraft,
  ReactionType,
} from "@/constants/domain";
import {
  addToMyRecipes,
  deleteMyRecipes,
  getRecipeDetail,
  mapDifficulty,
  toggleReaction,
  type RecipeDetailDto,
  type RecipeIngredientDto,
} from "@/services/recipes";
import { getErrorMessage } from "@/services/api";
import { formatAmount } from "@/utils/recipeServings";
import {
  createIngredients,
  getOwnedIngredientsByRecipe,
  mapIngredientToCreateRequest,
} from "@/services/userIngredients";
import { useIngredientMaster } from "@/context/IngredientMasterContext";
import { IngredientEditCard } from "@/components/IngredientEditCard";
import { ConfirmModal } from "@/components/ConfirmModal";
import { BottomGlassActions } from "@/components/BottomGlassActions";
import { useToast } from "@/components/Toast";
import { ErrorScreen } from "@/components/ErrorScreen";

export interface MappedRecipeDetail
  extends Omit<RecipeDetailDto, "difficulty"> {
  name: string;
  /** mapDifficulty 결과 — DTO의 "상/중/하" union을 사람이 읽는 라벨로 변환. */
  difficulty: string;
  ingredients: RecipeIngredientDto[];
  steps: string[];
  time: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// parseAmount / formatAmount는 utils/recipeServings.ts로 옮겨 cooking-ready와
// 공유. recipe-detail 단독으로 쓰던 시절의 인라인 정의에서 옮긴 것일 뿐
// 동작은 동일.

// Reaction toggle semantics (same as explore.tsx's card-level helper):
//   current === type → clear  (count-1)
//   current === null → add    (count+1)
//   current ≠ type   → swap   (other-1, this+1)
// Operates on whatever shape carries { myReaction, likeCount, dislikeCount }.
function applyReaction<
  T extends {
    myReaction: ReactionType | null;
    likeCount: number;
    dislikeCount: number;
  },
>(item: T, type: ReactionType): T {
  const cur = item.myReaction;
  let { likeCount, dislikeCount } = item;
  let next: ReactionType | null;

  if (cur === type) {
    next = null;
    if (type === "LIKE") likeCount -= 1;
    else dislikeCount -= 1;
  } else if (cur === null) {
    next = type;
    if (type === "LIKE") likeCount += 1;
    else dislikeCount += 1;
  } else {
    next = type;
    if (type === "LIKE") {
      likeCount += 1;
      dislikeCount = Math.max(0, dislikeCount - 1);
    } else {
      dislikeCount += 1;
      likeCount = Math.max(0, likeCount - 1);
    }
  }

  return { ...item, myReaction: next, likeCount, dislikeCount };
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
  item: RecipeIngredientDto;
  portions: number;
}) {
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
        {formatAmount(item.amount, portions)}
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
  item: RecipeIngredientDto;
  portions: number;
  onAddToFridge: () => void;
}) {
  const handleBuy = () => {
    const url = `https://m.coupang.com/nm/search?q=${encodeURIComponent(item.name)}`;
    Linking.openURL(url);
  };

  // PENDING ingredients are still being onboarded server-side; hide the
  // "추가" affordance entirely so the user can't try to register a row
  // that the backend will reject. The row otherwise renders identically
  // to ACTIVE missing items — no inline badge.
  const isPending = item.status === "PENDING";

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
          {formatAmount(item.amount, portions)}
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
        {!isPending && (
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
        )}
      </View>
    </View>
  );
}

/* ── Step Row ── */

function StepRow({
  order,
  instruction,
  isLast,
}: {
  order: number;
  instruction: string;
  isLast: boolean;
}) {
  // Simplistic timer extraction for demo, real implementation uses useTimer hook in cooking-step
  const timeMatch = instruction.match(/(\d+)(분|초)/);
  let timerSeconds: number | undefined;
  
  if (timeMatch) {
    const val = parseInt(timeMatch[1], 10);
    timerSeconds = timeMatch[2] === "분" ? val * 60 : val;
  }

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
  const { snapshot } = useIngredientMaster();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [recipe, setRecipe] = useState<MappedRecipeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);

  useEffect(() => {
    const fetchRecipeDetail = async () => {
      if (!id) return;
      setIsLoading(true);
      setIsError(false);
      try {
        const recipeId = Number(id);
        // Fetch detail + owned-match in parallel. The owned-match endpoint
        // is the authoritative source for the 보유 X/Y count; if it fails
        // we silently fall back to the DTO's per-ingredient `isOwned`.
        const [data, ownedItems] = await Promise.all([
          getRecipeDetail(recipeId),
          getOwnedIngredientsByRecipe(recipeId).catch(() => null),
        ]);

        const ownedSet =
          ownedItems !== null
            ? new Set(ownedItems.map((o) => o.name))
            : null;

        const mappedIngredients = (data.requiredIngredients || []).map(
          (ing) =>
            ownedSet !== null
              ? { ...ing, isOwned: ownedSet.has(ing.name) }
              : ing,
        );

        const mappedRecipe: MappedRecipeDetail = {
          ...data,
          name: data.recipeName,
          ingredients: mappedIngredients,
          steps: data.instructions || [],
          difficulty: mapDifficulty(data.difficulty),
          time: data.cookingTime || "15분",
        };
        setRecipe(mappedRecipe);
      } catch (error) {
        // toast는 폴백 카피, ErrorScreen에 동일 메시지를 헬퍼로 한 번 더 노출.
        showToast(getErrorMessage(error, "레시피 정보를 불러오지 못했어요."));
        setIsError(true);
        setLoadError(error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRecipeDetail();
  }, [id, showToast]);

  const [portions, setPortions] = useState(1);
  // True while the "내 레시피에 추가" PATCH is in-flight — gates the button
  // and shows an ActivityIndicator so the user can't double-tap.
  const [isAddingToMyRecipes, setIsAddingToMyRecipes] = useState(false);
  // Unregister (내 레시피에서 해제) flow — confirm modal + in-flight gate.
  const [unregisterModalVisible, setUnregisterModalVisible] = useState(false);
  const [unregistering, setUnregistering] = useState(false);

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
    // Best-effort master link: if the recipe ingredient name matches a row
    // in the catalog, register the new fridge entry as that master so it
    // gets an icon + storage defaults + appears under the right category.
    // No match → falls through as a custom ("내 재료") item.
    const masterId = snapshot?.byName.get(ingredientName)?.id;
    setDraftItem({
      id: String(Date.now()),
      name: ingredientName,
      nickname: masterId != null ? "" : ingredientName,
      ingredientId: masterId,
      isCustom: masterId == null,
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

  const handleAddToFridge = async () => {
    try {
      const req = mapIngredientToCreateRequest(draftItem);
      await createIngredients([req]);
      closeAddModal(() =>
        showToast(`${draftItem.name}을(를) 냉장고에 추가했어요`),
      );
    } catch (e) {
      showToast(getErrorMessage(e, "냉장고 추가에 실패했어요"));
    }
  };

  // Optimistic like/dislike with rollback. Snapshot the current recipe so a
  // failed PATCH restores the exact pre-tap state — same pattern as the
  // explore tab's card-level handler.
  const handleReact = async (type: ReactionType) => {
    if (!recipe) return;
    const original = recipe;
    setRecipe((prev) => (prev ? applyReaction(prev, type) : prev));
    try {
      await toggleReaction(recipe.recipeId, type);
    } catch (e) {
      setRecipe(original);
      showToast(getErrorMessage(e, "반응 처리에 실패했어요"));
    }
  };

  const handleAddToMyRecipes = async () => {
    if (!recipe || isAddingToMyRecipes) return;
    setIsAddingToMyRecipes(true);
    try {
      await addToMyRecipes([recipe.recipeId]);
      // Flip the flag in-place so the CTA switches over to the cooking
      // buttons without a refetch round-trip.
      setRecipe((prev) =>
        prev ? { ...prev, isRegisteredMyRecipe: true } : prev,
      );
      showToast("내 레시피에 추가되었어요");
    } catch (e) {
      showToast(getErrorMessage(e, "내 레시피 추가에 실패했어요"));
    } finally {
      setIsAddingToMyRecipes(false);
    }
  };

  const handleUnregister = async () => {
    if (!recipe || unregistering) return;
    setUnregistering(true);
    try {
      await deleteMyRecipes([recipe.recipeId]);
      // Flip the flag inline → CTA reverts to "내 레시피에 추가". The
      // recipe row itself stays on screen; user can re-add anytime.
      setRecipe((prev) =>
        prev ? { ...prev, isRegisteredMyRecipe: false } : prev,
      );
      setUnregisterModalVisible(false);
      showToast("내 레시피에서 제거되었어요");
    } catch (e) {
      showToast(getErrorMessage(e, "제거에 실패했어요"));
    } finally {
      setUnregistering(false);
    }
  };

  if (isError) {
    return (
      <ErrorScreen
        message={getErrorMessage(loadError, "레시피 정보를 불러오지 못했어요")}
        subMessage="일시적인 오류일 수 있으니 잠시 후 다시 시도해주세요."
        buttonLabel="이전으로 돌아가기"
        onPressHome={() => router.back()}
      />
    );
  }

  if (isLoading || !recipe) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const owned = (recipe?.ingredients || []).filter((i) => i.isOwned !== false); // Default to owned if undefined
  const missing = (recipe?.ingredients || []).filter((i) => i.isOwned === false);

  const totalIngredients = (recipe?.ingredients || []).length;
  const matchCount = owned.length;

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
        {/* Right slot — when this recipe is already in 내 레시피, surface
            a trash affordance so the user can remove it without going to
            the recipe tab. Otherwise an empty same-size spacer keeps the
            back button visually centered against the screen. */}
        {recipe.isRegisteredMyRecipe ? (
          <Pressable
            onPress={() => setUnregisterModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="내 레시피에서 제거"
            style={({ pressed }) => [
              styles.headerBtn,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Ionicons
              name="trash-outline"
              size={22}
              color={Colors.onSurfaceVariant}
            />
          </Pressable>
        ) : (
          <View style={styles.headerBtn} />
        )}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Hero ── */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>{recipe.name}</Text>
        </View>

        {/* ── Meta Chips ──
            Calories chip only renders when the DTO has a real positive
            value; the previous "적당량 kcal" placeholder was a hardcoded
            string that survived even when the field was a number. */}
        <View style={styles.metaRow}>
          <View style={styles.metaChip}>
            <Ionicons name="nutrition-outline" size={15} color={Colors.primary} />
            <Text style={styles.metaChipHighlight}>
              {matchCount}/{totalIngredients}
            </Text>
            <Text style={styles.metaChipLabel}>보유</Text>
          </View>
          {recipe.calories > 0 && (
            <View style={styles.metaChip}>
              <Ionicons name="flame-outline" size={15} color={Colors.outline} />
              <Text style={styles.metaChipText}>{recipe.calories}kcal</Text>
            </View>
          )}
          <View style={styles.metaChip}>
            <Ionicons name="speedometer-outline" size={15} color={Colors.outline} />
            <Text style={styles.metaChipText}>{recipe.difficulty}</Text>
          </View>
          <View style={styles.metaChip}>
            <Ionicons name="time-outline" size={15} color={Colors.outline} />
            <Text style={styles.metaChipText}>{recipe.time}</Text>
          </View>
        </View>

        {/* ── Reactions ── */}
        <View style={styles.reactionRow}>
          <Pressable
            onPress={() => handleReact("LIKE")}
            hitSlop={8}
            style={({ pressed }) => [
              styles.reactionBtn,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Ionicons
              name={recipe.myReaction === "LIKE" ? "heart" : "heart-outline"}
              size={24}
              color={
                recipe.myReaction === "LIKE"
                  ? Colors.primary
                  : Colors.onSurfaceVariant
              }
            />
            <Text
              style={[
                styles.reactionCount,
                recipe.myReaction === "LIKE" && styles.reactionCountActive,
              ]}
            >
              {recipe.likeCount ?? 0}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => handleReact("DISLIKE")}
            hitSlop={8}
            style={({ pressed }) => [
              styles.reactionBtn,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Ionicons
              name={
                recipe.myReaction === "DISLIKE"
                  ? "thumbs-down"
                  : "thumbs-down-outline"
              }
              size={24}
              color={
                recipe.myReaction === "DISLIKE"
                  ? Colors.error
                  : Colors.onSurfaceVariant
              }
            />
            <Text
              style={[
                styles.reactionCount,
                recipe.myReaction === "DISLIKE" &&
                  styles.reactionCountDislike,
              ]}
            >
              {recipe.dislikeCount ?? 0}
            </Text>
          </Pressable>
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
              key={idx}
              order={idx + 1}
              instruction={step}
              isLast={idx === recipe.steps.length - 1}
            />
          ))}
        </View>
      </ScrollView>

      {/* ── Bottom CTA ──
          Two modes:
          • Not yet in 내 레시피  → single "내 레시피에 추가" button.
          • Already in 내 레시피 → original cooking-flow buttons. Cooking
            entry is gated behind ownership so the user always has a
            persisted recipe row to attribute the cook to. */}
      <BottomGlassActions
        secondaryAction={
          recipe.isRegisteredMyRecipe ? (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/cooking-complete",
                  params: { id: recipe.recipeId },
                } as never)
              }
              style={({ pressed }) => [
                styles.shortcutBtn,
                pressed && { opacity: 0.5 },
              ]}
            >
              <Text style={styles.shortcutText}>바로 완성하기</Text>
            </Pressable>
          ) : undefined
        }
      >
        {!recipe.isRegisteredMyRecipe ? (
          <Pressable
            onPress={handleAddToMyRecipes}
            disabled={isAddingToMyRecipes}
            style={({ pressed }) => [
              styles.ctaButton,
              isAddingToMyRecipes && styles.ctaButtonDisabled,
              pressed &&
                !isAddingToMyRecipes && {
                  opacity: 0.85,
                  transform: [{ scale: 0.98 }],
                },
            ]}
          >
            {isAddingToMyRecipes ? (
              <ActivityIndicator color={Colors.onPrimary} />
            ) : (
              <Text style={styles.ctaText}>내 레시피에 추가</Text>
            )}
          </Pressable>
        ) : (
          <>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/cooking-ready",
                  // 현재 인분을 cooking-ready에 전달 — 그 화면이 같은 스케일링
                  // 헬퍼로 재료를 다시 곱셈해 같은 표시값을 이어간다.
                  params: {
                    id: recipe.recipeId,
                    servings: String(portions),
                  },
                } as never)
              }
              style={({ pressed }) => [
                styles.ctaButton,
                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Text style={styles.ctaText}>요리 시작하기</Text>
            </Pressable>
          </>
        )}
      </BottomGlassActions>

      {/* ── Unregister Confirm ── */}
      <ConfirmModal
        visible={unregisterModalVisible}
        title="내 레시피에서 제거"
        subtitle={"이 레시피를 내 레시피에서\n제거할까요?"}
        confirmLabel="제거하기"
        cancelLabel="취소"
        destructive
        onConfirm={handleUnregister}
        onCancel={() =>
          !unregistering && setUnregisterModalVisible(false)
        }
      />

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
  centered: {
    justifyContent: "center",
    alignItems: "center",
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
    // bottomCta는 glass overlay라 마지막 조리 순서가 버튼 뒤에 과하게
    // 가려지지 않도록 보호 여백을 둔다.
    paddingBottom: 128,
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

  // Reactions — centered + emphasized as a hero affordance under the meta
  // row. Buttons get generous padding so the touch target reads loud and
  // the inactive glyphs use onSurfaceVariant (heavier than outline) for a
  // more present resting state.
  reactionRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 28,
    marginBottom: Spacing.xl,
  },
  reactionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  reactionCount: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
  },
  reactionCountActive: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  reactionCountDislike: {
    color: Colors.error,
    fontWeight: FontWeight.bold,
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
  ctaButton: {
    width: "100%",
    height: Glass.bottomBarActionHeight,
    backgroundColor: GlassAction.primaryBackground,
    borderRadius: Radius.xl,
    alignItems: "center",
    justifyContent: "center",
    ...GlassAction.topHighlight,
    ...GlassAction.elevated,
  },
  ctaButtonDisabled: {
    backgroundColor: Colors.surfaceContainerHigh,
  },
  ctaText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onPrimary,
  },
  shortcutBtn: {
    minHeight: Glass.bottomBarSecondaryActionMinHeight,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.base,
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
