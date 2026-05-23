import { type Recipe } from "@/constants/domain";
import {
  generateAiRecipes,
  mapDifficulty,
  type GeneratedRecipeDto,
} from "@/services/recipes";
import { isAxiosError } from "axios";
import * as Notifications from "expo-notifications";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, AppStateStatus } from "react-native";
import { useToast } from "@/components/Toast";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecommendationStatus =
  | "idle"
  | "loading"
  | "ready"
  | "swiping"
  | "error";

interface RecipeRecommendationState {
  status: RecommendationStatus;
  recommendedRecipes: Recipe[];
  /**
   * AI 응답 원본 DTO. `recommendedRecipes`와 index 1:1 매핑. swipe 화면이
   * 저장 시 도메인 → DTO 역변환을 거치지 않고 이 배열을 그대로 보내
   * `requiredIngredients.amount` 같은 필드 손실을 막는다.
   */
  rawRecipes: GeneratedRecipeDto[];
  savedRecipes: Recipe[];
  requestedAt: Date | null;
  completedAt: Date | null;
}

interface RecipeRecommendationContextValue extends RecipeRecommendationState {
  requestRecommendation: () => Promise<void>;
  markSwiping: () => void;
  saveRecipe: (recipe: Recipe) => void;
  discardRecipe: (recipe: Recipe) => void;
  finishSwiping: () => void;
  reset: () => void;
  /** Register a callback to be invoked when recommendation completes (for in-app notification) */
  onComplete: (cb: (() => void) | null) => void;
}

// ─── Notification Setup ───────────────────────────────────────────────────────

// Foreground OS push is suppressed — we surface notifications via an in-app
// toast inside NotificationContext (and refresh the badge there) instead.
// Background pushes still display via the OS naturally (this handler only
// affects foreground display behavior).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: false,
  }),
});

// ─── Context ──────────────────────────────────────────────────────────────────

const RecipeRecommendationContext =
  createContext<RecipeRecommendationContextValue>({
    status: "idle",
    recommendedRecipes: [],
    rawRecipes: [],
    savedRecipes: [],
    requestedAt: null,
    completedAt: null,
    requestRecommendation: async () => {},
    markSwiping: () => {},
    saveRecipe: () => {},
    discardRecipe: () => {},
    finishSwiping: () => {},
    reset: () => {},
    onComplete: () => {},
  });

export const useRecipeRecommendation = () =>
  useContext(RecipeRecommendationContext);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function RecipeRecommendationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<RecipeRecommendationState>({
    status: "idle",
    recommendedRecipes: [],
    rawRecipes: [],
    savedRecipes: [],
    requestedAt: null,
    completedAt: null,
  });

  const { showToast } = useToast();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const onCompleteRef = useRef<(() => void) | null>(null);

  const onComplete = useCallback((cb: (() => void) | null) => {
    onCompleteRef.current = cb;
  }, []);

  // Request notification permission once on mount.
  useEffect(() => {
    (async () => {
      try {
        const current = await Notifications.getPermissionsAsync();
        if (
          current.status === "undetermined" ||
          (current.canAskAgain === true && current.status !== "granted")
        ) {
          await Notifications.requestPermissionsAsync();
        }
      } catch {
        // Permission APIs unavailable (e.g. web) — ignore, OS push simply won't fire.
      }
    })();
  }, []);

  // Track app foreground/background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  const handleCompletion = useCallback(
    (recipes: Recipe[], rawList: GeneratedRecipeDto[]) => {
      setState((prev) => ({
        ...prev,
        status: "ready",
        recommendedRecipes: recipes,
        rawRecipes: rawList,
        completedAt: new Date(),
      }));

      if (appStateRef.current !== "active") {
        // Background → push notification
        Notifications.scheduleNotificationAsync({
          content: {
            title: "KeepEat",
            body: "AI 셰프가 레시피를 완성했어요! 확인해보세요 🍳",
            data: { screen: "recipe" },
          },
          trigger: null,
        });
      } else {
        // Foreground → invoke registered callback (e.g. in-app notification)
        onCompleteRef.current?.();
      }
    },
    [],
  );

  const requestRecommendation = useCallback(async () => {
    if (state.status === "loading") return;

    setState((prev) => ({
      ...prev,
      status: "loading",
      recommendedRecipes: [],
      rawRecipes: [],
      savedRecipes: [],
      requestedAt: new Date(),
      completedAt: null,
    }));

    try {
      const generated = await generateAiRecipes();
      // Map GeneratedRecipeDto back to domain Recipe to feed the swipe UI.
      // The raw `generated` list is stored alongside so a save round-trip
      // can reuse the unmodified DTO instead of reverse-mapping.
      const mappedRecipes: Recipe[] = generated.map((dto, i) => ({
        id: `ai-gen-${Date.now()}-${i}`,
        title: dto.recipeName,
        time: dto.cookingTime,
        difficulty: mapDifficulty(dto.difficulty),
        kcal: dto.calories,
        method: dto.cookingMethod,
        ingredients: dto.requiredIngredients.map((ing) => ing.name),
        steps: dto.instructions,
        matchCount: dto.requiredIngredients.length,
        totalCount: dto.requiredIngredients.length,
      }));

      handleCompletion(mappedRecipes, generated);
    } catch (error) {
      console.error("[Recipe Gen Error]", error);
      setState((prev) => ({ ...prev, status: "idle" }));
      if (isAxiosError(error) && error.response?.status === 400) {
        const errorMessage = error.response?.data?.message || "식재료가 부족해요. 냉장고를 더 채워주세요!";
        showToast(errorMessage);
      } else {
        showToast("레시피를 생성하는 중에 오류가 발생했어요.");
      }
    }
  }, [state.status, handleCompletion, showToast]);

  const markSwiping = useCallback(() => {
    setState((prev) => ({ ...prev, status: "swiping" }));
  }, []);

  const saveRecipe = useCallback((recipe: Recipe) => {
    setState((prev) => ({
      ...prev,
      savedRecipes: [...prev.savedRecipes, recipe],
    }));
  }, []);

  const discardRecipe = useCallback((_recipe: Recipe) => {
    // No-op for now
  }, []);

  const finishSwiping = useCallback(() => {
    setState((prev) => ({
      ...prev,
      status: "idle",
      recommendedRecipes: [],
      rawRecipes: [],
    }));
  }, []);

  const reset = useCallback(() => {
    setState({
      status: "idle",
      recommendedRecipes: [],
      rawRecipes: [],
      savedRecipes: [],
      requestedAt: null,
      completedAt: null,
    });
  }, []);

  return (
    <RecipeRecommendationContext.Provider
      value={{
        ...state,
        requestRecommendation,
        markSwiping,
        saveRecipe,
        discardRecipe,
        finishSwiping,
        reset,
        onComplete,
      }}
    >
      {children}
    </RecipeRecommendationContext.Provider>
  );
}
