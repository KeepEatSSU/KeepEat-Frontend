/**
 * KeepEat — mock notifications for the in-app notification tray.
 *
 * ⚠️ NO LONGER REFERENCED. `services/notifications.ts` now calls
 * `GET /api/notifications` directly. This file is kept as a safety net for
 * dev sessions where the backend list is empty (swap the service body back
 * to `MOCK_NOTIFICATIONS.slice(...)` temporarily). Delete once production
 * notifications are flowing and we have no need for the fallback.
 *
 * `createdAt` is generated relative to "now" so the relative-time labels
 * stay sensible regardless of when the dev opens the tray.
 */

import type { AppNotification } from "@/constants/domain";

const now = new Date();

function isoMinutesAgo(mins: number): string {
  return new Date(now.getTime() - mins * 60 * 1000).toISOString();
}

function isoHoursAgo(hours: number): string {
  return isoMinutesAgo(hours * 60);
}

function isoDaysAgo(days: number): string {
  return isoMinutesAgo(days * 24 * 60);
}

export const MOCK_NOTIFICATIONS: AppNotification[] = [
  {
    id: 1,
    type: "expiry_soon",
    title: "참기름이 곧 만료돼요",
    body: "내일까지예요. 잊지 말고 사용해 주세요.",
    isRead: false,
    createdAt: isoMinutesAgo(0.5),
  },
  {
    id: 2,
    type: "recipe_ready",
    title: "레시피 추천이 준비됐어요!",
    body: "냉장고 재료로 만들 수 있는 3가지 메뉴가 있어요.",
    isRead: false,
    createdAt: isoMinutesAgo(45),
  },
  {
    id: 3,
    type: "weekly_cheer",
    title: "이번 주 최고예요! 🎉",
    body: "KeepEat과 함께 4번이나 식재료를 구출했어요!",
    isRead: false,
    createdAt: isoHoursAgo(3),
  },
  {
    id: 4,
    type: "notice",
    title: "[KeepEat] 새로운 기능 안내",
    body: "이제 레시피를 즐겨찾기 할 수 있어요!",
    isRead: true,
    createdAt: isoDaysAgo(1),
  },
  {
    id: 5,
    type: "expiry_soon",
    title: "우유가 곧 만료돼요",
    body: "3일 후 만료 예정이에요.",
    isRead: true,
    createdAt: isoDaysAgo(3),
  },
  {
    id: 6,
    type: "notice",
    title: "[KeepEat] 업데이트 안내",
    body: "더 빠르고 부드러워졌어요.",
    isRead: false,
    createdAt: isoDaysAgo(10),
  },
  {
    id: 7,
    type: "expiry_soon",
    title: "토마토가 곧 만료돼요",
    body: "2일 후 만료 예정이에요.",
    isRead: false,
    createdAt: isoHoursAgo(5),
  },
  {
    id: 8,
    type: "recipe_ready",
    title: "오늘의 추천 레시피",
    body: "토마토 파스타를 만들어볼까요?",
    isRead: false,
    createdAt: isoHoursAgo(8),
  },
  {
    id: 9,
    type: "weekly_cheer",
    title: "꾸준해요!",
    body: "이번 주에도 알차게 보내고 있어요.",
    isRead: true,
    createdAt: isoDaysAgo(2),
  },
  {
    id: 10,
    type: "expiry_soon",
    title: "양파가 곧 만료돼요",
    body: "5일 후 만료 예정이에요.",
    isRead: true,
    createdAt: isoDaysAgo(4),
  },
  {
    id: 11,
    type: "notice",
    title: "[KeepEat] 이벤트 안내",
    body: "여름 식재료 보관 가이드를 확인해보세요.",
    isRead: true,
    createdAt: isoDaysAgo(5),
  },
  {
    id: 12,
    type: "recipe_ready",
    title: "남은 재료 활용 레시피",
    body: "냉장고 정리에 도움이 될 거예요.",
    isRead: true,
    createdAt: isoDaysAgo(6),
  },
  {
    id: 13,
    type: "expiry_soon",
    title: "감자가 곧 만료돼요",
    body: "7일 후 만료 예정이에요.",
    isRead: true,
    createdAt: isoDaysAgo(7),
  },
  {
    id: 14,
    type: "weekly_cheer",
    title: "이번 주 절약왕!",
    body: "음식물 쓰레기를 줄이는 데 성공했어요.",
    isRead: true,
    createdAt: isoDaysAgo(8),
  },
  {
    id: 15,
    type: "notice",
    title: "[KeepEat] 개인정보처리방침 변경 안내",
    body: "변경된 내용을 확인해주세요.",
    isRead: true,
    createdAt: isoDaysAgo(11),
  },
  {
    id: 16,
    type: "recipe_ready",
    title: "주말 브런치 추천",
    body: "오믈렛은 어떠세요?",
    isRead: true,
    createdAt: isoDaysAgo(12),
  },
  {
    id: 17,
    type: "expiry_soon",
    title: "달걀이 곧 만료돼요",
    body: "다음 주까지 사용해 주세요.",
    isRead: true,
    createdAt: isoDaysAgo(13),
  },
  {
    id: 18,
    type: "weekly_cheer",
    title: "지난주 최고 기록!",
    body: "8개의 식재료를 구출했어요.",
    isRead: true,
    createdAt: isoDaysAgo(14),
  },
  {
    id: 19,
    type: "notice",
    title: "[KeepEat] 점검 안내",
    body: "더 나은 서비스를 위해 잠시 점검합니다.",
    isRead: true,
    createdAt: isoDaysAgo(15),
  },
  {
    id: 20,
    type: "recipe_ready",
    title: "건강한 한 끼 추천",
    body: "오늘은 가벼운 샐러드 어떠세요?",
    isRead: true,
    createdAt: isoDaysAgo(16),
  },
  {
    id: 21,
    type: "expiry_soon",
    title: "두부가 곧 만료돼요",
    body: "오늘까지 사용하시는 게 좋아요.",
    isRead: true,
    createdAt: isoDaysAgo(17),
  },
  {
    id: 22,
    type: "weekly_cheer",
    title: "꾸준한 사용 감사해요",
    body: "당신의 한 끼가 더 풍성해지길 바라요.",
    isRead: true,
    createdAt: isoDaysAgo(18),
  },
  {
    id: 23,
    type: "notice",
    title: "[KeepEat] 신규 카테고리 추가",
    body: "양념/소스 카테고리가 더 세분화됐어요.",
    isRead: true,
    createdAt: isoDaysAgo(19),
  },
  {
    id: 24,
    type: "recipe_ready",
    title: "오늘은 면 요리?",
    body: "보관된 재료로 만드는 잔치국수 어떠세요?",
    isRead: true,
    createdAt: isoDaysAgo(20),
  },
  {
    id: 25,
    type: "expiry_soon",
    title: "버터가 곧 만료돼요",
    body: "10일 후 만료 예정이에요.",
    isRead: true,
    createdAt: isoDaysAgo(21),
  },
  {
    id: 26,
    type: "weekly_cheer",
    title: "이번 달 식재료 마스터!",
    body: "20개의 식재료를 알차게 사용했어요.",
    isRead: true,
    createdAt: isoDaysAgo(22),
  },
  {
    id: 27,
    type: "notice",
    title: "[KeepEat] 푸시 알림 안내",
    body: "프로필에서 알림 설정을 변경할 수 있어요.",
    isRead: true,
    createdAt: isoDaysAgo(23),
  },
  {
    id: 28,
    type: "recipe_ready",
    title: "간단한 야식 추천",
    body: "재료가 부족할 땐 김치볶음밥은 어때요?",
    isRead: true,
    createdAt: isoDaysAgo(24),
  },
  {
    id: 29,
    type: "expiry_soon",
    title: "치즈가 곧 만료돼요",
    body: "이번 주 안에 사용해 주세요.",
    isRead: true,
    createdAt: isoDaysAgo(25),
  },
  {
    id: 30,
    type: "weekly_cheer",
    title: "한 달간 정말 잘했어요!",
    body: "KeepEat 한 달 사용 축하해요.",
    isRead: true,
    createdAt: isoDaysAgo(26),
  },
];
