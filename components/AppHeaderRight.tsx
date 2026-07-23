/**
 * KeepEat — top-right header cluster (notification bell only).
 *
 * Profile/logout/delete-account flow moved to the dedicated 마이페이지 tab
 * (`app/(tabs)/mypage.tsx`). The avatar entry-point was removed because the
 * tab bar is now the primary navigation for those actions.
 *
 * Each tab still mounts its own AppHeaderRight — accepted trade-off — but
 * the badge count stays consistent across tabs because the underlying state
 * lives in a single root Provider (NotificationContext).
 */

import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { NotificationBell } from "@/components/NotificationBell";
import { NotificationPopup } from "@/components/NotificationPopup";
import { useNotifications } from "@/context/NotificationContext";
import { Spacing } from "@/constants/theme";

export function AppHeaderRight() {
  const {
    items,
    unreadCount,
    hasNext,
    loading,
    refresh,
    loadMore,
    markAllRead,
    handleNotificationPress,
    removeNotification,
    removeNotifications,
  } = useNotifications();

  const [notifVisible, setNotifVisible] = useState(false);

  // Open-modal transition: server-truth refresh so newly arrived notifications
  // (and reads done elsewhere) appear without requiring a re-login. The
  // Provider's `refresh` has a stable identity, so this effect only fires on
  // notifVisible change — not on every items/loading update.
  useEffect(() => {
    if (notifVisible) {
      refresh();
    }
  }, [notifVisible, refresh]);

  return (
    <View style={styles.row}>
      <NotificationBell
        unreadCount={unreadCount}
        onPress={() => setNotifVisible(true)}
      />

      <NotificationPopup
        visible={notifVisible}
        onClose={() => setNotifVisible(false)}
        notifications={items}
        unreadCount={unreadCount}
        hasNext={hasNext}
        loading={loading}
        onLoadMore={loadMore}
        onNotificationPress={handleNotificationPress}
        onMarkAllRead={markAllRead}
        onRemoveNotification={removeNotification}
        onRemoveNotifications={removeNotifications}
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
});
