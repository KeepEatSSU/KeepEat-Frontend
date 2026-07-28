import { ConfirmModal } from "@/components/ConfirmModal";
import { useToast } from "@/components/Toast";
import { type Recipe } from "@/constants/domain";
import {
  Colors,
  FontSize,
  FontWeight,
  LetterSpacing,
  Radius,
  Shadows,
  Spacing,
} from "@/constants/theme";
import { useRecipeRecommendation } from "@/context/RecipeRecommendationContext";
import { saveRecipes, type GeneratedRecipeDto } from "@/services/recipes";
import { getErrorMessage } from "@/services/api";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Dimensions,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.3;

// Card height bounds. Front face usually fits in the min; back face (cooking
// steps) grows naturally up to the max and then scrolls internally. The
// wrapper's animated height interpolates between the two measured faces so
// the flip transition doesn't pop.
const CARD_MIN_HEIGHT = SCREEN_HEIGHT * 0.5;
const CARD_MAX_HEIGHT = SCREEN_HEIGHT * 0.8;

// ─── Swipe Card ──────────────────────────────────────────────────────────────

function SwipeCard({
  recipe,
  onSwipeLeft,
  onSwipeRight,
}: {
  recipe: Recipe;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
}) {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const flipProgress = useSharedValue(0); // 0 = front, 1 = back

  // Measured natural height of each face. Both faces are absolute-positioned
  // (no `bottom`) so their onLayout reports content-driven height. The wrapper
  // then interpolates its own height between these two values as the card flips.
  const frontHeight = useSharedValue(0);
  const backHeight = useSharedValue(0);

  const onFrontLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const h = e.nativeEvent.layout.height;
      if (h > 0) frontHeight.value = h;
    },
    [frontHeight],
  );

  const onBackLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const h = e.nativeEvent.layout.height;
      // Clamp at measure time so internal scroll kicks in for very long step lists.
      if (h > 0) backHeight.value = Math.min(h, CARD_MAX_HEIGHT);
    },
    [backHeight],
  );

  const processSwipe = useCallback(
    (direction: "left" | "right") => {
      if (direction === "right") onSwipeRight();
      else onSwipeLeft();
    },
    [onSwipeLeft, onSwipeRight],
  );

  const toggleFlip = useCallback(() => {
    flipProgress.value = withTiming(flipProgress.value === 0 ? 1 : 0, {
      duration: 300,
      easing: Easing.out(Easing.cubic),
    });
  }, [flipProgress]);

  // activeOffsetX ensures short taps never activate Pan — the Tap gesture
  // wins for clicks, Pan takes over once horizontal motion exceeds 10px.
  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY * 0.3;
    })
    .onEnd((e) => {
      if (e.translationX > SWIPE_THRESHOLD) {
        translateX.value = withTiming(SCREEN_WIDTH + 100, { duration: 250 });
        runOnJS(processSwipe)("right");
      } else if (e.translationX < -SWIPE_THRESHOLD) {
        translateX.value = withTiming(-SCREEN_WIDTH - 100, { duration: 250 });
        runOnJS(processSwipe)("left");
      } else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const tapGesture = Gesture.Tap()
    .maxDuration(200)
    .onEnd(() => {
      runOnJS(toggleFlip)();
    });

  const combinedGesture = Gesture.Race(tapGesture, pan);

  const cardStyle = useAnimatedStyle(() => {
    const rotate = interpolate(
      translateX.value,
      [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
      [-15, 0, 15],
      Extrapolation.CLAMP,
    );
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  // Colored shadow glow — direction-tinted halo during drag (red left, green
  // right). At rest returns {} so the base Shadows.floatingCard shadow from
  // styles.card is preserved.
  //
  // Platform-tuned values: Android's shadow rendering is z-depth based rather
  // than Gaussian blur, so shadowRadius + shadowOpacity at iOS levels barely
  // register. We inflate both and add an elevation ramp on Android so the
  // colored glow spreads at visually comparable intensity to iOS.
  const cardGlowStyle = useAnimatedStyle(() => {
    if (Math.abs(translateX.value) < 1) {
      return {};
    }
    const progress = Math.min(
      Math.abs(translateX.value) / SWIPE_THRESHOLD,
      1,
    );
    const shadowColor = interpolateColor(
      translateX.value,
      [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
      ["rgb(239, 68, 68)", "rgb(0, 0, 0)", "rgb(34, 197, 94)"],
    );

    if (Platform.OS === "ios") {
      return {
        shadowColor,
        shadowOpacity: progress * 0.6,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 0 },
      };
    }

    // Android — inflate opacity/radius + ramp elevation so Material z-depth
    // renders a broader colored halo. Base elevation (1) at no-drag lets the
    // early-return path above retain the card's default ambient shadow.
    return {
      shadowColor,
      shadowOpacity: progress * 0.9,
      shadowRadius: progress * 40,
      shadowOffset: { width: 0, height: 0 },
      elevation: interpolate(
        Math.abs(translateX.value),
        [0, SWIPE_THRESHOLD],
        [1, 24],
        Extrapolation.CLAMP,
      ),
    };
  });

  // Crossfade + subtle scale. Opacity uses a 3-point interpolate with a mid
  // dip (0.1 at progress 0.5) so the two faces' combined alpha at the crossing
  // stays ~0.2 — low enough to erase the ghost of the outgoing face's text,
  // high enough that the moment doesn't read as "blank." The same 3-point
  // shape is used across cardGlowStyle's drag interpolation for consistency.
  // 2D-only transforms: no perspective/rotateY/backfaceVisibility edge cases.
  const frontStyle = useAnimatedStyle(() => {
    const opacity = interpolate(flipProgress.value, [0, 0.5, 1], [1, 0.1, 0]);
    const scale = interpolate(flipProgress.value, [0, 1], [1, 0.96]);
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  const backStyle = useAnimatedStyle(() => {
    const opacity = interpolate(flipProgress.value, [0, 0.5, 1], [0, 0.1, 1]);
    const scale = interpolate(flipProgress.value, [0, 1], [0.96, 1]);
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  // Wrapper height tracks the currently-visible face's measured natural
  // height (clamped to [MIN, MAX]) and interpolates during flip. Before the
  // first layout measurement arrives, fall back to MIN so the card doesn't
  // collapse to zero height (both faces are absolute-positioned).
  const wrapperHeightStyle = useAnimatedStyle(() => {
    if (frontHeight.value === 0 && backHeight.value === 0) {
      return { height: CARD_MIN_HEIGHT };
    }
    const front = Math.max(frontHeight.value || CARD_MIN_HEIGHT, CARD_MIN_HEIGHT);
    const back = Math.max(backHeight.value || CARD_MIN_HEIGHT, CARD_MIN_HEIGHT);
    return {
      height: interpolate(flipProgress.value, [0, 1], [front, back]),
    };
  });

  return (
    <GestureDetector gesture={combinedGesture}>
      <Animated.View
        style={[styles.cardWrapper, cardStyle, cardGlowStyle, wrapperHeightStyle]}
      >
        {/* Front face — absolute overlay (no `bottom`) so onLayout reports
            the natural content height that drives the wrapper's animated size. */}
        <Animated.View
          style={[styles.card, styles.cardFront, frontStyle]}
          onLayout={onFrontLayout}
        >
          <Text style={styles.cardTitle}>{recipe.title}</Text>
          <View style={styles.metaContainer}>
            {/* Row 1: 보유 (emphasized) · kcal */}
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Ionicons
                  name="nutrition-outline"
                  size={14}
                  color={Colors.primary}
                />
                <Text style={styles.metaTextEmphasis}>
                  {recipe.matchCount}/{recipe.totalCount} 보유
                </Text>
              </View>
              <View style={styles.metaDivider} />
              <View style={styles.metaItem}>
                <Ionicons
                  name="flame-outline"
                  size={14}
                  color={Colors.onSurfaceVariant}
                />
                <Text style={styles.metaText}>{recipe.kcal}</Text>
              </View>
            </View>
            {/* Row 2: 시간 · 난이도 */}
            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={Colors.onSurfaceVariant}
                />
                <Text style={styles.metaText}>{recipe.time}</Text>
              </View>
              <View style={styles.metaDivider} />
              <View style={styles.metaItem}>
                <Ionicons
                  name="speedometer-outline"
                  size={14}
                  color={Colors.onSurfaceVariant}
                />
                <Text style={styles.metaText}>{recipe.difficulty}</Text>
              </View>
            </View>
          </View>

          {recipe.ingredients && recipe.ingredients.length > 0 && (
            <>
              <View style={styles.cardDivider} />
              <Text style={styles.ingredientLabel}>재료</Text>
              <View style={styles.ingredientWrap}>
                {recipe.ingredients.slice(0, 8).map((ing) => (
                  <View key={ing} style={styles.ingredientChip}>
                    <Text style={styles.ingredientChipText}>{ing}</Text>
                  </View>
                ))}
                {recipe.ingredients.length > 8 && (
                  <View style={styles.ingredientChipMore}>
                    <Text style={styles.ingredientChipMoreText}>
                      +{recipe.ingredients.length - 8}개
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}
        </Animated.View>

        {/* Back face — absolute overlay, shows cooking steps. Same sizing
            model as the front; measured height drives the wrapper interp. */}
        <Animated.View
          style={[styles.card, styles.cardBack, backStyle]}
          onLayout={onBackLayout}
        >
          <Text style={styles.backTitle} numberOfLines={2}>
            {recipe.title}
          </Text>
          <Text style={styles.backSubtitle}>만드는 법</Text>
          {recipe.steps && recipe.steps.length > 0 ? (
            <ScrollView
              style={styles.stepsScroll}
              contentContainerStyle={styles.stepsContent}
              showsVerticalScrollIndicator={false}
            >
              {recipe.steps.map((step, idx) => (
                <View key={idx} style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{idx + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.stepsEmpty}>
              <Text style={styles.stepsEmptyText}>조리법 준비 중이에요</Text>
            </View>
          )}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

// ─── Completion View ─────────────────────────────────────────────────────────

function CompletionView({
  savedCount,
  onConfirm,
  onRetry,
}: {
  savedCount: number;
  onConfirm: () => void;
  onRetry: () => void;
}) {
  return (
    <View style={styles.completionArea}>
      {savedCount > 0 ? (
        <>
          <Ionicons
            name="heart-circle"
            size={64}
            color={Colors.primaryContainer}
          />
          <Text style={styles.completionTitle}>
            {savedCount}개의 레시피가 저장되었어요!
          </Text>
          <Pressable
            onPress={onConfirm}
            style={({ pressed }) => [
              styles.completionBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.completionBtnText}>
              내 레시피에서 확인하기
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          <Ionicons
            name="sad-outline"
            size={64}
            color={Colors.outlineVariant}
          />
          <Text style={styles.completionTitle}>
            저장한 레시피가 없어요
          </Text>
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => [
              styles.completionBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.completionBtnText}>내 레시피</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

// ─── No-results / loading helpers ────────────────────────────────────────────

// 콜드스타트로 swipe에 진입하면 RecipeRecommendationContext의 AsyncStorage 추천
// 복원이 아직 안 끝나 status는 idle, 덱은 빈 한순간이 있다. 이 grace 동안은
// "결과 없음" 대신 로딩으로 취급해 거짓 빈 화면 깜빡임을 막는다. 캐시가 있으면
// 이 안에 덱이 채워지고, 없으면 grace 경과 후 "결과 없음" 안내로 넘어간다.
// (복원 중에도 status는 계속 idle이라 status만으로는 '복원 대기'와 '캐시 없음'을
// 구분 못 해 시간 게이트가 필요하다.)
const RESTORE_SETTLE_GRACE_MS = 1000;

// 결과가 휘발(24h TTL 만료 등)했는데 swipe로 진입한 경우의 안내. 스와이프를
// 다 끝낸 CompletionView("아쉽네요!")와 구분 — 여긴 보여줄 결과가 없던 상태다.
function NoResultsView({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.completionArea}>
      <Ionicons name="time-outline" size={64} color={Colors.outlineVariant} />
      <Text style={styles.completionTitle}>
        추천 결과를 불러올 수 없어요
      </Text>
      <Pressable
        onPress={onRetry}
        style={({ pressed }) => [
          styles.completionBtn,
          pressed && { opacity: 0.85 },
        ]}
      >
        <Text style={styles.completionBtnText}>내 레시피</Text>
      </Pressable>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RecipeSwipeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { showTopToast } = useToast();
  const {
    status: recommendationStatus,
    recommendedRecipes,
    rawRecipes,
    savedRecipes,
    saveRecipe,
    discardRecipe,
    finishSwiping,
    reset,
  } = useRecipeRecommendation();
  // Buffered save list — pushed during right-swipes, drained as one bulk
  // POST when the deck completes or the user exits. Ref instead of state so
  // navigation listeners can read a fresh value without stale closures.
  const savedDtosRef = useRef<GeneratedRecipeDto[]>([]);

  const flushSaves = useCallback(async () => {
    const dtos = savedDtosRef.current;
    if (dtos.length === 0) return;
    // Clear up front so any re-entry (beforeRemove firing after isComplete
    // already flushed, etc.) is a no-op instead of double-posting.
    savedDtosRef.current = [];
    try {
      await saveRecipes(dtos);
      showTopToast({
        message: `${dtos.length}개 레시피가 내 레시피에 저장되었어요`,
        variant: "success",
      });
    } catch (e) {
      showTopToast({
        message: getErrorMessage(
          e,
          "레시피 저장에 실패했어요. 잠시 후 다시 시도해 주세요",
        ),
        variant: "error",
      });
    }
  }, [showTopToast]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [exitModalVisible, setExitModalVisible] = useState(false);
  // 콜드스타트 복원 grace 경과 플래그. 경과 전 빈 덱은 로딩으로 취급(깜빡임 방지),
  // 경과 후에도 비어 있으면 "결과 없음"으로 확정.
  const [settleElapsed, setSettleElapsed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettleElapsed(true), RESTORE_SETTLE_GRACE_MS);
    return () => clearTimeout(t);
  }, []);

  const isComplete = currentIndex >= recommendedRecipes.length;

  // 화면 상태 결정 (status-aware):
  //  • 덱 있음 → 다 봤으면 completed, 아니면 deck
  //  • 덱 없음 + 생성 중 → Push 탭이 result 200보다 먼저 route해도 loading
  //  • 그 외 → 복원이 정착(ready/swiping)했거나 grace 경과면 no-results
  const hasDeck = recommendedRecipes.length > 0;
  const settled =
    recommendationStatus === "ready" ||
    recommendationStatus === "swiping" ||
    (recommendationStatus !== "loading" && settleElapsed);
  const viewState: "loading" | "deck" | "completed" | "no-results" = hasDeck
    ? isComplete
      ? "completed"
      : "deck"
    : settled
      ? "no-results"
      : "loading";

  // Android back button intercept
  useEffect(() => {
    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      setExitModalVisible(true);
      return true;
    });
    return () => handler.remove();
  }, []);

  // Auto-flush when the user finishes the whole deck. The CompletionView
  // shows alongside so the user gets immediate stats; the toast (success
  // or failure) appears shortly after.
  useEffect(() => {
    if (isComplete && savedDtosRef.current.length > 0) {
      flushSaves();
    }
  }, [isComplete, flushSaves]);

  // Safety net for any exit path (iOS back gesture, programmatic back, etc.)
  // that bypasses handleExit/handleComplete. If a regular handler already
  // flushed, savedDtosRef is empty and this is a no-op.
  useEffect(() => {
    const sub = navigation.addListener("beforeRemove", () => {
      flushSaves();
    });
    return sub;
  }, [navigation, flushSaves]);

  const handleSwipeRight = useCallback(() => {
    // No reverse-mapping: the raw AI DTO at the matching index is what
    // we'll eventually POST, byte-for-byte. saveRecipe(recipe) is still
    // called so the Context's `savedRecipes` UI state (e.g. CompletionView
    // count) stays accurate during the swipe session.
    const recipe = recommendedRecipes[currentIndex];
    const rawDto = rawRecipes[currentIndex];
    if (recipe && rawDto) {
      savedDtosRef.current.push(rawDto);
      saveRecipe(recipe);
    }
    setCurrentIndex((i) => i + 1);
  }, [currentIndex, recommendedRecipes, rawRecipes, saveRecipe]);

  const handleSwipeLeft = useCallback(() => {
    const recipe = recommendedRecipes[currentIndex];
    if (recipe) discardRecipe(recipe);
    setCurrentIndex((i) => i + 1);
  }, [currentIndex, recommendedRecipes, discardRecipe]);

  // Exit/complete/retry all land on the My-Recipe tab explicitly. Earlier
  // `router.back()` happened to work when entered from the recipe tab but
  // popped to whatever tab was active when the user tapped a RECIPE_READY
  // push (typically the fridge on cold start) — the apparent "내 레시피로
  // 돌아감" was incidental, not designed. `replace` instead of `push` so
  // back-gesture from /recipe doesn't resurface the consumed swipe deck.
  const handleExit = () => {
    setExitModalVisible(false);
    finishSwiping();
    router.replace("/(tabs)/recipe" as never);
  };

  const handleComplete = () => {
    finishSwiping();
    router.replace("/(tabs)/recipe" as never);
  };

  const handleRetry = () => {
    reset();
    router.replace("/(tabs)/recipe" as never);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => setExitModalVisible(true)}
          style={({ pressed }) => [
            styles.headerBtn,
            pressed && { opacity: 0.6 },
          ]}
        >
          <Ionicons name="close" size={24} color={Colors.onSurface} />
        </Pressable>
        <Text style={styles.logo}>KeepEat</Text>
        <View style={{ width: 44 }} />
      </View>

      {viewState === "loading" ? (
        <View style={styles.completionArea}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : viewState === "no-results" ? (
        <NoResultsView onRetry={handleRetry} />
      ) : viewState === "completed" ? (
        <CompletionView
          savedCount={savedRecipes.length}
          onConfirm={handleComplete}
          onRetry={handleRetry}
        />
      ) : (
        <>
          {/* Title + counter */}
          <View style={styles.titleRow}>
            <Text style={styles.screenTitle}>
              땡기는 레시피를 골라보세요!
            </Text>
            <Text style={styles.counter}>
              {currentIndex + 1}/{recommendedRecipes.length}
            </Text>
          </View>

          {/* Swipe area */}
          <View style={styles.swipeArea}>
            <SwipeCard
              key={recommendedRecipes[currentIndex].id}
              recipe={recommendedRecipes[currentIndex]}
              onSwipeLeft={handleSwipeLeft}
              onSwipeRight={handleSwipeRight}
            />
          </View>

          {/* Manual buttons */}
          <View
            style={[
              styles.bottomBtns,
              { paddingBottom: Math.max(insets.bottom, 16) + 8 },
            ]}
          >
            <Pressable
              onPress={handleSwipeLeft}
              style={({ pressed }) => [
                styles.roundBtn,
                styles.roundBtnReject,
                pressed && { transform: [{ scale: 0.9 }] },
              ]}
            >
              <Ionicons name="close" size={28} color={Colors.error} />
            </Pressable>
            <Pressable
              onPress={handleSwipeRight}
              style={({ pressed }) => [
                styles.roundBtn,
                styles.roundBtnAccept,
                pressed && { transform: [{ scale: 0.9 }] },
              ]}
            >
              <Ionicons name="heart" size={28} color={Colors.primaryContainer} />
            </Pressable>
          </View>
        </>
      )}

      {/* Exit confirm */}
      <ConfirmModal
        visible={exitModalVisible}
        title="잠깐!"
        subtitle={
          "아직 안 본 레시피가 남아있어요!\n나가시겠어요?"
        }
        footnote="저장한 레시피는 사라지지 않아요."
        confirmLabel="나가기"
        cancelLabel="계속 볼게요"
        destructive
        onConfirm={handleExit}
        onCancel={() => setExitModalVisible(false)}
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
    color: Colors.primary,
    letterSpacing: LetterSpacing.tight,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
    letterSpacing: LetterSpacing.tight,
  },
  counter: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.semiBold,
    color: Colors.outline,
  },

  // Swipe area
  swipeArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.base,
  },
  // Wrapper holds pan+glow animations. Front face sizes it via normal flow;
  // back face is absolute-overlaid. Shadow on this layer still renders (not
  // clipped — no overflow: hidden here).
  //
  // Background is fieldBackground (not pure white) so that when both faces
  // dip to opacity ~0.1 mid-crossfade, the wrapper's gray-mint tint shows
  // through at ~80% strength, erasing the "empty white frame" feeling on
  // iOS and mirroring Android's native ripple tint for platform parity.
  cardWrapper: {
    width: "100%",
    backgroundColor: Colors.fieldBackground,
    borderRadius: Radius.xxl,
  },
  card: {
    width: "100%",
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xxl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl + 8,
    paddingBottom: Spacing.xxl + 16,
    justifyContent: "flex-start",
    shadowColor: "#191C1D",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  // Front face — absolute overlay, content-sized within [MIN, MAX].
  // The previously in-flow front face no longer dictates wrapper height;
  // wrapperHeightStyle now interpolates between both faces' measurements.
  cardFront: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    minHeight: CARD_MIN_HEIGHT,
    maxHeight: CARD_MAX_HEIGHT,
  },
  // Back face — same constraints as the front. `maxHeight` here is what
  // triggers internal scroll on `stepsScroll` for long recipes.
  cardBack: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    minHeight: CARD_MIN_HEIGHT,
    maxHeight: CARD_MAX_HEIGHT,
  },
  cardTitle: {
    fontSize: 26,
    fontWeight: FontWeight.extraBold,
    color: Colors.onSurface,
    letterSpacing: LetterSpacing.tight,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  // Minimalist 2x2 meta: no pill backgrounds — icons + text only, joined by
  // a thin vertical divider. "보유" on the first row uses Primary emphasis to
  // anchor visual scan; the rest stay muted so the ingredient pills below
  // retain stronger visual weight as the section separator.
  metaContainer: {
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xs,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  metaDivider: {
    width: 1,
    height: 12,
    backgroundColor: Colors.outlineVariant,
  },
  metaText: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
  },
  metaTextEmphasis: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },

  // Ingredients
  cardDivider: {
    height: 1,
    backgroundColor: Colors.surfaceContainerHigh,
    marginVertical: Spacing.base,
  },
  ingredientLabel: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.bold,
    color: Colors.onSurfaceVariant,
    marginBottom: Spacing.sm,
  },
  ingredientWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  ingredientChip: {
    backgroundColor: Colors.surfaceContainerLow,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
  },
  ingredientChipText: {
    fontSize: FontSize.titleSm,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
  },
  ingredientChipMore: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  ingredientChipMoreText: {
    fontSize: FontSize.titleSm,
    fontWeight: FontWeight.semiBold,
    color: Colors.outline,
  },

  // ── Flip back face — cooking steps ──
  backTitle: {
    fontSize: FontSize.titleLg,
    fontWeight: FontWeight.extraBold,
    color: Colors.onSurface,
    letterSpacing: LetterSpacing.tight,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  backSubtitle: {
    fontSize: FontSize.labelMd,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    textAlign: "center",
    letterSpacing: LetterSpacing.wide,
    marginBottom: Spacing.lg,
  },
  stepsScroll: {
    // No `flex: 1`: ScrollView sizes by content so short step lists let the
    // back face — and through it the wrapper — measure tight. `flexShrink: 1`
    // lets the cardBack's maxHeight cascade and engage internal scrolling
    // when the steps content would otherwise overflow.
    flexShrink: 1,
  },
  stepsContent: {
    paddingBottom: Spacing.base,
  },
  stepRow: {
    flexDirection: "row",
    gap: Spacing.md,
    marginBottom: Spacing.md,
    alignItems: "flex-start",
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.secondaryContainer,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  stepNumberText: {
    fontSize: FontSize.labelMd,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  stepText: {
    flex: 1,
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
    lineHeight: 22,
  },
  stepsEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepsEmptyText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
  },

// Bottom buttons
  bottomBtns: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.xxl + 8,
    paddingTop: Spacing.md,
  },
  roundBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#191C1D",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  roundBtnReject: {
    backgroundColor: Colors.errorContainer,
  },
  roundBtnAccept: {
    backgroundColor: Colors.secondaryContainer,
  },

  // Completion
  completionArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xxl,
    gap: Spacing.lg,
  },
  completionTitle: {
    fontSize: FontSize.headlineSm,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
    textAlign: "center",
    letterSpacing: LetterSpacing.tight,
    lineHeight: 30,
  },
  completionBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.base,
    borderRadius: Radius.xl,
    marginTop: Spacing.md,
    ...Shadows.fab,
  },
  completionBtnText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onPrimary,
  },
});
