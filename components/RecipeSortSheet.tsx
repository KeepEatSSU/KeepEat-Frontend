/**
 * 레시피 정렬 바텀시트 — 내 레시피 탭에서 사용.
 *
 * 3옵션 단일 선택(최신순/좋아요 많은순/싫어요 많은순). 탭 즉시 onChange +
 * 시트 닫음. 정렬 자체는 부모의 useMemo 파이프라인이 담당, 이 컴포넌트는
 * 선택값 전달만.
 *
 * RecipeFilterSheet과 같은 split-animation 패턴(backdrop 페이드 + sheet
 * 슬라이드 분리)으로 검정 배경이 함께 올라오는 글리치를 피한다.
 */

import { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
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

const SLIDE_DISTANCE = Dimensions.get("window").height;

interface Props {
  visible: boolean;
  value: RecipeSortKey;
  onChange: (key: RecipeSortKey) => void;
  onClose: () => void;
}

export function RecipeSortSheet({ visible, value, onChange, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(SLIDE_DISTANCE)).current;

  useEffect(() => {
    if (visible) {
      backdropOpacity.setValue(0);
      sheetTranslateY.setValue(SLIDE_DISTANCE);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(sheetTranslateY, {
          toValue: 0,
          damping: 22,
          stiffness: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, backdropOpacity, sheetTranslateY]);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: SLIDE_DISTANCE,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  };

  const handleSelect = (key: RecipeSortKey) => {
    onChange(key);
    handleClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <Animated.View
          style={[styles.backdrop, { opacity: backdropOpacity }]}
          pointerEvents={visible ? "auto" : "none"}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 20) },
            { transform: [{ translateY: sheetTranslateY }] },
          ]}
        >
          <View style={styles.handleBar} />
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
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  handleBar: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceContainerHighest,
    marginBottom: Spacing.lg,
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
