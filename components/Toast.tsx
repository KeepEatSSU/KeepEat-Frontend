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

import {
  Colors,
  Feedback,
  FontSize,
  FontWeight,
  Glass,
  Radius,
  Shadows,
  Spacing,
} from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import {
  type ComponentProps,
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

export type FeedbackVariant = "success" | "error" | "info" | "warning";
export type FeedbackPlacement = "top" | "bottom";

export interface FeedbackAction {
  label: string;
  onPress: () => void;
}

export interface FeedbackOptions {
  message: string;
  variant?: FeedbackVariant;
  placement?: FeedbackPlacement;
  action?: FeedbackAction;
}

type ToastInput = string | FeedbackOptions;

interface ToastContextValue {
  showToast: (input: ToastInput) => void;
  showTopToast: (options: FeedbackOptions) => void;
  /** Reserved for future action snackbars. Non-action calls follow TopToast policy. */
  showSnackbar: (options: FeedbackOptions) => void;
  showNotification: (
    message: string,
    onTap?: () => void,
    title?: string,
  ) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
  showTopToast: () => {},
  showSnackbar: () => {},
  showNotification: () => {},
});

export const useToast = () => useContext(ToastContext);

// ─── Provider ─────────────────────────────────────────────────────────────────

const ANIM_IN = 300;
const ANIM_OUT = 250;
const FEEDBACK_Z_INDEX = 100000;
const NOTIFICATION_Z_INDEX = 100001;

interface FeedbackData {
  type: "feedback";
  message: string;
  placement: FeedbackPlacement;
  variant: FeedbackVariant;
  action?: FeedbackAction;
}

interface NotificationData {
  type: "notification";
  message: string;
  onTap?: () => void;
  /** 드롭다운(notification) 제목 줄. 없으면 "KeepEat"로 fallback. */
  title?: string;
}

type ToastData = FeedbackData | NotificationData;

const FEEDBACK_ICONS: Record<
  FeedbackVariant,
  ComponentProps<typeof Ionicons>["name"]
> = {
  success: "checkmark-circle",
  error: "alert-circle",
  info: "information-circle",
  warning: "warning",
};

function normalizeFeedback(
  input: ToastInput,
  fallbackPlacement: FeedbackPlacement,
): FeedbackData {
  if (typeof input === "string") {
    return {
      type: "feedback",
      message: input,
      placement: fallbackPlacement,
      variant: fallbackPlacement === "top" ? "info" : "success",
    };
  }

  const placement = input.placement ?? fallbackPlacement;
  return {
    type: "feedback",
    message: input.message,
    placement,
    variant: input.variant ?? (placement === "top" ? "info" : "success"),
    action: input.action,
  };
}

function getInitialOffset(data: ToastData) {
  if (data.type === "notification") return -40;
  return data.placement === "top" ? -40 : 40;
}

