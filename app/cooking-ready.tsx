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
import { LinearGradient } from "expo-linear-gradient";
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  Radius,
  Shadows,
  PrimaryGradient,
  LetterSpacing,
} from "@/constants/theme";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ErrorScreen } from "@/components/ErrorScreen";
import { getRecipeDetail, type RecipeDetailDto } from "@/services/recipes";
import { getOwnedIngredientsByRecipe } from "@/services/userIngredients";

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CookingReadyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipeId = Number(id);

  const [recipe, setRecipe] = useState<RecipeDetailDto | null>(null);
  // Names from `/by-recipe` — authoritative source for the owned/missing
  // split, more reliable than the DTO's per-ingredient `isOwned` flag.
  const [ownedNames, setOwnedNames] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const [portions, setPortions] = useState(1);
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
      } catch {
        if (!cancelled) setIsError(true);
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
        message="레시피 정보를 불러오지 못했어요"
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

          {/* Owned ingredients — checklist style. The portion stepper still
              renders so the user can preview servings, but the amount text
              now shows the backend's display string verbatim (e.g. "200g")
              because amounts come as strings. Re-introducing portion
              scaling will move with the cooking-* rewrite that drops mocks. */}
          {owned.map((item) => (
            <View key={item.name} style={styles.checkRow}>
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={Colors.primaryContainer}
              />
              <Text style={styles.checkName}>{item.name}</Text>
              <Text style={styles.checkQty}>{item.amount}</Text>
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
                  <Text style={styles.missingQty}>{item.amount}</Text>
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
      <View
        style={[
          styles.bottomArea,
          { paddingBottom: Math.max(insets.bottom, 16) + 12 },
        ]}
      >
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/cooking-step",
              params: { id: String(recipeId) },
            } as never)
          }
          style={({ pressed }) => [
            pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
          ]}
        >
          <LinearGradient
            colors={PrimaryGradient.colors as unknown as string[]}
            start={PrimaryGradient.start}
            end={PrimaryGradient.end}
            style={styles.ctaGradient}
          >
            <Text style={styles.ctaText}>바로 요리하러 가기</Text>
            <Ionicons name="play-circle" size={22} color={Colors.onPrimary} />
          </LinearGradient>
        </Pressable>
      </View>

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
    paddingBottom: 140,
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
    paddingTop: Spacing.base,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    ...Platform.select({
      ios: {
        backgroundColor: "rgba(255,255,255,0.80)",
        shadowColor: "#191C1D",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        backgroundColor: "#FFFFFF",
        elevation: 3,
      },
    }),
  },
  ctaGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.lg,
    borderRadius: Radius.xl,
    ...Shadows.fab,
  },
  ctaText: {
    fontSize: FontSize.titleLg,
    fontWeight: FontWeight.bold,
    color: Colors.onPrimary,
    letterSpacing: LetterSpacing.tight,
  },
});
