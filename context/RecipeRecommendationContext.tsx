import { type Recipe } from "@/constants/domain";
import { generateAiRecipes, mapDifficulty } from "@/services/recipes";
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

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── Context ──────────────────────────────────────────────────────────────────

const RecipeRecommendationContext =
  createContext<RecipeRecommendationContextValue>({
    status: "idle",
    recommendedRecipes: [],
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
    (recipes: Recipe[]) => {
      setState((prev) => ({
        ...prev,
        status: "ready",
        recommendedRecipes: recipes,
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
      savedRecipes: [],
      requestedAt: new Date(),
      completedAt: null,
    }));

    try {
      const generated = await generateAiRecipes();
      // Map GeneratedRecipeDto back to domain Recipe to feed the swipe UI
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

      handleCompletion(mappedRecipes);
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
    }));
  }, []);

  const reset = useCallback(() => {
    setState({
      status: "idle",
      recommendedRecipes: [],
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
