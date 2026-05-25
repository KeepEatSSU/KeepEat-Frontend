/**
 * 레시피 정렬 바텀시트 — 내 레시피 탭에서 사용.
 *
 * 3옵션 단일 선택(최신순/좋아요 많은순/싫어요 많은순). 탭 즉시 onChange +
 * 시트 닫음. 정렬 자체는 부모의 useMemo 파이프라인이 담당, 이 컴포넌트는
 * 선택값 전달만.
 *
 * 파일럿(reanimated + gesture-handler 전환): 기존 RN Animated + PanResponder
 * 조합은 useNativeDriver:true에서 JS setValue가 native에 안 닿아 핸들바
 * 드래그가 안 됐다. 여기는 `useSheetGesture` hook으로 애니메이션·제스처를
 * UI thread에서 일관 처리. 나머지 3개 시트는 검증 후 같은 패턴 복제 예정.
 *
 * Modal 내부에서 제스처가 동작하려면 GestureHandlerRootView를 Modal 안에
 * 다시 wrap해야 한다 — root의 RootView는 별도 native window인 Modal 안에
 * 닿지 않음.
 */

import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { useSheetGesture } from "@/hooks/useSheetGesture";
import {
  Colors,
  FontSize,
  FontWeight,
  Radius,
  Shadows,
  Spacing,
} from "@/constants/theme";

export type RecipeSortKey = "latest" | "mostLiked" | "mostDisliked";

const OPTIONS: { key: RecipeSortKey; label: string }[] = [
  { key: "latest", label: "최신순" },
  { key: "mostLiked", label: "좋아요 많은순" },
  { key: "mostDisliked", label: "싫어요 많은순" },
];

interface Props {
  visible: boolean;
  value: RecipeSortKey;
  onChange: (key: RecipeSortKey) => void;
  onClose: () => void;
}

export function RecipeSortSheet({ visible, value, onChange, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { pan, sheetStyle, backdropStyle, close } = useSheetGesture(
    visible,
    onClose,
  );

  const handleSelect = (key: RecipeSortKey) => {
    onChange(key);
    close();
  };

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
          <Animated.View
            style={[styles.backdrop, backdropStyle]}
            pointerEvents={visible ? "auto" : "none"}
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          </Animated.View>

          <Animated.View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 20) },
              sheetStyle,
            ]}
          >
            <GestureDetector gesture={pan}>
              <View style={styles.handleZone}>
                <View style={styles.handleBar} />
              </View>
            </GestureDetector>
            <Text style={styles.title}>정렬</Text>
            {OPTIONS.map((opt) => {
              const isActive = opt.key === value;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => handleSelect(opt.key)}
                  style={({ pressed }) => [
                    styles.option,
                    isActive && styles.optionActive,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    style={[
                      styles.optionLabel,
                      isActive && styles.optionLabelActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {isActive && (
                    <Ionicons
                      name="checkmark"
                      size={20}
                      color={Colors.primary}
                    />
                  )}
                </Pressable>
              );
            })}
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

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
    backgroundColor: "rgba(25, 28, 29, 0.45)",
  },
  sheet: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    ...Shadows.ambient,
  },
  // 드래그 hit zone — 작은 4px 바만으론 잡기 어려우니 시트 최상단 전체
  // 폭에 두툼한 padding으로 영역을 키운다. 시각은 동일(센터의 작은 바만 보임).
  handleZone: {
    alignItems: "center",
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceContainerHighest,
  },
  title: {
    fontSize: FontSize.titleLg,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
    marginBottom: Spacing.base,
  },
  option: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.lg,
  },
  optionActive: {
    backgroundColor: "rgba(0, 109, 55, 0.07)",
  },
  optionLabel: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
  },
  optionLabelActive: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
});
