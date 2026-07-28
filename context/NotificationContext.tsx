/**
 * KeepEat — in-app notification state (lifted from AppHeaderRight).
 *
 * Owns the paged list, cursor, loading flag, and read-state mutations so
 * every screen sees one shared source of truth. Notification taps from the
 * tray and Expo push responses share one per-ID read-and-route handler.
 *
 * Subscribers
 *   - AppHeaderRight (per-tab instances) → bell badge + popup data
 * Auth coupling
 *   Initial page fetches once when `isAuthenticated` flips to true. On
 *   logout (false), local state is cleared so the next session doesn't
 *   inherit the previous user's items — mirrors the implicit cleanup that
 *   happened when AppHeaderRight used to unmount on logout.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { AppState, type AppStateStatus } from "react-native";

import type {
  AppNotification,
  NotificationId,
  NotificationPushData,
} from "@/constants/domain";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/Toast";
import {
  deleteNotification,
  deleteNotifications,
  fetchNotificationsPage,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/services/notifications";
import {
  parseNotificationPushData,
  routeForNotificationType,
} from "@/utils/notificationRouting";

// ─── Context ──────────────────────────────────────────────────────────────────

interface NotificationContextValue {
  items: AppNotification[];
  unreadCount: number;
  hasNext: boolean;
  loading: boolean;
  /** Reset to page 1. Used on modal open + auth-driven initial fetch. */
  refresh: () => Promise<void>;
  /** Append the next page. Used by FlatList onEndReached. */
  loadMore: () => Promise<void>;
  markAllRead: () => Promise<void>;
  handleNotificationPress: (data: NotificationPushData) => void;
  /** 단일 알림 삭제 — 낙관적 제거 + 실패 시 롤백. */
  removeNotification: (id: NotificationId) => Promise<void>;
  /** 일괄 알림 삭제 — 선택된 ids만. 낙관적 제거 + 실패 시 롤백. */
  removeNotifications: (ids: NotificationId[]) => Promise<void>;
  /**
   * 배지(unreadCount)만 가볍게 동기화하는 throttle 내장 진입점. 목록은 안
   * 건드림 — refresh()와 달리 페이지 GET / cursor / loading 토글이 없어 탭
   * 전환 같은 빈번한 트리거에서 부담 없이 호출 가능. 마지막 호출 후
   * UNREAD_REFRESH_THROTTLE_MS 이내 재호출은 스킵한다.
   */
  maybeRefreshUnreadCount: () => void;
}

// 경량 unread-count 갱신 throttle 간격. 탭 전환 연타를 흡수하되, 의도적
// 재확인(예: 다른 탭 갔다 수 초 뒤 복귀) 반응성은 유지하는 균형값.
const UNREAD_REFRESH_THROTTLE_MS = 5000;

