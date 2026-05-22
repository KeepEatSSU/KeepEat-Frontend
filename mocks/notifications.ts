/**
 * KeepEat — mock notifications for the in-app notification tray.
 *
 * Replace with a real GET /api/notifications call when the backend lands.
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
    createdAt: isoMinutesAgo(0.5), // 방금 전
  },
  {
    id: 2,
    type: "recipe_ready",
    title: "레시피 추천이 준비됐어요!",
    body: "냉장고 재료로 만들 수 있는 3가지 메뉴가 있어요.",
    isRead: false,
    createdAt: isoMinutesAgo(45), // 45분 전
  },
  {
    id: 3,
    type: "weekly_cheer",
    title: "이번 주 최고예요! 🎉",
    body: "KeepEat과 함께 4번이나 식재료를 구출했어요!",
    isRead: false,
    createdAt: isoHoursAgo(3), // 3시간 전
  },
  {
    id: 4,
    type: "notice",
    title: "[KeepEat] 새로운 기능 안내",
    body: "이제 레시피를 즐겨찾기 할 수 있어요!",
    isRead: true,
    createdAt: isoDaysAgo(1), // 1일 전
  },
  {
    id: 5,
    type: "expiry_soon",
    title: "우유가 곧 만료돼요",
    body: "3일 후 만료 예정이에요.",
    isRead: true,
    createdAt: isoDaysAgo(3), // 3일 전
  },
  {
    id: 6,
    type: "notice",
    title: "[KeepEat] 업데이트 안내",
    body: "더 빠르고 부드러워졌어요.",
    isRead: false,
    createdAt: isoDaysAgo(10), // 10일 전 → 날짜 표기
  },
];
