/**
 * KeepEat — Expo push-notification token registration.
 *
 * Handles token issuance and idempotent server registration. Registration is
 * keyed by authenticated user ID + current Expo token and remains best-effort
 * so notification setup never blocks login or app startup.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
  deletePushToken,
  registerPushToken,
} from "@/services/notifications";
import { getErrorStatus } from "@/services/api";
import { tokenStorage } from "@/services/tokenStorage";

const REGISTRATION_STATE_KEY = "keepeat:pushTokenRegistration";

type PushTokenRegistrationState = {
  userId: string;
  expoPushToken: string;
};

const inFlightEnsures = new Map<string, Promise<void>>();
const inFlightRegistrations = new Map<string, Promise<void>>();
let registrationQueue: Promise<void> = Promise.resolve();
let logoutTokenLookupDepth = 0;

function normalizeUserId(userId: number | string): string | null {
  const normalized = String(userId).trim();
  return normalized.length > 0 ? normalized : null;
}

function parseRegistrationState(raw: string | null): PushTokenRegistrationState | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (value == null || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const state = value as Record<string, unknown>;
    if (
      typeof state.userId !== "string" ||
      state.userId.length === 0 ||
      typeof state.expoPushToken !== "string" ||
      state.expoPushToken.length === 0
    ) {
      return null;
    }
    return {
      userId: state.userId,
      expoPushToken: state.expoPushToken,
    };
  } catch {
    return null;
  }
}

async function readRegistrationState(): Promise<PushTokenRegistrationState | null> {
  try {
    return parseRegistrationState(
      await AsyncStorage.getItem(REGISTRATION_STATE_KEY),
    );
  } catch {
    return null;
  }
}

export async function clearPushTokenRegistrationState(): Promise<void> {
  await AsyncStorage.removeItem(REGISTRATION_STATE_KEY);
}

/**
 * Issue an Expo push token if the user has already granted notification
 * permission. **Does NOT** request permission — that is owned by the
 * pre-permission prompt (PushPermissionPrompt) which shows a friendly
 * rationale before triggering the OS dialog. Calling `requestPermissions`
 * from here would race with that prompt and surface the OS dialog
 * unsolicited on app boot / login.
 *
 * Returns `null` on web, ungranted permission, missing projectId, or any
 * SDK error so failures never block app boot or login.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      console.warn("[pushNotifications] Expo push tokens are not supported on web");
      return null;
    }

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      // 권한이 없는 상태에선 토큰을 발급하지 않는다. 권한 획득은 사용자가
      // pre-permission 팝업 / 마이페이지 토글에서 명시적으로 시작하는 흐름.
      // 로그는 release에서도 남긴다 — 이 무로그 return이 "등록이 소리 없이
      // 빠졌는데 이유를 알 수 없는" 실기 이슈의 관측 불가 지점이었다.
      console.log(
        `[pushNotifications] skip: permission not granted (status: ${status})`,
      );
      return null;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn(
        "[pushNotifications] Missing EAS projectId in app.json (extra.eas.projectId)",
      );
      return null;
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch (error) {
    // __DEV__ gate 금지 — release에서 Firebase 미초기화("Default FirebaseApp is
    // not initialized" 등)로 발급이 실패해도 이 한 줄이 유일한 단서다.
    // 에러 문자열에는 토큰 값이 실리지 않는다.
    console.warn(
      `[pushNotifications] Expo push token is unavailable: ${String(error)}`,
    );
    return null;
  }
}

/**
 * Reads the token for the logout request without letting that explicit lookup
 * feed back through the native token listener and re-register the ending
 * session. Normal token-change events remain enabled outside this short scope.
 */
export async function getExpoPushTokenForLogout(): Promise<string | null> {
  logoutTokenLookupDepth += 1;
  try {
    return await registerForPushNotificationsAsync();
  } finally {
    logoutTokenLookupDepth -= 1;
  }
}

/**
 * Runs the token acquisition and registration path for one normalized user ID.
 * The exported wrapper below installs its re-entry guard before this function
 * can advance past its first await.
 */
