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

/**
 * Request notification permission and issue an Expo push token.
 *
 * Returns `null` (and console.warns) on any non-fatal failure: web platform,
 * denied permission, missing EAS projectId, or unexpected SDK error.
 * Server registration is intentionally out of scope here.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      console.warn("[pushNotifications] Expo push tokens are not supported on web");
      return null;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      console.warn("[pushNotifications] Notification permission not granted");
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
