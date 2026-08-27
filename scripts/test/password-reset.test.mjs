// 비밀번호 찾기(재설정) flow의 서비스 계층 + 정책 유틸 하네스.
//
// api-auth.test.mjs와 같은 방식 — 실제 exported `api` 클라이언트와 서비스
// 함수를 그대로 구동하고 transport(axios adapter)만 가짜다. 서버 계약:
//   POST /api/users/password/find         200 plain string / 429 RATE_LIMIT_EXCEEDED
//   POST /api/users/password/find/verify  200 {resetToken, expiresInSeconds} / 400 BAD_REQUEST
//   POST /api/users/password/reset        204 / 401 INVALID_TOKEN / 400 INVALID_INPUT

import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { isAxiosError } from "axios";
import {
  api,
  findPassword,
  getErrorCode,
  getErrorMessage,
  getErrorStatus,
  getRetryAfterSeconds,
  resetPassword,
  verifyPasswordResetCode,
} from "@/services/api";
import {
  isValidPassword,
  PASSWORD_REGEX,
  PW_ALLOWED_CHARSET_REGEX,
  PW_HAS_DIGIT_REGEX,
  PW_HAS_LETTER_REGEX,
  PW_HAS_SPECIAL_REGEX,
  PW_LENGTH_REGEX,
} from "@/utils/passwordPolicy";
import { createSubmitGuard } from "@/utils/submitGuard";
import { installTransport, seedSession } from "./support/transport.mjs";

const FIND_PATH = "/api/users/password/find";
const VERIFY_PATH = "/api/users/password/find/verify";
const RESET_PATH = "/api/users/password/reset";

const RATE_LIMIT_429 = {
  status: 429,
  data: {
    status: "error",
    code: "RATE_LIMIT_EXCEEDED",
    message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
  },
  headers: { "retry-after": "60" },
};
const VERIFY_400 = {
  status: 400,
  data: {
    status: "error",
    code: "BAD_REQUEST",
    message: "인증번호가 일치하지 않습니다.",
  },
};
const INVALID_TOKEN_401 = {
  status: 401,
  data: {
    status: "error",
    code: "INVALID_TOKEN",
    message: "유효하지 않은 토큰입니다.",
  },
};

let transport = null;

function install(options) {
  transport = installTransport(options);
  return transport;
}

beforeEach(async () => {
  await seedSession();
});

afterEach(() => {
  transport?.dispose();
  transport = null;
  globalThis.__DEV__ = false;
});

async function expectRejection(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("expected the request to reject");
}

// ── 1. step1: find ───────────────────────────────────────────────────────────

test("find: 200 plain string is returned verbatim", async () => {
  const t = install({
    routes: {
      [FIND_PATH]: () => ({ status: 200, data: "인증번호가 발송되었습니다." }),
    },
  });

  const message = await findPassword("user@example.com");

  assert.equal(message, "인증번호가 발송되었습니다.");
  assert.equal(t.attemptsFor(FIND_PATH).length, 1);
  assert.deepEqual(JSON.parse(t.attemptsFor(FIND_PATH)[0].data), {
    email: "user@example.com",
  });
});

test("find: 429 exposes code, message and Retry-After seconds", async () => {
  const t = install({ routes: { [FIND_PATH]: () => RATE_LIMIT_429 } });

  const error = await expectRejection(findPassword("user@example.com"));

  assert.equal(getErrorStatus(error), 429);
  assert.equal(getErrorCode(error), "RATE_LIMIT_EXCEEDED");
  assert.equal(getErrorMessage(error, "fallback"), RATE_LIMIT_429.data.message);
  assert.equal(getRetryAfterSeconds(error), 60);
  assert.equal(t.refreshAttempts.length, 0, "password/ prefix must skip refresh");
  assert.equal(t.attemptsFor(FIND_PATH).length, 1);
});

test("find: 429 without a Retry-After header yields null (no invented countdown)", async () => {
  install({
    routes: {
      [FIND_PATH]: () => ({ ...RATE_LIMIT_429, headers: {} }),
    },
  });

  const error = await expectRejection(findPassword("user@example.com"));

  assert.equal(getErrorCode(error), "RATE_LIMIT_EXCEEDED");
  assert.equal(getRetryAfterSeconds(error), null);
});

test("getRetryAfterSeconds: unparseable or negative header values yield null", async () => {
  for (const value of ["soon", "", "-5"]) {
    transport?.dispose();
    install({
      routes: {
        [FIND_PATH]: () => ({
          ...RATE_LIMIT_429,
          headers: { "retry-after": value },
        }),
      },
    });
    const error = await expectRejection(findPassword("user@example.com"));
    assert.equal(getRetryAfterSeconds(error), null, `value ${JSON.stringify(value)}`);
  }
  // 응답이 없는 네트워크 에러 / axios 에러가 아닌 값도 null.
  assert.equal(getRetryAfterSeconds(new Error("boom")), null);
});

