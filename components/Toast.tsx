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
  Radius,
  Shadows,
  Spacing,
} from "@/constants/theme";
import {
  createTopBannerPressGuard,
  createTopBannerTimer,
  EMPTY_TOP_BANNER_QUEUE,
  isActionableNotification,
  topBannerQueueReducer,
  type TopBannerFeedbackItem,
  type TopBannerFeedbackVariant,
  type TopBannerItem,
  type TopBannerNotificationItem,
} from "@/components/topBannerQueue";
import { Ionicons } from "@expo/vector-icons";
import {
  type ComponentProps,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Portal } from "@gorhom/portal";

// ─── Context ──────────────────────────────────────────────────────────────────

export type FeedbackVariant = TopBannerFeedbackVariant;

export interface FeedbackOptions {
  message: string;
  variant?: FeedbackVariant;
  dedupeKey?: string;
}

interface ToastContextValue {
  showTopToast: (options: FeedbackOptions) => void;
  showNotification: (
    message: string,
    onTap?: () => void,
    title?: string,
    dedupeKey?: string,
  ) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showTopToast: () => {},
  showNotification: () => {},
});

export const useToast = () => useContext(ToastContext);

// ─── Provider ─────────────────────────────────────────────────────────────────

const ANIM_IN = 300;
const ANIM_OUT = 250;
const FEEDBACK_Z_INDEX = 100000;
const NOTIFICATION_Z_INDEX = 100001;

const FEEDBACK_ICONS: Record<
  FeedbackVariant,
  ComponentProps<typeof Ionicons>["name"]
> = {
  success: "checkmark-circle",
  error: "alert-circle",
  info: "information-circle",
  warning: "warning",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [queueState, dispatch] = useReducer(
    topBannerQueueReducer,
    EMPTY_TOP_BANNER_QUEUE,
  );
  const current = queueState.current;

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const timer = useRef(createTopBannerTimer()).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const currentItemRef = useRef<TopBannerItem | null>(current);
  const currentIdRef = useRef<string | null>(current?.id ?? null);
  const pressGuard = useRef(createTopBannerPressGuard()).current;
  const nextIdRef = useRef(0);

  currentItemRef.current = current;
  currentIdRef.current = current?.id ?? null;

  const dismiss = useCallback(
    (id: string) => {
      if (currentIdRef.current !== id) return;

      timer.clear();
      animationRef.current?.stop();
      const closing = Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: ANIM_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -40,
          duration: ANIM_OUT,
          useNativeDriver: true,
        }),
      ]);
      animationRef.current = closing;
      closing.start(({ finished }) => {
        if (!finished || currentIdRef.current !== id) return;
        animationRef.current = null;
        dispatch({ type: "dismiss", id });
      });
    },
    [opacity, timer, translateY],
  );

  const currentId = current?.id ?? null;
  useEffect(() => {
    pressGuard.setCurrent(currentId);
    timer.clear();
    animationRef.current?.stop();

    const item = currentItemRef.current;
    if (!item || item.id !== currentId) return;

    opacity.setValue(0);
    translateY.setValue(-40);
    const opening = Animated.parallel([
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
    ]);
    animationRef.current = opening;
    opening.start(({ finished }) => {
      if (finished && currentIdRef.current === currentId) {
        animationRef.current = null;
      }
    });
    timer.schedule(() => dismiss(item.id), item.durationMs);

    return () => {
      timer.clear();
      animationRef.current?.stop();
      animationRef.current = null;
    };
  }, [currentId, dismiss, opacity, pressGuard, timer, translateY]);

  const nextId = useCallback(() => {
    nextIdRef.current += 1;
    return `top-banner-${nextIdRef.current}`;
  }, []);

  const showTopToast = useCallback(
    (options: FeedbackOptions) => {
      const item: TopBannerFeedbackItem = {
        id: nextId(),
        kind: "feedback",
        message: options.message,
        variant: options.variant ?? "info",
        dedupeKey: options.dedupeKey,
        durationMs: Feedback.durationMs.top,
      };
      dispatch({ type: "enqueue", item });
    },
    [nextId],
  );

  const showNotification = useCallback(
    (
      message: string,
      onTap?: () => void,
      title?: string,
      dedupeKey?: string,
    ) => {
      const item: TopBannerNotificationItem = {
        id: nextId(),
        kind: "notification",
        message,
        title,
        onPress: onTap,
        dedupeKey,
        durationMs: Feedback.durationMs.notification,
      };
      dispatch({ type: "enqueue", item });
    },
    [nextId],
  );

  const handleNotificationPress = useCallback(
    (item: TopBannerNotificationItem & { onPress: () => void }) => {
      if (!pressGuard.claim(item.id)) return;
      dismiss(item.id);
      item.onPress();
    },
    [dismiss, pressGuard],
  );

  // The single host mounts at the root PortalProvider, preserving the existing
  // safe-area positioning while ensuring feedback and notifications cannot
  // render simultaneously.

  return (
    <ToastContext.Provider value={{ showTopToast, showNotification }}>
      {children}

      <Portal>
        {current && (
          <TopBannerHost
            item={current}
            opacity={opacity}
            translateY={translateY}
            onNotificationPress={handleNotificationPress}
          />
        )}
      </Portal>
    </ToastContext.Provider>
  );
}

