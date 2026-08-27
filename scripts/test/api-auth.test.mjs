// Auth harness for the 401 handling in services/api.ts's response interceptor.
//
// Everything here drives the real exported `api` client, so the interceptor
// under test is the shipping one. Only the transport is faked.

import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { isAxiosError } from "axios";
import { api, changePassword } from "@/services/api";
import { installTransport, seedSession } from "./support/transport.mjs";

// Exactly the two shapes the backend emits for 401.
const CREDENTIAL_401 = {
  status: "error",
  code: "INVALID_CREDENTIALS",
  message: "이메일 또는 비밀번호가 일치하지 않습니다.",
};
const EXPIRED_401 = {
  error: "Unauthorized",
  message: "토큰이 만료되었거나 유효하지 않습니다.",
};

const PASSWORD_PATH = "/api/users/me/password";
const ME_PATH = "/api/users/me";

const fail401 = (data) => () => ({ status: 401, data });
const expiredThenOk = (attempt) =>
  attempt === 1 ? { status: 401, data: EXPIRED_401 } : { status: 200, data: { ok: true } };

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

// ── 1. credential 401 → no refresh, no retry, no logout, original error ──────

test("1. 401 + code INVALID_CREDENTIALS is rejected as-is, without refreshing", async () => {
  const t = install({ routes: { [PASSWORD_PATH]: fail401(CREDENTIAL_401) } });

  const error = await expectRejection(
    api.patch(PASSWORD_PATH, { currentPassword: "wrong-pw", newPassword: "NewPassword1!" }),
  );

  assert.equal(t.refreshAttempts.length, 0, "refresh must not be called");
  assert.equal(t.attemptsFor(PASSWORD_PATH).length, 1, "request must not be retried");
  assert.equal(t.logoutEvents.length, 0, "logout must not be emitted");
  assert.equal(t.tokensRefreshedEvents.length, 0);

  // The caller receives the untouched AxiosError: status + body still readable.
  assert.ok(isAxiosError(error), "must stay an AxiosError, not a wrapped Error");
  assert.equal(error.response.status, 401);
  assert.equal(error.response.data.code, "INVALID_CREDENTIALS");
  assert.equal(error.response.data.message, CREDENTIAL_401.message);
  assert.equal(error.config._retry, undefined, "_retry must not be marked");
});

test("1b. tokens in SecureStore survive a credential 401", async () => {
  install({ routes: { [PASSWORD_PATH]: fail401(CREDENTIAL_401) } });
  const { tokenStorage } = await import("@/services/tokenStorage");

  await expectRejection(api.patch(PASSWORD_PATH, { currentPassword: "wrong-pw" }));

  assert.equal(await tokenStorage.getAccessToken(), "access-1");
  assert.equal(await tokenStorage.getRefreshToken(), "refresh-1");
});

test("1c. the skip log never leaks the request body or a password", async () => {
  install({ routes: { [PASSWORD_PATH]: fail401(CREDENTIAL_401) } });
  globalThis.__DEV__ = true;

  const lines = [];
  const realLog = console.log;
  console.log = (...args) => {
    lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  };
  try {
    await expectRejection(
      api.patch(PASSWORD_PATH, {
        currentPassword: "hunter2-current",
        newPassword: "hunter2-next!",
      }),
    );
  } finally {
    console.log = realLog;
  }

  const output = lines.join("\n");
  assert.ok(output.includes("[API AUTH]"), "the skip should be observable in dev logs");
  assert.ok(output.includes(PASSWORD_PATH), "path is fine to log");
  assert.ok(!output.includes("hunter2-current"), "current password must be masked");
  assert.ok(!output.includes("hunter2-next"), "new password must be masked");
});

// ── 2. expiry 401 → unchanged behavior ───────────────────────────────────────

test("2. 401 without a code field still refreshes once and retries the request", async () => {
  const t = install({ routes: { [ME_PATH]: expiredThenOk } });

  const { data } = await api.get(ME_PATH);

  assert.deepEqual(data, { ok: true });
  assert.equal(t.refreshAttempts.length, 1, "refresh runs exactly once");
  const tries = t.attemptsFor(ME_PATH);
  assert.equal(tries.length, 2, "original request retried exactly once");
  assert.match(String(tries[1].authorization), /Bearer access-2/, "retry uses the new token");
});

// ── 3. undecidable bodies → fall back to today's behavior ────────────────────

for (const [label, body] of [
  ["no body", undefined],
  ["null body", null],
  ["string body", "Unauthorized"],
  ["array body", ["INVALID_CREDENTIALS"]],
  ["numeric code", { code: 401 }],
  ["null code", { code: null }],
  ["different code", { status: "error", code: "INVALID_TOKEN" }],
]) {
  test(`3. 401 with ${label} falls back to refresh`, async () => {
    const t = install({
      routes: {
        [ME_PATH]: (attempt) =>
          attempt === 1 ? { status: 401, data: body } : { status: 200, data: { ok: true } },
      },
    });

    await api.get(ME_PATH);

    assert.equal(t.refreshAttempts.length, 1, "must behave exactly as before the change");
    assert.equal(t.attemptsFor(ME_PATH).length, 2);
  });
}

