// Push token 등록 하네스 — services/pushNotifications.ts의 ensure 체인.
//
// 재현 시나리오(실기 이슈): 앱 재설치 다음 날 logout(user 2) → OAuth 로그인
// (user 3) 성공 후 POST /api/notifications/token 이 로그 한 줄 없이 빠졌다.
// 재설치는 AsyncStorage(등록 기록)를 지우고 OS 알림 권한을 리셋하며, release
// 빌드에선 __DEV__-gated warn 이 전부 침묵한다. 이 하네스는
//   (1) 침묵하던 조기 return 들이 __DEV__=false 에서도 이유를 로그로 남기고
//   (2) 정상 경로(권한 granted)에서 재설치/사용자 전환 후 등록이 실제로
//       POST 를 내보내는지
// 를 고정한다. __DEV__ 는 setup.mjs 가 false 로 둔 그대로 둔다 — release
// 침묵 회귀를 그대로 재현하기 위해서다.

import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { __mock as notificationsMock } from "expo-notifications";
import { __mock as constantsMock } from "expo-constants";
import {
  clearPushTokenRegistrationState,
  ensurePushTokenRegistered,
} from "@/services/pushNotifications";
import { tokenStorage } from "@/services/tokenStorage";
import { installTransport, seedSession } from "./support/transport.mjs";

const TOKEN_PATH = "/api/notifications/token";
const REGISTRATION_STATE_KEY = "keepeat:pushTokenRegistration";

let transport = null;
let logs = [];
const originalConsole = { log: console.log, warn: console.warn };

function install(options) {
  transport = installTransport(options);
  return transport;
}

function pushLogsOf(pattern) {
  return logs.filter(
    (line) => line.includes("[pushNotifications]") && pattern.test(line),
  );
}

beforeEach(async () => {
  logs = [];
  console.log = (...args) => {
    logs.push(args.map(String).join(" "));
  };
  console.warn = (...args) => {
    logs.push(args.map(String).join(" "));
  };
  notificationsMock.reset();
  constantsMock.projectId = "harness-project-id";
  await AsyncStorage.clear();
  await seedSession();
});

afterEach(() => {
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  transport?.dispose();
  transport = null;
  globalThis.__DEV__ = false;
});

test("권한이 granted가 아니면(재설치로 리셋) POST 없이 이유를 로그로 남긴다", async () => {
  const t = install({ routes: {} });
  notificationsMock.permissionStatus = "undetermined";

  await ensurePushTokenRegistered(3);

  assert.equal(t.attemptsFor(TOKEN_PATH).length, 0);
  const skips = pushLogsOf(/permission not granted/);
  assert.equal(skips.length, 1);
  assert.ok(skips[0].includes("status: undetermined"));
  // 체인 종결점도 침묵하지 않는다.
  assert.equal(pushLogsOf(/no expo push token issued/).length, 1);
});

test("토큰 발급이 throw하면(Firebase 미초기화 등) __DEV__=false에서도 원인이 로그에 남는다", async () => {
  const t = install({ routes: {} });
  notificationsMock.permissionStatus = "granted";
  notificationsMock.tokenError = new Error(
    "Default FirebaseApp is not initialized",
  );

  await ensurePushTokenRegistered(3);

  assert.equal(t.attemptsFor(TOKEN_PATH).length, 0);
  const warns = pushLogsOf(/unavailable/);
  assert.equal(warns.length, 1);
  assert.ok(warns[0].includes("Default FirebaseApp is not initialized"));
});

test("access token이 없으면 POST 없이 이유를 로그로 남긴다", async () => {
  const t = install({ routes: {} });
  notificationsMock.permissionStatus = "granted";
  await tokenStorage.clearTokens();

  await ensurePushTokenRegistered(3);

  assert.equal(t.attemptsFor(TOKEN_PATH).length, 0);
  assert.equal(pushLogsOf(/no access token/).length, 1);
});

test("재설치 후(기록 없음, 권한 granted): 등록 POST가 1회 나가고 기록이 저장된다 — 로그엔 토큰 원문 없음", async () => {
  const t = install({
    routes: { [TOKEN_PATH]: () => ({ status: 200, data: {} }) },
  });
  notificationsMock.permissionStatus = "granted";

  await ensurePushTokenRegistered(3);

  const attempts = t.attemptsFor(TOKEN_PATH);
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].method, "POST");
  assert.deepEqual(JSON.parse(attempts[0].data), {
    token: notificationsMock.token,
  });

  const state = JSON.parse(await AsyncStorage.getItem(REGISTRATION_STATE_KEY));
  assert.deepEqual(state, { userId: "3", expoPushToken: notificationsMock.token });

  assert.equal(pushLogsOf(/registered push token for user 3/).length, 1);
  // 마스킹 준수: 어떤 로그에도 토큰 원문이 실리지 않는다.
  assert.ok(!logs.some((line) => line.includes(notificationsMock.token)));
});

test("같은 user+token 재호출은 dedupe — 추가 POST 없이 이유를 로그로 남긴다", async () => {
  const t = install({
    routes: { [TOKEN_PATH]: () => ({ status: 200, data: {} }) },
  });
  notificationsMock.permissionStatus = "granted";

  await ensurePushTokenRegistered(3);
  await ensurePushTokenRegistered(3);

  assert.equal(t.attemptsFor(TOKEN_PATH).length, 1);
  assert.equal(pushLogsOf(/already registered for user 3/).length, 1);
});

test("사용자 전환: 기록의 userId가 다르면(2→3) 같은 토큰이라도 다시 등록한다", async () => {
  const t = install({
    routes: { [TOKEN_PATH]: () => ({ status: 200, data: {} }) },
  });
  notificationsMock.permissionStatus = "granted";
  await AsyncStorage.setItem(
    REGISTRATION_STATE_KEY,
    JSON.stringify({ userId: "2", expoPushToken: notificationsMock.token }),
  );

  await ensurePushTokenRegistered(3);

  assert.equal(t.attemptsFor(TOKEN_PATH).length, 1);
  const state = JSON.parse(await AsyncStorage.getItem(REGISTRATION_STATE_KEY));
  assert.equal(state.userId, "3");
});

test("logout cleanup이 기록을 지운 뒤에는 같은 user라도 다시 등록한다", async () => {
  const t = install({
    routes: { [TOKEN_PATH]: () => ({ status: 200, data: {} }) },
  });
  notificationsMock.permissionStatus = "granted";

  await ensurePushTokenRegistered(3);
  await clearPushTokenRegistrationState();
  await ensurePushTokenRegistered(3);

  assert.equal(t.attemptsFor(TOKEN_PATH).length, 2);
});

test("서버 등록 실패는 삼키되 status를 로그로 남기고, 기록을 남기지 않아 다음 시도가 재등록한다", async () => {
  const t = install({
    routes: {
      [TOKEN_PATH]: (attempt) =>
        attempt === 1 ? { status: 500, data: {} } : { status: 200, data: {} },
    },
  });
  notificationsMock.permissionStatus = "granted";

  await ensurePushTokenRegistered(3);

  assert.equal(t.attemptsFor(TOKEN_PATH).length, 1);
  const warns = pushLogsOf(/was not completed/);
  assert.equal(warns.length, 1);
  assert.ok(warns[0].includes("status: 500"));
  assert.equal(await AsyncStorage.getItem(REGISTRATION_STATE_KEY), null);

  await ensurePushTokenRegistered(3);
  assert.equal(t.attemptsFor(TOKEN_PATH).length, 2);
  const state = JSON.parse(await AsyncStorage.getItem(REGISTRATION_STATE_KEY));
  assert.equal(state.userId, "3");
});
