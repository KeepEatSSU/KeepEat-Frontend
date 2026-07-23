/**
 * KeepEat — in-app notification tray data source.
 *
 * Wraps the backend's notification endpoints behind functions that speak the
 * frontend's domain type (`AppNotification`). Translation between the two
 * happens here so the UI never sees backend enum casing.
 *
 * Endpoints
 *   GET   /api/notifications?cursor=&size=20  → { notifications, nextCursor, hasNext }
 *   PATCH /api/notifications/{id}/read         → 200
 *   PATCH /api/notifications/read-all          → 200
 *   GET   /api/notifications/unread-count      → { unreadCount: number }
 *
 * `mocks/notifications.ts` is now unreferenced — left in place so the dev
 * can swap it back in if the backend list is empty during integration.
 */

import { api } from "@/services/api";
import type {
  AppNotification,
  NotificationId,
  NotificationType,
} from "@/constants/domain";

export const NOTIFICATIONS_PAGE_SIZE = 20;

export interface NotificationPage {
  items: AppNotification[];
  /** Server-supplied opaque cursor. Pass back as-is on the next fetch. */
  nextCursor: number | null;
  hasNext: boolean;
}

// ─── API → domain mapping ────────────────────────────────────────────────────

const TYPE_MAP: Record<string, NotificationType> = {
  NOTICE: "notice",
  EXPIRY_SOON: "expiry_soon",
  RECIPE_READY: "recipe_ready",
};

interface RawNotification {
  id: NotificationId;
  type: string;
  title: string;
  body: string;
  targetId?: number | string;
  isRead: boolean;
  createdAt: string;
}

function mapNotificationFromApi(raw: RawNotification): AppNotification {
  return {
    id: raw.id,
    // Unknown / future enums fall back to "notice" so the icon set has
    // a deterministic visual instead of crashing on a missing TYPE_VISUAL key.
    type: TYPE_MAP[raw.type] ?? "notice",
    title: raw.title,
    body: raw.body,
    targetId: raw.targetId,
    isRead: raw.isRead,
    createdAt: raw.createdAt,
  };
}

// ─── List ────────────────────────────────────────────────────────────────────

interface NotificationsApiResponse {
  notifications: RawNotification[];
  nextCursor: number | null;
  hasNext: boolean;
}

/**
 * Cursor pagination. First page passes `cursor: null` — we omit the param so
 * the URL is `?size=20` rather than `?cursor=null&size=20`, matching the
 * "no cursor on first page" convention.
 */
export async function fetchNotificationsPage(
  cursor: number | null,
  size: number = NOTIFICATIONS_PAGE_SIZE,
): Promise<NotificationPage> {
  const params: { cursor?: number; size: number } = { size };
  if (cursor !== null) params.cursor = cursor;

  const { data } = await api.get<NotificationsApiResponse>(
    "/api/notifications",
    { params },
  );

  return {
    items: data.notifications.map(mapNotificationFromApi),
    nextCursor: data.nextCursor,
    hasNext: data.hasNext,
  };
}

// ─── Read state ──────────────────────────────────────────────────────────────

export async function markNotificationRead(id: NotificationId): Promise<void> {
  await api.patch(`/api/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.patch("/api/notifications/read-all");
}

// ─── Delete (DELETE /api/notifications/{id}, DELETE /api/notifications) ─────

/** 단일 알림 삭제 — 일반 모드 카드 X 버튼이 호출. */
export async function deleteNotification(id: NotificationId): Promise<void> {
  await api.delete(`/api/notifications/${id}`);
}

/**
 * 일괄 알림 삭제 — 다중선택 모드에서 선택된 ids 배열로 요청. axios DELETE는
 * body를 `data`로 실어보낸다. `deleteUserIngredients` 패턴과 동일.
 */
export async function deleteNotifications(
  ids: NotificationId[],
): Promise<void> {
  await api.delete("/api/notifications", { data: { ids } });
}

// ─── Push token (POST/DELETE /api/notifications/token) ───────────────────────
// Expo push token을 서버에 등록/삭제. AuthContext의 login/logout 흐름이
// `services/pushNotifications.ts`의 convenience wrapper 경유로 호출.

export async function registerPushToken(token: string): Promise<void> {
  await api.post("/api/notifications/token", { token });
}

export async function deletePushToken(token: string): Promise<void> {
  // axios DELETE는 body를 `data`로 실어보낸다. 백엔드 스펙은
  // `{ token }` body 방식이라 query param이 아님에 주의.
  await api.delete("/api/notifications/token", { data: { token } });
}

// ─── Unread count ────────────────────────────────────────────────────────────
// 종 아이콘 배지의 server-truth. 페이지-1 derivation을 대체해 ① 페이지-2 이상의
// unread도 정확히 잡고 ② 다른 디바이스/시점의 변화도 GET 호출만으로 반영.
// 응답은 `{ unreadCount: number }` 단일 필드 — 백엔드가 Map<String, Long>으로
// 직렬화해 Swagger에 additionalProp으로 보이지만 실 키는 unreadCount 하나뿐.

interface UnreadCountResponse {
  unreadCount: number;
}

export async function fetchUnreadCount(): Promise<number> {
  const { data } = await api.get<UnreadCountResponse>(
    "/api/notifications/unread-count",
  );
  return data.unreadCount;
}
