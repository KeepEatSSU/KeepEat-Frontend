import { useState, useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Platform,
  StyleSheet,
  Dimensions,
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
  Radius,
  Shadows,
  LetterSpacing,
} from "@/constants/theme";
import type { RecipeIngredient } from "@/constants/domain";
import { MOCK_RECIPE_DETAILS } from "@/mocks";
import { useToast } from "@/components/Toast";

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CookingCompleteScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();

  const recipe = useMemo(
    () => MOCK_RECIPE_DETAILS.find((r) => r.id === id) ?? MOCK_RECIPE_DETAILS[0],
    [id],
  );

  // Only show owned ingredients (user actually had them)
  const ingredients = recipe.ingredients.filter((i) => i.isOwned !== false);

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiRef = useRef<ConfettiCannon>(null);

  const toggleItem = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleComplete = () => {
    // Fire confetti
    setShowConfetti(true);
    confettiRef.current?.start();

    // TODO: delete selected ingredients from fridge state/DB
    const deletedNames = Array.from(selected);
    console.log("Deleting from fridge:", deletedNames);

    // Delayed navigation to home
    setTimeout(() => {
      showToast("맛있는 식사 되세요!");
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: "(tabs)" }],
        }),
      );
    }, 1800);
  };

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
          <Text style={styles.heroSubtitle}>
            {recipe.title} 완성입니다
          </Text>
        </View>

        {/* ── Section Label ── */}
        <Text style={styles.sectionLabel}>
          냉장고에서 이제 지워야 할 재료가 있나요?
        </Text>
        <Text style={styles.sectionHint}>
          선택한 재료는 냉장고에서 비워집니다
        </Text>

        {/* ── Toggle Cards ── */}
        <View style={styles.cardList}>
          {ingredients.map((item) => {
            const isSelected = selected.has(item.name);
            return (
              <Pressable
                key={item.name}
                onPress={() => toggleItem(item.name)}
                style={[
                  styles.toggleCard,
                  isSelected && styles.toggleCardSelected,
                ]}
              >
                <View style={styles.toggleLeft}>
                  <Ionicons
                    name={isSelected ? "trash" : "ellipse-outline"}
                    size={20}
                    color={
                      isSelected ? Colors.primary : Colors.outlineVariant
                    }
                  />
                  <Text
                    style={[
                      styles.toggleName,
                      isSelected && styles.toggleNameSelected,
                    ]}
                  >
                    {item.name}
                  </Text>
                </View>
                {isSelected && (
                  <Ionicons
                    name="checkmark"
                    size={20}
                    color={Colors.primary}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* ── Bottom CTA ── */}
      <View
        style={[
          styles.bottomArea,
          { paddingBottom: Math.max(insets.bottom, 12) },
        ]}
      >
        <Pressable
          onPress={handleComplete}
          style={({ pressed }) => [
            styles.ctaButton,
            pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
          ]}
        >
          <Text style={styles.ctaText}>
            {selected.size > 0
              ? `선택한 ${selected.size}개 비우고 식사하러 가기`
              : `비울 재료 없이 식사하러 가기`}
          </Text>
        </Pressable>
      </View>

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
    paddingBottom: 120,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.xl,
    minHeight: 56,
    ...Platform.select({
      ios: {
        backgroundColor: "rgba(255,255,255,0.70)",
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
    ...Platform.select({
      ios: {
        backgroundColor: "rgba(181, 241, 192, 0.35)",
      },
      android: {
        backgroundColor: "#E8F5E9",
      },
    }),
  },
  toggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  toggleName: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
  },
  toggleNameSelected: {
    fontWeight: FontWeight.semiBold,
    color: Colors.onSurface,
  },

  // Bottom CTA
  bottomArea: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
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
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
  },
  ctaButton: {
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
});
