import { useToast } from "@/components/Toast";
import {
  Colors,
  FontSize,
  FontWeight,
  LetterSpacing,
  Radius,
  Shadows,
  Spacing,
} from "@/constants/theme";
import { sendEmailCode, verifyEmailCode } from "@/services/api";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─── Validation ───────────────────────────────────────────────────────────────

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Screen ───────────────────────────────────────────────────────────────────
// Step 1 of signup: collect + verify the email. On success we hand off to
// /signup-profile (step 2) via router.push, carrying the verified email as a
// route param. The handoff exists specifically so the password input in step
// 2 lives in a small, single-form route — the same shape as login.tsx and
// change-password.tsx, both of which type cleanly on iOS. Keeping password
// here (in a step-branched ternary) reliably reproduced an iOS bug where the
// native input session never bound to the field.

export default function SignupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [email, setEmail] = useState("");

  // Email-verification state. Real send/verify endpoints handle the full flow.
  const [codeSent, setCodeSent] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const isEmailValid = EMAIL_REGEX.test(email);

  const handleSendCode = async () => {
    if (!isEmailValid || sending) return;
    Keyboard.dismiss();
    setSending(true);
    setVerifyError("");
    try {
      await sendEmailCode(email.trim());
      setCodeSent(true);
      setVerifyCode("");
      showToast("인증번호를 전송했어요");
    } catch {
      // Logger already prints the server body / network code; user-facing
      // message stays generic.
      setVerifyError("인증번호 전송에 실패했어요. 잠시 후 다시 시도해주세요");
    } finally {
      setSending(false);
    }
  };

  const handleCodeChange = async (next: string) => {
    // number-pad only allows digits but be defensive in case keyboard variants
    // emit other chars.
    const digits = next.replace(/\D/g, "").slice(0, 6);
    setVerifyCode(digits);
    setVerifyError("");
    if (digits.length < 6 || verifying) return;

    setVerifying(true);
    try {
      await verifyEmailCode(email.trim(), digits);
      Keyboard.dismiss();
      // Push to step-2 route with the verified email. The toast fires shortly
      // after to land on top of the new screen — ToastProvider sits at the
      // app root (inside <Portal>), so it survives the navigation cleanly.
      router.push({
        pathname: "/signup-profile",
        params: { email: email.trim() },
      });
      setTimeout(() => showToast("이메일 인증이 완료되었어요"), 400);
    } catch {
      setVerifyError("인증번호가 일치하지 않아요");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        style={[styles.screen, { paddingTop: insets.top }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.backBtn,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Ionicons name="arrow-back" size={24} color={Colors.onSurface} />
            </Pressable>
          </View>

          {/* Hero */}
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>회원가입</Text>
            <Text style={styles.heroSubtitle}>이메일을 인증해주세요</Text>
          </View>

          {/* Form */}
          <View style={styles.formCard}>
            {/* Email */}
            <View style={styles.inputWrap}>
              <Text style={styles.inputLabel}>이메일</Text>
              <View
                style={[
                  styles.inputRow,
                  email.length > 0 && !isEmailValid && styles.inputRowError,
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={Colors.outline}
                  style={{ marginRight: Spacing.sm }}
                />
                <TextInput
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    // Editing the email after sending invalidates the code.
                    if (codeSent) {
                      setCodeSent(false);
                      setVerifyCode("");
                      setVerifyError("");
                    }
                  }}
                  placeholder="example@email.com"
                  placeholderTextColor={Colors.outline}
                  style={styles.input}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                />
                {email.length > 0 && isEmailValid && (
                  <Ionicons
                    name="checkmark-circle"
                    size={18}
                    color={Colors.primary}
                  />
                )}
              </View>
              {email.length > 0 && !isEmailValid && (
                <Text style={styles.fieldError}>
                  올바른 이메일 형식을 입력하세요
                </Text>
              )}
            </View>

            {/* Send code button — visible until first send, then replaced
                by the code input + resend link below. */}
            {!codeSent && (
              <Pressable
                onPress={handleSendCode}
                disabled={!isEmailValid || sending}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  (!isEmailValid || sending) && styles.primaryBtnDisabled,
                  isEmailValid &&
                    !sending &&
                    pressed && {
                      opacity: 0.85,
                      transform: [{ scale: 0.98 }],
                    },
                ]}
              >
                {sending ? (
                  <ActivityIndicator color={Colors.onPrimary} />
                ) : (
                  <Text
                    style={[
                      styles.primaryBtnText,
                      !isEmailValid && styles.primaryBtnTextDisabled,
                    ]}
                  >
                    인증번호 전송
                  </Text>
                )}
              </Pressable>
            )}

            {codeSent && (
              <View style={styles.inputWrap}>
                <Text style={styles.inputLabel}>인증번호</Text>
                <View
                  style={[
                    styles.inputRow,
                    verifyError !== "" && styles.inputRowError,
                  ]}
                >
                  <Ionicons
                    name="keypad-outline"
                    size={18}
                    color={Colors.outline}
                    style={{ marginRight: Spacing.sm }}
                  />
                  <TextInput
                    value={verifyCode}
                    onChangeText={handleCodeChange}
                    placeholder="6자리 숫자"
                    placeholderTextColor={Colors.outline}
                    style={styles.input}
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>
                {verifyError !== "" && (
                  <Text style={styles.fieldError}>{verifyError}</Text>
                )}

                <Pressable
                  onPress={handleSendCode}
                  disabled={sending}
                  style={({ pressed }) => [
                    styles.resendBtn,
                    pressed && !sending && { opacity: 0.6 },
                  ]}
                >
                  <Text
                    style={[styles.resendText, sending && { opacity: 0.5 }]}
                  >
                    {sending ? "전송 중..." : "인증번호 재전송"}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>이미 계정이 있으신가요?</Text>
            <Pressable onPress={() => router.back()}>
              <Text style={styles.footerLink}>로그인</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 40,
  },

  // Header
  headerRow: {
    height: 56,
    justifyContent: "center",
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },

  // Hero
  hero: {
    marginBottom: Spacing.xxl,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: FontWeight.extraBold,
    color: Colors.onSurface,
    letterSpacing: LetterSpacing.tight,
    marginBottom: Spacing.xs,
  },
  heroSubtitle: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
  },

  // Form card
  formCard: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xxl,
    padding: Spacing.xl,
    gap: Spacing.lg,
    ...Shadows.ambient,
  },
  inputWrap: {
    gap: Spacing.sm,
  },
  inputLabel: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.bold,
    color: Colors.onSurfaceVariant,
    textTransform: "uppercase",
    letterSpacing: LetterSpacing.wide,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  inputRowError: {
    backgroundColor: "rgba(186, 26, 26, 0.05)",
  },
  input: {
    flex: 1,
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
    padding: 0,
    margin: 0,
  },
  fieldError: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.medium,
    color: Colors.error,
    marginTop: -2,
  },

  // Primary button
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.xl,
    paddingVertical: Spacing.base + 2,
    alignItems: "center",
    ...Shadows.fab,
  },
  primaryBtnDisabled: {
    backgroundColor: Colors.surfaceContainerHighest,
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryBtnText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onPrimary,
  },
  primaryBtnTextDisabled: {
    color: Colors.outline,
  },

  // Resend link
  resendBtn: {
    alignSelf: "center",
    paddingVertical: Spacing.xs,
    marginTop: Spacing.sm,
  },
  resendText: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.semiBold,
    color: Colors.primary,
  },

  // Footer
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xxl,
  },
  footerText: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
  },
  footerLink: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
});
