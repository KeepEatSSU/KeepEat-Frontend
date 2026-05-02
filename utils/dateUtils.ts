/**
 * D-Day calculation utility for expiration dates.
 */

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

export interface DDayInfo {
  /** Remaining days (negative = expired) */
  daysLeft: number;
  /** Formatted text: "D-5", "D-Day", "D+15" */
  text: string;
  /** "expired" | "urgent" | "caution" | "safe" */
  status: "expired" | "urgent" | "caution" | "safe";
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

  let text: string;
  if (daysLeft > 0) {
    text = `D-${daysLeft}`;
  } else if (daysLeft === 0) {
    text = "D-Day";
  } else {
    text = `D+${Math.abs(daysLeft)}`;
  }

  let status: DDayInfo["status"];
  if (daysLeft < 0) {
    status = "expired";   // 기한 초과
  } else if (daysLeft <= 3) {
    status = "urgent";    // 임박 (0~3일) → 빨강
  } else if (daysLeft <= 7) {
    status = "caution";   // 주의 (4~7일) → 노랑/주황
  } else {
    status = "safe";      // 안전 (8일+) → 초록
  }

  return { daysLeft, text, status };
}
