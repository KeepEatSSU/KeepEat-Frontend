/**
 * KeepEat — 알림 타입별 라우팅 규칙 (원격 푸시 탭 + 알림창 카드 탭 공용).
 *
 * 원격 푸시(NotificationContext)와 알림창 카드(NotificationPopup) 양쪽 모두
 * 같은 헬퍼를 통해 라우팅하도록 통일. 이전엔 두 곳에 따로 구현되어 있어
 * 라우팅 변경 시 누락 위험이 있었다.
 *
 * NOTICE는 목적지가 없으므로 null을 반환 — 원격 푸시 탭 시엔 no-op,
 * 알림창 카드 탭 시에도 닫기만 하고 이동하지 않는다.
 */

import type { NotificationType } from "@/constants/domain";

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
// 모델은 lowercase ("recipe_ready") — 이 변환은 라우팅·읽음처리 양쪽에서 쓰여
// 한 곳에 둔다. 알 수 없는 값(스펙 추가 누락 등)에 대해선 null을 반환해
// 호출자가 안전하게 무시할 수 있게 한다.
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
