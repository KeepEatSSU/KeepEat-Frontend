/**
 * KeepEat — full-screen notification tray.
 *
 * Renders as an iOS-style full-screen modal: header (title + close + mark-all)
 * sits above a FlatList that grows via cursor-based infinite scroll. The
 * popup is purely presentational — paging state, loading flag, and the
 * notification action callbacks all come from AppHeaderRight so the data
 * lives next to the unread-badge it drives.
 *
 * Card design (icon bubble + title/body + relative time + unread dot) is
 * preserved from the previous popup; only the chrome around it changed.
 *
 * A card press passes only its notification ID and type to the shared
 * notification handler. NOTICE stays in the tray and toggles its body;
 * routed types close the tray before navigation.
 */

import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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
  NotificationId,
  NotificationPushData,
  NotificationType,
} from "@/constants/domain";
import { formatRelativeTime } from "@/utils/dateUtils";
import { ConfirmModal } from "@/components/ConfirmModal";

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
  recipe_ready: {
    icon: "restaurant-outline",
    color: Colors.primaryContainer,
    bg: "rgba(46, 204, 113, 0.12)",
  },
};

interface Props {
  visible: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  unreadCount: number;
  hasNext: boolean;
  loading: boolean;
  onLoadMore: () => void;
  onNotificationPress: (data: NotificationPushData) => void;
  onMarkAllRead: () => void;
  /** 일반 모드 카드 X 버튼 — 즉시 개별 삭제. 확인 모달 없음. */
  onRemoveNotification: (id: NotificationId) => void;
  /** 다중선택 모드 "선택 N개 삭제" — ConfirmModal 후 호출. */
  onRemoveNotifications: (ids: NotificationId[]) => void;
}

