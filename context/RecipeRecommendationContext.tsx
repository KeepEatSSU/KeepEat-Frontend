import AsyncStorage from "@react-native-async-storage/async-storage";
import { type Recipe } from "@/constants/domain";
import {
  getAiRecipeResult,
  mapDifficulty,
  requestAiRecipeGeneration,
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
import { useAuth } from "@/context/AuthContext";
import { parseNotificationPushData } from "@/utils/notificationRouting";
import {
  claimNotificationResponse,
  loadInitialNotificationResponseOnce,
} from "@/utils/notificationResponse";
import {
  classifyRecipeResultHttpStatus,
  RecipeResultPoller,
  type RecipeResultErrorDisposition,
  type RecipeResultTerminalFailure,
} from "@/utils/recipeResultPoller";

// ─── Persistence (B) ──────────────────────────────────────────────────────────
// AsyncStorage cache of the latest completed AI recommendation. Survives
// app kills so users who tap the RECIPE_READY push (or just re-open the app
// after the result arrived) still have something to swipe.
//
// The server result endpoint is polled for an active generation. This cache is
// still useful after a completed result has been fetched and mapped.

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

function createInitialRecommendationState(): RecipeRecommendationState {
  return {
    status: "idle",
    recommendedRecipes: [],
    rawRecipes: [],
    savedRecipes: [],
    requestedAt: null,
    completedAt: null,
  };
}

function mapGeneratedRecipes(
  generated: GeneratedRecipeDto[],
  completedAtMs: number,
): Recipe[] {
  return generated.map((dto, index) => ({
    id: `ai-gen-${completedAtMs}-${index}`,
    title: dto.recipeName,
    time: dto.cookingTime,
    difficulty: mapDifficulty(dto.difficulty),
    kcal: dto.calories,
    method: dto.cookingMethod,
    ingredients: dto.requiredIngredients.map((ingredient) => ingredient.name),
    steps: dto.instructions,
    matchCount: dto.requiredIngredients.length,
    totalCount: dto.requiredIngredients.length,
  }));
}

function classifyRecipeResultError(
  error: unknown,
): RecipeResultErrorDisposition {
  if (!isAxiosError(error)) return "terminal";
  return classifyRecipeResultHttpStatus(error.response?.status);
}

function getRecipeResultFailureMessage(
  failure: RecipeResultTerminalFailure,
): string {
  if (failure.reason === "timeout") {
    return "레시피 생성 시간이 초과됐어요. 다시 요청해 주세요.";
  }
  if (failure.reason === "transient-retries-exhausted") {
    return getErrorMessage(
      failure.error,
      "네트워크 연결이 불안정해 결과를 불러오지 못했어요.",
    );
  }

  const status = isAxiosError(failure.error)
    ? failure.error.response?.status
    : undefined;
  switch (status) {
    case 404:
      return getErrorMessage(
        failure.error,
        "진행 중인 레시피 생성 요청을 찾을 수 없어요. 다시 요청해 주세요.",
      );
    case 500:
      return getErrorMessage(
        failure.error,
        "생성된 레시피를 처리하지 못했어요. 다시 요청해 주세요.",
      );
    case 502:
      return getErrorMessage(
        failure.error,
        "AI 레시피 생성 서비스에 연결하지 못했어요. 다시 요청해 주세요.",
      );
    default:
      return getErrorMessage(
        failure.error,
        "레시피 결과를 불러오는 중에 오류가 발생했어요.",
      );
  }
}

interface RecipeRecommendationContextValue extends RecipeRecommendationState {
  requestRecommendation: () => Promise<void>;
  markSwiping: () => void;
  saveRecipe: (recipe: Recipe) => void;
  discardRecipe: (recipe: Recipe) => void;
  finishSwiping: () => void;
  reset: () => void;
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
  });

