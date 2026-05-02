import { type Recipe } from "@/constants/domain";
import { RECOMMENDED_RECIPES_POOL } from "@/mocks";
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
  requestRecommendation: () => void;
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
    requestRecommendation: () => {},
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

  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const onCompleteRef = useRef<(() => void) | null>(null);

  const onComplete = useCallback((cb: (() => void) | null) => {
    onCompleteRef.current = cb;
  }, []);

  // Request notification permission once on mount. Only prompts if the user
  // hasn't made a decision yet (getPermissionsAsync returns "undetermined");
  // already-granted or already-denied states are respected without a re-prompt.
  // Silent failure — a rejected permission should not crash the app; the push
  // path in handleCompletion is already best-effort (no await).
  useEffect(() => {
    (async () => {
      try {
        const current = await Notifications.getPermissionsAsync();
        if (
          current.status === "undetermined" ||
          current.canAskAgain === true && current.status !== "granted"
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

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
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

  const requestRecommendation = useCallback(() => {
    if (state.status === "loading") return;

    setState((prev) => ({
      ...prev,
      status: "loading",
      recommendedRecipes: [],
      savedRecipes: [],
      requestedAt: new Date(),
      completedAt: null,
    }));

    // TODO: 실제 API 연동 시 제거. 현재 10초 시뮬레이션
    const delay = 10000;
    timerRef.current = setTimeout(() => {
      // Pick 5 random recipes from pool
      const shuffled = [...RECOMMENDED_RECIPES_POOL].sort(
        () => Math.random() - 0.5,
      );
      const picked = shuffled.slice(0, 5);
      handleCompletion(picked);
    }, delay);
  }, [state.status, handleCompletion]);

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
    // No-op for now — just removes from the swipe stack by not saving
  }, []);

  const finishSwiping = useCallback(() => {
    setState((prev) => ({
      ...prev,
      status: "idle",
      recommendedRecipes: [],
    }));
  }, []);

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
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
