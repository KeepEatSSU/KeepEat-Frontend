/**
 * +(FAB) 메뉴 바텀시트 — 갤러리/카메라/수동 입력 3개 액션.
 *
 * 동작 보존이 핵심: 사용자가 메뉴를 선택하면 "시트 닫힘 애니메이션 완료
 * 후" 해당 액션(ImagePicker 또는 navigate)이 실행되어야 함 — 시트가
 * 화면에 남아 있는 채로 picker가 뜨면 어색하기 때문. 기존 RN Animated
 * 구현은 `animateOut(callback)`이 .start(callback) 콜백으로 풀었던 것을,
 * useSheetGesture로 옮기면서 `pendingActionRef` + close 후 onClose 훅에서
 * ref 액션 실행 패턴으로 동일 효과 유지.
 *
 * 애니메이션·제스처 레이어는 useSheetGesture(reanimated + gesture-handler)
 * 로 통일. Modal 내부에서 제스처가 작동하도록 GestureHandlerRootView로
 * 다시 wrap.
 */

import { useCallback, useRef } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import {
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSheetGesture } from "@/hooks/useSheetGesture";
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  Radius,
  Shadows,
} from "@/constants/theme";

// ─── Types & Data ─────────────────────────────────────────────────────────────

interface AddMenuSheetProps {
  visible: boolean;
  onClose: () => void;
  onGallery: () => void;
  onCamera: () => void;
  onManual: () => void;
}

const MENU_ITEMS: {
  key: string;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  action: keyof Pick<AddMenuSheetProps, "onGallery" | "onCamera" | "onManual">;
}[] = [
  { key: "gallery", label: "갤러리에서 선택", icon: "photo-library", action: "onGallery" },
  { key: "camera", label: "사진 찍기", icon: "photo-camera", action: "onCamera" },
  { key: "manual", label: "수동 입력", icon: "edit-note", action: "onManual" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function AddMenuSheet({
  visible,
  onClose,
  onGallery,
  onCamera,
  onManual,
}: AddMenuSheetProps) {
  const insets = useSafeAreaInsets();
  const actions = { onGallery, onCamera, onManual };

  // 선택한 메뉴의 액션 — close 애니메이션이 끝난 뒤 실행되도록 ref에 보관.
  // 백드롭/뒤로로 닫는 경우엔 null이라 아무 액션도 실행 안 됨.
  const pendingActionRef = useRef<(() => void) | null>(null);

  // close 애니메이션 완료 후 hook이 이 콜백을 호출한다. 부모의 onClose를
  // 먼저 실행(visible=false 전환)한 뒤 보관해뒀던 액션을 실행 — 기존
  // animateOut(callback)의 `.start(() => { onClose(); callback?(); })` 순서
  // 와 동일.
  const handleAfterClose = useCallback(() => {
    onClose();
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    action?.();
  }, [onClose]);

  const { pan, sheetStyle, backdropStyle, close } = useSheetGesture(
    visible,
    handleAfterClose,
  );

  const handleMenuPress = useCallback(
    (action: () => void) => {
      pendingActionRef.current = action;
      close();
    },
    [close],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={close}
    >
      {/* Modal 내부 제스처용 root — Modal이 별도 native window라 앱 루트의
          GestureHandlerRootView가 닿지 않음. */}
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.container}>
          {/* Backdrop — fades in place */}
          <Animated.View style={[styles.backdrop, backdropStyle]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          </Animated.View>

          {/* Sheet — slides up independently */}
          <Animated.View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 20) + 8 },
              sheetStyle,
            ]}
          >
            {/* Drag handle — handleRow가 hit zone 역할도 겸함 */}
            <GestureDetector gesture={pan}>
              <View style={styles.handleRow}>
                <View style={styles.handle} />
              </View>
            </GestureDetector>

            {/* Menu buttons */}
            <View style={styles.menuList}>
              {MENU_ITEMS.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => handleMenuPress(actions[item.action])}
                  style={({ pressed }) => [
                    styles.menuItem,
                    pressed && styles.menuItemPressed,
                  ]}
                >
                  <MaterialIcons
                    name={item.icon}
                    size={24}
                    color={Colors.primary}
                  />
                  <Text style={styles.menuLabel}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(25, 28, 29, 0.40)",
  },
  sheet: {
    backgroundColor: Colors.glassBackground,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    ...Shadows.ambient,
  },
  handleRow: {
    alignItems: "center",
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceContainerHighest,
  },
  menuList: {
    gap: Spacing.md,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    height: 64,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.base,
  },
  menuItemPressed: {
    backgroundColor: Colors.surfaceContainerLow,
    transform: [{ scale: 0.98 }],
  },
  menuLabel: {
    flex: 1,
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.semiBold,
    color: Colors.onSurface,
    textAlign: "center",
    marginRight: 24 + Spacing.base,
  },
});
