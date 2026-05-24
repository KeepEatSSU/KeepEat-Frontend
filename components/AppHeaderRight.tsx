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
    markRead,
    markAllRead,
    markTypeRead,
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
        onClose={() => {
          // NOTICE는 목적지가 없으므로 destination screen의 useFocusEffect로
          // 읽음 처리를 걸 수 없다. 대신 알림창에서 나가는 순간(상단 X, 카드
          // 탭으로 인한 자동 close, 시스템 dismiss 어느 경로든) 일괄 읽음.
          // markTypeRead는 unread가 없으면 no-op이므로 매 close마다 안전.
          markTypeRead("notice");
          setNotifVisible(false);
        }}
        notifications={items}
        unreadCount={unreadCount}
        hasNext={hasNext}
        loading={loading}
        onLoadMore={loadMore}
        onNotificationRead={markRead}
        onMarkAllRead={markAllRead}
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