test("3b. code matching is exact — no substring or case-insensitive match", async () => {
  for (const code of ["invalid_credentials", "X_INVALID_CREDENTIALS", "INVALID_CREDENTIALS_X"]) {
    transport?.dispose();
    await seedSession();
    const t = install({
      routes: {
        [ME_PATH]: (attempt) =>
          attempt === 1
            ? { status: 401, data: { status: "error", code } }
            : { status: 200, data: { ok: true } },
      },
    });

    await api.get(ME_PATH);
    assert.equal(t.refreshAttempts.length, 1, `${code} must not match`);
  }
});

// ── 4. single-flight refresh is untouched ────────────────────────────────────

test("4. concurrent expiry 401s share one refresh", async () => {
  const paths = ["/api/recipes", "/api/user-ingredients", "/api/notifications"];
  const routes = Object.fromEntries(paths.map((p) => [p, expiredThenOk]));
  const t = install({ routes });

  const results = await Promise.all(paths.map((p) => api.get(p)));

  assert.equal(t.refreshAttempts.length, 1, "refresh must be single-flight");
  for (const [i, p] of paths.entries()) {
    assert.deepEqual(results[i].data, { ok: true });
    assert.equal(t.attemptsFor(p).length, 2);
  }
});

// ── 5. mixed concurrency ─────────────────────────────────────────────────────

test("5. an expiry 401 and a credential 401 in flight together stay independent", async () => {
  const t = install({
    routes: {
      [ME_PATH]: expiredThenOk,
      [PASSWORD_PATH]: fail401(CREDENTIAL_401),
    },
  });

  const [expired, credential] = await Promise.allSettled([
    api.get(ME_PATH),
    api.patch(PASSWORD_PATH, { currentPassword: "wrong-pw" }),
  ]);

  assert.equal(expired.status, "fulfilled");
  assert.equal(credential.status, "rejected");

  assert.equal(t.refreshAttempts.length, 1, "only the expiry 401 triggers refresh");
  assert.equal(t.attemptsFor(ME_PATH).length, 2);
  assert.equal(
    t.attemptsFor(PASSWORD_PATH).length,
    1,
    "the credential request must not ride the refresh result",
  );
  assert.equal(credential.reason.response.status, 401);
  assert.equal(credential.reason.response.data.code, "INVALID_CREDENTIALS");
  assert.equal(t.logoutEvents.length, 0);
});

// ── 6. the existing exclusion list still wins ────────────────────────────────

test("6. /api/users/refresh is still excluded from refresh-on-401", async () => {
  const t = install({ routes: { "/api/users/refresh": fail401(EXPIRED_401) } });

  const error = await expectRejection(api.post("/api/users/refresh", { refreshToken: "r" }));

  assert.equal(t.refreshAttempts.length, 0, "no nested refresh");
  assert.equal(t.attemptsFor("/api/users/refresh").length, 1);
  assert.equal(error.response.status, 401);
});

test("6b. /api/users/login with a credential 401 still passes through untouched", async () => {
  const t = install({ routes: { "/api/users/login": fail401(CREDENTIAL_401) } });

  const error = await expectRejection(
    api.post("/api/users/login", { email: "a@b.c", password: "wrong-pw" }),
  );

  assert.equal(t.refreshAttempts.length, 0);
  assert.equal(t.attemptsFor("/api/users/login").length, 1);
  assert.equal(error.response.data.code, "INVALID_CREDENTIALS");
  assert.equal(t.logoutEvents.length, 0);
});

test("6c. /api/users/password/reset (prefix rule) is still excluded", async () => {
  const t = install({ routes: { "/api/users/password/reset": fail401(EXPIRED_401) } });

  await expectRejection(api.post("/api/users/password/reset", { resetToken: "t" }));

  assert.equal(t.refreshAttempts.length, 0);
  assert.equal(t.attemptsFor("/api/users/password/reset").length, 1);
});

// ── regression guards on the paths the change must not touch ────────────────

test("7a. a failing refresh on an expiry 401 still forces logout", async () => {
  const t = install({
    routes: { [ME_PATH]: fail401(EXPIRED_401) },
    refresh: () => ({ status: 401, data: EXPIRED_401 }),
  });

  await expectRejection(api.get(ME_PATH));

  assert.equal(t.refreshAttempts.length, 1);
  assert.equal(t.logoutEvents.length, 1, "expiry path must still expire the session");
});

test("7b. non-401 responses are untouched even when they carry the code", async () => {
  const t = install({
    routes: { [ME_PATH]: () => ({ status: 500, data: { code: "INVALID_CREDENTIALS" } }) },
  });

  const error = await expectRejection(api.get(ME_PATH));

  assert.equal(t.refreshAttempts.length, 0);
  assert.equal(t.attemptsFor(ME_PATH).length, 1);
  assert.equal(error.response.status, 500);
});

// ── 8. the password-change success contract ─────────────────────────────────

test("8. changePassword resolves on 204 with an empty body", async () => {
  const t = install({
    routes: { [PASSWORD_PATH]: () => ({ status: 204, data: "" }) },
  });

  await changePassword("Old-pw1@", "New-pw1@");

  assert.equal(t.attemptsFor(PASSWORD_PATH).length, 1);
  assert.equal(t.refreshAttempts.length, 0);
  // 세션 정리는 화면이 AuthContext.endLocalSession으로 수행한다 —
  // 여기서 logout 이벤트가 튀면 안내 토스트 없이 튕기는 옛 동작으로 돌아간다.
  assert.equal(t.logoutEvents.length, 0);
});