// ── 2. step2: verify ─────────────────────────────────────────────────────────

test("verify: 200 returns resetToken and expiresInSeconds", async () => {
  const t = install({
    routes: {
      [VERIFY_PATH]: () => ({
        status: 200,
        data: { resetToken: "reset-token-1", expiresInSeconds: 600 },
      }),
    },
  });

  const result = await verifyPasswordResetCode("user@example.com", "123456");

  assert.deepEqual(result, { resetToken: "reset-token-1", expiresInSeconds: 600 });
  assert.equal(t.attemptsFor(VERIFY_PATH).length, 1);
  assert.deepEqual(JSON.parse(t.attemptsFor(VERIFY_PATH)[0].data), {
    email: "user@example.com",
    code: "123456",
  });
});

test("verify: 400 BAD_REQUEST rejects with the original error, no refresh", async () => {
  const t = install({ routes: { [VERIFY_PATH]: () => VERIFY_400 } });

  const error = await expectRejection(
    verifyPasswordResetCode("user@example.com", "000000"),
  );

  assert.ok(isAxiosError(error));
  assert.equal(getErrorStatus(error), 400);
  assert.equal(getErrorCode(error), "BAD_REQUEST");
  assert.equal(getErrorMessage(error, "fallback"), VERIFY_400.data.message);
  assert.equal(t.refreshAttempts.length, 0);
  assert.equal(t.logoutEvents.length, 0);
});

test("verify: 429 is distinguishable from 400 by status and code", async () => {
  install({ routes: { [VERIFY_PATH]: () => RATE_LIMIT_429 } });

  const error = await expectRejection(
    verifyPasswordResetCode("user@example.com", "123456"),
  );

  assert.equal(getErrorStatus(error), 429);
  assert.equal(getErrorCode(error), "RATE_LIMIT_EXCEEDED");
  assert.equal(getRetryAfterSeconds(error), 60);
});

// ── 3. step3: reset ──────────────────────────────────────────────────────────

test("reset: resolves on 204 with an empty body, single request, no logout", async () => {
  const t = install({
    routes: { [RESET_PATH]: () => ({ status: 204, data: "" }) },
  });

  await resetPassword("reset-token-1", "NewPassw0rd!");

  assert.equal(t.attemptsFor(RESET_PATH).length, 1);
  assert.deepEqual(JSON.parse(t.attemptsFor(RESET_PATH)[0].data), {
    resetToken: "reset-token-1",
    newPassword: "NewPassw0rd!",
  });
  assert.equal(t.refreshAttempts.length, 0);
  // 비로그인 플로우 — 서비스 계층이 세션 이벤트를 건드리면 안 된다.
  assert.equal(t.logoutEvents.length, 0);
});

test("reset: 401 INVALID_TOKEN passes through untouched — no refresh, no retry, no logout", async () => {
  const t = install({ routes: { [RESET_PATH]: () => INVALID_TOKEN_401 } });

  const error = await expectRejection(resetPassword("stale-token", "NewPassw0rd!"));

  assert.equal(getErrorStatus(error), 401);
  assert.equal(getErrorCode(error), "INVALID_TOKEN");
  assert.equal(t.refreshAttempts.length, 0, "password/ prefix must skip refresh");
  assert.equal(t.attemptsFor(RESET_PATH).length, 1, "must not retry");
  assert.equal(t.logoutEvents.length, 0);
});

test("reset: 400 INVALID_INPUT rejects with the server message", async () => {
  install({
    routes: {
      [RESET_PATH]: () => ({
        status: 400,
        data: {
          status: "error",
          code: "INVALID_INPUT",
          message: "비밀번호 형식이 올바르지 않습니다.",
        },
      }),
    },
  });

  const error = await expectRejection(resetPassword("reset-token-1", "short"));

  assert.equal(getErrorStatus(error), 400);
  assert.equal(getErrorCode(error), "INVALID_INPUT");
  assert.equal(
    getErrorMessage(error, "fallback"),
    "비밀번호 형식이 올바르지 않습니다.",
  );
});

// ── 4. resetToken must never reach the logs ──────────────────────────────────

test("dev logs mask resetToken in both the verify response and the reset request", async () => {
  install({
    routes: {
      [VERIFY_PATH]: () => ({
        status: 200,
        data: { resetToken: "secret-reset-token", expiresInSeconds: 600 },
      }),
      [RESET_PATH]: () => ({ status: 204, data: "" }),
    },
  });
  globalThis.__DEV__ = true;

  const lines = [];
  const realLog = console.log;
  console.log = (...args) => {
    lines.push(
      args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "),
    );
  };
  try {
    await verifyPasswordResetCode("user@example.com", "123456");
    await resetPassword("secret-reset-token", "hunter2-Next!");
  } finally {
    console.log = realLog;
  }

  const output = lines.join("\n");
  assert.ok(output.includes(VERIFY_PATH), "requests should still be logged");
  assert.ok(!output.includes("secret-reset-token"), "resetToken must be masked");
  assert.ok(!output.includes("hunter2-Next"), "newPassword must be masked");
  assert.ok(!output.includes("123456"), "the emailed code must be masked");
});

