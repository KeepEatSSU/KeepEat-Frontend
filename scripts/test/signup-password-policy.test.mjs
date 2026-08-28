// signup-profile 비밀번호 정책 정렬 하네스.
//
// 배경: signup-profile.tsx는 인라인 정규식(허용 특수문자 집합이 서버보다
// 넓고 화이트리스트 검사 없음)을 쓰다가 utils/passwordPolicy.ts 조각으로
// 교체됐다. 서버 SignUpRequest의 @Pattern은 change/reset과 문자 단위로
// 동일하므로, 화면의 제출 판정(조각 AND)은 PASSWORD_REGEX와 동치여야 한다.
//
// 화면 컴포넌트는 하네스에서 렌더할 수 없으므로 화면이 조합하는 predicate를
// 그대로 재현해 고정한다. 조각 구성이 바뀌면 이 파일도 함께 갱신할 것.

import test from "node:test";
import assert from "node:assert/strict";
import {
  PASSWORD_REGEX,
  PW_ALLOWED_CHARSET_REGEX,
  PW_HAS_DIGIT_REGEX,
  PW_HAS_LETTER_REGEX,
  PW_HAS_SPECIAL_REGEX,
  PW_LENGTH_REGEX,
} from "@/utils/passwordPolicy";

// signup-profile.tsx의 제출 판정 중 비밀번호 부분과 동일한 조합.
function signupAccepts(pw) {
  const isPwLengthOk = PW_LENGTH_REGEX.test(pw);
  const isPwComplexOk =
    PW_HAS_LETTER_REGEX.test(pw) &&
    PW_HAS_DIGIT_REGEX.test(pw) &&
    PW_HAS_SPECIAL_REGEX.test(pw);
  const isPwCharsetOk = PW_ALLOWED_CHARSET_REGEX.test(pw);
  return isPwLengthOk && isPwComplexOk && isPwCharsetOk;
}

// 교체 전 인라인 정규식은 통과시켰지만 서버 @Pattern은 거부하던 입력들 —
// 회원가입 제출 후에야 400을 맞던 출시 blocker 사례.
const PREVIOUSLY_LEAKED = [
  ["Abcdef1^", "허용 외 특수문자 ^"],
  ["Abcdef1(", "허용 외 특수문자 ("],
  ["Abcdef1_", "허용 외 특수문자 _"],
  ["Aa1@aa a", "공백 포함"],
  ["Aa1@아아아아", "한글 포함 (인라인 정규식엔 화이트리스트가 없었음)"],
];

test("signup 판정: 예전 인라인 정규식이 흘려보내던 입력을 이제 서버와 같이 거부한다", () => {
  for (const [pw, why] of PREVIOUSLY_LEAKED) {
    assert.equal(
      PASSWORD_REGEX.test(pw),
      false,
      `server pattern must reject ${JSON.stringify(pw)} (${why})`,
    );
    assert.equal(
      signupAccepts(pw),
      false,
      `signup must reject ${JSON.stringify(pw)} (${why})`,
    );
  }
});

test("signup 판정: 경계값에서 서버 @Pattern과 완전 동치다", () => {
  const samples = [
    "Aa1@aaaa", // 8자 하한
    "Aa1@aaaaaaaaaaa", // 15자 상한
    "Aa1@aaa", // 7자
    "Aa1@aaaaaaaaaaaa", // 16자
    "Zz9@$!%*#?&Zz9a", // 허용 특수문자 전부
    "12345@78", // 영문 없음
    "abcde@fg", // 숫자 없음
    "abcd1234", // 특수문자 없음
    "", // 빈 문자열
    " Aa1@aaaa", // 선행 공백
    "Aa1@aaaa\n", // 제어 문자
    "Aa1@aaaa😀", // 이모지
    ...PREVIOUSLY_LEAKED.map(([pw]) => pw),
  ];
  for (const pw of samples) {
    assert.equal(
      signupAccepts(pw),
      PASSWORD_REGEX.test(pw),
      `signup predicate and server pattern disagree on ${JSON.stringify(pw)}`,
    );
  }
});
