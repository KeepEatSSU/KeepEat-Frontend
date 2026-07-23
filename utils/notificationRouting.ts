import type {
  NotificationId,
  NotificationPushData,
  NotificationType,
} from "@/constants/domain";

export type NotificationRoute = "/" | "/recipe-swipe";

export function routeForNotificationType(
  type: NotificationType,
): NotificationRoute | null {
  switch (type) {
    case "expiry_soon":
      return "/";
    case "recipe_ready":
      return "/recipe-swipe";
    case "notice":
      return null;
  }
}

// 백엔드는 알림 타입을 UPPER_SNAKE_CASE로 내려준다 (예: "RECIPE_READY"). 도메인
// 모델은 lowercase ("recipe_ready")이므로 Push 파싱과 라우팅 경계에서 한 번만
// 변환한다. 알 수 없는 값은 null을 반환해 호출자가 안전하게 무시할 수 있게 한다.
const VALID_DOMAIN_TYPES: ReadonlySet<NotificationType> = new Set([
  "notice",
  "expiry_soon",
  "recipe_ready",
]);

export function toDomainNotificationType(
  apiType: string,
): NotificationType | null {
  const lower = apiType.toLowerCase() as NotificationType;
  return VALID_DOMAIN_TYPES.has(lower) ? lower : null;
}

export function normalizeNotificationId(
  value: unknown,
): NotificationId | undefined {
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  ) {
    return value;
  }

  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;

  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function parseNotificationPushData(
  value: unknown,
): NotificationPushData {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const raw = value as Record<string, unknown>;
  const notificationId = normalizeNotificationId(raw.notificationId);
  const type =
    typeof raw.type === "string"
      ? (toDomainNotificationType(raw.type) ?? undefined)
      : undefined;

  return { notificationId, type };
}
