import { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  Switch,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/Toast";
import { updateNotificationSetting } from "@/services/api";
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  Radius,
  Shadows,
} from "@/constants/theme";

// Backend DELETE /api/users/me is live — surface the button. Kept as a flag
// rather than removed in case the endpoint is rolled back, so the UI wiring
// stays intact.
const SHOW_DELETE_ACCOUNT = true;

interface ProfileModalProps {
  visible: boolean;
  onClose: () => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
}

export function ProfileModal({
  visible,
  onClose,
  onLogout,
  onDeleteAccount,
}: ProfileModalProps) {
  const { user, setUserNotificationEnabled } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  // Initial pushOn from the server-known state (`isNotificationEnabled` on
  // /me). `?? true` covers the brief window where user is still loading.
  const [pushOn, setPushOn] = useState(user?.isNotificationEnabled ?? true);
  const [toggling, setToggling] = useState(false);

  // ProfileModal is always mounted (AppHeaderRight keeps it under <Modal>
  // visible toggle), so useState's first-mount snapshot doesn't reflect later
  // user changes. Re-sync on every modal open + whenever the server-known
  // value changes (e.g. after re-login or another toggle elsewhere).
  useEffect(() => {
    if (visible && user) {
      setPushOn(user.isNotificationEnabled);
    }
  }, [visible, user?.isNotificationEnabled, user]);

  // Backend mixes casing ("LOCAL" / "google") — normalize for comparison.
  const isGoogleAccount =
    (user?.provider ?? "").toLowerCase() === "google";

  // No `nickname` field on UserInfo yet — derive a display name from the
  // email local-part as a friendly fallback. Once the server includes
  // `nickname` in /me, swap this for `user?.nickname ?? localPart`.
  const email = user?.email ?? "";
  const displayName = email.includes("@") ? email.split("@")[0] : email;

  const handleTogglePush = async () => {
    if (toggling) return;
    const next = !pushOn;
    setPushOn(next);
    setToggling(true);
    try {
      await updateNotificationSetting();
      // Sync the AuthContext user so a later modal open / nav doesn't reset
      // the toggle to the stale server-known value.
      setUserNotificationEnabled(next);
    } catch {
      setPushOn(!next);
      showToast("설정 변경에 실패했어요. 잠시 후 다시 시도해주세요");
    } finally {
      setToggling(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          {/* Close button */}
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeBtn,
              pressed && { opacity: 0.5 },
            ]}
          >
            <Ionicons name="close" size={20} color={Colors.outline} />
          </Pressable>

          {/* Avatar */}
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={28} color={Colors.onSecondaryContainer} />
          </View>

          {/* Display name (email local-part fallback while nickname is unavailable) */}
          {displayName !== "" && (
            <Text style={styles.userName} numberOfLines={1}>
              {displayName}
            </Text>
          )}

          {/* Email */}
          {email !== "" && (
            <Text style={styles.accountInfo} numberOfLines={1}>
              {email}
            </Text>
          )}

          {/* Provider row */}
          <View style={styles.providerRow}>
            <Ionicons
              name={isGoogleAccount ? "logo-google" : "mail-outline"}
              size={14}
              color={Colors.onSurfaceVariant}
            />
            <Text style={styles.providerText}>
              {isGoogleAccount ? "Google 계정" : "이메일 가입"}
            </Text>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Push notification toggle */}
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>푸시 알림 받기</Text>
            <Switch
              value={pushOn}
              onValueChange={handleTogglePush}
              disabled={toggling}
              trackColor={{
                false: Colors.surfaceContainerHigh,
                true: Colors.primary,
              }}
              thumbColor={Colors.surfaceContainerLowest}
              ios_backgroundColor={Colors.surfaceContainerHigh}
            />
          </View>

          {/* Change password — LOCAL accounts only; social passwords are
              UUID placeholders server-side and aren't user-changeable. */}
          {!isGoogleAccount && (
            <Pressable
              onPress={() => {
                onClose();
                router.push("/change-password");
              }}
              style={({ pressed }) => [
                styles.menuRow,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.menuLabel}>비밀번호 변경</Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={Colors.outline}
              />
            </Pressable>
          )}

          {/* Divider */}
          <View style={styles.divider} />

          {/* Logout */}
          <Pressable
            onPress={onLogout}
            style={({ pressed }) => [
              styles.logoutBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.logoutText}>로그아웃</Text>
          </Pressable>

          {/* Delete account — hidden until the backend API is implemented.
              Flip SHOW_DELETE_ACCOUNT at the top of this file to restore. */}
          {SHOW_DELETE_ACCOUNT && (
            <Pressable
              onPress={onDeleteAccount}
              style={({ pressed }) => [
                styles.deleteBtn,
                pressed && { opacity: 0.5 },
              ]}
            >
              <Text style={styles.deleteText}>회원 탈퇴</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xxl,
  },
  card: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xxl,
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.xxl + 8,
    paddingBottom: Spacing.xl,
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    ...Shadows.ambient,
  },
  closeBtn: {
    position: "absolute",
    top: Spacing.md,
    right: Spacing.md,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },

  // Avatar
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.secondaryContainer,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },

  // Info
  userName: {
    fontSize: FontSize.headlineSm,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
    marginBottom: Spacing.xs,
    maxWidth: "100%",
  },
  accountInfo: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
    marginBottom: Spacing.sm,
    maxWidth: "100%",
  },
  providerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  providerText: {
    fontSize: FontSize.labelMd,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: Colors.surfaceContainerHigh,
    width: "100%",
    marginBottom: Spacing.lg,
  },

  // Setting row (notification toggle)
  settingRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.lg,
  },
  settingLabel: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
  },

  // Menu row (e.g. 비밀번호 변경) — same vertical rhythm as settingRow but
  // tappable end-to-end with a trailing chevron.
  menuRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
    marginBottom: Spacing.lg,
  },
  menuLabel: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
  },

  // Actions
  logoutBtn: {
    width: "100%",
    paddingVertical: Spacing.md + 2,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: "center",
  },
  logoutText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
  },
  deleteBtn: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  deleteText: {
    fontSize: FontSize.labelMd,
    fontWeight: FontWeight.regular,
    color: Colors.outline,
    textDecorationLine: "underline",
  },
});
