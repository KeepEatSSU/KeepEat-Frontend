/**
 * 비밀번호 정책 — 서버와 동일한 단일 기준.
 *
 * 서버(PasswordChangeRequest / PasswordResetRequest)의 @Pattern이 유일한 기준:
 *   ^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,15}$
 *
 * 화면 체크리스트가 항목별 피드백을 줄 수 있도록 같은 규칙을 조각으로 나눠
 * 함께 내보낸다. 조각을 전부 합치면 위 전체 패턴과 정확히 동치다 —
 * 새 조건을 추가하거나 조각을 수정할 때는 반드시 전체 패턴과의 동치를
 * 하네스(scripts/test)의 경계값 테스트로 다시 확인할 것.
 *
 * trim을 여기서 하지 않는다: 공백은 화이트리스트 위반으로 "탈락"시켜
 * 사용자에게 알려야 하는 입력이지, 조용히 지워도 되는 입력이 아니다.
 */

export const PW_ALLOWED_SPECIALS = "@$!%*#?&";

// 전체 서버 패턴. 최종 전송 가능 여부는 이 정규식 하나로 판정한다.
export const PASSWORD_REGEX =
  /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,15}$/;

// 체크리스트용 조각들 — 합치면 PASSWORD_REGEX와 동일.
export const PW_LENGTH_REGEX = /^[\s\S]{8,15}$/;
export const PW_HAS_LETTER_REGEX = /[A-Za-z]/;
export const PW_HAS_DIGIT_REGEX = /\d/;
export const PW_HAS_SPECIAL_REGEX = /[@$!%*#?&]/;
export const PW_ALLOWED_CHARSET_REGEX = /^[A-Za-z\d@$!%*#?&]*$/;

/** 서버가 수락할 비밀번호인지 여부. 입력을 변형(trim 등)하지 않는다. */
export function isValidPassword(password: string): boolean {
  return PASSWORD_REGEX.test(password);
}
