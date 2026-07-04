import { useState, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CommonActions, useNavigation } from "@react-navigation/native";
import ConfettiCannon from "react-native-confetti-cannon";
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  Glass,
  GlassAction,
  Radius,
  LetterSpacing,
} from "@/constants/theme";
import { ErrorScreen } from "@/components/ErrorScreen";
import { GlassBottomBar } from "@/components/GlassBottomBar";
import { useToast } from "@/components/Toast";
import { getErrorMessage } from "@/services/api";
import { completeCooking, getRecipeDetail } from "@/services/recipes";
import {
  deleteUserIngredients,
  getOwnedIngredientsByRecipe,
  type OwnedRecipeIngredientDto,
} from "@/services/userIngredients";
import {
  formatDDay,
  formatKoreanShortDate,
  getDDayBadgeColor,
} from "@/utils/dateUtils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STORAGE_CHIP: Record<
  NonNullable<OwnedRecipeIngredientDto["storageType"]>,
  { bg: string; text: string; label: string }
> = {
  냉장: { bg: "#E8F5E9", text: "#166534", label: "냉장" },
  냉동: { bg: "#E0F2FE", text: "#0369A1", label: "냉동" },
  실온: { bg: "#F5F5F4", text: "#44403C", label: "실온" },
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CookingCompleteScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { showTopToast } = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipeId = Number(id);

  const [title, setTitle] = useState<string>("");
  const [ingredients, setIngredients] = useState<OwnedRecipeIngredientDto[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);

  // Selected keyed by user-ingredient id (not name) so the bulk delete call
  // can reference rows directly. Entries without a backend id are filtered
  // out at delete time — they can still be toggled visually.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiRef = useRef<ConfettiCannon>(null);

  useEffect(() => {
    if (!id || Number.isNaN(recipeId)) {
      setIsError(true);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [detail, owned] = await Promise.all([
          getRecipeDetail(recipeId),
          getOwnedIngredientsByRecipe(recipeId).catch(() => []),
        ]);
        if (cancelled) return;
        setTitle(detail.recipeName);
        setIngredients(owned);
        setIsError(false);
        setLoadError(null);
      } catch (e) {
        if (!cancelled) {
          setIsError(true);
          setLoadError(e);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, recipeId]);

  const toggleItem = (itemId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleComplete = async () => {
    if (submitting) return;
    setSubmitting(true);

    // Fire confetti immediately — visual reward before API resolves.
    setShowConfetti(true);
    confettiRef.current?.start();

    // 1) Record the cook (best-effort; failure surfaces a toast but doesn't
    //    block the rest of the flow).
    try {
      await completeCooking(recipeId);
    } catch (e) {
      showTopToast({
        message: getErrorMessage(e, "요리 기록 저장에 실패했어요"),
        variant: "error",
      });
    }

    // 2) Delete the selected fridge items. Skip silently when nothing was
    //    chosen so the user can finish without managing the fridge.
    const deleteIds = Array.from(selectedIds);
    if (deleteIds.length > 0) {
      try {
        await deleteUserIngredients(deleteIds);
      } catch (e) {
        showTopToast({
          message: getErrorMessage(e, "재료 삭제에 실패했어요"),
          variant: "error",
        });
      }
    }

    // 3) Tail-end UX: toast + reset to tabs.
    setTimeout(() => {
      showTopToast({ message: "맛있는 식사 되세요!", variant: "success" });
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: "(tabs)" }],
        }),
      );
    }, 1800);
  };

  if (isError) {
    return (
      <ErrorScreen
        message={getErrorMessage(loadError, "레시피 정보를 불러오지 못했어요")}
        subMessage="잠시 후 다시 시도해 주세요"
        buttonLabel="이전으로 돌아가기"
        onPressHome={() => router.back()}
      />
    );
  }

  if (isLoading) {
    return (
      <View
        style={[styles.screen, styles.centered, { paddingTop: insets.top }]}
      >
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

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
          <Ionicons name="close" size={24} color={Colors.primary} />
        </Pressable>
        <Text style={styles.logo}>KeepEat</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Hero ── */}
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>
            고생하셨어요!
          </Text>
          <Text style={styles.heroSubtitle}>{title} 완성입니다</Text>
        </View>

        {/* ── Section Label ── */}
        <Text style={styles.sectionLabel}>
          냉장고에서 이제 지워야 할 재료가 있나요?
        </Text>
        <Text style={styles.sectionHint}>
          선택한 재료는 냉장고에서 비워집니다
        </Text>

        {/* ── Toggle Cards ──
            Row 1: [check] [name] [customName?] [storage chip]
            Row 2: "M월 D일 구매 · X일 남음" (daysLeft ≤ 1 → red) */}
        <View style={styles.cardList}>
          {ingredients.map((item) => {
            const isSelected = selectedIds.has(item.id);
            const storageStyle = item.storageType
              ? STORAGE_CHIP[item.storageType]
              : null;
            const hasNickname =
              !!item.customName && item.customName !== item.name;
            const showDaysLeft = typeof item.daysLeft === "number";
            // 냉장고 탭과 동일한 D-N/D-Day/D+N 텍스트 + 4단계 status 색상.
            // formatDDay/getDDayBadgeColor는 utils/dateUtils.ts에서 공유.
            const dday = showDaysLeft
              ? formatDDay(item.daysLeft as number)
              : null;
            const ddayColor = dday ? getDDayBadgeColor(dday.status) : undefined;
            const purchaseText = item.purchaseDate
              ? `${formatKoreanShortDate(item.purchaseDate)} 구매`
              : "";

            return (
              <Pressable
                key={item.id}
                onPress={() => toggleItem(item.id)}
                style={[
                  styles.toggleCard,
                  isSelected && styles.toggleCardSelected,
                ]}
              >
                <View style={styles.toggleTopRow}>
                  <View
                    style={[
                      styles.checkCircle,
                      isSelected && styles.checkCircleActive,
                    ]}
                  >
                    {isSelected && (
                      <Ionicons
                        name="checkmark"
                        size={14}
                        color={Colors.onPrimary}
                      />
                    )}
                  </View>

                  <View style={styles.toggleNameWrap}>
                    <Text
                      style={[
                        styles.toggleName,
                        isSelected && styles.toggleNameSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    {hasNickname && (
                      <Text
                        style={styles.toggleNickname}
                        numberOfLines={1}
                      >
                        {item.customName}
                      </Text>
                    )}
                  </View>

                  {storageStyle && (
                    <View
                      style={[
                        styles.storageChip,
                        { backgroundColor: storageStyle.bg },
                      ]}
                    >
                      <Text
                        style={[
                          styles.storageChipText,
                          { color: storageStyle.text },
                        ]}
                      >
                        {storageStyle.label}
                      </Text>
                    </View>
                  )}
                </View>

                {(purchaseText || dday) && (
                  <Text style={styles.toggleMeta}>
                    {purchaseText}
                    {purchaseText && dday ? " · " : ""}
                    {dday && (
                      <Text style={[styles.toggleMeta, { color: ddayColor }]}>
                        {dday.text}
                      </Text>
                    )}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* ── Bottom CTA ── */}
      <GlassBottomBar
        contentStyle={styles.bottomArea}
        paddingBottomMin={Glass.bottomBarPaddingBottomMin}
      >
        <Pressable
          onPress={handleComplete}
          disabled={submitting}
          style={({ pressed }) => [
            styles.ctaButton,
            submitting && styles.ctaButtonDisabled,
            pressed &&
              !submitting && {
                opacity: 0.85,
                transform: [{ scale: 0.98 }],
              },
          ]}
        >
          {submitting ? (
            <ActivityIndicator color={Colors.onPrimary} />
          ) : (
            <Text style={styles.ctaText}>
              {selectedIds.size > 0
                ? `선택한 ${selectedIds.size}개 비우고 식사하러 가기`
                : `비울 재료 없이 식사하러 가기`}
            </Text>
          )}
        </Pressable>
      </GlassBottomBar>

      {/* ── Confetti ── */}
      {showConfetti && (
        <ConfettiCannon
          ref={confettiRef}
          count={120}
          origin={{
            x: Dimensions.get("window").width / 2,
            y: -20,
          }}
          autoStart
          fadeOut
          fallSpeed={2500}
          explosionSpeed={400}
          colors={[
            Colors.primaryContainer,
            Colors.secondaryContainer,
            "#FFD700",
            "#FF6B6B",
            "#4ECDC4",
          ]}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const COOKING_BG = "#F0FDF4";

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COOKING_BG,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    height: 56,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    fontSize: FontSize.titleLg,
    fontWeight: FontWeight.extraBold,
    color: "#166534",
    letterSpacing: LetterSpacing.tight,
  },

  // Scroll
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 112,
  },

  // Hero
  hero: {
    alignItems: "center",
    marginTop: Spacing.xxl + 8,
    marginBottom: Spacing.xxl,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: FontWeight.extraBold,
    color: Colors.onSurface,
    textAlign: "center",
    letterSpacing: LetterSpacing.tight,
    marginBottom: Spacing.sm,
  },
  heroSubtitle: {
    fontSize: FontSize.titleLg,
    fontWeight: FontWeight.medium,
    color: Colors.onSecondaryContainer,
    textAlign: "center",
  },

  // Section
  sectionLabel: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
    marginBottom: Spacing.xs,
  },
  sectionHint: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
    marginBottom: Spacing.lg,
  },

  // Toggle cards
  cardList: {
    gap: Spacing.sm,
  },
  toggleCard: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: "transparent",
    gap: 6,
    ...Platform.select({
      ios: {
        backgroundColor: "#FFFFFF",
        shadowColor: "#191C1D",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: {
        backgroundColor: "#FFFFFF",
        elevation: 1,
      },
    }),
  },
  toggleCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: "#E8F5E9",
  },
  toggleTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.outlineVariant,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  checkCircleActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  toggleNameWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    flexWrap: "wrap",
  },
  toggleName: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.semiBold,
    color: Colors.onSurface,
  },
  toggleNameSelected: {
    color: Colors.onSurface,
  },
  toggleNickname: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
    flexShrink: 1,
  },
  storageChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  storageChipText: {
    fontSize: 11,
    fontWeight: FontWeight.semiBold,
  },
  toggleMeta: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
    marginLeft: 22 + Spacing.md, // align under name (checkCircle + gap)
  },
  toggleMetaUrgent: {
    color: Colors.error,
    fontWeight: FontWeight.bold,
  },

  // Bottom CTA
  bottomArea: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Glass.bottomBarContentPaddingTop,
  },
  ctaButton: {
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
});
