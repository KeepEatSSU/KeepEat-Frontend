/**
 * KeepEat — top-right header cluster (notification bell + profile avatar).
 *
 * Renders the bell + profile UI and connects them to shared state:
 *   - notification data + actions come from `useNotifications()` (lifted to
 *     NotificationContext so every tab's instance sees the same unread count)
 *   - auth (logout, deleteAccount) from `useAuth()`
 *
 * Each tab still mounts its own AppHeaderRight — accepted trade-off — but
 * the badge count is now consistent across tabs because the underlying
 * state lives in a single root Provider.
 */

import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NotificationBell } from "@/components/NotificationBell";
import { NotificationPopup } from "@/components/NotificationPopup";
import { ProfileModal } from "@/components/ProfileModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { DeletePasswordModal } from "@/components/DeletePasswordModal";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import { getErrorMessage } from "@/services/api";
import { clearRecentIngredients } from "@/services/recentIngredients";
import { Colors, Radius, Spacing } from "@/constants/theme";

export function AppHeaderRight() {
  const { user, logout, deleteAccount } = useAuth();
  const { showToast } = useToast();
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
  const [profileVisible, setProfileVisible] = useState(false);

  // Delete-account flow: only one of the two confirm modals is up at a time.
  // For LOCAL accounts we go straight to the password modal (it doubles as
  // the confirmation), for GOOGLE we show a plain ConfirmModal (no password
  // exists client-side to verify with).
  const [googleConfirmVisible, setGoogleConfirmVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Open-modal transition: server-truth refresh so newly arrived notifications
  // (and reads done elsewhere) appear without requiring a re-login. The
  // Provider's `refresh` has a stable identity, so this effect only fires on
  // notifVisible change — not on every items/loading update.
  useEffect(() => {
    if (notifVisible) {
      refresh();
    }
  }, [notifVisible, refresh]);

  // Backend mixes casing ("LOCAL" / "google") — normalize.
  const isGoogleAccount =
    (user?.provider ?? "").toLowerCase() === "google";

  const handleDeleteAccountStart = () => {
    setProfileVisible(false);
    if (isGoogleAccount) {
      setGoogleConfirmVisible(true);
    } else {
      setPasswordModalVisible(true);
    }
  };

  const finishDeleteSuccess = async () => {
    // Local caches that don't belong to the next user. Token clearing +
    // setUser(null) is already handled inside deleteAccount.
    await clearRecentIngredients();
    showToast("탈퇴가 완료되었어요");
  };

  const handleDeleteGoogleConfirm = async () => {
    if (deleteSubmitting) return;
    setDeleteSubmitting(true);
    try {
      await deleteAccount();
      setGoogleConfirmVisible(false);
      await finishDeleteSuccess();
    } catch (err) {
      // Keep the modal open so the user can retry; surface the server's
      // message via the shared getErrorMessage helper (which never exposes
      // the raw error body).
      showToast(getErrorMessage(err, "탈퇴에 실패했어요"));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleDeleteLocalConfirm = async (password: string) => {
    if (deleteSubmitting) return;
    setDeleteSubmitting(true);
    try {
      await deleteAccount(password);
      setPasswordModalVisible(false);
      await finishDeleteSuccess();
    } catch (err) {
      // Wrong password / network → modal stays open, password field stays
      // filled. User can retry without re-opening.
      showToast(getErrorMessage(err, "탈퇴에 실패했어요"));
    } finally {
      setDeleteSubmitting(false);
    }
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
          // 로그아웃은 즉시 로그인 화면으로 전환되므로 toast는 보일 시간이
          // 없음 + 토큰은 이미 정리됨. 사용자 노출 메시지보다 unhandled
          // rejection만 막는 best-effort 처리.
          try {
            await logout();
          } catch (e) {
            console.warn("[logout]", e);
          }
        }}
        onDeleteAccount={handleDeleteAccountStart}
      />

      <ConfirmModal
        visible={googleConfirmVisible}
        title="회원 탈퇴"
        subtitle={"정말 탈퇴하시겠어요?\n모든 데이터가 삭제되며 복구할 수 없어요."}
        confirmLabel="탈퇴하기"
        cancelLabel="취소"
        destructive
        onConfirm={handleDeleteGoogleConfirm}
        onCancel={() => setGoogleConfirmVisible(false)}
      />

      <DeletePasswordModal
        visible={passwordModalVisible}
        submitting={deleteSubmitting}
        onConfirm={handleDeleteLocalConfirm}
        onCancel={() => setPasswordModalVisible(false)}
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
  avatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: "center",
    justifyContent: "center",
  },
});
