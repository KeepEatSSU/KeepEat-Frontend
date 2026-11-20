import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import * as WebBrowser from "expo-web-browser";
import { LEGAL_URLS } from "@/constants/config";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/Toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { DeletePasswordModal } from "@/components/DeletePasswordModal";
import { getErrorMessage, updateNotificationSetting } from "@/services/api";
import { ensurePushTokenRegistered } from "@/services/pushNotifications";
import { clearRecentIngredients } from "@/services/recentIngredients";
import { createSubmitGuard } from "@/utils/submitGuard";
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  Radius,
} from "@/constants/theme";

const SHOW_DELETE_ACCOUNT = true;

export default function MyPageScreen() {
  const { user, logout, logoutAll, deleteAccount, setUserNotificationEnabled } =
    useAuth();
  const { showTopToast } = useToast();
  const router = useRouter();

  // "기기 알림" 행은 OS 권한의 거울 — 서버 isNotificationEnabled flag는 제어하지
  // 않는다 (종/알림창 히스토리는 권한 무관 항상 저장. 푸시 송신은 OS 권한과 서버
  // flag가 각각 통제). 앱이 권한을 코드로 끌 수 없으므로 행은 "상태 표시 + 설정
  // 앱 바로가기" 역할만. 매 focus마다 아래 useFocusEffect가 권한을 재확인해 갱신.
  // 서버 flag는 아래 "푸시 알림 수신" 스위치가 별도로 담당한다.
  const [osPermDenied, setOsPermDenied] = useState(false);

  // 푸시 알림 수신(서버 저장 설정) 스위치.
  //   표시값: 요청 중에는 낙관값(notifPending), 평소엔 AuthContext user 값.
  //   성공: setUserNotificationEnabled로 로컬 merge — /me 재호출 없음.
  //   실패: pending만 걷어내면 user 값(변경 전)으로 자연 rollback.
  //   가드: submitGuard가 같은 tick 연타의 중복 요청을 동기 차단하고,
  //         요청 중에는 disabled로 스위치 자체를 잠근다.
  const notifGuardRef = useRef(createSubmitGuard());
  const [notifSubmitting, setNotifSubmitting] = useState(false);
  const [notifPending, setNotifPending] = useState<boolean | null>(null);

  // 탈퇴 흐름 — LOCAL은 비번 모달, GOOGLE은 단순 확인 모달.
  const [googleConfirmVisible, setGoogleConfirmVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [logoutAllConfirmVisible, setLogoutAllConfirmVisible] = useState(false);
  const [logoutAllSubmitting, setLogoutAllSubmitting] = useState(false);
  const logoutAllSubmittingRef = useRef(false);

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
  // 판정은 부정형("local이 아니면 소셜")이다. 백엔드도 전부
  // `"LOCAL".equals(provider)` 기준으로 갈라내고, 긍정형("google이면")은 새
  // 소셜 provider가 붙는 순간 비밀번호 메뉴가 새어나온다. provider를 모를 때는
  // 숨겨지는 쪽이 안전하다.
  // NOTE: 아래 provider 표시 텍스트는 아직 소셜 = Google 하나를 가정한다.
  const isSocialAccount = (user?.provider ?? "").toLowerCase() !== "local";

  // 표시명 폴백 체인:
  //   1. 서버 nickname (LOCAL 가입자는 signup-profile에서 입력값, 구글은
  //      백엔드 설정에 따라 displayName 또는 null)
  //   2. 이메일 local-part (구글 등 nickname이 null/공백인 경우)
  //   3. 이메일 전체 (드물게 "@" 없는 비표준 입력)
  const email = user?.email ?? "";
  const emailLocalPart = email.includes("@") ? email.split("@")[0] : email;
  const displayName = user?.nickname?.trim() || emailLocalPart;

  const openOsSettings = () => {
    Linking.openSettings().catch(() => {
      showTopToast({ message: "설정 앱을 열 수 없어요", variant: "error" });
    });
  };

  const openLegalDocument = (url: string) => {
    WebBrowser.openBrowserAsync(url).catch(() => {
      showTopToast({ message: "문서를 열 수 없어요", variant: "error" });
    });
  };

  // 알림 행 누름 — OS 권한 상태로 분기. 서버 flag(updateNotificationSetting)는
  // 더 이상 건드리지 않는다.
  //   • granted   → 끄려는 의도. 앱은 권한 회수 불가 → OS 설정 앱으로 보냄.
  //   • undetermined / canAskAgain → 첫 요청. 그 자리서 OS 권한 팝업 → 결과로
  //     osPermDenied 갱신. granted 되면 토큰 발급/등록까지 이어줌
  //     (로그인 시엔 권한이 없어 토큰을 못 받았을 수 있으므로 여기서 재확인).
  //   • 거부 확정(canAskAgain false) → 설정 앱으로.
  const handleNotificationRowPress = async () => {
    try {
      const current = await Notifications.getPermissionsAsync();
      if (current.status === "granted") {
        openOsSettings();
        return;
      }
      if (current.status === "undetermined" || current.canAskAgain) {
        const requested = await Notifications.requestPermissionsAsync();
        const granted = requested.status === "granted";
        setOsPermDenied(!granted);
        if (granted && user) void ensurePushTokenRegistered(user.id);
        return;
      }
      openOsSettings();
    } catch {
      // 권한 API 없는 환경(웹 등) — 설정 앱 시도로 폴백.
      openOsSettings();
    }
  };

  // 서버 수신 설정 토글 — "반대로 토글"이 아니라 스위치가 준 최종 값을
  // 명시적으로 보낸다. OS 권한 로직(handleNotificationRowPress)과는 무관.
  const serverNotifEnabled = user?.isNotificationEnabled ?? true;
  const notifDisplayValue = notifPending ?? serverNotifEnabled;

  const handleNotificationSettingToggle = (next: boolean) =>
    notifGuardRef.current(async () => {
      setNotifPending(next); // 낙관적 즉시 반영
      setNotifSubmitting(true);
      try {
        await updateNotificationSetting(next);
        // 같은 컬럼을 /me가 돌려주므로 로컬 merge로 충분 — 재조회 없음.
        setUserNotificationEnabled(next);
      } catch (e) {
        showTopToast({
          message: getErrorMessage(e, "알림 설정 변경에 실패했어요"),
          variant: "error",
        });
      } finally {
        // 성공이면 user가 이미 next라 표시 유지, 실패면 변경 전 값으로 rollback.
        setNotifPending(null);
        setNotifSubmitting(false);
      }
    });

  const handleLogout = async () => {
    // 로그아웃은 즉시 로그인 화면으로 전환되므로 toast는 보일 시간이
    // 없음 + 토큰은 이미 정리됨. unhandled rejection만 막는 best-effort.
    try {
      await logout();
    } catch (e) {
      console.warn("[logout]", e);
    }
  };

  const handleLogoutAllConfirm = async () => {
    if (logoutAllSubmittingRef.current) return;
    logoutAllSubmittingRef.current = true;
    setLogoutAllSubmitting(true);
    setLogoutAllConfirmVisible(false);

    try {
      await logoutAll();
      showTopToast({
        message: "모든 기기에서 로그아웃 되었습니다",
        variant: "success",
        dedupeKey: "logout-all:success",
      });
    } catch (error) {
      showTopToast({
        message: getErrorMessage(
          error,
          "모든 기기 로그아웃에 실패했어요. 잠시 후 다시 시도해 주세요.",
        ),
        variant: "error",
        dedupeKey: "logout-all:error",
      });
    } finally {
      logoutAllSubmittingRef.current = false;
      setLogoutAllSubmitting(false);
    }
  };

  const handleDeleteAccountStart = () => {
    if (isSocialAccount) {
      setGoogleConfirmVisible(true);
    } else {
      setPasswordModalVisible(true);
    }
  };

  const finishDeleteSuccess = async () => {
    // Local caches that don't belong to the next user. Token clearing +
    // setUser(null) is already handled inside deleteAccount.
    await clearRecentIngredients();
    showTopToast({ message: "탈퇴가 완료되었어요", variant: "success" });
  };

  const handleDeleteGoogleConfirm = async () => {
    if (deleteSubmitting) return;
    setDeleteSubmitting(true);
    try {
      await deleteAccount();
      setGoogleConfirmVisible(false);
      await finishDeleteSuccess();
    } catch (err) {
      showTopToast({
        message: getErrorMessage(err, "탈퇴에 실패했어요"),
        variant: "error",
      });
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
      showTopToast({
        message: getErrorMessage(err, "탈퇴에 실패했어요"),
        variant: "error",
      });
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
            <Text
              style={styles.userName}
              numberOfLines={1}
              testID="mypage.nickname.text"
            >
              {displayName}
            </Text>
          )}
          {email !== "" && (
            <Text
              style={styles.accountInfo}
              numberOfLines={1}
              testID="mypage.email.text"
            >
              {email}
            </Text>
          )}
          <View style={styles.providerRow}>
            <Ionicons
              name={isSocialAccount ? "logo-google" : "mail-outline"}
              size={14}
              color={Colors.onSurfaceVariant}
            />
            <Text style={styles.providerText}>
              {isSocialAccount ? "Google 계정" : "이메일 가입"}
            </Text>
          </View>
        </View>

        {/* 설정 카드 */}
        <View style={styles.card}>
          {/* 기기 알림 — OS 권한 거울. 누르면 권한 상태에 따라 OS 팝업/설정 앱.
              비밀번호 변경 행과 같은 menuRow 시각 패턴으로 일관성 유지. */}
          <Pressable
            onPress={handleNotificationRowPress}
            accessibilityRole="button"
            accessibilityLabel={
              osPermDenied
                ? "기기 알림 꺼짐, 눌러서 설정 열기"
                : "기기 알림 켜짐, 눌러서 설정 열기"
            }
            style={({ pressed }) => [
              styles.menuRow,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.menuLabel}>기기 알림</Text>
            <View style={styles.menuRight}>
              <Text
                style={[styles.menuValue, osPermDenied && styles.menuValueOff]}
              >
                {osPermDenied ? "꺼짐" : "켜짐"}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={Colors.outline}
              />
            </View>
          </Pressable>

          <View style={styles.divider} />

          {/* 푸시 알림 수신 — 서버 저장 설정(GET /me의 isNotificationEnabled).
              OS 권한과 별개로, 서버가 이 계정으로 푸시를 보낼지 여부. */}
          <View style={styles.menuRow}>
            <Text style={styles.menuLabel}>푸시 알림 수신</Text>
            <Switch
              value={notifDisplayValue}
              onValueChange={handleNotificationSettingToggle}
              disabled={notifSubmitting}
              testID="mypage.notification-toggle.switch"
              accessibilityLabel={
                notifDisplayValue ? "푸시 알림 수신 켜짐" : "푸시 알림 수신 꺼짐"
              }
              trackColor={{ true: Colors.primary }}
            />
          </View>

          {/* 비밀번호 변경 — LOCAL 계정만. 소셜 계정은 서버의 password 컬럼이
              null이라 확인할 현재 비밀번호 자체가 없다. */}
          {!isSocialAccount && (
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

        {/* 약관·정책 카드 — 앱 안 브라우저로 공개 문서를 연다. */}
        <View style={styles.card}>
          <Pressable
            onPress={() => openLegalDocument(LEGAL_URLS.terms)}
            testID="mypage.terms.row"
            accessibilityRole="link"
            accessibilityLabel="이용약관 보기"
            style={({ pressed }) => [
              styles.menuRow,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.menuLabel}>이용약관</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.outline} />
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            onPress={() => openLegalDocument(LEGAL_URLS.privacy)}
            testID="mypage.privacy.row"
            accessibilityRole="link"
            accessibilityLabel="개인정보 처리방침 보기"
            style={({ pressed }) => [
              styles.menuRow,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.menuLabel}>개인정보 처리방침</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.outline} />
          </Pressable>
        </View>

        {/* 로그아웃 */}
        <Pressable
          onPress={handleLogout}
          disabled={logoutAllSubmitting}
          testID="mypage.logout-button"
          accessibilityRole="button"
          accessibilityState={{ disabled: logoutAllSubmitting }}
          style={({ pressed }) => [
            styles.logoutBtn,
            logoutAllSubmitting && styles.buttonDisabled,
            pressed && !logoutAllSubmitting && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.logoutText}>로그아웃</Text>
        </Pressable>

        <Pressable
          onPress={() => setLogoutAllConfirmVisible(true)}
          disabled={logoutAllSubmitting}
          accessibilityRole="button"
          accessibilityLabel="모든 기기에서 로그아웃"
          accessibilityState={{ disabled: logoutAllSubmitting }}
          style={({ pressed }) => [
            styles.logoutAllBtn,
            logoutAllSubmitting && styles.buttonDisabled,
            pressed && !logoutAllSubmitting && { opacity: 0.7 },
          ]}
        >
          {logoutAllSubmitting ? (
            <ActivityIndicator color={Colors.error} />
          ) : (
            <Text style={styles.logoutAllText}>모든 기기에서 로그아웃</Text>
          )}
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
        visible={logoutAllConfirmVisible}
        title="모든 기기에서 로그아웃하시겠습니까?"
        subtitle="현재 기기를 포함해 로그인된 모든 기기에서 로그아웃됩니다."
        confirmLabel="모두 로그아웃"
        cancelLabel="취소"
        destructive
        onConfirm={handleLogoutAllConfirm}
        onCancel={() => setLogoutAllConfirmVisible(false)}
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
  // 알림 행 우측 — 상태 텍스트(켜짐/꺼짐) + chevron 묶음.
  menuRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  menuValue: {
    fontSize: FontSize.labelMd,
    fontWeight: FontWeight.semiBold,
    color: Colors.primary,
  },
  menuValueOff: {
    color: Colors.outline,
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
  logoutAllBtn: {
    width: "100%",
    minHeight: 52,
    paddingVertical: Spacing.md + 2,
    borderRadius: Radius.lg,
    backgroundColor: Colors.errorContainer,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.md,
  },
  logoutAllText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.bold,
    color: Colors.error,
  },
  buttonDisabled: {
    opacity: 0.55,
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
