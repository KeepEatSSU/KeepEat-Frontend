/**
 * KeepEat — Expo push-notification token registration.
 *
 * Single entry point that handles the full Expo push-token dance:
 * device check → permission check/request → Android channel setup →
 * token issuance via the EAS projectId.
 *
 * This module is currently issue-only — the caller is responsible for
 * what to do with the returned token (server registration arrives in a
 * later milestone). All failure modes resolve to `null` rather than
 * throwing so a missing token never blocks app startup.
 */

import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import {
  deletePushToken,
  registerPushToken,
} from "@/services/notifications";

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
  } catch (err) {
    console.warn("[pushNotifications] Failed to register for push notifications", err);
    return null;
  }
}

/**
 * 로그인 직후 호출 — 현재 기기의 Expo push token을 발급 + 서버에 등록.
 * Best-effort: 권한 거부 / 토큰 발급 실패 / 서버 오류 어떤 단계에서도
 * 예외를 흘리지 않아 로그인 본 흐름을 막지 않음.
 */
export async function syncPushTokenWithServer(): Promise<void> {
  try {
    const token = await registerForPushNotificationsAsync();
    if (!token) return;
    await registerPushToken(token);
  } catch (err) {
    if (__DEV__) {
      console.warn("[pushNotifications] server registration failed", err);
    }
  }
}

/**
 * 로그아웃/회원탈퇴 직전 호출 — 같은 토큰을 서버에서 deregister.
 * **반드시 토큰 클리어 전에 호출**해야 Bearer 헤더가 살아있는 상태에서
 * DELETE가 인증된다. 실패해도 로그아웃 흐름은 계속.
 */
export async function clearPushTokenOnServer(): Promise<void> {
  try {
    const token = await registerForPushNotificationsAsync();
    if (!token) return;
    await deletePushToken(token);
  } catch (err) {
    if (__DEV__) {
      console.warn("[pushNotifications] server deregistration failed", err);
    }
  }
}
