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

import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { NotificationBell } from "@/components/NotificationBell";
import { NotificationPopup } from "@/components/NotificationPopup";
import { useNotifications } from "@/context/NotificationContext";
import { Spacing } from "@/constants/theme";

// NOTICE 전체 읽음 지연 — popup 닫힌 직후 즉시 읽음 처리하면 사용자가
// 카드에서 마지막으로 본 내용을 "방금 봤다는 표시"로 인지하기 전에 사라짐.
// 짧은 buffer 두고 일괄. 재오픈하면 취소됨.
const NOTICE_AUTO_READ_DELAY_MS = 2500;

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
    removeNotification,
    removeNotifications,
  } = useNotifications();

  const [notifVisible, setNotifVisible] = useState(false);
  // 지연된 NOTICE 일괄 읽음 타이머. 재오픈/unmount 시 cleanup.
  const noticeReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Open-modal transition: server-truth refresh so newly arrived notifications
  // (and reads done elsewhere) appear without requiring a re-login. The
  // Provider's `refresh` has a stable identity, so this effect only fires on
  // notifVisible change — not on every items/loading update.
  useEffect(() => {
    if (notifVisible) {
      // 재오픈: 진행 중이던 NOTICE 일괄 읽음 타이머 취소 — 닫자마자 다시
      // 열면 아직 안 본 NOTICE까지 묻혀 사라지는 걸 막는다.
      if (noticeReadTimerRef.current) {
        clearTimeout(noticeReadTimerRef.current);
        noticeReadTimerRef.current = null;
      }
      refresh();
    }
  }, [notifVisible, refresh]);

  // 컴포넌트 unmount 시 잔존 타이머 정리.
  useEffect(() => {
    return () => {
      if (noticeReadTimerRef.current) clearTimeout(noticeReadTimerRef.current);
    };
  }, []);

  return (
    <View style={styles.row}>
      <NotificationBell
        unreadCount={unreadCount}
        onPress={() => setNotifVisible(true)}
      />

      <NotificationPopup
        visible={notifVisible}
        onClose={() => {
          // popup이 닫힌 뒤 일정 시간 후 NOTICE 전체 읽음. 사용자가 카드를
          // 봤다는 시각적 인지를 짧게 보장 + 재오픈하면 useEffect에서
          // 취소되므로 오발화 없음. markTypeRead는 unread 0이면 no-op이라
          // 매 close마다 안전.
          if (noticeReadTimerRef.current) {
            clearTimeout(noticeReadTimerRef.current);
          }
          noticeReadTimerRef.current = setTimeout(() => {
            markTypeRead("notice");
            noticeReadTimerRef.current = null;
          }, NOTICE_AUTO_READ_DELAY_MS);
          setNotifVisible(false);
        }}
        notifications={items}
        unreadCount={unreadCount}
        hasNext={hasNext}
        loading={loading}
        onLoadMore={loadMore}
        onNotificationRead={markRead}
        onMarkAllRead={markAllRead}
        onMarkTypeRead={markTypeRead}
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
