/**
 * KeepEat — full-screen notification tray.
 *
 * Renders as an iOS-style full-screen modal: header (title + close + mark-all)
 * sits above a FlatList that grows via cursor-based infinite scroll. The
 * popup is purely presentational — paging state, loading flag, and the
 * mark-read callbacks all come from AppHeaderRight so the data lives next
 * to the unread-badge it drives.
 *
 * Card design (icon bubble + title/body + relative time + unread dot) is
 * preserved from the previous popup; only the chrome around it changed.
 *
 * Routing
 *   Every card routes by `type` alone (recipe_ready → recipe tab, others →
 *   home). targetId hooks in A-2 once the backend supplies it.
 */

import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Colors,
  FontSize,
  FontWeight,
  LetterSpacing,
  Radius,
  Spacing,
} from "@/constants/theme";
import type {
  AppNotification,
  NotificationType,
} from "@/constants/domain";
import { formatRelativeTime } from "@/utils/dateUtils";

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

// Route by type. NOTICE/RECIPE_READY → /recipe (recipe tab is where they
// get marked-as-read on focus); EXPIRY_SOON/WEEKLY_CHEER → / (home tab).
function routeForType(type: NotificationType): "/" | "/recipe" {
  return type === "recipe_ready" || type === "notice" ? "/recipe" : "/";
}

interface Props {
  visible: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  unreadCount: number;
  hasNext: boolean;
  loading: boolean;
  onLoadMore: () => void;
  onNotificationRead: (id: number) => void;
  onMarkAllRead: () => void;
}

export function NotificationPopup({
  visible,
  onClose,
  notifications,
  unreadCount,
  hasNext,
  loading,
  onLoadMore,
  onNotificationRead,
  onMarkAllRead,
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleCardPress = (n: AppNotification) => {
    // Read state is now driven by the destination screen via markTypeRead
    // in useFocusEffect — tapping the card just navigates. (onNotificationRead
    // prop is retained on the interface for future direct-read use cases.)
    onClose();
    router.push(routeForType(n.type) as never);
  };

  const renderFooter = () => {
    if (loading) {
      return (
        <View style={styles.footer}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      );
    }
    if (!hasNext && notifications.length > 0) {
      return (
        <View style={styles.footer}>
          <Text style={styles.footerEnd}>모든 알림을 확인했어요</Text>
        </View>
      );
    }
    return null;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        {/* Header row 1: close (left) + title (center) + spacer (right,
            visual balance). Mirrors the [close][title][44 spacer] pattern
            used by detail/cooking-* screens so all left-X headers line up. */}
        <View style={styles.headerRow}>
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
            <Ionicons name="close" size={24} color={Colors.onSurface} />
          </Pressable>
          <Text style={styles.headerTitle}>알림</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Header row 2: 전체 읽음 — only when there's something to mark. */}
        {unreadCount > 0 && (
          <View style={styles.actionsRow}>
            <Pressable
              onPress={onMarkAllRead}
              accessibilityRole="button"
              accessibilityLabel="모두 읽음으로 표시"
              hitSlop={6}
              style={({ pressed }) => [
                styles.markAllBtn,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Ionicons
                name="checkmark-done-outline"
                size={16}
                color={Colors.primary}
              />
              <Text style={styles.markAllText}>모두 읽음으로 표시</Text>
            </Pressable>
          </View>
        )}

        <FlatList
          data={notifications}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <NotificationCard
              item={item}
              onPress={() => handleCardPress(item)}
            />
          )}
          onEndReached={hasNext && !loading ? onLoadMore : undefined}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyContainer}>
                <Ionicons
                  name="notifications-off-outline"
                  size={40}
                  color={Colors.outlineVariant}
                />
                <Text style={styles.emptyText}>아직 알림이 없어요</Text>
              </View>
            ) : null
          }
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom, Spacing.xl) },
          ]}
          showsVerticalScrollIndicator={false}
        />
      </View>
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
  screen: {
    flex: 1,
    backgroundColor: Colors.surface,
  },

  // Header — title + close in one row, mark-all in a second compact row
  // so it has dedicated visual weight without overlapping the title.
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSize.headlineSm,
    fontWeight: FontWeight.extraBold,
    color: Colors.onSurface,
    letterSpacing: LetterSpacing.tight,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  // Mirrors the closeBtn width so the centered title sits at true mid-screen.
  headerSpacer: {
    width: 44,
  },

  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  markAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  markAllText: {
    fontSize: FontSize.labelMd,
    fontWeight: FontWeight.semiBold,
    color: Colors.primary,
  },

  // List
  listContent: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
    flexGrow: 1,
  },

  // Card
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceContainerLowest,
  },
  cardUnread: {
    // Mid-mint between surfaceSubtle (#F8FAF8) and secondaryContainer (#B5F1C0).
    // The previous #F0FAF3 was too close to the screen surface (#F8F9FA) and
    // visually under-weighted next to the white read cards → unread looked
    // less prominent. Bumping saturation here restores the proper hierarchy
    // without adding a shadow (No-Line rule).
    backgroundColor: "#D9F5E0",
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

  // Footer (loading / end-of-list)
  footer: {
    paddingVertical: Spacing.lg,
    alignItems: "center",
  },
  footerEnd: {
    fontSize: FontSize.labelMd,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
  },

  // Empty
  emptyContainer: {
    flex: 1,
    paddingVertical: Spacing.xxl + Spacing.xxl,
    alignItems: "center",
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
  },
});
