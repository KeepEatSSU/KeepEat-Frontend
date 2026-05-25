import { useCallback, useEffect, useState } from "react";
import {
  Linking,
  View,
  Text,
  Pressable,
  Switch,
  ScrollView,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/Toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { DeletePasswordModal } from "@/components/DeletePasswordModal";
import { getErrorMessage, updateNotificationSetting } from "@/services/api";
import { clearRecentIngredients } from "@/services/recentIngredients";
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  Radius,
} from "@/constants/theme";

const SHOW_DELETE_ACCOUNT = true;

export default function MyPageScreen() {
  const { user, logout, deleteAccount, setUserNotificationEnabled } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  // 푸시 토글 상태 (서버 known + 낙관적 토글)
  const [pushOn, setPushOn] = useState(user?.isNotificationEnabled ?? true);
  const [toggling, setToggling] = useState(false);
  // OS 권한 거부 상태에서 ON 시도 시 띄우는 안내 모달.
  const [permissionModalVisible, setPermissionModalVisible] = useState(false);
  // 서버 setting은 ON인데 OS는 막혀 있는 미스매치를 보조 경고 행으로 시각화.
  // 토글 자체 값은 절대 바꾸지 않는다.
  const [osPermDenied, setOsPermDenied] = useState(false);

  // 탈퇴 흐름 — LOCAL은 비번 모달, GOOGLE은 단순 확인 모달.
  const [googleConfirmVisible, setGoogleConfirmVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // 서버 known 값 변경(재로그인, 다른 화면에서 토글) 시 동기화.
  useEffect(() => {
    if (user) {
      setPushOn(user.isNotificationEnabled);
    }
  }, [user?.isNotificationEnabled, user]);

  // 탭 진입 / 백그라운드에서 OS 설정 바꾸고 복귀하는 경로 모두 잡기 위해
  // useFocusEffect로 매 focus마다 OS 권한 재확인.
  useFocusEffect(
    useCallback(() => {
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
    }, []),
  );

  // Backend mixes casing ("LOCAL" / "google") — normalize for comparison.
  const isGoogleAccount = (user?.provider ?? "").toLowerCase() === "google";

  // 표시명 폴백 체인:
  //   1. 서버 nickname (LOCAL 가입자는 signup-profile에서 입력값, 구글은
  //      백엔드 설정에 따라 displayName 또는 null)
  //   2. 이메일 local-part (구글 등 nickname이 null/공백인 경우)
  //   3. 이메일 전체 (드물게 "@" 없는 비표준 입력)
  const email = user?.email ?? "";
  const emailLocalPart = email.includes("@") ? email.split("@")[0] : email;
  const displayName = user?.nickname?.trim() || emailLocalPart;

  const handleTogglePush = async () => {
    if (toggling) return;
    const next = !pushOn;

    // ON 시도 시점에만 OS 권한 체크. OFF는 OS 권한과 무관(서버에서만 끔).
    if (next) {
      try {
        const current = await Notifications.getPermissionsAsync();
        if (current.status !== "granted") {
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
        // 권한 API 자체가 없는 환경 — 기존 서버 토글 동작으로 폴백.
      }
    }

    setPushOn(next);
    setToggling(true);
    try {
      await updateNotificationSetting();
      setUserNotificationEnabled(next);
    } catch (e) {
      setPushOn(!next);
      showToast(
        getErrorMessage(
          e,
          "알림 설정 변경에 실패했어요. 잠시 후 다시 시도해주세요",
        ),
      );
    } finally {
      setToggling(false);
    }
  };

  const handleOpenSettings = async () => {
    setPermissionModalVisible(false);
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

  const handleLogout = async () => {
    // 로그아웃은 즉시 로그인 화면으로 전환되므로 toast는 보일 시간이
    // 없음 + 토큰은 이미 정리됨. unhandled rejection만 막는 best-effort.
    try {
      await logout();
    } catch (e) {
      console.warn("[logout]", e);
    }
  };

  const handleDeleteAccountStart = () => {
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
      showToast(getErrorMessage(err, "탈퇴에 실패했어요"));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={["top"]} style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.headerTitle}>마이페이지</Text>

        {/* 프로필 카드 */}
        <View style={styles.card}>
          <View style={styles.avatarCircle}>
            <Ionicons
              name="person"
              size={28}
              color={Colors.onSecondaryContainer}
            />
          </View>
          {displayName !== "" && (
            <Text style={styles.userName} numberOfLines={1}>
              {displayName}
            </Text>
          )}
          {email !== "" && (
            <Text style={styles.accountInfo} numberOfLines={1}>
              {email}
            </Text>
          )}
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
        </View>

        {/* 설정 카드 */}
        <View style={styles.card}>
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

          {/* OS 권한 미스매치 보조 경고. OFF거나 OS granted면 숨김. */}
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

          {/* 비밀번호 변경 — LOCAL 계정만. 소셜은 서버측 패스워드가 placeholder. */}
          {!isGoogleAccount && (
            <>
              <View style={styles.divider} />
              <Pressable
                onPress={() => router.push("/change-password")}
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
            </>
          )}
        </View>

        {/* 로그아웃 */}
        <Pressable
          onPress={handleLogout}
          style={({ pressed }) => [
            styles.logoutBtn,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.logoutText}>로그아웃</Text>
        </Pressable>

        {/* 회원탈퇴 */}
        {SHOW_DELETE_ACCOUNT && (
          <Pressable
            onPress={handleDeleteAccountStart}
            style={({ pressed }) => [
              styles.deleteBtn,
              pressed && { opacity: 0.5 },
            ]}
          >
            <Text style={styles.deleteText}>회원 탈퇴</Text>
          </Pressable>
        )}
      </ScrollView>

      <ConfirmModal
        visible={permissionModalVisible}
        title="알림 권한이 꺼져 있어요"
        subtitle={
          "기기 설정에서 알림을 허용하면\n소비기한 임박과 레시피 완성 알림을 받을 수 있어요"
        }
        confirmLabel="설정으로 이동"
        cancelLabel="닫기"
        onConfirm={handleOpenSettings}
        onCancel={() => setPermissionModalVisible(false)}
      />

      <ConfirmModal
        visible={googleConfirmVisible}
        title="회원 탈퇴"
        subtitle={
          "정말 탈퇴하시겠어요?\n모든 데이터가 삭제되며 복구할 수 없어요."
        }
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    // 탭바 + 시스템 네비바에 가려지지 않도록 충분히 확보.
    paddingBottom: 140,
  },
  headerTitle: {
    fontSize: FontSize.headlineMd,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
    marginBottom: Spacing.lg,
  },
  card: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    alignItems: "center",
    width: "100%",
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.secondaryContainer,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
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
  },
  providerText: {
    fontSize: FontSize.labelMd,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.surfaceContainerHigh,
    width: "100%",
    marginVertical: Spacing.sm,
  },
  settingRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.xs,
  },
  settingLabel: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
  },
  permWarnRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: Spacing.sm,
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
  menuRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.md,
  },
  menuLabel: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
  },
  logoutBtn: {
    width: "100%",
    paddingVertical: Spacing.md + 2,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: "center",
    marginTop: Spacing.lg,
  },
  logoutText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
  },
  deleteBtn: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.xs,
    alignItems: "center",
  },
  deleteText: {
    fontSize: FontSize.labelMd,
    fontWeight: FontWeight.regular,
    color: Colors.outline,
    textDecorationLine: "underline",
  },
});
