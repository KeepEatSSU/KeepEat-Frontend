/**
 * 레시피 재료 amount의 인분 스케일링 유틸.
 *
 * 백엔드는 amount를 자유 문자열("150g", "2개", "적당량", "약간")로 내려주고
 * 정형 수치/단위 분리가 없다. 그래서 클라이언트가 "선두 수치 + 나머지 단위"
 * 패턴으로만 파싱해 인분 곱셈을 적용한다. 매치 안 되는 표기("적당량" 등)는
 * 원문을 그대로 노출 — 의미 없는 "1적당량" 같은 결과를 만들지 않기 위함.
 *
 * recipe-detail / cooking-ready 양쪽이 같은 헬퍼를 통해 동일한 스케일링
 * 동작을 갖도록 한다.
 */

export function parseAmount(amountStr: string): { num: number; unit: string } {
  const match = amountStr.match(/^([\d.]+)(.*)$/);
  if (match) {
    return { num: parseFloat(match[1]), unit: match[2].trim() };
  }
  return { num: 1, unit: amountStr };
}

export function formatAmount(amountStr: string, portions: number): string {
  if (portions === 1) return amountStr;

  const parsed = parseAmount(amountStr);
  // "적당량" 같은 비수치 표기는 원문 유지. parseAmount의 폴백이 num=1을
  // 주긴 하지만 unit이 원문 전체라 NaN 체크가 더 안전 — 숫자 파싱 실패는
  // 명시적으로 폴백.
  if (isNaN(parsed.num)) return amountStr;

  const scaled = parsed.num * portions;
  const scaledStr = scaled % 1 === 0 ? String(scaled) : scaled.toFixed(1);
  return `${scaledStr}${parsed.unit}`;
}