// ── 5. duplicate-tap guard → exactly one network request ─────────────────────

test("submit guard: a same-tick double tap sends exactly one request", async () => {
  const t = install({
    routes: { [FIND_PATH]: () => ({ status: 200, data: "ok" }) },
  });
  const guard = createSubmitGuard();
  const submit = () => guard(() => findPassword("user@example.com"));

  const [first, second] = await Promise.all([submit(), submit()]);

  assert.equal(t.attemptsFor(FIND_PATH).length, 1, "second tap must not hit the wire");
  assert.equal(first, "ok");
  assert.equal(second, undefined, "the blocked call resolves to undefined");
});

test("submit guard: unlocks after completion — sequential submits both go through", async () => {
  const t = install({
    routes: { [FIND_PATH]: () => ({ status: 200, data: "ok" }) },
  });
  const guard = createSubmitGuard();

  await guard(() => findPassword("user@example.com"));
  await guard(() => findPassword("user@example.com"));

  assert.equal(t.attemptsFor(FIND_PATH).length, 2);
});

test("submit guard: unlocks after a failure so the user can retry", async () => {
  const t = install({ routes: { [FIND_PATH]: () => RATE_LIMIT_429 } });
  const guard = createSubmitGuard();
  const submit = () =>
    guard(async () => {
      try {
        await findPassword("user@example.com");
      } catch {
        // 화면과 동일 — 에러는 삼키고 상태로 표현한다.
      }
    });

  await submit();
  await submit();

  assert.equal(t.attemptsFor(FIND_PATH).length, 2, "a failed submit must not stay locked");
});

// ── 6. password policy — 서버 @Pattern과의 동치 경계값 ───────────────────────

const VALID_PASSWORDS = [
  "Aa1@aaaa", //  8자 — 하한 경계
  "Aa1@aaaaaaaaaaa", // 15자 — 상한 경계
  "a1@aaaaa", // 소문자만으로도 영문 충족
  "A1@AAAAA", // 대문자만으로도 영문 충족
  "Zz9@$!%*#?&Zz9a", // 허용 특수문자 전부 포함, 15자
];

const INVALID_PASSWORDS = [
  ["Aa1@aaa", "7자 — 너무 짧음"],
  ["Aa1@aaaaaaaaaaaa", "16자 — 너무 긺"],
  ["Aa1^aaaa", "허용 외 특수문자 ^"],
  ["Aa1@aaa aaa", "공백 포함"],
  ["Aa1@아아아아", "한글 포함"],
  ["12345@78", "영문 없음"],
  ["abcde@fg", "숫자 없음"],
  ["abcd1234", "특수문자 없음"],
  ["", "빈 문자열"],
  [" Aa1@aaaa", "선행 공백 — trim하지 않으므로 탈락해야 한다"],
];

test("password policy: boundary values match the server pattern", () => {
  for (const pw of VALID_PASSWORDS) {
    assert.equal(isValidPassword(pw), true, `should accept ${JSON.stringify(pw)}`);
  }
  for (const [pw, why] of INVALID_PASSWORDS) {
    assert.equal(isValidPassword(pw), false, `should reject ${JSON.stringify(pw)} (${why})`);
  }
});

test("password policy: the checklist pieces combined are equivalent to the full regex", () => {
  // 화면은 조각 정규식들의 AND로 제출 가능 여부를 판단한다. 조각과 전체
  // 패턴이 어긋나면 "체크리스트는 초록인데 서버는 400"이 재발한다.
  const samples = [
    ...VALID_PASSWORDS,
    ...INVALID_PASSWORDS.map(([pw]) => pw),
    "@$!%*#?&1a", // 특수문자 위주
    "aaaaaaa1@", // 9자 혼합
    "Aa1@aaaa\n", // 제어 문자
    "Aa1@aaaa😀", // 이모지
  ];
  for (const pw of samples) {
    const pieces =
      PW_LENGTH_REGEX.test(pw) &&
      PW_HAS_LETTER_REGEX.test(pw) &&
      PW_HAS_DIGIT_REGEX.test(pw) &&
      PW_HAS_SPECIAL_REGEX.test(pw) &&
      PW_ALLOWED_CHARSET_REGEX.test(pw);
    assert.equal(
      pieces,
      PASSWORD_REGEX.test(pw),
      `pieces and full regex disagree on ${JSON.stringify(pw)}`,
    );
  }
});
