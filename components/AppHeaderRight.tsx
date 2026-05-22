/**
 * KeepEat — top-right header cluster (notification bell + profile avatar).
 *
 * Wraps NotificationBell, NotificationPopup, and ProfileModal behind a single
 * mount so every tab gets the same affordance with one line of JSX. Owns its
 * own notifications + popup/profile open state because there's no upstream
 * store yet — when the backend lands, swap the `useState(MOCK_NOTIFICATIONS)`
 * for a fetch and the rest of the surface area stays the same.
 *
 * State sharing
 *   Each tab mounts its own instance, so read-state changes in the fridge tab
 *   do NOT propagate to the recipe tab's bell. That's an accepted trade-off
 *   for the mock phase; once the server is the source of truth, both tabs
 *   will see the same unread count automatically.
 */

import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NotificationBell } from "@/components/NotificationBell";
import { NotificationPopup } from "@/components/NotificationPopup";
import { ProfileModal } from "@/components/ProfileModal";
import { useAuth } from "@/context/AuthContext";
import { MOCK_NOTIFICATIONS } from "@/mocks/notifications";
import type { AppNotification } from "@/constants/domain";
import { Colors, Radius, Spacing } from "@/constants/theme";

export function AppHeaderRight() {
  const { logout } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>(
    () => MOCK_NOTIFICATIONS,
  );
  const [notifVisible, setNotifVisible] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleNotificationRead = (id: number) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
    );
  };

  return (
    <View style={styles.row}>
      <NotificationBell
        unreadCount={unreadCount}
        onPress={() => setNotifVisible(true)}
      />
      <Pressable
        onPress={() => setProfileVisible(true)}
        style={({ pressed }) => [
          styles.avatar,
          pressed && { opacity: 0.6 },
        ]}
      >
        <Ionicons name="person" size={16} color={Colors.onSurfaceVariant} />
      </Pressable>

      <ProfileModal
        visible={profileVisible}
        onClose={() => setProfileVisible(false)}
        onLogout={async () => {
          setProfileVisible(false);
          await logout();
        }}
        onDeleteAccount={() => {
          setProfileVisible(false);
          // TODO: delete account logic
        }}
      />

      <NotificationPopup
        visible={notifVisible}
        onClose={() => setNotifVisible(false)}
        notifications={notifications.filter((n) => !n.isRead)}
        onNotificationRead={handleNotificationRead}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
});
