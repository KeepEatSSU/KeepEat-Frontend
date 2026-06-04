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

// ─── 단일 라우팅 결정 (resolveNotificationAction) ────────────────────────────
//
// 알림 탭의 세 진입 경로(OS 알림 탭 / 인앱 드롭다운 탭 / 알림창 카드 탭)가
// 공유할 "무엇을 할지"의 단일 진실. 이전엔 같은 타입인데도 경로마다 라우팅·
// 읽음·가드가 제각각이었다(RECIPE_READY 빈화면 가드가 알림창에만 있는 등).
//
// 이 함수는 순수(side-effect 없음) — 실제 router.push / markTypeRead 호출과
// 안내 표현(알림창의 hint pill, 그 밖의 toast)은 경로가 blockedReason을 보고
// 수행한다. utils를 leaf로 유지하려고 RecommendationStatus enum 대신 ready
// 여부만 boolean으로 받는다(hint 문구 분기는 status를 가진 경로가 직접 결정).
//
// 백엔드 결과조회(R2: "마지막 추천 결과 GET")가 도입돼 ready 가드가 덜
// 필요해지면 RECIPE_READY 분기만 여기서 손보면 된다.

export type NotificationBlockedReason = "not_ready" | "already_read";

export interface NotificationActionContext {
  /** 알림이 이미 읽음인지. OS/드롭다운(갓 도착한 푸시)은 false로 가정 가능. */
  isRead: boolean;
  /** AI 추천 결과가 swipe로 보여줄 준비가 됐는지(status === "ready"). */
  isRecommendationReady: boolean;
}

export interface NotificationAction {
  /** 이동할 경로. null이면 이동 없음(NOTICE 또는 blocked 케이스). */
  route: NotificationRoute | null;
  /** 읽음 처리할 타입. null이면 읽음 없음(blocked 케이스). */
  markType: NotificationType | null;
  /**
   * 이동이 막힌 이유. null이면 정상. 경로가 이걸 보고 안내 표현을 고른다
   * (알림창=hint pill, OS/드롭다운=toast 또는 무동작).
   */
  blockedReason: NotificationBlockedReason | null;
}

export function resolveNotificationAction(
  type: NotificationType,
  ctx: NotificationActionContext,
): NotificationAction {
  switch (type) {
    case "recipe_ready": {
      // 이미 읽음 = "과거 추천" — 현재 결과와 무관할 수 있어 무반응.
      if (ctx.isRead) {
        return { route: null, markType: null, blockedReason: "already_read" };
      }
      // 결과 미준비면 이동 안 함(빈 swipe 화면 회피). 읽음도 보류 — 사용자가
      // 아직 결과를 못 봤으므로.
      if (!ctx.isRecommendationReady) {
        return { route: null, markType: null, blockedReason: "not_ready" };
      }
      return {
        route: routeForNotificationType("recipe_ready"),
        markType: "recipe_ready",
        blockedReason: null,
      };
    }
    case "expiry_soon":
      return {
        route: routeForNotificationType("expiry_soon"),
        markType: "expiry_soon",
        blockedReason: null,
      };
    case "notice":
      // 목적지 없음(route null)이지만 읽음은 수행 — OS/드롭다운으로 온 NOTICE도
      // 읽음 처리되게(per-경로 누락 해소). 알림창의 per-id 펼침/읽음은 경로가
      // 자체적으로 유지(NOTICE는 알림창이 정당하게 분기하는 유일 타입).
      return {
        route: routeForNotificationType("notice"),
        markType: "notice",
        blockedReason: null,
      };
  }
}
