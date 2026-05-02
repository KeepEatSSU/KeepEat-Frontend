import { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
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
import { RECIPE_FILTERS } from "@/constants/filters";
import type { Recipe } from "@/constants/domain";
import { MOCK_RECIPES } from "@/mocks";
import { useRecipeRecommendation } from "@/context/RecipeRecommendationContext";
import { useToast } from "@/components/Toast";

// ─── Recipe Card ──────────────────────────────────────────────────────────────

function RecipeCard({ item }: { item: Recipe }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: "/recipe-detail", params: { id: item.id } } as never)
      }
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.cardTopRow}>
        <Text style={styles.cardTitle} numberOfLines={2} ellipsizeMode="tail">
          {item.title}
        </Text>
        <Text style={styles.matchText}>
          <Text style={styles.matchHighlight}>{item.matchCount}</Text>
          /{item.totalCount}개 보유
        </Text>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ionicons name="speedometer-outline" size={14} color={Colors.outline} />
          <Text style={styles.metaText}>{item.difficulty}</Text>
        </View>
        <View style={styles.metaDot} />
        <View style={styles.metaItem}>
          <Ionicons name="time-outline" size={14} color={Colors.outline} />
          <Text style={styles.metaText}>{item.time}</Text>
        </View>
        <View style={styles.metaDot} />
        <View style={styles.metaItem}>
          <Ionicons name="flame-outline" size={14} color={Colors.outline} />
          <Text style={styles.metaText}>{item.kcal}</Text>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RecipeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showToast, showNotification } = useToast();
  const { status, requestRecommendation, markSwiping, onComplete } =
    useRecipeRecommendation();

  // Register in-app notification when recommendation completes
  useEffect(() => {
    onComplete(() => {
      showNotification("AI 셰프가 레시피를 완성했어요!", () => {
        markSwiping();
        router.push("/recipe-swipe" as never);
      });
    });
    return () => onComplete(null);
  }, [onComplete, showNotification, markSwiping, router]);
  const [selectedChip, setSelectedChip] = useState(RECIPE_FILTERS[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const hasRecipes = MOCK_RECIPES.length > 0;

  const handleRecommendPress = () => {
    if (status === "idle" || status === "error") {
      requestRecommendation();
      showToast(
        "레시피 생성에 최대 2분이 소요됩니다. 완료되면 알려드릴게요!",
      );
    } else if (status === "ready") {
      markSwiping();
      router.push("/recipe-swipe" as never);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* ── Header (matches fridge tab) ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons
            name="leaf"
            size={20}
            color={Colors.primaryContainer}
            style={{ marginRight: 6 }}
          />
          <Text style={styles.appTitle}>KeepEat</Text>
        </View>
        <View style={styles.avatar}>
          <Ionicons name="person" size={16} color={Colors.onSurfaceVariant} />
        </View>
      </View>

      {/* ── Search Bar ── */}
      <View style={styles.searchBarWrap}>
        <View style={styles.searchBar}>
          <Ionicons
            name="search"
            size={18}
            color={Colors.onSurfaceVariant}
            style={{ marginRight: Spacing.sm }}
          />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="레시피 검색..."
            placeholderTextColor={Colors.outline}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons
                name="close-circle"
                size={18}
                color={Colors.onSurfaceVariant}
              />
            </Pressable>
          )}
        </View>
      </View>

      {/* ── Keyword Chips ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContent}
        style={styles.chipsScroll}
      >
        {RECIPE_FILTERS.map((chip) => {
          const isSelected = selectedChip === chip;
          return (
            <Pressable
              key={chip}
              onPress={() => setSelectedChip(chip)}
              style={[styles.chip, isSelected && styles.chipSelected]}
            >
              <Text
                style={[styles.chipText, isSelected && styles.chipTextSelected]}
              >
                {chip}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Recommend Button (always visible) ── */}
      <View style={styles.recommendRow}>
        <Pressable
          onPress={handleRecommendPress}
          disabled={status === "loading" || status === "swiping"}
          style={({ pressed }) => [
            styles.recommendBtn,
            status === "loading" && styles.recommendBtnLoading,
            status === "ready" && styles.recommendBtnReady,
            status !== "loading" &&
              status !== "swiping" &&
              pressed &&
              styles.recommendBtnPressed,
          ]}
        >
          {status === "loading" ? (
            <>
              <ActivityIndicator size={16} color={Colors.primary} />
              <Text style={styles.recommendTextLoading}>
                AI 셰프가 요리 중...
              </Text>
            </>
          ) : status === "ready" ? (
            <>
              <Ionicons
                name="sparkles"
                size={18}
                color={Colors.onPrimary}
              />
              <Text style={styles.recommendText}>
                눌러서 레시피 확인하기
              </Text>
            </>
          ) : (
            <>
              <Ionicons
                name="sparkles"
                size={18}
                color={Colors.onPrimary}
              />
              <Text style={styles.recommendText}>레시피 추천</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* ── Content ── */}
      {hasRecipes ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
        >
          {MOCK_RECIPES.map((recipe) => (
            <RecipeCard key={recipe.id} item={recipe} />
          ))}
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons
            name="restaurant-outline"
            size={48}
            color={Colors.outlineVariant}
          />
          <Text style={styles.emptyText}>
            위에 레시피 추천을{"\n"}눌러서 시작해 보세요!
          </Text>
        </View>
      )}
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
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  appTitle: {
    fontSize: FontSize.titleLg,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    letterSpacing: LetterSpacing.tight,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },

  // Search Bar
  searchBarWrap: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
    padding: 0,
    margin: 0,
  },

  // Keyword Chips
  chipsScroll: {
    flexGrow: 0,
    height: 52,
    marginBottom: Spacing.xs,
  },
  chipsContent: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
    alignItems: "center",
  },
  chip: {
    height: 36,
    paddingHorizontal: Spacing.base,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.md,
  },
  chipSelected: {
    backgroundColor: Colors.primary,
  },
  chipText: {
    fontSize: FontSize.bodySm,
    lineHeight: 20,
    fontWeight: FontWeight.semiBold,
    color: Colors.onSurfaceVariant,
  },
  chipTextSelected: {
    color: Colors.onPrimary,
  },

  // List
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 120,
    gap: Spacing.base,
  },

  // Inline recommend button
  recommendRow: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  recommendBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    ...Shadows.fab,
  },
  recommendBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.95 }],
  },
  recommendBtnLoading: {
    backgroundColor: Colors.surfaceContainerHigh,
  },
  recommendBtnReady: {
    backgroundColor: Colors.primaryContainer,
  },
  recommendText: {
    fontSize: FontSize.titleSm,
    fontWeight: FontWeight.bold,
    color: Colors.onPrimary,
    letterSpacing: LetterSpacing.tight,
  },
  recommendTextLoading: {
    fontSize: FontSize.titleSm,
    fontWeight: FontWeight.bold,
    color: Colors.onSurfaceVariant,
    letterSpacing: LetterSpacing.tight,
  },

  // Recipe Card
  card: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  cardPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.985 }],
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardTitle: {
    flex: 1,
    marginRight: Spacing.md,
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
    letterSpacing: LetterSpacing.tight,
  },
  matchText: {
    flexShrink: 0,
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
  },
  matchHighlight: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.extraBold,
    color: Colors.primaryContainer,
  },

  // Meta row
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.outlineVariant,
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.base,
    paddingBottom: 80,
  },
  emptyText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
    textAlign: "center",
    lineHeight: 22,
  },
});
