import { useEffect, useState } from "react";
import {
  Linking,
  Modal,
  View,
  Text,
  Pressable,
  Switch,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/Toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { getErrorMessage, updateNotificationSetting } from "@/services/api";
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
  // OS 권한 거부 상태에서 ON 시도 시 띄우는 안내 모달.
  const [permissionModalVisible, setPermissionModalVisible] = useState(false);
  // 모달 열릴 때 OS 권한 상태 스냅샷. 토글(서버 setting)은 ON인데 OS는 막혀
  // 있으면 사용자가 "켰는데 왜 안 오지" 혼란을 겪는다 — 그 미스매치를 보조
  // 경고 행으로 시각화하기 위한 플래그. 토글 자체 값은 절대 바꾸지 않는다.
  const [osPermDenied, setOsPermDenied] = useState(false);

  // ProfileModal is always mounted (AppHeaderRight keeps it under <Modal>
  // visible toggle), so useState's first-mount snapshot doesn't reflect later
  // user changes. Re-sync on every modal open + whenever the server-known
  // value changes (e.g. after re-login or another toggle elsewhere).
  useEffect(() => {
    if (visible && user) {
      setPushOn(user.isNotificationEnabled);
    }
  }, [visible, user?.isNotificationEnabled, user]);

  // 모달이 열릴 때마다 OS 권한 재확인. 사용자가 백그라운드에서 OS 설정을
  // 바꾸고 돌아왔을 수 있으므로, 매 open이 가장 신선한 스냅샷이 된다.
  // AppState 'active' 복귀 시 추가 갱신은 과한 비용 → 다음 open에 잡힌다.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (!cancelled) setOsPermDenied(status !== "granted");
      } catch {
        // 권한 API 없는 환경(웹 등) — 경고 행 숨김으로 폴백.
        if (!cancelled) setOsPermDenied(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

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

    // ON 시도 시점에만 OS 권한 체크. 서버 setting이 ON이어도 OS 권한이 없으면
    // 실제로는 아무 알림도 안 뜨므로, 두 상태가 어긋난 채로 토글이 켜져 있는
    // 미스매치를 막는다. OFF는 OS 권한과 무관(서버에서만 끔)이라 스킵.
    if (next) {
      try {
        const current = await Notifications.getPermissionsAsync();
        if (current.status !== "granted") {
          // 한 번도 안 물어봤거나 다시 물어볼 수 있는 상태 → OS 다이얼로그 시도.
          // iOS에선 한 번 거부하면 canAskAgain=false가 되어 더 이상 안 뜨므로,
          // 그 경우엔 설정 안내 모달로 바로 우회.
          if (current.status === "undetermined" || current.canAskAgain) {
            const requested = await Notifications.requestPermissionsAsync();
            if (requested.status !== "granted") {
              setPermissionModalVisible(true);
              return;
            }
          } else {
            setPermissionModalVisible(true);
            return;
          }
        }
      } catch {
        // 권한 API 자체가 없는 환경(웹 등) — 기존 서버 토글 동작으로 폴백.
      }
    }

    setPushOn(next);
    setToggling(true);
    try {
      await updateNotificationSetting();
      // Sync the AuthContext user so a later modal open / nav doesn't reset
      // the toggle to the stale server-known value.
      setUserNotificationEnabled(next);
    } catch (e) {
      setPushOn(!next);
      showToast(getErrorMessage(e, "알림 설정 변경에 실패했어요. 잠시 후 다시 시도해주세요"));
    } finally {
      setToggling(false);
    }
  };

  const handleOpenSettings = async () => {
    setPermissionModalVisible(false);
    // 권한 상태에 따라 분기: 'undetermined'이면 아직 OS 다이얼로그를 띄울
    // 수 있으니 직접 띄워본다 (사용자가 첫 진입 팝업의 "나중에"를 누른 직후
    // 이런 케이스가 발생할 수 있음). 그 외(주로 denied)는 OS가 더 이상
    // 다이얼로그를 띄우지 않으므로 설정 앱으로 보내는 수밖에 없다.
    try {
      const current = await Notifications.getPermissionsAsync();
      if (current.status === "undetermined") {
        const requested = await Notifications.requestPermissionsAsync();
        if (requested.status === "granted") {
          setOsPermDenied(false);
        }
        return;
      }
    } catch {
      // 권한 API 없는 환경 — 그냥 설정 앱 시도로 폴백.
    }
    Linking.openSettings().catch(() => {
      showToast("설정 앱을 열 수 없어요");
    });
  };

  return (
    <>
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

          {/* OS 권한 미스매치 보조 경고 — 서버 ON인데 기기가 막아둔 상태. 토글
              값은 그대로 두고 한 줄로만 알린다. OFF거나 OS granted면 숨김. */}
          {pushOn && osPermDenied && (
            <View style={styles.permWarnRow}>
              <Text style={styles.permWarnText}>기기 알림이 꺼져 있어요</Text>
              <Pressable
                onPress={handleOpenSettings}
                accessibilityRole="link"
                accessibilityLabel="기기 알림 설정 열기"
                hitSlop={8}
                style={({ pressed }) => [pressed && { opacity: 0.5 }]}
              >
                <Text style={styles.permWarnLink}>설정</Text>
              </Pressable>
            </View>
          )}

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

    <ConfirmModal
      visible={permissionModalVisible}
      title="알림 권한이 꺼져 있어요"
      subtitle={"기기 설정에서 알림을 허용하면\n소비기한 임박과 레시피 완성 알림을 받을 수 있어요"}
      confirmLabel="설정으로 이동"
      cancelLabel="닫기"
      onConfirm={handleOpenSettings}
      onCancel={() => setPermissionModalVisible(false)}
    />
    </>
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

  // OS 권한 미스매치 보조 경고 행 — 토글 바로 아래에 시각적으로 인접해
  // 보이도록 settingRow의 marginBottom을 일부 음수 마진으로 상쇄한다.
  permWarnRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: -Spacing.md,
    marginBottom: Spacing.lg,
  },
  permWarnText: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
  },
  permWarnLink: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.semiBold,
    color: Colors.primary,
    textDecorationLine: "underline",
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
