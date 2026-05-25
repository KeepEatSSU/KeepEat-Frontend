/**
 * D-Day calculation utility for expiration dates + relative-time formatter
 * shared by the notification tray.
 */

import { Colors } from "@/constants/theme";

/** Format a Date as "YYYY-MM-DD" in local time (safe for react-native-calendars). */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse a "YYYY-MM-DD" string into a local-time Date. */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export type DDayStatus = "expired" | "urgent" | "caution" | "safe";

export interface DDayInfo {
  /** Remaining days (negative = expired) */
  daysLeft: number;
  /** Formatted text: "D-5", "D-Day", "D+15" */
  text: string;
  /** "expired" | "urgent" | "caution" | "safe" */
  status: DDayStatus;
}

/**
 * 숫자형 daysLeft만 받아 text/status 산출 — by-recipe 등 서버가 미리 계산해
 * 보낸 daysLeft를 그대로 표기에 쓰는 화면(cooking-complete)이 직접 호출 가능.
 * `getDDayInfo`도 내부적으로 이 함수를 호출해 출력 일관성 유지.
 *
 *   text: D-N(>0) / D-Day(0) / D+N(<0).  Infinity는 방어적으로 "∞".
 *   status: <0 expired / 0~3 urgent / 4~7 caution / 8+ safe.
 */
export function formatDDay(daysLeft: number): {
  text: string;
  status: DDayStatus;
} {
  if (!Number.isFinite(daysLeft)) {
    return { text: "∞", status: "safe" };
  }

  let text: string;
  if (daysLeft > 0) {
    text = `D-${daysLeft}`;
  } else if (daysLeft === 0) {
    text = "D-Day";
  } else {
    text = `D+${Math.abs(daysLeft)}`;
  }

  let status: DDayStatus;
  if (daysLeft < 0) {
    status = "expired";   // 기한 초과
  } else if (daysLeft <= 3) {
    status = "urgent";    // 임박 (0~3일) → 빨강
  } else if (daysLeft <= 7) {
    status = "caution";   // 주의 (4~7일) → 노랑/주황
  } else {
    status = "safe";      // 안전 (8일+) → 초록
  }

  return { text, status };
}

/**
 * 4단계 status를 화면 색으로 매핑 — 냉장고 카드/요리완료창 등에서 공유.
 * (이전 app/(tabs)/index.tsx 로컬 함수를 utils로 이동, 구현/시그니처 동일.)
 */
export function getDDayBadgeColor(status: string): string {
  switch (status) {
    case "expired":
    case "urgent":
      return Colors.error;
    case "caution":
      return "#F9A825";
    default:
      return Colors.primary;
  }
}

/**
 * Calculate D-Day info from an expiration date.
 * @param expirationDate - ISO string, "MM.DD" (current year assumed), Date, or null
 * @returns DDayInfo — null input returns safe/∞
 */
export function getDDayInfo(
  expirationDate: string | Date | null,
): DDayInfo {
  if (expirationDate === null) {
    return { daysLeft: Infinity, text: "∞", status: "safe" };
  }

  let target: Date;

  if (expirationDate instanceof Date) {
    target = expirationDate;
  } else if (expirationDate.includes("-") || expirationDate.length >= 8) {
    // ISO format or "YYYY.MM.DD"
    target = new Date(expirationDate.replace(/\./g, "-"));
  } else {
    // "MM.DD" format — assume current year
    const [month, day] = expirationDate.split(".").map(Number);
    const now = new Date();
    target = new Date(now.getFullYear(), month - 1, day);
  }

  // Strip time component for accurate day diff
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  const diffMs = target.getTime() - today.getTime();
  const daysLeft = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const { text, status } = formatDDay(daysLeft);
  return { daysLeft, text, status };
}

/**
 * Format a "YYYY-MM-DD" ISO date as the Korean "M월 D일" short form.
 * Returns the input untouched when the shape doesn't match — defensive
 * fallback for whatever the backend might send (or omit).
 */
export function formatKoreanShortDate(iso?: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[2])}월 ${Number(m[3])}일`;
}

/**
 * Render a day count in the most readable Korean unit, prefixed with "약"
 * once the unit is no longer days (because rounding has happened).
 *
 *   < 7        → "N일"             (exact — no "약")
 *   < 30       → "약 N주"           (round days/7)
 *   < 365      → "약 N개월"         (round days/30)
 *   ≥ 365      → "약 N년"           (round days/365)
 *
 * Display-only. The caller is responsible for using the raw day count for
 * any date math — this function intentionally returns just the label.
 */
export function formatDaysApprox(days: number): string {
  if (days < 7) return `${days}일`;
  if (days < 30) return `약 ${Math.round(days / 7)}주`;
  if (days < 365) return `약 ${Math.round(days / 30)}개월`;
  return `약 ${Math.round(days / 365)}년`;
}

/**
 * Format an ISO timestamp as a Korean relative-time label.
 *   < 1 minute  → "방금 전"
 *   < 1 hour    → "N분 전"
 *   < 24 hours  → "N시간 전"
 *   < 7 days    → "N일 전"
 *   otherwise   → "MM월 DD일"
 *
 * Future timestamps (or skewed clocks producing negative diffs) collapse
 * to "방금 전" so the UI never shows a nonsensical "0분 전" or negative.
 */
export function formatRelativeTime(isoDate: string): string {
  const target = new Date(isoDate);
  const diffMs = Date.now() - target.getTime();

  if (diffMs < 60_000) return "방금 전";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;

  const month = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");
  return `${month}월 ${day}일`;
}
