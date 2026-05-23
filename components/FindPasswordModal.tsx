/**
 * 비밀번호 찾기 모달. 사용자가 가입 이메일을 입력하면 서버가 해당 주소로
 * 임시 비밀번호를 발송. UI는 DeletePasswordModal과 같은 카드 + 버튼 행 톤을
 * 유지 — 로그인 화면 위에 가볍게 떠서 결과를 토스트로 전달한다.
 *
 * 결과 메시지(서버 plain-string)는 부모가 받아서 toast로 띄움. 빈 이메일은
 * 버튼 비활성, 제출 중에는 ActivityIndicator로 중복 클릭 차단.
 */

import { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  Radius,
  Shadows,
} from "@/constants/theme";

interface FindPasswordModalProps {
  visible: boolean;
  submitting: boolean;
  onSubmit: (email: string) => void;
  onCancel: () => void;
}

export function FindPasswordModal({
  visible,
  submitting,
  onSubmit,
  onCancel,
}: FindPasswordModalProps) {
  const [email, setEmail] = useState("");

  // 매번 열릴 때 입력값을 비움 — 이전 시도가 남지 않도록.
  useEffect(() => {
    if (visible) setEmail("");
  }, [visible]);

  const trimmed = email.trim();
  const canSubmit = trimmed.length > 0 && !submitting;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.card}>
          <Text style={styles.title}>비밀번호 찾기</Text>
          <Text style={styles.subtitle}>
            가입한 이메일을 입력하면{"\n"}
            임시 비밀번호를 보내드려요.
          </Text>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="이메일"
            placeholderTextColor={Colors.outline}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
            style={styles.input}
          />

          <View style={styles.buttonRow}>
            <Pressable
              onPress={() => onSubmit(trimmed)}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.button,
                styles.primaryButton,
                !canSubmit && styles.buttonDisabled,
                pressed && canSubmit && styles.pressed,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={Colors.onPrimary} />
              ) : (
                <Text style={styles.primaryText}>임시 비밀번호 받기</Text>
              )}
            </Pressable>

            <Pressable
              onPress={onCancel}
              disabled={submitting}
              style={({ pressed }) => [
                styles.button,
                styles.cancelButton,
                pressed && !submitting && styles.pressed,
              ]}
            >
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    marginBottom: Spacing.lg,
  },
  input: {
    backgroundColor: Colors.fieldBackground,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
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
  buttonDisabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  primaryButton: {
    backgroundColor: Colors.primary,
  },
  cancelButton: {
    backgroundColor: Colors.surfaceContainerHigh,
  },
  primaryText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onPrimary,
  },
  cancelText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onSurfaceVariant,
  },
});
