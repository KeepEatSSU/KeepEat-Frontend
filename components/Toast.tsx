/**
 * ⚠️ Known Issue: iOS fullScreenModal 위에서 Toast가 표시되지 않음
 *
 * app/_layout.tsx에서 presentation="fullScreenModal"로 지정된 스크린
 * (detail, crop, cooking-ready, cooking-step, add-confirm)이 활성 상태일 때,
 * iOS에서 아래의 Toast/Notification이 화면에 나타나지 않는다.
 *
 * 원인:
 *   iOS의 UIModalPresentationFullScreen이 native UIWindow를 완전히 덮어,
 *   RN View 계층의 어떤 위치에 있는 요소도 그 위에 렌더될 수 없음.
 *   react-native-screens 4.x의 fullScreenModal 구현이 이 특성을 따름.
 *
 * 시도했으나 실패한 해결책 (2026-04):
 *   1. RN <Modal transparent statusBarTranslucent> 래핑 - iOS 무효
 *   2. Modal에 presentationStyle="overFullScreen" 추가 - 시도 안 함 (가능성 낮아 스킵)
 *   3. @gorhom/portal 도입 - iOS 무효 (Android는 정상 동작/위치 개선됨)
 *
 * 현재 폴백:
 *   RecipeRecommendationContext에서 AppState !== "active"일 때
 *   expo-notifications의 OS 푸시로 대체됨. 즉 앱이 백그라운드면 OS 알림이 뜨고,
 *   포그라운드 + fullScreenModal 조합에서만 이 팝업을 놓침.
 *
 * Android: 정상 동작 (Portal 도입 후 위치 중앙 버그도 해결됨).
 *
 * 해결 단서가 발견되면 수정 범위:
 *   - components/Toast.tsx (이 파일)
 *   - app/_layout.tsx (PortalProvider 위치 또는 presentation 설정)
 *
 * 관련 커뮤니티 이슈:
 *   https://github.com/software-mansion/react-native-screens/issues
 *   https://github.com/gorhom/react-native-portal/issues
 */

import { Colors, FontSize, FontWeight, Radius, Shadows, Spacing } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Portal } from "@gorhom/portal";

// ─── Context ──────────────────────────────────────────────────────────────────

interface ToastContextValue {
  showToast: (message: string) => void;
  showNotification: (message: string, onTap?: () => void) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
  showNotification: () => {},
});

export const useToast = () => useContext(ToastContext);

// ─── Provider ─────────────────────────────────────────────────────────────────

const TOAST_DURATION = 2800;
const NOTIF_DURATION = 4000;
const ANIM_IN = 300;
const ANIM_OUT = 250;

interface ToastData {
  message: string;
  type: "toast" | "notification";
  onTap?: () => void;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<ToastData | null>(null);
  const [visible, setVisible] = useState(false);

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: ANIM_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: data?.type === "notification" ? -40 : 40,
        duration: ANIM_OUT,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      setData(null);
    });
  }, [opacity, translateY, data?.type]);

  const show = useCallback(
    (d: ToastData) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      setData(d);
      setVisible(true);

      const isNotif = d.type === "notification";
      opacity.setValue(0);
      translateY.setValue(isNotif ? -40 : 40);

      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: ANIM_IN,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: ANIM_IN,
          useNativeDriver: true,
        }),
      ]).start();

      timerRef.current = setTimeout(hide, isNotif ? NOTIF_DURATION : TOAST_DURATION);
    },
    [opacity, translateY, hide],
  );

  const showToast = useCallback(
    (message: string) => show({ message, type: "toast" }),
    [show],
  );

  const showNotification = useCallback(
    (message: string, onTap?: () => void) =>
      show({ message, type: "notification", onTap }),
    [show],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Rendering both views inside <Portal> so they mount at the root
  // <PortalProvider> (outside the Stack) — sidesteps the iOS native
  // fullScreenModal presentation boundary that hides sibling-of-Stack views,
  // and anchors positioning to the app root (fixes Android off-center render).
  const showNotif = visible && data?.type === "notification";
  const showToastPill = visible && data?.type === "toast";

  return (
    <ToastContext.Provider value={{ showToast, showNotification }}>
      {children}

      <Portal>
        {showNotif && data && (
          <NotificationView
            message={data.message}
            opacity={opacity}
            translateY={translateY}
            onTap={() => {
              hide();
              data.onTap?.();
            }}
          />
        )}
      </Portal>

      <Portal>
        {showToastPill && data && (
          <ToastView
            message={data.message}
            opacity={opacity}
            translateY={translateY}
          />
        )}
      </Portal>
    </ToastContext.Provider>
  );
}

// ─── Toast View (bottom pill) ────────────────────────────────────────────────

function ToastView({
  message,
  opacity,
  translateY,
}: {
  message: string;
  opacity: Animated.Value;
  translateY: Animated.Value;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.toastContainer, { bottom: Math.max(insets.bottom, 16) + 110 }]}
      pointerEvents="none"
    >
      <Animated.View
        style={[styles.pill, { opacity, transform: [{ translateY }] }]}
      >
        <Ionicons name="checkmark-circle" size={18} color={Colors.onPrimary} />
        <Text style={styles.toastText}>{message}</Text>
      </Animated.View>
    </View>
  );
}

// ─── Notification View (top dropdown, tappable) ──────────────────────────────

function NotificationView({
  message,
  opacity,
  translateY,
  onTap,
}: {
  message: string;
  opacity: Animated.Value;
  translateY: Animated.Value;
  onTap: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.notifContainer, { top: Math.max(insets.top, 16) + 4 }]}
      pointerEvents="box-none"
    >
      <Animated.View
        style={[styles.notifCard, { opacity, transform: [{ translateY }] }]}
      >
        <Pressable onPress={onTap} style={styles.notifPressable}>
          <View style={styles.notifIconWrap}>
            <Ionicons name="restaurant" size={18} color={Colors.primary} />
          </View>
          <View style={styles.notifTextWrap}>
            <Text style={styles.notifTitle}>KeepEat</Text>
            <Text style={styles.notifBody} numberOfLines={2}>
              {message}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Bottom toast
  toastContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 99999,
    elevation: 99999,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md + 2,
    borderRadius: Radius.xl,
    marginHorizontal: Spacing.lg,
    ...Shadows.fab,
  },
  toastText: {
    flex: 1,
    flexShrink: 1,
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.semiBold,
    color: Colors.onPrimary,
  },

  // Top notification
  notifContainer: {
    position: "absolute",
    left: Spacing.base,
    right: Spacing.base,
    zIndex: 99999,
    elevation: 99999,
  },
  notifCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    ...Shadows.ambient,
  },
  notifPressable: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.base,
    gap: Spacing.md,
  },
  notifIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.secondaryContainer,
    alignItems: "center",
    justifyContent: "center",
  },
  notifTitle: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.bold,
    color: Colors.outline,
    marginBottom: 2,
  },
  notifTextWrap: {
    flex: 1,
  },
  notifBody: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.semiBold,
    color: Colors.onSurface,
  },
});
