import { useEffect, useRef, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  Animated,
  StyleSheet,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
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

const SHEET_HEIGHT = 300; // approximate max content height

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

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  // ── Animate in ──
  useEffect(() => {
    if (visible) {
      // Reset positions before animating in
      backdropOpacity.setValue(0);
      sheetTranslateY.setValue(SHEET_HEIGHT);

      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(sheetTranslateY, {
          toValue: 0,
          damping: 20,
          stiffness: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  // ── Animate out, then close ──
  const animateOut = useCallback(
    (callback?: () => void) => {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslateY, {
          toValue: SHEET_HEIGHT,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onClose();
        callback?.();
      });
    },
    [onClose, backdropOpacity, sheetTranslateY],
  );

  const handleMenuPress = useCallback(
    (action: () => void) => {
      animateOut(action);
    },
    [animateOut],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => animateOut()}
    >
      <View style={styles.container}>
        {/* Backdrop — fades in place */}
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => animateOut()} />
        </Animated.View>

        {/* Sheet — slides up independently */}
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 20) + 8 },
            { transform: [{ translateY: sheetTranslateY }] },
          ]}
        >
          {/* Drag handle */}
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

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
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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
    paddingBottom: Spacing.xl,
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
