/**
 * LOCAL 계정 회원탈퇴용 확인 모달.
 *
 * 단일 화면에서 (1) "정말 탈퇴?" 확인 + (2) 비밀번호 재입력 두 단계를 합쳐
 * 처리한다. 비밀번호가 비어있으면 제출 버튼이 비활성, 제출 중에는
 * ActivityIndicator로 중복 클릭을 막는다. ConfirmModal과 같은 톤(destructive)
 * 으로 일관된 위험 시그널을 유지.
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
import { Ionicons } from "@expo/vector-icons";
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  Radius,
  Shadows,
} from "@/constants/theme";

interface DeletePasswordModalProps {
  visible: boolean;
  submitting: boolean;
  onConfirm: (password: string) => void;
  onCancel: () => void;
}

export function DeletePasswordModal({
  visible,
  submitting,
  onConfirm,
  onCancel,
}: DeletePasswordModalProps) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // 매번 열릴 때 비번 필드를 비움 — 이전 시도 값이 남지 않도록.
  // showPassword도 함께 false로 — 다음 오픈 시 기본 숨김 상태로 복귀.
  useEffect(() => {
    if (visible) {
      setPassword("");
      setShowPassword(false);
    }
  }, [visible]);

  const canSubmit = password.length > 0 && !submitting;

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
          <Text style={styles.title}>회원 탈퇴</Text>
          <Text style={styles.subtitle}>
            정말 탈퇴하시겠어요?{"\n"}
            비밀번호를 입력하면 모든 데이터가 삭제돼요.
          </Text>

          <View style={styles.inputRow}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="비밀번호"
              placeholderTextColor={Colors.outline}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
              style={styles.input}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={8}
              accessibilityLabel={
                showPassword ? "비밀번호 숨기기" : "비밀번호 보기"
              }
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={18}
                color={Colors.outline}
              />
            </Pressable>
          </View>

          <View style={styles.buttonRow}>
            <Pressable
              onPress={() => onConfirm(password)}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.button,
                styles.destructiveButton,
                !canSubmit && styles.buttonDisabled,
                pressed && canSubmit && styles.pressed,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={Colors.onError} />
              ) : (
                <Text style={styles.destructiveText}>탈퇴하기</Text>
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
  // 컨테이너 — 기존 input 스타일의 시각 속성(background/border/padding)을
  // 옮겨와 TextInput 옆에 눈 토글 Pressable이 들어갈 자리를 확보.
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.fieldBackground,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.xl,
  },
  input: {
    flex: 1,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
    padding: 0,
    margin: 0,
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
  destructiveButton: {
    backgroundColor: Colors.error,
  },
  cancelButton: {
    backgroundColor: Colors.surfaceContainerHigh,
  },
  destructiveText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onError,
  },
  cancelText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onSurfaceVariant,
  },
});