export function NotificationPopup({
  visible,
  onClose,
  notifications,
  unreadCount,
  hasNext,
  loading,
  onLoadMore,
  onNotificationPress,
  onMarkAllRead,
  onRemoveNotification,
  onRemoveNotifications,
}: Props) {
  const insets = useSafeAreaInsets();

  // 본문 펼침 상태 — 목적지 없는 타입(NOTICE)이 카드 탭으로 본문을 펼치고 다시
  // 접을 수 있게 한다. 팝업이 닫힐 때 리셋해서 다음 오픈은 항상 collapsed 상태로.
  const [expandedIds, setExpandedIds] = useState<Set<NotificationId>>(
    () => new Set(),
  );

  // 다중선택 모드 — "삭제" 버튼으로 진입. selectedIds는 체크된 알림 id 집합.
  // 모달 close 시 리셋해 잔상 방지. selectMode일 땐 카드의 X 숨김 + 카드 탭이
  // 토글로 바뀜(라우팅·펼침 무동작).
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<NotificationId>>(
    () => new Set(),
  );
  // 일괄 삭제 확인 모달.
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);

  const toggleExpand = useCallback((id: NotificationId) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!visible) {
      setExpandedIds(new Set());
      // 다중선택 모드/선택 항목도 닫을 때 리셋.
      setSelectMode(false);
      setSelectedIds(new Set());
      setConfirmDeleteVisible(false);
    }
  }, [visible]);

  const toggleSelectId = useCallback((id: NotificationId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      // 전부 선택돼 있으면 전체 해제, 아니면 전체 선택. notifications는
      // 현재 로드된 리스트만(=화면에 보이는 것만) 기준.
      if (prev.size === notifications.length && notifications.length > 0) {
        return new Set();
      }
      return new Set(notifications.map((n) => n.id));
    });
  }, [notifications]);

  const handleCancelSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleConfirmBulkDelete = useCallback(() => {
    const ids = [...selectedIds];
    setConfirmDeleteVisible(false);
    setSelectMode(false);
    setSelectedIds(new Set());
    if (ids.length > 0) onRemoveNotifications(ids);
  }, [selectedIds, onRemoveNotifications]);

  const handleCardPress = (n: AppNotification) => {
    // 다중선택 모드: 카드 탭은 선택 토글로만 동작. 라우팅·펼침·읽음 없음.
    if (selectMode) {
      toggleSelectId(n.id);
      return;
    }

    // NOTICE: 해당 카드 한 건만 읽고 본문을 펼치거나 접는다. 팝업을 닫아도
    // 다른 NOTICE의 읽음 상태에는 영향을 주지 않는다.
    if (n.type === "notice") {
      onNotificationPress({ notificationId: n.id, type: n.type });
      toggleExpand(n.id);
      return;
    }

    onClose();
    onNotificationPress({ notificationId: n.id, type: n.type });
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
      <View
        style={[styles.screen, { paddingTop: insets.top }]}
        testID="notification-popup.root"
      >
        {/* Header row 1: close (left) + title (center) + spacer (right,
            visual balance). Mirrors the [close][title][44 spacer] pattern
            used by detail/cooking-* screens so all left-X headers line up. */}
        <View style={styles.headerRow}>
          <Pressable
            onPress={onClose}
            testID="notification-popup.close-button"
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

        {/* Header row 2: 모드별 액션. 일반 모드는 [모두 읽음] [삭제],
            선택 모드는 [취소][전체 선택] [선택 N개 삭제]. */}
        {notifications.length > 0 && !selectMode && (
          <View style={styles.actionsRow}>
            {unreadCount > 0 ? (
              <Pressable
                onPress={onMarkAllRead}
                accessibilityRole="button"
                accessibilityLabel="모두 읽음으로 표시"
                hitSlop={6}
                style={({ pressed }) => [
                  styles.actionBtn,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Ionicons
                  name="checkmark-done-outline"
                  size={16}
                  color={Colors.primary}
                />
                <Text style={styles.actionBtnText}>모두 읽음으로 표시</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(
                  () => {},
                );
                setSelectMode(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="알림 삭제 모드"
              hitSlop={6}
              style={({ pressed }) => [
                styles.actionBtn,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Ionicons
                name="trash-outline"
                size={16}
                color={Colors.onSurfaceVariant}
              />
              <Text style={styles.actionBtnTextNeutral}>삭제</Text>
            </Pressable>
          </View>
        )}

        {selectMode && (
          <View style={styles.actionsRow}>
            <View style={styles.actionsLeftCluster}>
              <Pressable
                onPress={handleCancelSelectMode}
                accessibilityRole="button"
                hitSlop={6}
                style={({ pressed }) => [
                  styles.actionBtn,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Text style={styles.actionBtnTextNeutral}>취소</Text>
              </Pressable>
              <Pressable
                onPress={handleToggleSelectAll}
                accessibilityRole="button"
                hitSlop={6}
                disabled={notifications.length === 0}
                style={({ pressed }) => [
                  styles.actionBtn,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Ionicons
                  name={
                    selectedIds.size === notifications.length &&
                    notifications.length > 0
                      ? "checkbox-outline"
                      : "square-outline"
                  }
                  size={16}
                  color={Colors.onSurfaceVariant}
                />
                <Text style={styles.actionBtnTextNeutral}>전체 선택</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => {
                if (selectedIds.size === 0) return;
                setConfirmDeleteVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={`선택한 ${selectedIds.size}개 삭제`}
              disabled={selectedIds.size === 0}
              hitSlop={6}
              style={({ pressed }) => [
                styles.actionBtn,
                selectedIds.size === 0 && { opacity: 0.4 },
                pressed && selectedIds.size > 0 && { opacity: 0.6 },
              ]}
            >
              <Ionicons
                name="trash-outline"
                size={16}
                color={selectedIds.size > 0 ? Colors.error : Colors.outline}
              />
              <Text
                style={[
                  styles.actionBtnTextDestructive,
                  selectedIds.size === 0 && { color: Colors.outline },
                ]}
              >
                {selectedIds.size > 0
                  ? `선택 ${selectedIds.size}개 삭제`
                  : "선택 삭제"}
              </Text>
            </Pressable>
          </View>
        )}

        <FlatList
          data={notifications}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <NotificationCard
              item={item}
              expanded={expandedIds.has(item.id)}
              onPress={() => handleCardPress(item)}
              selectMode={selectMode}
              isSelected={selectedIds.has(item.id)}
              onRemove={() => onRemoveNotification(item.id)}
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

        {/* 일괄 삭제 확인 — 다중선택 모드의 "선택 N개 삭제" 탭 시 표시. */}
        <ConfirmModal
          visible={confirmDeleteVisible}
          title="알림 삭제"
          subtitle={`선택한 ${selectedIds.size}개 알림을 삭제할까요?`}
          confirmLabel="삭제하기"
          cancelLabel="취소"
          destructive
          onConfirm={handleConfirmBulkDelete}
          onCancel={() => setConfirmDeleteVisible(false)}
        />
      </View>
    </Modal>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

function NotificationCard({
  item,
  expanded,
  onPress,
  selectMode,
  isSelected,
  onRemove,
}: {
  item: AppNotification;
  /**
   * 본문을 다 보여줄지 여부. 목적지 없는 타입(NOTICE)이 카드 탭으로 토글한다.
   * 목적지 있는 타입은 어차피 탭 시 화면을 이동하므로 항상 false로 들어와도
   * 무방.
   */
  expanded: boolean;
  onPress: () => void;
  /** 다중선택 모드 여부 — true면 X 숨김 + 체크박스 표시. */
  selectMode: boolean;
  /** 다중선택 모드에서 이 카드가 선택됐는지. */
  isSelected: boolean;
  /** 일반 모드 X 버튼 → 즉시 개별 삭제. */
  onRemove: () => void;
}) {
  const visual = TYPE_VISUAL[item.type];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.body}`}
      accessibilityState={{ selected: selectMode && isSelected }}
      style={({ pressed }) => [
        styles.card,
        !item.isRead && styles.cardUnread,
        selectMode && isSelected && styles.cardSelected,
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
        <Text
          style={styles.cardSubtitle}
          numberOfLines={expanded ? undefined : 2}
        >
          {item.body}
        </Text>
      </View>

      <View style={styles.cardRight}>
        <Text style={styles.cardTime}>
          {formatRelativeTime(item.createdAt)}
        </Text>
        {!item.isRead && <View style={styles.unreadDot} />}
      </View>

      {/* 모드별 trailing affordance — selectMode면 체크박스(시각만, 탭은
          전체 카드가 받음), 일반 모드면 X 버튼(별도 Pressable이라 본문 탭과
          분리됨). */}
      {selectMode ? (
        <View
          style={[
            styles.selectCheckbox,
            isSelected && styles.selectCheckboxActive,
          ]}
          pointerEvents="none"
        >
          {isSelected && (
            <Ionicons name="checkmark" size={14} color={Colors.onPrimary} />
          )}
        </View>
      ) : (
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel="이 알림 삭제"
          hitSlop={8}
          style={({ pressed }) => [
            styles.removeBtn,
            pressed && { opacity: 0.5 },
          ]}
        >
          <Ionicons
            name="close"
            size={16}
            color={Colors.onSurfaceVariant}
          />
        </Pressable>
      )}
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
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  actionsLeftCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  // 액션 버튼 공통 — primary 톤(모두 읽음), neutral(취소/전체선택/삭제 진입),
  // destructive(선택 N개 삭제)는 텍스트 스타일로 분기.
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  actionBtnText: {
    fontSize: FontSize.labelMd,
    fontWeight: FontWeight.semiBold,
    color: Colors.primary,
  },
  actionBtnTextNeutral: {
    fontSize: FontSize.labelMd,
    fontWeight: FontWeight.semiBold,
    color: Colors.onSurfaceVariant,
  },
  actionBtnTextDestructive: {
    fontSize: FontSize.labelMd,
    fontWeight: FontWeight.bold,
    color: Colors.error,
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
  // 다중선택 모드 — 선택된 카드 강조.
  cardSelected: {
    backgroundColor: Colors.secondaryContainer,
  },
  // 일반 모드 우측 X 버튼 — 별도 Pressable이라 카드 본문 탭과 분리.
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: Spacing.xs,
  },
  // 다중선택 모드 체크박스 — pointerEvents none, 카드 자체 Pressable이 탭 받음.
  selectCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: Colors.outline,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: Spacing.xs,
  },
  selectCheckboxActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
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