function getDuration(data: ToastData) {
  if (data.type === "notification") return Feedback.durationMs.notification;
  return data.placement === "top"
    ? Feedback.durationMs.top
    : Feedback.durationMs.bottom;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<ToastData | null>(null);
  const [visible, setVisible] = useState(false);

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef<ToastData | null>(null);
  const visibleRef = useRef(false);
  const queuedTopToastRef = useRef<FeedbackData | null>(null);
  const showRef = useRef<(next: ToastData) => void>(() => {});

  const hide = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const closingData = dataRef.current;
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: ANIM_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: closingData ? getInitialOffset(closingData) : 40,
        duration: ANIM_OUT,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      setData(null);
      dataRef.current = null;
      visibleRef.current = false;

      if (closingData?.type === "notification" && queuedTopToastRef.current) {
        const queued = queuedTopToastRef.current;
        queuedTopToastRef.current = null;
        setTimeout(() => showRef.current(queued), 0);
      }
    });
  }, [opacity, translateY]);

  const show = useCallback(
    (d: ToastData) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      dataRef.current = d;
      visibleRef.current = true;
      setData(d);
      setVisible(true);

      opacity.setValue(0);
      translateY.setValue(getInitialOffset(d));

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

      timerRef.current = setTimeout(hide, getDuration(d));
    },
    [opacity, translateY, hide],
  );

  useEffect(() => {
    showRef.current = show;
  }, [show]);

  const showFeedback = useCallback(
    (feedback: FeedbackData) => {
      if (
        feedback.placement === "top" &&
        visibleRef.current &&
        dataRef.current?.type === "notification"
      ) {
        queuedTopToastRef.current = feedback;
        return;
      }
      show(feedback);
    },
    [show],
  );

  // Backward-compatible API. General non-blocking feedback now follows the
  // TopToast policy, even when older callers still use the legacy helper.
  const showToast = useCallback(
    (input: ToastInput) => showFeedback(normalizeFeedback(input, "top")),
    [showFeedback],
  );

  const showTopToast = useCallback(
    (options: FeedbackOptions) =>
      showFeedback(normalizeFeedback(options, "top")),
    [showFeedback],
  );

  // Reserved for future action snackbars (Undo / retry / view). Plain
  // information without an action is intentionally routed to TopToast.
  const showSnackbar = useCallback(
    (options: FeedbackOptions) => {
      const placement: FeedbackPlacement = options.action ? "bottom" : "top";
      showFeedback(normalizeFeedback({ ...options, placement }, placement));
    },
    [showFeedback],
  );

  const showNotification = useCallback(
    (message: string, onTap?: () => void, title?: string) =>
      show({ message, type: "notification", onTap, title }),
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
  const showFeedbackSurface = visible && data?.type === "feedback";

  return (
    <ToastContext.Provider
      value={{ showToast, showTopToast, showSnackbar, showNotification }}
    >
      {children}

      <Portal>
        {showNotif && data && (
          <NotificationView
            message={data.message}
            title={data.title}
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
        {showFeedbackSurface && data && data.type === "feedback" && (
          <FeedbackView
            message={data.message}
            placement={data.placement}
            variant={data.variant}
            action={data.action}
            opacity={opacity}
            translateY={translateY}
            onDismiss={hide}
          />
        )}
      </Portal>
    </ToastContext.Provider>
  );
}

// ─── Feedback Views ───────────────────────────────────────────────────────────

function FeedbackView({
  message,
  placement,
  variant,
  action,
  opacity,
  translateY,
  onDismiss,
}: {
  message: string;
  placement: FeedbackPlacement;
  variant: FeedbackVariant;
  action?: FeedbackAction;
  opacity: Animated.Value;
  translateY: Animated.Value;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const isTop = placement === "top";
  const tokens = Feedback.variants[variant];
  const bottomOffset =
    Math.max(insets.bottom, Glass.bottomBarPaddingBottomMin) +
    Glass.bottomBarActionHeight +
    Glass.bottomBarContentPaddingTop +
    Feedback.bottomBarGap;

  const handleActionPress = () => {
    onDismiss();
    action?.onPress();
  };

  return (
    <View
      style={[
        isTop ? styles.topFeedbackContainer : styles.bottomFeedbackContainer,
        isTop
          ? { top: Math.max(insets.top, 16) + Feedback.topOffsetGap }
          : { bottom: bottomOffset },
      ]}
      pointerEvents={action ? "box-none" : "none"}
    >
      <Animated.View
        style={[
          isTop ? styles.topFeedbackCard : styles.snackbar,
          isTop
            ? {
                backgroundColor: tokens.softBackground,
                borderColor: tokens.borderColor,
              }
            : { backgroundColor: tokens.solidBackground },
          { opacity, transform: [{ translateY }] },
        ]}
      >
        <View
          style={[
            styles.feedbackIconWrap,
            {
              backgroundColor: isTop
                ? tokens.iconBackground
                : "rgba(255, 255, 255, 0.18)",
            },
          ]}
        >
          <Ionicons
            name={FEEDBACK_ICONS[variant]}
            size={18}
            color={isTop ? tokens.softForeground : tokens.foreground}
          />
        </View>
        <Text
          style={[
            isTop ? styles.topFeedbackText : styles.snackbarText,
            { color: isTop ? tokens.softForeground : tokens.foreground },
          ]}
          numberOfLines={2}
        >
          {message}
        </Text>
        {action && (
          <Pressable
            onPress={handleActionPress}
            style={({ pressed }) => [
              styles.snackbarAction,
              pressed && { opacity: 0.65 },
            ]}
          >
            <Text
              style={[
                styles.snackbarActionText,
                { color: isTop ? tokens.softForeground : tokens.foreground },
              ]}
            >
              {action.label}
            </Text>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

// ─── Notification View (top dropdown, tappable) ──────────────────────────────

function NotificationView({
  message,
  title,
  opacity,
  translateY,
  onTap,
}: {
  message: string;
  /** 제목 줄. 없으면 브랜드 라벨 "KeepEat"로 fallback. */
  title?: string;
  opacity: Animated.Value;
  translateY: Animated.Value;
  onTap: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.notifContainer,
        { top: Math.max(insets.top, 16) + Feedback.topOffsetGap },
      ]}
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
            <Text style={styles.notifTitle}>{title ?? "KeepEat"}</Text>
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
  // Role-based feedback
  topFeedbackContainer: {
    position: "absolute",
    left: Spacing.base,
    right: Spacing.base,
    alignItems: "center",
    zIndex: FEEDBACK_Z_INDEX,
    elevation: FEEDBACK_Z_INDEX,
  },
  bottomFeedbackContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: FEEDBACK_Z_INDEX,
    elevation: FEEDBACK_Z_INDEX,
  },
  topFeedbackCard: {
    width: "100%",
    maxWidth: Feedback.maxWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    borderWidth: 1,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderRadius: Radius.xl,
    ...Shadows.ambient,
  },
  snackbar: {
    maxWidth: Feedback.maxWidth,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderRadius: Radius.xl,
    marginHorizontal: Spacing.lg,
    ...Shadows.fab,
  },
  feedbackIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  topFeedbackText: {
    flex: 1,
    flexShrink: 1,
    fontSize: FontSize.bodySm,
    lineHeight: 18,
    fontWeight: FontWeight.semiBold,
  },
  snackbarText: {
    flex: 1,
    flexShrink: 1,
    fontSize: FontSize.bodyMd,
    lineHeight: 20,
    fontWeight: FontWeight.semiBold,
  },
  snackbarAction: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  snackbarActionText: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.bold,
  },

  // Top notification
  notifContainer: {
    position: "absolute",
    left: Spacing.base,
    right: Spacing.base,
    zIndex: NOTIFICATION_Z_INDEX,
    elevation: NOTIFICATION_Z_INDEX,
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
