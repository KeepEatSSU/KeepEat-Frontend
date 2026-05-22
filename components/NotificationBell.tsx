/**
 * KeepEat — header notification bell with unread badge.
 *
 * Sized to align with the existing 40×40 profile avatar in the home header
 * so the two icons share the same touch-target footprint. The badge follows
 * the spec'd palette (#E63946) — slightly less saturated than `Colors.error`
 * so it doesn't compete with expiry urgency cues elsewhere in the UI.
 */

import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, FontSize, FontWeight, Radius } from "@/constants/theme";

const BADGE_COLOR = "#E63946";

interface Props {
  unreadCount: number;
  onPress: () => void;
}

export function NotificationBell({ unreadCount, onPress }: Props) {
  const hasUnread = unreadCount > 0;
  const label = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        hasUnread ? `알림 ${unreadCount}개 안 읽음` : "알림"
      }
      hitSlop={8}
      style={({ pressed }) => [
        styles.container,
        pressed && { opacity: 0.6 },
      ]}
    >
      <Ionicons
        name="notifications-outline"
        size={22}
        color={Colors.primary}
      />
      {hasUnread && (
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: Radius.full,
    backgroundColor: BADGE_COLOR,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: FontSize.labelXs,
    fontWeight: FontWeight.bold,
    color: Colors.onPrimary,
    lineHeight: 14,
  },
});
