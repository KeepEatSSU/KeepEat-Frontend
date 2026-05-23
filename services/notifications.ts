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
 *   GET   /api/notifications/unread-count      → { unreadCount: number }   (future)
 *
 * `mocks/notifications.ts` is now unreferenced — left in place so the dev
 * can swap it back in if the backend list is empty during integration.
 */

import { api } from "@/services/api";
import type {
  AppNotification,
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
  WEEKLY_CHEER: "weekly_cheer",
  RECIPE_READY: "recipe_ready",
};

interface RawNotification {
  id: number;
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

export async function markNotificationRead(id: number): Promise<void> {
  await api.patch(`/api/notifications/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.patch("/api/notifications/read-all");
}

// ─── Unread count (future) ───────────────────────────────────────────────────
// Page-1 derivation (`notifications.filter(!isRead).length`) drives the bell
// badge today — accurate enough since unread is usually clustered at the top.
// If we later need a server-truth count (e.g. >20 unread, or syncing across
// tabs), add:
//
//   interface UnreadCountResponse { unreadCount: number }  ← camelCase wrapper, NOT a bare number
//   export async function fetchUnreadCount(): Promise<number> {
//     const { data } = await api.get<UnreadCountResponse>("/api/notifications/unread-count");
//     return data.unreadCount;
//   }
