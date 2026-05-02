import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  Radius,
  Shadows,
  LetterSpacing,
} from "@/constants/theme";

// ─── ErrorScreen ──────────────────────────────────────────────────────────────
//
// Reusable error surface for any failure context — routing miss, API failure,
// blocked screen entry. Pass nothing for a generic "유효하지 않은 접근" state,
// or pass a code/message tuned to the situation.
//
// Usage:
//   import { ErrorScreen } from "@/components/ErrorScreen";
//
//   // From an API error boundary inside a screen
//   if (query.error) {
//     return (
//       <ErrorScreen
//         errorCode="500"
//         message="레시피를 불러오지 못했어요"
//         subMessage="잠시 후 다시 시도해 주세요"
//         onRetry={() => query.refetch()}
//       />
//     );
//   }
//

export type ErrorScreenProps = {
  errorCode?: string | number;
  message?: string;
  subMessage?: string;
  /** Override the home button label. Defaults to "냉장고로 돌아가기". */
  buttonLabel?: string;
  /** Override the home button action. Defaults to routing to /(tabs). */
  onPressHome?: () => void;
  /** Optional retry action shown above the home button as a text link. */
  onRetry?: () => void;
};

export function ErrorScreen({
  errorCode,
  message = "유효하지 않은 접근입니다",
  subMessage,
  buttonLabel = "냉장고로 돌아가기",
  onPressHome,
  onRetry,
}: ErrorScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleHome = () => {
    if (onPressHome) {
      onPressHome();
      return;
    }
    router.replace("/(tabs)");
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.center}>
        {errorCode !== undefined && (
          <Text style={styles.code} accessibilityRole="header">
            {errorCode}
          </Text>
        )}
        <Text style={styles.message}>{message}</Text>
        {subMessage && <Text style={styles.subMessage}>{subMessage}</Text>}
      </View>

      <View
        style={[
          styles.bottomArea,
          { paddingBottom: Math.max(insets.bottom, Spacing.md) },
        ]}
      >
        {onRetry && (
          <Pressable
            onPress={onRetry}
            style={({ pressed }) => [
              styles.retryButton,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.retryText}>다시 시도하기</Text>
          </Pressable>
        )}
        <Pressable
          onPress={handleHome}
          style={({ pressed }) => [
            styles.ctaButton,
            pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
          ]}
        >
          <Text style={styles.ctaText}>{buttonLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.surfaceSubtle,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  code: {
    fontSize: 96,
    lineHeight: 104,
    fontWeight: FontWeight.extraBold,
    color: Colors.primary,
    letterSpacing: LetterSpacing.tight,
    marginBottom: Spacing.lg,
    textAlign: "center",
  },
  message: {
    fontSize: FontSize.headlineSm,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
    textAlign: "center",
    letterSpacing: LetterSpacing.tight,
  },
  subMessage: {
    marginTop: Spacing.sm,
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.regular,
    color: Colors.onSurfaceVariant,
    textAlign: "center",
    lineHeight: 20,
  },
  bottomArea: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },
  retryButton: {
    alignSelf: "center",
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.base,
  },
  retryText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.semiBold,
    color: Colors.primary,
  },
  ctaButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.xl,
    paddingVertical: Spacing.base,
    alignItems: "center",
    justifyContent: "center",
    ...Shadows.fab,
  },
  ctaText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onPrimary,
  },
});
