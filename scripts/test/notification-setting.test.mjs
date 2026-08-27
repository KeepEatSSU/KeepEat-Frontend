// 알림 수신 설정(updateNotificationSetting) 하네스.
//
// 서버 계약 (AppUserController.toggleNotificationSetting):
//   PATCH /api/users/me/notification-setting, body { enabled: boolean }
//   성공 200 + plain-string message. 일반 인증 API — refresh 제외 아님.

import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  getErrorMessage,
  getErrorStatus,
  updateNotificationSetting,
} from "@/services/api";
import { createSubmitGuard } from "@/utils/submitGuard";
import { installTransport, seedSession } from "./support/transport.mjs";

const SETTING_PATH = "/api/users/me/notification-setting";

const EXPIRED_401 = {
  error: "Unauthorized",
  message: "토큰이 만료되었거나 유효하지 않습니다.",
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

test("sends the explicit desired value, not a toggle — body is { enabled }", async () => {
  const t = install({
    routes: { [SETTING_PATH]: () => ({ status: 200, data: "알림 수신이 꺼졌습니다." }) },
  });

  const message = await updateNotificationSetting(false);

  assert.equal(message, "알림 수신이 꺼졌습니다.");
  const [attempt] = t.attemptsFor(SETTING_PATH);
  assert.equal(attempt.method, "PATCH");
  assert.deepEqual(JSON.parse(attempt.data), { enabled: false });
});

test("enabled: true is serialized as-is", async () => {
  const t = install({
    routes: { [SETTING_PATH]: () => ({ status: 200, data: "알림 수신이 켜졌습니다." }) },
  });

  const message = await updateNotificationSetting(true);

  assert.equal(message, "알림 수신이 켜졌습니다.");
  assert.deepEqual(JSON.parse(t.attemptsFor(SETTING_PATH)[0].data), {
    enabled: true,
  });
});

test("this is a regular authed API — an expiry 401 refreshes once and retries", async () => {
  const t = install({
    routes: {
      [SETTING_PATH]: (attempt) =>
        attempt === 1
          ? { status: 401, data: EXPIRED_401 }
          : { status: 200, data: "알림 수신이 켜졌습니다." },
    },
  });

  const message = await updateNotificationSetting(true);

  assert.equal(message, "알림 수신이 켜졌습니다.");
  assert.equal(t.refreshAttempts.length, 1, "must ride the normal refresh path");
  assert.equal(t.attemptsFor(SETTING_PATH).length, 2, "retried exactly once");
  assert.equal(t.logoutEvents.length, 0);
});

test("failure rejects with the server message readable — caller rolls back UI", async () => {
  const t = install({
    routes: {
      [SETTING_PATH]: () => ({
        status: 400,
        data: {
          status: "error",
          code: "BAD_REQUEST",
          message: "알림 수신 여부를 입력해 주세요.",
        },
      }),
    },
  });

  const error = await expectRejection(updateNotificationSetting(true));

  assert.equal(getErrorStatus(error), 400);
  assert.equal(getErrorMessage(error, "fallback"), "알림 수신 여부를 입력해 주세요.");
  assert.equal(t.attemptsFor(SETTING_PATH).length, 1);
  assert.equal(t.logoutEvents.length, 0);
});

test("duplicate tap through the submit guard sends exactly one request", async () => {
  const t = install({
    routes: { [SETTING_PATH]: () => ({ status: 200, data: "알림 수신이 꺼졌습니다." }) },
  });
  const guard = createSubmitGuard();
  const tap = () => guard(() => updateNotificationSetting(false));

  const [first, second] = await Promise.all([tap(), tap()]);

  assert.equal(t.attemptsFor(SETTING_PATH).length, 1);
  assert.equal(first, "알림 수신이 꺼졌습니다.");
  assert.equal(second, undefined, "the second tap must be swallowed, not re-sent");
});
