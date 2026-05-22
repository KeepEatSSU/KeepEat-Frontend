/**
 * KeepEat — notification tray popup.
 *
 * Fades a translucent backdrop + popup body in/out together. Uses RN's
 * <Modal> so the overlay sits above the tab bar — wrapping the screen in
 * an absolute-positioned <View> wouldn't cover the tab navigator.
 *
 * Interaction model
 *   Tapping a card marks it as read in the parent and immediately closes
 *   the tray + navigates. No mid-tap animation: the parent re-filters the
 *   array on the next open, and the popup fades out naturally during the
 *   route transition.
 *
 * Routing
 *   `data` field is intentionally absent on the spec — every notification
 *   routes by `type` alone, with `recipe_ready` going to the recipe tab and
 *   the rest landing on the home (fridge) tab.
 */

import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Colors,
  FontSize,
  FontWeight,
  LetterSpacing,
  Radius,
  Shadows,
  Spacing,
} from "@/constants/theme";
import type {
  AppNotification,
  NotificationType,
} from "@/constants/domain";
import { formatRelativeTime } from "@/utils/dateUtils";

// Pixel-based cap so the popup is predictable across devices. Percent maxHeight
// inside <Modal> resolves against an ambiguous parent height, which had been
// clamping the tray well below the intended ceiling.
const POPUP_MAX_HEIGHT = Dimensions.get("window").height * 0.8;

// Per-type icon + accent color. Kept inline (not a separate config file)
// because the popup is the only consumer.
const TYPE_VISUAL: Record<
  NotificationType,
  { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }
> = {
  notice: {
    icon: "megaphone-outline",
    color: Colors.primary,
    bg: "rgba(0, 109, 55, 0.10)",
  },
  expiry_soon: {
    icon: "alarm-outline",
    color: Colors.error,
    bg: "rgba(186, 26, 26, 0.10)",
  },
  weekly_cheer: {
    icon: "trophy-outline",
    color: "#C97A1A",
    bg: "rgba(249, 168, 37, 0.12)",
  },
  recipe_ready: {
    icon: "restaurant-outline",
    color: Colors.primaryContainer,
    bg: "rgba(46, 204, 113, 0.12)",
  },
};

function routeForType(type: NotificationType): "/" | "/recipe" {
  return type === "recipe_ready" ? "/recipe" : "/";
}

interface Props {
  visible: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onNotificationRead: (id: number) => void;
}

export function NotificationPopup({
  visible,
  onClose,
  notifications,
  onNotificationRead,
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleCardPress = (n: AppNotification) => {
    if (!n.isRead) onNotificationRead(n.id);
    onClose();
    router.push(routeForType(n.type) as never);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {visible && (
        <View style={StyleSheet.absoluteFill}>
          {/* Backdrop — taps anywhere outside the popup body close the tray. */}
          <Animated.View
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(160)}
            style={styles.backdrop}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          </Animated.View>

          <Animated.View
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            style={[
              styles.popup,
              { marginTop: insets.top + Spacing.sm },
            ]}
          >
            <View style={styles.header}>
              <Text style={styles.headerTitle}>알림</Text>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="알림 닫기"
                hitSlop={8}
                style={({ pressed }) => [
                  styles.closeBtn,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color={Colors.onSurfaceVariant}
                />
              </Pressable>
            </View>

            {notifications.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons
                  name="notifications-off-outline"
                  size={40}
                  color={Colors.outlineVariant}
                />
                <Text style={styles.emptyText}>아직 알림이 없어요</Text>
              </View>
            ) : (
              <ScrollView
                style={styles.list}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
              >
                {notifications.map((n) => (
                  <NotificationCard
                    key={n.id}
                    item={n}
                    onPress={() => handleCardPress(n)}
                  />
                ))}
              </ScrollView>
            )}
          </Animated.View>
        </View>
      )}
    </Modal>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

function NotificationCard({
  item,
  onPress,
}: {
  item: AppNotification;
  onPress: () => void;
}) {
  const visual = TYPE_VISUAL[item.type];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.body}`}
      style={({ pressed }) => [
        styles.card,
        !item.isRead && styles.cardUnread,
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={[styles.iconBubble, { backgroundColor: visual.bg }]}>
        <Ionicons name={visual.icon} size={18} color={visual.color} />
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.cardSubtitle} numberOfLines={2}>
          {item.body}
        </Text>
      </View>

      <View style={styles.cardRight}>
        <Text style={styles.cardTime}>
          {formatRelativeTime(item.createdAt)}
        </Text>
        {!item.isRead && <View style={styles.unreadDot} />}
      </View>
    </Pressable>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },

  popup: {
    marginHorizontal: Spacing.base,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl + 2, // ~18px per spec
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    // Content-driven height up to a hard pixel cap; ScrollView takes over past it.
    maxHeight: POPUP_MAX_HEIGHT,
    ...Shadows.ambient,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  headerTitle: {
    fontSize: FontSize.titleLg,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
    letterSpacing: LetterSpacing.tight,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },

  list: {
    flexGrow: 0,
  },
  listContent: {
    gap: Spacing.sm,
    paddingBottom: Spacing.sm,
  },

  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
  },
  cardUnread: {
    // Slight tonal lift so unread cards "pop" against read ones — adheres to
    // the no-line surface-shift rule rather than borders.
    backgroundColor: "#F0FAF3",
  },

  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },

  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: FontSize.labelMd,
    fontWeight: FontWeight.regular,
    color: Colors.onSurfaceVariant,
    lineHeight: 16,
  },

  cardRight: {
    alignItems: "flex-end",
    gap: 6,
  },
  cardTime: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryContainer,
  },

  emptyContainer: {
    paddingVertical: Spacing.xxl + Spacing.sm,
    alignItems: "center",
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
  },
});