const NotificationContext = createContext<NotificationContextValue | undefined>(
  undefined,
);

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error(
      "useNotifications must be used inside <NotificationProvider>",
    );
  }
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = useAuth();

  const [items, setItems] = useState<AppNotification[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [hasNext, setHasNext] = useState(true);
  const [loading, setLoading] = useState(false);
  // 서버 unread-count를 기준으로 하되 개별/전체 읽음 시 즉시 낙관 반영한다.
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const itemsRef = useRef<AppNotification[]>([]);
  const unreadCountRef = useRef(0);
  const readInFlightRef = useRef<
    Map<NotificationId, Promise<void>>
  >(new Map());
  const markAllInFlightRef = useRef<Promise<void> | null>(null);
  const stateGenerationRef = useRef(0);
  // count-only GET이 읽음 mutation이나 전체 refresh보다 늦게 도착해 최신
  // optimistic/server state를 덮지 못하도록 요청 세대를 무효화한다.
  const unreadCountRequestGenerationRef = useRef(0);

  // 진행 중인 전체 refresh Promise를 공유해 foreground push, 알림함 open,
  // AppState resume가 겹쳐도 한 요청만 실행하고 읽음 mutation과 직렬화한다.
  const refreshingRef = useRef<Promise<void> | null>(null);
  const initialFetchedRef = useRef(false);
  // 탭 전환 기반 경량 unread-count 갱신의 throttle 타임스탬프.
  const lastUnreadFetchRef = useRef<number>(0);

  const commitItems = useCallback((next: AppNotification[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const updateItems = useCallback(
    (updater: (current: AppNotification[]) => AppNotification[]) => {
      const next = updater(itemsRef.current);
      commitItems(next);
      return next;
    },
    [commitItems],
  );

  const commitUnreadCount = useCallback((next: number) => {
    const normalized = Math.max(0, next);
    unreadCountRef.current = normalized;
    setUnreadCount(normalized);
  }, []);

  const refresh = useCallback(async () => {
    const existing = refreshingRef.current;
    if (existing) {
      await existing;
      return;
    }

    const stateGeneration = stateGenerationRef.current;
    const operation = (async () => {
      setLoading(true);
      // 이미 시작된 count-only GET은 이 전체 refresh보다 오래된 결과다.
      unreadCountRequestGenerationRef.current += 1;

      // 먼저 시작된 읽음 mutation을 정착시킨 뒤 서버 최신값을 조회한다.
      // 이 operation이 refreshingRef에 공개된 뒤 시작되는 mutation은 반대로
      // refresh 완료를 기다리므로 양방향 순서에서 stale overwrite가 없다.
      const markAllInFlight = markAllInFlightRef.current;
      if (markAllInFlight) await markAllInFlight;
      await Promise.allSettled([...readInFlightRef.current.values()]);
      if (stateGenerationRef.current !== stateGeneration) return;

      // 페이지 GET과 unread-count GET을 병렬로. 한쪽 실패가 다른 쪽을 막지
      // 않도록 allSettled. 페이지 실패 시엔 list state를 유지(기존 정책)하고,
      // unread-count 실패 시엔 배지도 그대로 둔다(stale ≪ wiping).
      const [pageResult, countResult] = await Promise.allSettled([
        fetchNotificationsPage(null),
        fetchUnreadCount(),
      ]);
      if (stateGenerationRef.current !== stateGeneration) return;

      if (pageResult.status === "fulfilled") {
        commitItems(pageResult.value.items);
        setNextCursor(pageResult.value.nextCursor);
        setHasNext(pageResult.value.hasNext);
      }
      if (countResult.status === "fulfilled") {
        // 직후 탭 focus가 같은 count를 다시 요청하지 않도록 경량 refresh
        // throttle에도 전체 refresh 성공 시각을 공유한다.
        lastUnreadFetchRef.current = Date.now();
        commitUnreadCount(countResult.value);
      }
    })();
    refreshingRef.current = operation;

    try {
      await operation;
    } finally {
      if (refreshingRef.current === operation) {
        refreshingRef.current = null;
        setLoading(false);
      }
    }
  }, [commitItems, commitUnreadCount]);

  const maybeRefreshUnreadCount = useCallback(() => {
    if (!isAuthenticated) return;
    // 전체 refresh 또는 읽음 mutation이 이미 server truth를 정리 중이면
    // count-only GET을 추가하지 않는다.
    if (
      refreshingRef.current ||
      markAllInFlightRef.current ||
      readInFlightRef.current.size > 0
    ) {
      return;
    }
    const now = Date.now();
    if (now - lastUnreadFetchRef.current < UNREAD_REFRESH_THROTTLE_MS) return;
    lastUnreadFetchRef.current = now;
    const stateGeneration = stateGenerationRef.current;
    const requestGeneration = ++unreadCountRequestGenerationRef.current;
    fetchUnreadCount()
      .then((count) => {
        if (
          stateGenerationRef.current !== stateGeneration ||
          unreadCountRequestGenerationRef.current !== requestGeneration ||
          refreshingRef.current ||
          markAllInFlightRef.current ||
          readInFlightRef.current.size > 0
        ) {
          return;
        }
        commitUnreadCount(count);
      })
      // 일시 실패는 무시 — 다음 탭 전환 또는 전체 refresh에서 정정.
      .catch(() => {});
  }, [isAuthenticated, commitUnreadCount]);

  const loadMore = useCallback(async () => {
    if (loading || !hasNext) return;
    setLoading(true);
    try {
      const page = await fetchNotificationsPage(nextCursor);
      updateItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
      setHasNext(page.hasNext);
    } catch {
      // Logger handles details; the tray just stops paging on failure.
      setHasNext(false);
    } finally {
      setLoading(false);
    }
  }, [loading, hasNext, nextCursor, updateItems]);

  const markRead = useCallback(
    async (id: NotificationId) => {
      const invocationGeneration = stateGenerationRef.current;
      const initialInFlight = readInFlightRef.current.get(id);
      if (initialInFlight) {
        await initialInFlight;
        return;
      }

      // 먼저 시작된 전체 refresh/전체 읽음을 정착시킨다. 대기 중 새 작업이
      // 시작될 수 있으므로 둘 다 없을 때까지 확인한다.
      while (true) {
        const refreshInFlight = refreshingRef.current;
        if (refreshInFlight) {
          await refreshInFlight;
          if (stateGenerationRef.current !== invocationGeneration) return;
          continue;
        }
        const markAllInFlight = markAllInFlightRef.current;
        if (markAllInFlight) {
          await markAllInFlight;
          if (stateGenerationRef.current !== invocationGeneration) return;
          continue;
        }
        break;
      }

      const inFlight = readInFlightRef.current.get(id);
      if (inFlight) {
        await inFlight;
        return;
      }

      const target = itemsRef.current.find((item) => item.id === id);
      if (target?.isRead) return;

      const optimisticallyRead = target !== undefined;
      const stateGeneration = stateGenerationRef.current;
      let decrementedUnreadCount = false;
      unreadCountRequestGenerationRef.current += 1;

      if (optimisticallyRead) {
        updateItems((current) =>
          current.map((item) =>
            item.id === id ? { ...item, isRead: true } : item,
          ),
        );
        if (unreadCountRef.current > 0) {
          commitUnreadCount(unreadCountRef.current - 1);
          decrementedUnreadCount = true;
        }
      }

      const operation = (async () => {
        try {
          await markNotificationRead(id);
        } catch {
          // 로그아웃으로 상태 세대가 바뀌었다면 이전 세션 snapshot을 복원하지 않는다.
          if (
            optimisticallyRead &&
            stateGenerationRef.current === stateGeneration
          ) {
            let restored = false;
            updateItems((current) => {
              const currentTarget = current.find((item) => item.id === id);
              if (!currentTarget?.isRead) return current;
              restored = true;
              return current.map((item) =>
                item.id === id ? { ...item, isRead: false } : item,
              );
            });
            if (restored && decrementedUnreadCount) {
              commitUnreadCount(unreadCountRef.current + 1);
            }
          }
        }
      })();
      readInFlightRef.current.set(id, operation);

      try {
        await operation;
      } finally {
        if (readInFlightRef.current.get(id) === operation) {
          readInFlightRef.current.delete(id);
        }
      }
    },
    [commitUnreadCount, updateItems],
  );

  const markAllRead = useCallback(async () => {
    const existing = markAllInFlightRef.current;
    if (existing) {
      await existing;
      return;
    }

    const invocationGeneration = stateGenerationRef.current;
    const refreshInFlight = refreshingRef.current;
    if (refreshInFlight) await refreshInFlight;
    if (stateGenerationRef.current !== invocationGeneration) return;

    // refresh를 기다리는 동안 다른 전체 읽음이 시작됐을 수 있다.
    const racedMarkAll = markAllInFlightRef.current;
    if (racedMarkAll) {
      await racedMarkAll;
      return;
    }

    const stateGeneration = invocationGeneration;
    const operation = (async () => {
      // 먼저 시작된 단건 요청의 성공/rollback을 확정한 뒤 snapshot을 잡는다.
      // 이 promise를 ref에 공개하므로 이후 단건 요청은 전체 요청 뒤에 이어진다.
      await Promise.allSettled([...readInFlightRef.current.values()]);
      if (stateGenerationRef.current !== stateGeneration) return;

      unreadCountRequestGenerationRef.current += 1;
      const snapshotItems = itemsRef.current;
      const snapshotUnreadCount = unreadCountRef.current;
      updateItems((current) =>
        current.map((notification) => ({ ...notification, isRead: true })),
      );
      commitUnreadCount(0);

      try {
        await markAllNotificationsRead();
      } catch {
        if (stateGenerationRef.current === stateGeneration) {
          commitItems(snapshotItems);
          commitUnreadCount(snapshotUnreadCount);
        }
      }
    })();
    markAllInFlightRef.current = operation;

    try {
      await operation;
    } finally {
      if (markAllInFlightRef.current === operation) {
        markAllInFlightRef.current = null;
      }
    }
  }, [commitItems, commitUnreadCount, updateItems]);

  // 삭제 후 리스트가 적게 남고 hasNext면 빈 화면 방지 위해 다음 페이지를
  // 한 번 끌어옴. loading 중엔 호출 안 함 → 무한루프 가드. 임계치는 페이지
  // 사이즈의 1/4 정도(과한 fetch 회피). loadMore는 hasNext/loading 자체
  // 가드를 한 번 더 갖는다.
  const LOW_WATERMARK = 5;
  const maybeBackfill = useCallback((remaining: number) => {
    if (remaining < LOW_WATERMARK && hasNext && !loading) {
      loadMore();
    }
  }, [hasNext, loading, loadMore]);

  const removeNotification = useCallback(
    async (id: NotificationId) => {
      const snapshot = itemsRef.current;
      if (!snapshot.some((notification) => notification.id === id)) return;

      const next = snapshot.filter((notification) => notification.id !== id);
      commitItems(next);
      try {
        await deleteNotification(id);
        maybeBackfill(next.length);
      } catch {
        commitItems(snapshot);
      }
    },
    [commitItems, maybeBackfill],
  );

  const removeNotifications = useCallback(
    async (ids: NotificationId[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const snapshot = itemsRef.current;
      if (!snapshot.some((notification) => idSet.has(notification.id))) return;

      const next = snapshot.filter(
        (notification) => !idSet.has(notification.id),
      );
      commitItems(next);
      try {
        await deleteNotifications(ids);
        maybeBackfill(next.length);
      } catch {
        commitItems(snapshot);
      }
    },
    [commitItems, maybeBackfill],
  );

  // Auth-driven lifecycle: first fetch when authenticated, clear on logout.
  useEffect(() => {
    if (!isAuthenticated) {
      stateGenerationRef.current += 1;
      unreadCountRequestGenerationRef.current += 1;
      commitItems([]);
      setNextCursor(null);
      setHasNext(true);
      commitUnreadCount(0);
      setLoading(false);
      readInFlightRef.current.clear();
      markAllInFlightRef.current = null;
      refreshingRef.current = null;
      initialFetchedRef.current = false;
      return;
    }
    if (initialFetchedRef.current) return;
    initialFetchedRef.current = true;
    refresh();
  }, [isAuthenticated, refresh, commitItems, commitUnreadCount]);

  // Background/inactive→active 복귀 시 목록 첫 페이지와 unread count를 함께
  // 동기화한다. 백그라운드에서 JS push listener가 놓친 이벤트의 fallback이며,
  // 최초 mount가 이미 active인 경우는 prev 비교로 복귀로 오인하지 않는다.
  const prevAppStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const prev = prevAppStateRef.current;
      prevAppStateRef.current = next;
      if (next !== "active" || prev === "active") return;
      if (!isAuthenticated) return;
      void refresh();
    });
    return () => sub.remove();
  }, [isAuthenticated, refresh]);

  // 알림함 카드, foreground dropdown, OS push response가 공유하는 유일한 탭
  // handler. 개별 읽음 실패는 내부에서 rollback하며 navigation을 막지 않는다.
  // notificationId가 없는 구형 push는 읽음 API 없이 type route만 수행한다.
  const handleNotificationPress = useCallback(
    ({ notificationId, type }: NotificationPushData) => {
      if (notificationId !== undefined) {
        void markRead(notificationId);
      }
      if (type !== undefined) {
        const route = routeForNotificationType(type);
        if (route) router.push(route);
      }
    },
    [markRead],
  );

  // Foreground push reception: the OS handler suppresses the banner for all
  // types (see RecipeRecommendationContext.setNotificationHandler) — we
  // surface a light in-app drop-down instead and refresh so the badge updates
  // without waiting for the user to open the tray. Showing the dropdown alone
  // never changes read state; only its explicit tap reaches the common handler.
  const { showNotification } = useToast();
  useEffect(() => {
    if (!isAuthenticated) return;
    const sub = Notifications.addNotificationReceivedListener((notif) => {
      void refresh();
      const body = notif.request.content.body;
      if (!body) return;
      // 제목 줄로 쓸 푸시 title. 없으면 NotificationView가 "KeepEat" fallback.
      const title = notif.request.content.title ?? undefined;
      const pushData = parseNotificationPushData(notif.request.content.data);
      const isActionable =
        pushData.notificationId !== undefined || pushData.type !== undefined;
      showNotification(
        body,
        isActionable
          ? () => handleNotificationPress(pushData)
          : undefined,
        title,
      );
    });
    return () => sub.remove();
  }, [isAuthenticated, refresh, showNotification, handleNotificationPress]);

  // Tap response listener: routes by payload type for both foreground taps
  // (after toast) and background-pull taps. Cold-start initial route is
  // handled by the effect below — this one covers any tap after launch.
  useEffect(() => {
    if (!isAuthenticated) return;
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const pushData = parseNotificationPushData(
          response.notification.request.content.data,
        );
        if (
          pushData.notificationId === undefined &&
          pushData.type === undefined
        ) {
          return;
        }
        handleNotificationPress(pushData);
      },
    );
    return () => sub.remove();
  }, [isAuthenticated, handleNotificationPress]);

  // Cold-start: if the app was launched by tapping a push, route once.
  // A ref guards against the strict-mode double-mount re-firing the same
  // navigation.
  const coldStartedRef = useRef(false);
  useEffect(() => {
    if (!isAuthenticated || coldStartedRef.current) return;
    coldStartedRef.current = true;
    let cancelled = false;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (cancelled || !response) return;
        const pushData = parseNotificationPushData(
          response.notification.request.content.data,
        );
        if (
          pushData.notificationId === undefined &&
          pushData.type === undefined
        ) {
          return;
        }
        handleNotificationPress(pushData);
      })
      // 네이티브 API 실패 — unhandled rejection 방지용 silent catch.
      // 콜드 스타트 라우팅이 실패할 뿐 사용자 플로우엔 영향 없음.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, handleNotificationPress]);

  const value = useMemo<NotificationContextValue>(
    () => ({
      items,
      unreadCount,
      hasNext,
      loading,
      refresh,
      loadMore,
      markAllRead,
      handleNotificationPress,
      removeNotification,
      removeNotifications,
      maybeRefreshUnreadCount,
    }),
    [
      items,
      unreadCount,
      hasNext,
      loading,
      refresh,
      loadMore,
      markAllRead,
      handleNotificationPress,
      removeNotification,
      removeNotifications,
      maybeRefreshUnreadCount,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