export const useRecipeRecommendation = () =>
  useContext(RecipeRecommendationContext);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function RecipeRecommendationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<RecipeRecommendationState>(
    createInitialRecommendationState,
  );
  const { showTopToast } = useToast();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const statusRef = useRef<RecommendationStatus>("idle");
  const mountedRef = useRef(true);
  const isAuthenticatedRef = useRef(isAuthenticated);
  const requestGenerationRef = useRef(0);
  const requestInFlightRef = useRef<Promise<void> | null>(null);
  const cacheWriteGenerationRef = useRef(0);
  const pollerRef = useRef<RecipeResultPoller<GeneratedRecipeDto[]> | null>(
    null,
  );

  isAuthenticatedRef.current = isAuthenticated;

  // (Permission request used to live here, fired on Provider mount. It moved
  // to <PushPermissionPrompt> in _layout.tsx so users see a friendly rationale
  // before the OS dialog appears, and so the dialog only shows once — gated
  // by an AsyncStorage flag — rather than every cold start.)

  const handleCompletion = useCallback((rawList: GeneratedRecipeDto[]) => {
    if (!mountedRef.current || !isAuthenticatedRef.current) return;

    const completedAt = new Date();
    const recipes = mapGeneratedRecipes(rawList, completedAt.getTime());
    statusRef.current = "ready";
    setState((prev) => ({
      ...prev,
      status: "ready",
      recommendedRecipes: recipes,
      rawRecipes: rawList,
      savedRecipes: [],
      completedAt,
    }));

    const cacheGeneration = ++cacheWriteGenerationRef.current;
    void savePersistedRecommendation({
      recommendedRecipes: recipes,
      rawRecipes: rawList,
      completedAt: completedAt.toISOString(),
    }).then(() => {
      if (cacheWriteGenerationRef.current !== cacheGeneration) {
        void clearPersistedRecommendation();
      }
    });

  }, []);

  const handlePollingTerminal = useCallback(
    (failure: RecipeResultTerminalFailure) => {
      if (!mountedRef.current || !isAuthenticatedRef.current) return;
      statusRef.current = "error";
      setState((prev) => ({ ...prev, status: "error" }));
      showTopToast({
        message: getRecipeResultFailureMessage(failure),
        variant: "error",
      });
    },
    [showTopToast],
  );

  const completionHandlerRef = useRef(handleCompletion);
  const pollingTerminalHandlerRef = useRef(handlePollingTerminal);
  completionHandlerRef.current = handleCompletion;
  pollingTerminalHandlerRef.current = handlePollingTerminal;

  if (pollerRef.current === null) {
    pollerRef.current = new RecipeResultPoller<GeneratedRecipeDto[]>({
      fetchResult: getAiRecipeResult,
      classifyError: classifyRecipeResultError,
      onComplete: (result) => completionHandlerRef.current(result),
      onTerminal: (failure) =>
        pollingTerminalHandlerRef.current(failure),
      isForeground: () => appStateRef.current === "active",
    });
  }

  const invalidateActiveRun = useCallback(() => {
    requestGenerationRef.current += 1;
    requestInFlightRef.current = null;
    pollerRef.current?.cancel();
  }, []);

  // Pause timer scheduling while inactive, then query immediately on a real
  // background/inactive → active transition. Initial active mount is ignored.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const previous = appStateRef.current;
      appStateRef.current = next;

      if (next !== "active") {
        pollerRef.current?.pause();
        return;
      }
      if (previous === "background" || previous === "inactive") {
        void pollerRef.current?.resume();
      }
    });
    return () => sub.remove();
  }, []);

  // Restore only after the authenticated user is known. An active request or
  // push-triggered recovery wins over a late cache read.
  useEffect(() => {
    if (isAuthLoading || !isAuthenticated) return;
    let cancelled = false;
    void loadPersistedRecommendation().then((cached) => {
      if (cancelled || !cached) return;
      setState((prev) => {
        if (prev.status !== "idle") return prev;
        statusRef.current = "ready";
        return {
          ...prev,
          status: "ready",
          recommendedRecipes: cached.recommendedRecipes,
          rawRecipes: cached.rawRecipes,
          completedAt: new Date(cached.completedAt),
        };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isAuthLoading]);

  // Logout invalidates timers and late responses and clears user-scoped
  // recommendation state. The auth-loading phase is not treated as logout.
  useEffect(() => {
    if (isAuthLoading || isAuthenticated) return;
    invalidateActiveRun();
    cacheWriteGenerationRef.current += 1;
    statusRef.current = "idle";
    setState(createInitialRecommendationState());
    void clearPersistedRecommendation();
  }, [isAuthenticated, isAuthLoading, invalidateActiveRun]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      invalidateActiveRun();
    };
  }, [invalidateActiveRun]);

  const recoverResultFromPush = useCallback(() => {
    if (!isAuthenticatedRef.current) return;
    const poller = pollerRef.current;
    if (!poller) return;

    // Ready/swiping decks ignore delayed duplicate pushes — a result that is
    // already on screen (or consumed) must not be clobbered.
    if (
      !poller.isRunning &&
      statusRef.current !== "idle" &&
      statusRef.current !== "error"
    ) {
      return;
    }

    // RECIPE_READY means the server holds a finished result right now, so a
    // /result GET must go out unconditionally — even when the previous run's
    // 2-minute deadline elapsed while backgrounded, and even before AppState
    // flips to "active" (start()'s first request bypasses the foreground
    // gate). Restarting the poller gives that GET a fresh deadline; a 409
    // (still pending server-side) then simply continues polling. No second
    // POST is ever issued, and a cold-start push with no live poller takes
    // this same path.
    requestGenerationRef.current += 1;
    const startedAt = Date.now();
    if (statusRef.current !== "loading") {
      statusRef.current = "loading";
      setState((prev) => ({
        ...prev,
        status: "loading",
        requestedAt: new Date(startedAt),
      }));
    }
    void poller.start(startedAt);
  }, []);

  // RECIPE_READY is an accelerator, not the sole completion mechanism.
  // Foreground reception, background-tap resume, and cold start all funnel
  // into recoverResultFromPush, which restarts the poller unconditionally.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    const handlePushData = (data: unknown) => {
      if (parseNotificationPushData(data).type === "recipe_ready") {
        recoverResultFromPush();
      }
    };
    const receivedSub = Notifications.addNotificationReceivedListener(
      (notification) => handlePushData(notification.request.content.data),
    );
    const responseSub =
      Notifications.addNotificationResponseReceivedListener((response) => {
        if (
          claimNotificationResponse("recipe-result-recovery", response)
        ) {
          handlePushData(response.notification.request.content.data);
        }
      });

    void loadInitialNotificationResponseOnce(
      Notifications.getLastNotificationResponseAsync,
    )
      .then((response) => {
        if (
          cancelled ||
          !response ||
          !claimNotificationResponse("recipe-result-recovery", response)
        ) {
          return;
        }
        handlePushData(response.notification.request.content.data);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      receivedSub.remove();
      responseSub.remove();
    };
  }, [isAuthenticated, recoverResultFromPush]);

  const requestRecommendation = useCallback(async () => {
    const existingRequest = requestInFlightRef.current;
    if (existingRequest) {
      await existingRequest;
      return;
    }
    if (
      !isAuthenticatedRef.current ||
      pollerRef.current?.isRunning ||
      (statusRef.current !== "idle" && statusRef.current !== "error")
    ) {
      return;
    }

    invalidateActiveRun();
    const requestGeneration = requestGenerationRef.current;
    statusRef.current = "loading";
    setState((prev) => ({
      ...prev,
      status: "loading",
      requestedAt: null,
    }));

    showTopToast({
      message: "레시피 생성에 최대 2분이 소요됩니다. 완료되면 알려드릴게요!",
      variant: "info",
    });

    const operation = (async () => {
      try {
        await requestAiRecipeGeneration();
      } catch (error) {
        if (
          requestGenerationRef.current !== requestGeneration ||
          !mountedRef.current ||
          !isAuthenticatedRef.current
        ) {
          return;
        }

        // 409 means the server already has this user's generation in flight.
        // Join it through /result instead of issuing another POST or failing.
        if (!isAxiosError(error) || error.response?.status !== 409) {
          console.log("[Recipe Gen Error]", error);
          statusRef.current = "error";
          setState((prev) => ({ ...prev, status: "error" }));
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
                "레시피 생성을 요청하지 못했어요.",
              ),
              variant: "error",
            });
          }
          return;
        }
      }

      if (
        requestGenerationRef.current !== requestGeneration ||
        !mountedRef.current ||
        !isAuthenticatedRef.current
      ) {
        return;
      }

      const acceptedAt = Date.now();
      setState((prev) => ({
        ...prev,
        requestedAt: new Date(acceptedAt),
      }));
      await pollerRef.current?.start(acceptedAt);
    })();

    requestInFlightRef.current = operation;
    try {
      await operation;
    } finally {
      if (requestInFlightRef.current === operation) {
        requestInFlightRef.current = null;
      }
    }
  }, [invalidateActiveRun, showTopToast]);

  const markSwiping = useCallback(() => {
    if (statusRef.current !== "ready") return;
    statusRef.current = "swiping";
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
    invalidateActiveRun();
    cacheWriteGenerationRef.current += 1;
    statusRef.current = "idle";
    setState((prev) => ({
      ...prev,
      status: "idle",
      recommendedRecipes: [],
      rawRecipes: [],
    }));
    // Consumed → drop the persisted cache so the next mount doesn't
    // resurrect already-handled recommendations.
    void clearPersistedRecommendation();
  }, [invalidateActiveRun]);

  const reset = useCallback(() => {
    invalidateActiveRun();
    cacheWriteGenerationRef.current += 1;
    statusRef.current = "idle";
    setState(createInitialRecommendationState());
    void clearPersistedRecommendation();
  }, [invalidateActiveRun]);

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
      }}
    >
      {children}
    </RecipeRecommendationContext.Provider>
  );
}
