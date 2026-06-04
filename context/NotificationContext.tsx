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
import { AppState, type AppStateStatus } from "react-native";

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
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
  markTypeNotificationsRead,
} from "@/services/notifications";
import {
  resolveNotificationAction,
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
  // 배지 숫자의 server-truth. items derived(페이지-1 한정)에서 서버 GET
  // /unread-count 기반으로 전환. mutation 직후엔 잠깐 stale일 수 있는데
  // (Phase 2에서 ±N 즉시 보정으로 해결 예정) 다음 refresh / active 복귀 /
  // 푸시 수신 / modal open 중 가장 빠른 트리거에서 자동 정정된다.
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // ref (not state) keeps `refresh` identity stable — open-modal subscribers
  // can include it in useEffect deps without retrigger loops.
  const refreshingRef = useRef(false);
  const initialFetchedRef = useRef(false);
  // 경량 unread-count 갱신의 throttle 타임스탬프. AppState 복귀·탭 전환이
  // 공유해 5초 내 연속 트리거를 1회로 흡수.
  const lastUnreadFetchRef = useRef<number>(0);

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
        setItems(pageResult.value.items);
        setNextCursor(pageResult.value.nextCursor);
        setHasNext(pageResult.value.hasNext);
      }
      if (countResult.status === "fulfilled") {
        setUnreadCount(countResult.value);
      }
    } finally {
      setLoading(false);
      refreshingRef.current = false;
    }
  }, []);

  const maybeRefreshUnreadCount = useCallback(() => {
    if (!isAuthenticated) return;
    const now = Date.now();
    if (now - lastUnreadFetchRef.current < UNREAD_REFRESH_THROTTLE_MS) return;
    lastUnreadFetchRef.current = now;
    fetchUnreadCount()
      .then(setUnreadCount)
      // 일시 실패는 무시 — 다음 트리거(탭 전환 / 복귀 / push / modal)에서 정정.
      .catch(() => {});
  }, [isAuthenticated]);

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
    // 가드 정책 변경: items에 unread가 없어도 서버 PATCH는 항상 시도.
    // 이유: 푸시 직후 receivedListener의 refresh 전에 markTypeRead가
    // 돌면 items가 stale(새 알림 누락)이라, 옛 가드("items unread 0이면
    // 스킵")가 서버 호출 자체를 막아 서버 isRead가 false로 남던 버그.
    // PATCH /read-all/{type}은 멱등이라 unread 0이어도 무해.
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
    try {
      await markTypeNotificationsRead(backendNotificationType(type));
      // 서버 성공 후 — items 낙관적 flip이 안 됐던 경우(stale 가드 통과)에도
      // 같은 타입 잔여 unread를 retroactive 동기화. 다음 refresh에 새 알림이
      // 들어와도 이미 isRead=true. 중복 호출 안전(이미 read면 no-op).
      if (!hadUnread) {
        setItems((prev) =>
          prev.map((n) =>
            n.type === type && !n.isRead ? { ...n, isRead: true } : n,
          ),
        );
      }
    } catch {
      if (hadUnread) setItems(snapshot);
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
      setUnreadCount(0);
      initialFetchedRef.current = false;
      return;
    }
    if (initialFetchedRef.current) return;
    initialFetchedRef.current = true;
    refresh();
  }, [isAuthenticated, refresh]);

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

  // 세 진입 경로(드롭다운 onTap / OS 푸시 탭 / 콜드스타트) 공통 라우팅 — 단일
  // 결정 함수 resolveNotificationAction으로 통일. 새 푸시 전제라 isRead=false,
  // ready 가드는 swipe 화면(A-1)에 위임하므로 isRecommendationReady=true.
  // RECIPE_READY 읽음은 결과를 실제로 보여줄 때만 처리해야 하므로(A-1) 진입
  // 경로에선 markType을 건너뛰고 swipe 화면에 위임 — 결과 못 본 채 읽힘 방지.
  // EXPIRY_SOON/NOTICE는 진입 시 즉시 읽음(NOTICE는 route 없어도 읽음 → ★4 해소).
  const applyEntryAction = useCallback(
    (domainType: NotificationType) => {
      const action = resolveNotificationAction(domainType, {
        isRead: false,
        isRecommendationReady: true,
      });
      if (action.markType && action.markType !== "recipe_ready") {
        markTypeRead(action.markType);
      }
      if (action.route) {
        router.push(action.route);
      }
    },
    [markTypeRead],
  );

  // Foreground push reception: the OS handler suppresses the banner for all
  // types (see RecipeRecommendationContext.setNotificationHandler) — we
  // surface a light in-app drop-down instead and refresh so the badge updates
  // without waiting for the user to open the tray. The drop-down's onTap routes
  // via the same applyEntryAction as a real push tap (단일 결정 함수 공유).
  const { showNotification } = useToast();
  useEffect(() => {
    if (!isAuthenticated) return;
    const sub = Notifications.addNotificationReceivedListener((notif) => {
      refresh();
      const body = notif.request.content.body;
      if (!body) return;
      // 제목 줄로 쓸 푸시 title. 없으면 NotificationView가 "KeepEat" fallback.
      const title = notif.request.content.title ?? undefined;
      const apiType = notif.request.content.data?.type;
      const domainType =
        typeof apiType === "string" ? toDomainNotificationType(apiType) : null;
      if (domainType) {
        // 모든 유효 타입에 onTap 부착 — NOTICE는 route 없이 읽음만(★4), 그 외엔
        // 라우팅. RECIPE_READY 읽음은 swipe에 위임(applyEntryAction이 스킵).
        showNotification(body, () => applyEntryAction(domainType), title);
      } else {
        showNotification(body, undefined, title);
      }
    });
    return () => sub.remove();
  }, [isAuthenticated, refresh, showNotification, applyEntryAction]);

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
        applyEntryAction(domainType);
      },
    );
    return () => sub.remove();
  }, [isAuthenticated, applyEntryAction]);

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
        applyEntryAction(domainType);
      })
      // 네이티브 API 실패 — unhandled rejection 방지용 silent catch.
      // 콜드 스타트 라우팅이 실패할 뿐 사용자 플로우엔 영향 없음.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, applyEntryAction]);

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
      maybeRefreshUnreadCount,
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
      maybeRefreshUnreadCount,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}
