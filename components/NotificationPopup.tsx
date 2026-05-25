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

import { useCallback, useEffect, useRef, useState } from "react";
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
import { routeForNotificationType } from "@/utils/notificationRouting";
import { useRecipeRecommendation } from "@/context/RecipeRecommendationContext";
import { ConfirmModal } from "@/components/ConfirmModal";

// RECIPE_READY가 ready 아닐 때 모달 내부에 띄우는 안내 pill 표시 시간.
// iOS UIModalPresentationFullScreen이 root window를 덮어 전역 Toast가
// 모달 위에 안 그려지는 한계를 우회 — 모달 내부에서 자체 안내 (Toast.tsx
// 헤더 Known Issue 참조).
const HINT_DURATION_MS = 2500;

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
  onNotificationRead: (id: number) => void;
  onMarkAllRead: () => void;
  /**
   * EXPIRY_SOON 카드 탭 시 즉시 호출 — destination 화면(냉장고 탭)에 이미
   * 있을 때 router.push("/")가 navigation transition을 만들지 않아
   * useFocusEffect가 재발화 안 하는 케이스를 직접 해결. markTypeRead는
   * unread 0이면 no-op이라 destination focus와 중복 호출돼도 안전.
   */
  onMarkTypeRead: (type: NotificationType) => void;
  /** 일반 모드 카드 X 버튼 — 즉시 개별 삭제. 확인 모달 없음. */
  onRemoveNotification: (id: number) => void;
  /** 다중선택 모드 "선택 N개 삭제" — ConfirmModal 후 호출. */
  onRemoveNotifications: (ids: number[]) => void;
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
  onMarkTypeRead,
  onRemoveNotification,
  onRemoveNotifications,
}: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // RECIPE_READY 카드 탭 시 swipe로 이동할지 판단하는 게이트. recommendation
  // status가 "ready"여야만 이동(빈 화면 회피). Provider 계층상 popup이
  // RecipeRecommendationProvider 안쪽이라 hook 호출 안전.
  const { status: recommendationStatus } = useRecipeRecommendation();

  // 모달 내부 안내 pill — RECIPE_READY ready 아닐 때 표시. 전역 Toast가
  // iOS fullScreen modal에 가려지는 한계를 우회해 모달 안에서 자체 렌더.
  const [hint, setHint] = useState<string | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showHint = useCallback((message: string) => {
    // 새 hint 뜨면 진행 중 타이머 cancel 후 재설정 — 연속 탭 시 메시지가
    // 갱신되고 타이머도 리셋되어 마지막 메시지가 끝까지 보임.
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    setHint(message);
    hintTimerRef.current = setTimeout(() => {
      setHint(null);
      hintTimerRef.current = null;
    }, HINT_DURATION_MS);
  }, []);

  // 본문 펼침 상태 — 목적지 없는 타입(NOTICE)이 카드 탭으로 본문을 펼치고 다시
  // 접을 수 있게 한다. 팝업이 닫힐 때 리셋해서 다음 오픈은 항상 collapsed 상태로.
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());

  // 다중선택 모드 — "삭제" 버튼으로 진입. selectedIds는 체크된 알림 id 집합.
  // 모달 close 시 리셋해 잔상 방지. selectMode일 땐 카드의 X 숨김 + 카드 탭이
  // 토글로 바뀜(라우팅·펼침 무동작).
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  // 일괄 삭제 확인 모달.
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);

  const toggleExpand = useCallback((id: number) => {
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
      // 모달 닫힐 때 hint도 즉시 정리 — 다음 열림 시 잔상 없게.
      if (hintTimerRef.current) {
        clearTimeout(hintTimerRef.current);
        hintTimerRef.current = null;
      }
      setHint(null);
      // 다중선택 모드/선택 항목도 닫을 때 리셋.
      setSelectMode(false);
      setSelectedIds(new Set());
      setConfirmDeleteVisible(false);
    }
  }, [visible]);

  // Unmount cleanup — 진행 중 hint 타이머 정리.
  useEffect(() => {
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, []);

  const toggleSelectId = useCallback((id: number) => {
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

    // 타입별 독립 흐름. routeForNotificationType은 안전망(미래 타입)으로만.

    if (n.type === "notice") {
      // 카드 탭 즉시 그 알림만 개별 읽음(미읽음일 때) + 본문 펼침/접힘.
      // 팝업은 유지 — 사용자가 다른 카드를 계속 본다. NOTICE 전체 읽음은
      // popup close 후 일정시간 뒤(AppHeaderRight) 일괄 처리.
      if (!n.isRead) onNotificationRead(n.id);
      toggleExpand(n.id);
      return;
    }

    if (n.type === "recipe_ready") {
      // 이미 읽음 = "과거 추천" 알림. 현재 recommendedRecipes와 무관할
      // 가능성이 커서 클릭에 반응 안 함.
      if (n.isRead) return;
      // 미읽음 + status가 "ready"여야만 이동. loading/idle/swiping/error면
      // 이동 X — swipe 화면이 빈 결과를 보이거나 의도와 어긋남. 읽음 처리도
      // 안 함(사용자가 결과를 아직 못 봤으므로).
      if (recommendationStatus !== "ready") {
        // 전역 Toast는 iOS fullScreen modal에 가려 안 보이므로 모달 내부
        // pill로 안내. 사용자가 "왜 이동 안 되나" 헷갈리지 않게.
        showHint(
          recommendationStatus === "loading"
            ? "아직 레시피를 만들고 있어요"
            : "추천 레시피가 준비되지 않았어요",
        );
        return;
      }
      onClose();
      router.push("/recipe-swipe" as never);
      return;
    }

    if (n.type === "expiry_soon") {
      // 라우팅 + 즉시 markTypeRead. router.push("/")가 이미 냉장고 탭에
      // 있을 때 transition을 안 만들어 useFocusEffect가 재발화 안 하는
      // 케이스를 직접 해결. destination focus의 markTypeRead와 중복 호출돼도
      // unread 0이면 no-op이라 안전.
      onMarkTypeRead("expiry_soon");
      onClose();
      router.push("/" as never);
      return;
    }

    // 미래 타입 안전망 — routeForNotificationType에 위임.
    const path = routeForNotificationType(n.type);
    if (!path) {
      toggleExpand(n.id);
      return;
    }
    onClose();
    router.push(path as never);
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
              onPress={() => setSelectMode(true)}
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

        {/* 모달 내부 안내 pill — RECIPE_READY가 ready 아닐 때 표시.
            pointerEvents="none"이라 리스트 탭 방해 X. 전역 Toast 시스템과
            무관, 이 모달 내부 한정. */}
        {hint !== null && (
          <View
            style={[
              styles.hintWrap,
              { bottom: Math.max(insets.bottom, 16) + 24 },
            ]}
            pointerEvents="none"
          >
            <View style={styles.hintPill}>
              <Text style={styles.hintText} numberOfLines={2}>
                {hint}
              </Text>
            </View>
          </View>
        )}

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

  // 모달 내부 안내 pill — 전역 Toast pill과 시각 비슷하게(어두운/primary,
  // 흰 텍스트, 둥근 모서리) 하단 absolute 배치.
  hintWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  hintPill: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md + 2,
    borderRadius: Radius.xl,
    marginHorizontal: Spacing.lg,
  },
  hintText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.semiBold,
    color: Colors.onPrimary,
    textAlign: "center",
  },
});
