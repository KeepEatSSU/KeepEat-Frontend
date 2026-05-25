/**
 * KeepEat — in-app notification state (lifted from AppHeaderRight).
 *
 * Owns the paged list, cursor, loading flag, and read-state mutations so
 * every screen sees one shared source of truth. Behavior is intentionally
 * identical to the previous AppHeaderRight-local implementation — this
 * round is structural only. New features (type-scoped reads, push routing,
 * foreground push handler) land in the next round.
 *
 * Subscribers
 *   - AppHeaderRight (per-tab instances) → bell badge + popup data
 *   - Future: each screen's useFocusEffect → markTypeRead(...)
 *
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

import type {
  AppNotification,
  NotificationType,
} from "@/constants/domain";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/Toast";
import {
  backendNotificationType,
  deleteNotification,
  deleteNotifications,
  fetchNotificationsPage,
  markAllNotificationsRead,
  markNotificationRead,
  markTypeNotificationsRead,
} from "@/services/notifications";
import {
  routeForNotificationType,
  toDomainNotificationType,
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
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  /**
   * Mark every unread notification of a given type as read. Driven by
   * useFocusEffect in destination screens (home/recipe tab, recipe-swipe).
   * No-op when there's nothing unread for that type, so the focus-effect
   * call is safe to fire on every entry. Operates on currently-loaded
   * `items` only (page-1 scope, method A from diagnosis).
   */
  markTypeRead: (type: NotificationType) => Promise<void>;
  /** 단일 알림 삭제 — 낙관적 제거 + 실패 시 롤백. */
  removeNotification: (id: number) => Promise<void>;
  /** 일괄 알림 삭제 — 선택된 ids만. 낙관적 제거 + 실패 시 롤백. */
  removeNotifications: (ids: number[]) => Promise<void>;
}

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

  // ref (not state) keeps `refresh` identity stable — open-modal subscribers
  // can include it in useEffect deps without retrigger loops.
  const refreshingRef = useRef(false);
  const initialFetchedRef = useRef(false);

  const unreadCount = items.filter((n) => !n.isRead).length;

  const refresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setLoading(true);
    try {
      const page = await fetchNotificationsPage(null);
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setHasNext(page.hasNext);
    } catch {
      // Keep current state on failure rather than wiping the list.
    } finally {
      setLoading(false);
      refreshingRef.current = false;
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loading || !hasNext) return;
    setLoading(true);
    try {
      const page = await fetchNotificationsPage(nextCursor);
      setItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
      setHasNext(page.hasNext);
    } catch {
      // Logger handles details; the tray just stops paging on failure.
      setHasNext(false);
    } finally {
      setLoading(false);
    }
  }, [loading, hasNext, nextCursor]);

  const markRead = useCallback(async (id: number) => {
    let snapshot: AppNotification[] = [];
    setItems((prev) => {
      snapshot = prev;
      return prev.map((n) => (n.id === id ? { ...n, isRead: true } : n));
    });
    try {
      await markNotificationRead(id);
    } catch {
      setItems(snapshot);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    let snapshot: AppNotification[] = [];
    setItems((prev) => {
      snapshot = prev;
      return prev.map((n) => ({ ...n, isRead: true }));
    });
    try {
      await markAllNotificationsRead();
    } catch {
      setItems(snapshot);
    }
  }, []);

  const markTypeRead = useCallback(async (type: NotificationType) => {
    // Optimistic: flip the type's unread items to read in-memory, then
    // issue a single PATCH /api/notifications/read-all/{TYPE}. Rolls back
    // to the pre-flip snapshot on failure. No-op when nothing unread for
    // that type — focus effects can fire freely without burning requests.
    let snapshot: AppNotification[] = [];
    let hadUnread = false;
    setItems((prev) => {
      const unreadOfType = prev.filter((n) => !n.isRead && n.type === type);
      if (unreadOfType.length === 0) return prev;
      hadUnread = true;
      snapshot = prev;
      const idSet = new Set(unreadOfType.map((n) => n.id));
      return prev.map((n) => (idSet.has(n.id) ? { ...n, isRead: true } : n));
    });
    if (!hadUnread) return;
    try {
      await markTypeNotificationsRead(backendNotificationType(type));
    } catch {
      setItems(snapshot);
    }
  }, []);

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
    async (id: number) => {
      let snapshot: AppNotification[] = [];
      let nextLength = 0;
      setItems((prev) => {
        if (!prev.some((n) => n.id === id)) return prev;
        snapshot = prev;
        const next = prev.filter((n) => n.id !== id);
        nextLength = next.length;
        return next;
      });
      if (snapshot.length === 0) return;
      try {
        await deleteNotification(id);
        maybeBackfill(nextLength);
      } catch {
        setItems(snapshot);
      }
    },
    [maybeBackfill],
  );

  const removeNotifications = useCallback(
    async (ids: number[]) => {
      if (ids.length === 0) return;
      let snapshot: AppNotification[] = [];
      let nextLength = 0;
      const idSet = new Set(ids);
      setItems((prev) => {
        if (!prev.some((n) => idSet.has(n.id))) return prev;
        snapshot = prev;
        const next = prev.filter((n) => !idSet.has(n.id));
        nextLength = next.length;
        return next;
      });
      if (snapshot.length === 0) return;
      try {
        await deleteNotifications(ids);
        maybeBackfill(nextLength);
      } catch {
        setItems(snapshot);
      }
    },
    [maybeBackfill],
  );

  // Auth-driven lifecycle: first fetch when authenticated, clear on logout.
  useEffect(() => {
    if (!isAuthenticated) {
      setItems([]);
      setNextCursor(null);
      setHasNext(true);
      initialFetchedRef.current = false;
      return;
    }
    if (initialFetchedRef.current) return;
    initialFetchedRef.current = true;
    refresh();
  }, [isAuthenticated, refresh]);

  // Foreground push reception: the OS handler suppresses the banner (see
  // RecipeRecommendationContext.setNotificationHandler) — we surface a
  // light in-app toast instead and refresh the list so the badge updates
  // without waiting for the user to open the tray.
  const { showNotification } = useToast();
  useEffect(() => {
    if (!isAuthenticated) return;
    const sub = Notifications.addNotificationReceivedListener((notif) => {
      refresh();
      const body = notif.request.content.body;
      if (body) showNotification(body);
    });
    return () => sub.remove();
  }, [isAuthenticated, refresh, showNotification]);

  // Tap response listener: routes by payload type for both foreground taps
  // (after toast) and background-pull taps. Cold-start initial route is
  // handled by the effect below — this one covers any tap after launch.
  useEffect(() => {
    if (!isAuthenticated) return;
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const apiType = response.notification.request.content.data?.type;
        if (typeof apiType !== "string") return;
        const domainType = toDomainNotificationType(apiType);
        if (!domainType) return;
        const path = routeForNotificationType(domainType);
        if (path) router.push(path);
      },
    );
    return () => sub.remove();
  }, [isAuthenticated]);

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
        const apiType = response.notification.request.content.data?.type;
        if (typeof apiType !== "string") return;
        const domainType = toDomainNotificationType(apiType);
        if (!domainType) return;
        const path = routeForNotificationType(domainType);
        if (path) router.push(path);
      })
      // 네이티브 API 실패 — unhandled rejection 방지용 silent catch.
      // 콜드 스타트 라우팅이 실패할 뿐 사용자 플로우엔 영향 없음.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const value = useMemo<NotificationContextValue>(
    () => ({
      items,
      unreadCount,
      hasNext,
      loading,
      refresh,
      loadMore,
      markRead,
      markAllRead,
      markTypeRead,
      removeNotification,
      removeNotifications,
    }),
    [
      items,
      unreadCount,
      hasNext,
      loading,
      refresh,
      loadMore,
      markRead,
      markAllRead,
      markTypeRead,
      removeNotification,
      removeNotifications,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