async function runPushTokenRegistration(normalizedUserId: string): Promise<void> {
  try {
    const accessToken = await tokenStorage.getAccessToken();
    if (!accessToken) {
      console.log("[pushNotifications] skip: no access token for registration");
      return;
    }

    const expoPushToken = await registerForPushNotificationsAsync();
    if (!expoPushToken) {
      // 발급 실패 사유(권한/projectId/SDK 오류)는 위 함수가 이미 로그했다.
      console.log("[pushNotifications] skip: no expo push token issued");
      return;
    }

    const registrationKey = `${normalizedUserId}\u0000${expoPushToken}`;
    const inFlight = inFlightRegistrations.get(registrationKey);
    if (inFlight) return inFlight;

    const operation = registrationQueue.then(async () => {
      const registered = await readRegistrationState();
      if (
        registered?.userId === normalizedUserId &&
        registered.expoPushToken === expoPushToken
      ) {
        console.log(
          `[pushNotifications] skip: already registered for user ${normalizedUserId}`,
        );
        return;
      }

      try {
        await registerPushToken(expoPushToken);
        const nextState: PushTokenRegistrationState = {
          userId: normalizedUserId,
          expoPushToken,
        };
        await AsyncStorage.setItem(
          REGISTRATION_STATE_KEY,
          JSON.stringify(nextState),
        );
        console.log(
          `[pushNotifications] registered push token for user ${normalizedUserId}`,
        );
      } catch (error) {
        console.warn(
          `[pushNotifications] token registration was not completed (status: ${getErrorStatus(error) ?? "network"})`,
        );
      }
    });
    const tracked = operation.finally(() => {
      inFlightRegistrations.delete(registrationKey);
    });
    inFlightRegistrations.set(registrationKey, tracked);
    registrationQueue = tracked.catch(() => {});
    return tracked;
  } catch (error) {
    // SecureStore/token issuance failures are non-blocking and leave no
    // registration metadata, so a later lifecycle trigger can retry.
    console.warn(
      `[pushNotifications] registration aborted: ${String(error)}`,
    );
  }
}

/**
 * Ensures this authenticated user + Expo token pair is registered exactly once
 * per persisted local state. Calls for the same user share the whole execution
 * before token acquisition, preventing a native token event emitted by that
 * acquisition from recursively starting another acquisition. The existing
 * user + token dedupe still protects the server registration stage.
 */
export function ensurePushTokenRegistered(
  userId: number | string,
): Promise<void> {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) return Promise.resolve();

  const inFlight = inFlightEnsures.get(normalizedUserId);
  if (inFlight) return inFlight;

  const operation = runPushTokenRegistration(normalizedUserId);
  const tracked = operation.finally(() => {
    if (inFlightEnsures.get(normalizedUserId) === tracked) {
      inFlightEnsures.delete(normalizedUserId);
    }
  });
  inFlightEnsures.set(normalizedUserId, tracked);
  return tracked;
}

export function subscribeToPushTokenChanges(
  userId: number | string,
): () => void {
  if (Platform.OS === "web") return () => {};

  const subscription = Notifications.addPushTokenListener(() => {
    if (logoutTokenLookupDepth > 0) return;
    void ensurePushTokenRegistered(userId);
  });
  return () => subscription.remove();
}

/**
 * 로그아웃/회원탈퇴 직전 호출 — 같은 토큰을 서버에서 deregister.
 * **반드시 토큰 클리어 전에 호출**해야 Bearer 헤더가 살아있는 상태에서
 * DELETE가 인증된다. 실패해도 로그아웃 흐름은 계속.
 */
export async function clearPushTokenOnServer(): Promise<void> {
  try {
    const token = await registerForPushNotificationsAsync();
    if (token) await deletePushToken(token);
  } catch (error) {
    console.warn(
      `[pushNotifications] server deregistration failed (status: ${getErrorStatus(error) ?? "network"})`,
    );
  } finally {
    try {
      await clearPushTokenRegistrationState();
    } catch {
      console.warn("[pushNotifications] local registration cleanup failed");
    }
  }
}
