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
   * 전환·앱 복귀 같은 빈번한 트리거에서 부담 없이 호출 가능. 마지막 호출 후
   * UNREAD_REFRESH_THROTTLE_MS 이내 재호출은 스킵. AppState 복귀와 탭 전환이
   * 같은 ref를 공유해 연속 발화가 1회로 흡수된다.
   */
  maybeRefreshUnreadCount: () => void;
}

// 경량 unread-count 갱신 throttle 간격. 탭 전환 연타·앱 복귀+첫 focus 동시
// 발화를 1회로 흡수하되, 의도적 재확인(예: 다른 탭 갔다 수 초 뒤 복귀) 반응성은
// 유지하는 균형값.
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

  // ref (not state) keeps `refresh` identity stable — open-modal subscribers
  // can include it in useEffect deps without retrigger loops.
  const refreshingRef = useRef(false);
  const initialFetchedRef = useRef(false);
  // 경량 unread-count 갱신의 throttle 타임스탬프. AppState 복귀·탭 전환이
  // 공유해 5초 내 연속 트리거를 1회로 흡수.
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
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setLoading(true);
    try {
      // 페이지 GET과 unread-count GET을 병렬로. 한쪽 실패가 다른 쪽을 막지
      // 않도록 allSettled. 페이지 실패 시엔 list state를 유지(기존 정책)하고,
      // unread-count 실패 시엔 배지도 그대로 둔다(stale ≪ wiping).
      const [pageResult, countResult] = await Promise.allSettled([
        fetchNotificationsPage(null),
        fetchUnreadCount(),
      ]);
      if (pageResult.status === "fulfilled") {
        commitItems(pageResult.value.items);
        setNextCursor(pageResult.value.nextCursor);
        setHasNext(pageResult.value.hasNext);
      }
      if (countResult.status === "fulfilled") {
        commitUnreadCount(countResult.value);
      }
    } finally {
      setLoading(false);
      refreshingRef.current = false;
    }
  }, [commitItems, commitUnreadCount]);

  const maybeRefreshUnreadCount = useCallback(() => {
    if (!isAuthenticated) return;
    const now = Date.now();
    if (now - lastUnreadFetchRef.current < UNREAD_REFRESH_THROTTLE_MS) return;
    lastUnreadFetchRef.current = now;
    fetchUnreadCount()
      .then(commitUnreadCount)
      // 일시 실패는 무시 — 다음 트리거(탭 전환 / 복귀 / push / modal)에서 정정.
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
      // 전체 읽음과 단건 읽음의 rollback이 서로를 덮어쓰지 않도록 먼저 시작된
      // 전체 요청을 정착시킨다. 전체 요청이 실패해도 이어서 이 ID를 단건 처리한다.
      const markAllInFlight = markAllInFlightRef.current;
      if (markAllInFlight) await markAllInFlight;
      if (stateGenerationRef.current !== invocationGeneration) return;

      const inFlight = readInFlightRef.current.get(id);
      if (inFlight) {
        // 최초 호출이 자기 rollback을 담당한다. 중복 탭은 같은 raw request를
        // 기다리되 그 실패를 다시 전파해 unhandled rejection을 만들지 않는다.
        await inFlight.catch(() => {});
        return;
      }

      const target = itemsRef.current.find((item) => item.id === id);
      if (target?.isRead) return;

      const optimisticallyRead = target !== undefined;
      const stateGeneration = stateGenerationRef.current;
      let decrementedUnreadCount = false;

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

      const request = markNotificationRead(id);
      readInFlightRef.current.set(id, request);
      try {
        await request;
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
      } finally {
        if (readInFlightRef.current.get(id) === request) {
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

    const stateGeneration = stateGenerationRef.current;
    const operation = (async () => {
      // 먼저 시작된 단건 요청의 성공/rollback을 확정한 뒤 snapshot을 잡는다.
      // 이 promise를 ref에 공개하므로 이후 단건 요청은 전체 요청 뒤에 이어진다.
      await Promise.allSettled([...readInFlightRef.current.values()]);
      if (stateGenerationRef.current !== stateGeneration) return;

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
      commitItems([]);
      setNextCursor(null);
      setHasNext(true);
      commitUnreadCount(0);
      readInFlightRef.current.clear();
      markAllInFlightRef.current = null;
      initialFetchedRef.current = false;
      return;
    }
    if (initialFetchedRef.current) return;
    initialFetchedRef.current = true;
    refresh();
  }, [isAuthenticated, refresh, commitItems, commitUnreadCount]);

  // Background→active 복귀 시 배지만 가볍게 동기화 — 다른 앱 보다가 KeepEat
  // 으로 돌아온 순간 종 옆 숫자가 곧장 맞도록. 목록(items)은 안 건드림
  // (사용자가 알림창 열면 그때 refresh가 같이 끌어옴). active→active 같은
  // 헛 발화는 prevAppState 비교로 제거하고, 로그아웃 상태면 호출 자체 스킵.
  const prevAppStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const prev = prevAppStateRef.current;
      prevAppStateRef.current = next;
      // background→active 천이에서만. 천이 판정은 여기서, auth/throttle 가드는
      // maybeRefreshUnreadCount 내부에서. 탭 전환과 같은 ref를 공유해 복귀+첫
      // focus가 거의 동시여도 5초 내 1회만 실제 GET.
      if (next !== "active" || prev === "active") return;
      maybeRefreshUnreadCount();
    });
    return () => sub.remove();
  }, [maybeRefreshUnreadCount]);

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
      refresh();
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