// ─── Top Banner Host ──────────────────────────────────────────────────────────

function TopBannerHost({
  item,
  opacity,
  translateY,
  onNotificationPress,
}: {
  item: TopBannerItem;
  opacity: Animated.Value;
  translateY: Animated.Value;
  onNotificationPress: (
    item: TopBannerNotificationItem & { onPress: () => void },
  ) => void;
}) {
  if (item.kind === "notification") {
    return (
      <NotificationView
        message={item.message}
        title={item.title}
        opacity={opacity}
        translateY={translateY}
        onTap={
          isActionableNotification(item)
            ? () => onNotificationPress(item)
            : undefined
        }
      />
    );
  }

  return (
    <FeedbackView
      message={item.message}
      variant={item.variant}
      opacity={opacity}
      translateY={translateY}
    />
  );
}

// ─── Feedback View ────────────────────────────────────────────────────────────

function FeedbackView({
  message,
  variant,
  opacity,
  translateY,
}: {
  message: string;
  variant: FeedbackVariant;
  opacity: Animated.Value;
  translateY: Animated.Value;
}) {
  const insets = useSafeAreaInsets();
  const tokens = Feedback.variants[variant];

  return (
    <View
      style={[
        styles.topFeedbackContainer,
        { top: Math.max(insets.top, 16) + Feedback.topOffsetGap },
      ]}
      pointerEvents="none"
    >
      <Animated.View
        style={[
          styles.topFeedbackCard,
          {
            backgroundColor: tokens.softBackground,
            borderColor: tokens.borderColor,
          },
          { opacity, transform: [{ translateY }] },
        ]}
      >
        <View
          style={[
            styles.feedbackIconWrap,
            { backgroundColor: tokens.iconBackground },
          ]}
        >
          <Ionicons
            name={FEEDBACK_ICONS[variant]}
            size={18}
            color={tokens.softForeground}
          />
        </View>
        <Text
          style={[styles.topFeedbackText, { color: tokens.softForeground }]}
          numberOfLines={2}
        >
          {message}
        </Text>
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
  onTap?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const content = (
    <>
      <View style={styles.notifIconWrap}>
        <Ionicons name="restaurant" size={18} color={Colors.primary} />
      </View>
      <View style={styles.notifTextWrap}>
        <Text style={styles.notifTitle}>{title ?? "KeepEat"}</Text>
        <Text style={styles.notifBody} numberOfLines={2}>
          {message}
        </Text>
      </View>
    </>
  );

  return (
    <View
      style={[
        styles.notifContainer,
        { top: Math.max(insets.top, 16) + Feedback.topOffsetGap },
      ]}
      pointerEvents={onTap ? "box-none" : "none"}
    >
      <Animated.View
        style={[styles.notifCard, { opacity, transform: [{ translateY }] }]}
      >
        {onTap ? (
          <Pressable onPress={onTap} style={styles.notifContent}>
            {content}
          </Pressable>
        ) : (
          <View style={styles.notifContent}>{content}</View>
        )}
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
  notifContent: {
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
