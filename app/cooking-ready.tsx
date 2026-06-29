import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
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
  LetterSpacing,
} from "@/constants/theme";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ErrorScreen } from "@/components/ErrorScreen";
import { GlassBottomBar } from "@/components/GlassBottomBar";
import { getRecipeDetail, type RecipeDetailDto } from "@/services/recipes";
import { getErrorMessage } from "@/services/api";
import { formatAmount } from "@/utils/recipeServings";
import { getOwnedIngredientsByRecipe } from "@/services/userIngredients";

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CookingReadyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, servings } = useLocalSearchParams<{
    id: string;
    servings?: string;
  }>();
  const recipeId = Number(id);
  // 상세창에서 조절한 인분을 그대로 이어받음. 누락/invalid면 1.
  // useState 초기화에만 쓰여 mount 이후 prop 변화는 무시 (의도된 동작 —
  // 사용자가 이 화면 안에서 스테퍼로 자유 조절).
  const initialPortions = (() => {
    const n = Number(servings);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  })();

  const [recipe, setRecipe] = useState<RecipeDetailDto | null>(null);
  // Names from `/by-recipe` — authoritative source for the owned/missing
  // split, more reliable than the DTO's per-ingredient `isOwned` flag.
  const [ownedNames, setOwnedNames] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  // 서버 에러 객체 보관용. ErrorScreen 메시지에 getErrorMessage로 주입.
  // isError=true지만 loadError=null인 경우(예: invalid id)는 폴백만 표시.
  const [loadError, setLoadError] = useState<unknown>(null);

  const [portions, setPortions] = useState(initialPortions);
  const [exitModalVisible, setExitModalVisible] = useState(false);

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
        setRecipe(detail);
        setOwnedNames(new Set(owned.map((o) => o.name)));
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

  const { owned, missing } = useMemo(() => {
    if (!recipe) return { owned: [], missing: [] };
    const all = recipe.requiredIngredients ?? [];
    return {
      owned: all.filter((i) => ownedNames.has(i.name)),
      missing: all.filter((i) => !ownedNames.has(i.name)),
    };
  }, [recipe, ownedNames]);

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

  if (isLoading || !recipe) {
    return (
      <View
        style={[
          styles.screen,
          styles.centered,
          { paddingTop: insets.top },
        ]}
      >
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Background decorations */}
      <View style={styles.bgCircleTopRight} />
      <View style={styles.bgCircleBottomLeft} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable
          onPress={() => setExitModalVisible(true)}
          style={({ pressed }) => [
            styles.closeBtn,
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
            요리할 준비,{"\n"}되셨나요?
          </Text>
        </View>

        {/* ── Glass Card: Ingredient Checklist ── */}
        <View style={styles.glassCard}>
          {/* Card header: title + mini portions selector */}
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>재료 체크리스트</Text>
            <Pressable
              onPress={() => setPortions((p) => (p >= 4 ? 1 : p + 1))}
              style={({ pressed }) => [
                styles.portionChip,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.portionChipText}>{portions}인분</Text>
              <Ionicons
                name="chevron-down"
                size={12}
                color={Colors.primary}
              />
            </Pressable>
          </View>

          {/* Owned/missing 모두 recipe-detail과 동일한 formatAmount로 인분
              스케일링. "적당량" 같은 비수치 표기는 헬퍼가 원문 유지. */}
          {owned.map((item) => (
            <View key={item.name} style={styles.checkRow}>
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={Colors.primaryContainer}
              />
              <Text style={styles.checkName}>{item.name}</Text>
              <Text style={styles.checkQty}>
                {formatAmount(item.amount, portions)}
              </Text>
            </View>
          ))}

          {/* Missing ingredients — dimmed, no actions */}
          {missing.length > 0 && (
            <>
              <View style={styles.divider} />
              <Text style={styles.missingLabel}>없이 진행하는 재료</Text>
              {missing.map((item) => (
                <View key={item.name} style={styles.checkRow}>
                  <Ionicons
                    name="close-circle-outline"
                    size={20}
                    color={Colors.outlineVariant}
                  />
                  <Text style={styles.missingName}>{item.name}</Text>
                  <Text style={styles.missingQty}>
                    {formatAmount(item.amount, portions)}
                  </Text>
                </View>
              ))}
            </>
          )}
        </View>

        {/* Confirmation message */}
        <Text style={styles.confirmMessage}>
          재료를 모두 꺼냈다면{"\n"}요리를 시작할게요!
        </Text>
      </ScrollView>

      {/* ── Bottom CTA ── */}
      <GlassBottomBar
        contentStyle={styles.bottomArea}
        paddingBottomMin={Glass.bottomBarPaddingBottomMin}
      >
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/cooking-step",
              params: { id: String(recipeId) },
            } as never)
          }
          style={({ pressed }) => [
            styles.ctaButton,
            pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
          ]}
        >
          <Text style={styles.ctaText}>바로 요리하러 가기</Text>
          <Ionicons name="play" size={18} color={Colors.onPrimary} />
        </Pressable>
      </GlassBottomBar>

      {/* ── Exit Confirm Modal ── */}
      <ConfirmModal
        visible={exitModalVisible}
        title="요리 중단"
        subtitle="요리를 중단하고 나가시겠습니까?"
        confirmLabel="나가기"
        cancelLabel="계속하기"
        destructive
        onConfirm={() => {
          setExitModalVisible(false);
          router.back();
        }}
        onCancel={() => setExitModalVisible(false)}
      />
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
  bgCircleTopRight: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: "rgba(46, 204, 113, 0.08)",
  },
  bgCircleBottomLeft: {
    position: "absolute",
    bottom: -60,
    left: -60,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(181, 241, 192, 0.12)",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    height: 56,
    zIndex: 10,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.full,
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
    paddingBottom: 120,
    alignItems: "center",
  },

  // Hero
  hero: {
    marginTop: Spacing.xxl,
    marginBottom: Spacing.xxl,
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: FontWeight.extraBold,
    color: Colors.onSurface,
    textAlign: "center",
    letterSpacing: LetterSpacing.tight,
    lineHeight: 44,
  },

  // Glass card
  glassCard: {
    width: "100%",
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    marginBottom: Spacing.xxl,
    ...Platform.select({
      ios: {
        backgroundColor: "rgba(255, 255, 255, 0.80)",
        shadowColor: "#191C1D",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        backgroundColor: "#FFFFFF",
        elevation: 3,
      },
    }),
  },

  // Card header with mini portions
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  cardTitle: {
    fontSize: FontSize.titleSm,
    fontWeight: FontWeight.bold,
    color: Colors.onSurfaceVariant,
    letterSpacing: LetterSpacing.wide,
    textTransform: "uppercase",
  },
  portionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.surfaceContainerLow,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 1,
    borderRadius: Radius.full,
  },
  portionChipText: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },

  // Checklist rows
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  checkName: {
    flex: 1,
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.semiBold,
    color: Colors.onSurface,
  },
  checkQty: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
  },

  // Divider (tonal)
  divider: {
    height: 1,
    backgroundColor: "rgba(187, 203, 187, 0.20)",
    marginVertical: Spacing.md,
  },

  // Missing section
  missingLabel: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.semiBold,
    color: Colors.outline,
    marginBottom: Spacing.sm,
  },
  missingName: {
    flex: 1,
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.medium,
    color: Colors.outlineVariant,
    textDecorationLine: "line-through",
  },
  missingQty: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.medium,
    color: Colors.outlineVariant,
  },

  // Confirmation
  confirmMessage: {
    fontSize: FontSize.titleLg,
    fontWeight: FontWeight.semiBold,
    color: Colors.onSecondaryContainer,
    textAlign: "center",
    lineHeight: 28,
  },

  // Bottom CTA
  bottomArea: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Glass.bottomBarContentPaddingTop,
  },
  // cooking-step의 navBtnPrimary와 통일 — gradient/큰 텍스트로 인한 시각적
  // 과중을 덜고 두 화면이 같은 톤의 primary CTA를 갖도록. "시작" 강조는
  // play 아이콘으로 유지.
  ctaButton: {
    height: Glass.bottomBarActionHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    borderRadius: Radius.xl,
    backgroundColor: GlassAction.primaryBackground,
    ...GlassAction.topHighlight,
    ...GlassAction.elevated,
  },
  ctaText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onPrimary,
  },
});
