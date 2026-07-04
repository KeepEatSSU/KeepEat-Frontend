import AsyncStorage from "@react-native-async-storage/async-storage";
import { type Recipe } from "@/constants/domain";
import {
  generateAiRecipes,
  mapDifficulty,
  type GeneratedRecipeDto,
} from "@/services/recipes";
import { getErrorMessage } from "@/services/api";
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

// ─── Persistence (B) ──────────────────────────────────────────────────────────
// AsyncStorage cache of the latest completed AI recommendation. Survives
// app kills so users who tap the RECIPE_READY push (or just re-open the app
// after the result arrived) still have something to swipe.
//
// A-transition note: when the backend exposes a "latest generate result"
// endpoint, swap the body of `loadPersistedRecommendation` for a server
// GET — call sites (Provider mount) stay unchanged.

const PERSIST_KEY = "keepeat:lastRecommendation";
const PERSIST_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface PersistedRecommendation {
  recommendedRecipes: Recipe[];
  rawRecipes: GeneratedRecipeDto[];
  completedAt: string; // ISO
}

async function savePersistedRecommendation(
  payload: PersistedRecommendation,
): Promise<void> {
  try {
    await AsyncStorage.setItem(PERSIST_KEY, JSON.stringify(payload));
  } catch {
    // best-effort — storage failure must not block the happy path
  }
}

async function loadPersistedRecommendation(): Promise<PersistedRecommendation | null> {
  try {
    const raw = await AsyncStorage.getItem(PERSIST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedRecommendation;
    if (
      !parsed?.completedAt ||
      !Array.isArray(parsed.recommendedRecipes) ||
      !Array.isArray(parsed.rawRecipes)
    ) {
      return null;
    }
    // TTL check: drop anything older than 24h so we never resurface a
    // stale recommendation built against an outdated fridge state.
    const ageMs = Date.now() - new Date(parsed.completedAt).getTime();
    if (Number.isNaN(ageMs) || ageMs > PERSIST_TTL_MS) {
      AsyncStorage.removeItem(PERSIST_KEY).catch(() => {});
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function clearPersistedRecommendation(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PERSIST_KEY);
  } catch {
    // ignore
  }
}

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

// Foreground 표시 정책: 전 타입(RECIPE_READY/EXPIRY_SOON/NOTICE)을 인앱
// 드롭다운(NotificationContext의 addNotificationReceivedListener →
// showNotification)으로 통일한다. OS 배너까지 같이 뜨면 중복이므로 포그라운드
// 에서는 배너/사운드/리스트/배지를 전부 억제 — 이 핸들러는 "앱이 켜진 동안
// 도착한 알림"에만 적용된다. 백그라운드/종료 시 알림은 이 핸들러를 거치지
// 않고 OS가 자체 표시하므로 그대로 유지된다.
//
// shouldShowAlert(구 API, deprecated)는 제거 — shouldShowBanner/shouldShowList
// 신 API만으로 충분하고 콘솔 경고를 없앤다.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
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

  const { showTopToast } = useToast();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const onCompleteRef = useRef<(() => void) | null>(null);

  const onComplete = useCallback((cb: (() => void) | null) => {
    onCompleteRef.current = cb;
  }, []);

  // (Permission request used to live here, fired on Provider mount. It moved
  // to <PushPermissionPrompt> in _layout.tsx so users see a friendly rationale
  // before the OS dialog appears, and so the dialog only shows once — gated
  // by an AsyncStorage flag — rather than every cold start.)

  // Track app foreground/background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  // Restore the most-recent recommendation (if still within TTL) on mount.
  // This makes the result survive app kills: user backgrounds during
  // generation → receives RECIPE_READY push → re-opens app → sees the
  // "눌러서 레시피 확인하기" CTA instead of an empty state.
  // Only restores when state is still idle so an in-flight `requestRecommendation`
  // can't be clobbered mid-call.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await loadPersistedRecommendation();
      if (cancelled || !cached) return;
      setState((prev) => {
        if (prev.status !== "idle") return prev;
        return {
          ...prev,
          status: "ready",
          recommendedRecipes: cached.recommendedRecipes,
          rawRecipes: cached.rawRecipes,
          completedAt: new Date(cached.completedAt),
        };
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCompletion = useCallback(
    (recipes: Recipe[], rawList: GeneratedRecipeDto[]) => {
      const completedAt = new Date();
      setState((prev) => ({
        ...prev,
        status: "ready",
        recommendedRecipes: recipes,
        rawRecipes: rawList,
        completedAt,
      }));

      // Persist so the result survives app kills (e.g. user backgrounds
      // the app during generation, receives RECIPE_READY push, re-opens
      // after JS was killed). Fire-and-forget — storage failures are
      // tolerable, the in-memory state already reflects the result.
      savePersistedRecommendation({
        recommendedRecipes: recipes,
        rawRecipes: rawList,
        completedAt: completedAt.toISOString(),
      });

      // Foreground only — surface as the registered in-app callback (toast).
      // Background notification was previously fired here via
      // scheduleNotificationAsync, but the backend now sends a RECIPE_READY
      // remote push for the same event; firing both produced duplicate
      // alerts. AppState ref is kept for the foreground vs background
      // discrimination here.
      if (appStateRef.current === "active") {
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

    // "2분 소요" 안내 — 요청 시작 직후 띄움. Toast 시스템이 single-instance
    // 라(`clearTimeout` 후 즉시 교체) 빠른 에러가 와도 catch의 에러 토스트가
    // 안내를 자동으로 dismiss + 교체 → 두 토스트가 동시에 보일 일 없음.
    // 호출처(recipe.tsx)에서 타이밍 추측(setTimeout) 없이 결과 기반 분기.
    showTopToast({
      message: "레시피 생성에 최대 2분이 소요됩니다. 완료되면 알려드릴게요!",
      variant: "info",
    });

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
      // console.log 사용 — console.error는 RN dev LogBox 빨간 박스를 띄워
      // 이미 토스트로 처리되는 친화 에러까지 시각적으로 두 번 노출됨.
      // 디버깅 로그는 유지하되 LogBox 트리거만 회피.
      console.log("[Recipe Gen Error]", error);
      setState((prev) => ({ ...prev, status: "idle" }));
      // 400(식재료 부족)과 그 외(서버 오류)는 폴백 카피가 달라 분기 유지.
      // 두 경로 모두 getErrorMessage를 통과해 서버 message가 있으면 우선 노출.
      if (isAxiosError(error) && error.response?.status === 400) {
        showTopToast({
          message: getErrorMessage(
            error,
            "식재료가 부족해요. 냉장고를 더 채워주세요!",
          ),
          variant: "warning",
        });
      } else {
        showTopToast({
          message: getErrorMessage(
            error,
            "레시피를 생성하는 중에 오류가 발생했어요.",
          ),
          variant: "error",
        });
      }
    }
  }, [state.status, handleCompletion, showTopToast]);

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
    // Consumed → drop the persisted cache so the next mount doesn't
    // resurrect already-handled recommendations.
    clearPersistedRecommendation();
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
    clearPersistedRecommendation();
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
