import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  Radius,
  Shadows,
  LetterSpacing,
} from "@/constants/theme";

interface ConfirmModalProps {
  visible: boolean;
  /** Single-line message (legacy). Used when title/subtitle are not provided. */
  message?: string;
  /** Bold heading displayed above subtitle */
  title?: string;
  /** Body text below title, supports \n */
  subtitle?: string;
  /** Small muted text below subtitle */
  footnote?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** If true, confirm button uses error (red) color */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  visible,
  message,
  title,
  subtitle,
  footnote,
  confirmLabel = "예",
  cancelLabel = "아니요",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  // Fallback: if title/subtitle not given, use message
  const hasStructured = title != null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {hasStructured ? (
            <>
              <Text style={styles.title}>{title}</Text>
              {subtitle && (
                <Text style={styles.subtitle}>{subtitle}</Text>
              )}
              {footnote && (
                <Text style={styles.footnote}>{footnote}</Text>
              )}
            </>
          ) : (
            <Text style={styles.title}>
              {message ?? "수정하시겠습니까?"}
            </Text>
          )}

          <View style={styles.buttonRow}>
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.button,
                destructive ? styles.destructiveButton : styles.confirmButton,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.confirmText,
                  destructive && styles.destructiveText,
                ]}
              >
                {confirmLabel}
              </Text>
            </Pressable>

            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [
                styles.button,
                styles.cancelButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(25, 28, 29, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xxl,
  },
  card: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xxl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl + 8,
    paddingBottom: Spacing.xl,
    width: "100%",
    maxWidth: 320,
    ...Shadows.ambient,
  },
  title: {
    fontSize: FontSize.titleLg,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
    textAlign: "center",
    marginBottom: Spacing.md,
  },
  subtitle: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: Spacing.sm,
  },
  footnote: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.regular,
    color: Colors.outline,
    textAlign: "center",
    marginBottom: Spacing.xl,
  },
  buttonRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  button: {
    flex: 1,
    paddingVertical: Spacing.base,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  confirmButton: {
    backgroundColor: Colors.primary,
  },
  destructiveButton: {
    backgroundColor: Colors.error,
  },
  cancelButton: {
    backgroundColor: Colors.surfaceContainerHigh,
  },
  confirmText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onPrimary,
  },
  destructiveText: {
    color: Colors.onError,
  },
  cancelText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onSurfaceVariant,
  },
});
