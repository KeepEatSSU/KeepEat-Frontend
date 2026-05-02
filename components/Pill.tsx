// Task 3: Reusable pill-shaped action chip (quick-select buttons, etc.)
// - Full radius (999), muted grey-mint background, action-trigger (not toggle)
// - Light haptic feedback on press for tactile feedback

import { Pressable, Text, StyleSheet, type ViewStyle, type StyleProp } from "react-native";
import * as Haptics from "expo-haptics";
import {
  FontSize,
  FontWeight,
  PillTokens,
  Spacing,
} from "@/constants/theme";

interface PillProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function Pill({
  label,
  onPress,
  disabled = false,
  style,
  accessibilityLabel,
}: PillProps) {
  const handlePress = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
      /* haptics may be unavailable on some devices — fail silently */
    });
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.pill,
        pressed && !disabled && styles.pillPressed,
        disabled && styles.pillDisabled,
        style,
      ]}
    >
      <Text style={[styles.pillText, disabled && styles.pillTextDisabled]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: PillTokens.radius,
    backgroundColor: PillTokens.background,
    alignItems: "center",
    justifyContent: "center",
  },
  pillPressed: {
    backgroundColor: PillTokens.backgroundPressed,
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  pillDisabled: {
    opacity: 0.4,
  },
  pillText: {
    fontSize: FontSize.labelMd,
    fontWeight: FontWeight.bold,
    color: PillTokens.text,
  },
  pillTextDisabled: {
    opacity: 0.6,
  },
});
