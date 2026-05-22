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
import { useAuth } from "@/context/AuthContext";
import { sendEmailCode, verifyEmailCode } from "@/services/api";
import { Ionicons } from "@expo/vector-icons";
import { isAxiosError } from "axios";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
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
const PW_LENGTH_REGEX = /^.{8,15}$/;
const PW_COMPLEXITY_REGEX =
  /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).+$/;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function SignupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { signUp } = useAuth();

  const passwordRef = useRef<TextInput>(null);

  const [step, setStep] = useState<1 | 2>(1);

  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Step-1 email verification state. Real send/verify endpoints are wired
  // below; backend currently 401s on send while the public-route permission
  // is being rolled out. A __DEV__-only "123456" fallback inside the verify
  // handler keeps the UI flow testable until that lands — remove the fallback
  // once 200 responses come back.
  const [codeSent, setCodeSent] = useState(false);
  const [verifyCode, setVerifyCode] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Auto-focus removed: programmatic .focus() on iOS can leave the input in
  // a "focused but no keyboard" state, which then traps subsequent taps on
  // other inputs. Users tap each field themselves — slightly less convenient
  // but reliably works on both platforms.

  // Validation
  const isEmailValid = EMAIL_REGEX.test(email);
  const isPwLengthOk = PW_LENGTH_REGEX.test(password);
  const isPwComplexOk = PW_COMPLEXITY_REGEX.test(password);
  const isNicknameValid = nickname.trim().length > 0;
  const canSubmit =
    isNicknameValid && isPwLengthOk && isPwComplexOk && !submitting;

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
      // Logger already prints the server body / network code; the user-facing
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

    // 백엔드 401 해결 전 임시 폴백: __DEV__ + "123456"이면 verify API 건너뛰고
    // step 2 진입. 백엔드 권한 풀리면 이 블록 제거.
    if (__DEV__ && digits === "123456") {
      Keyboard.dismiss();
      setStep(2);
      return;
    }

    setVerifying(true);
    try {
      await verifyEmailCode(email.trim(), digits);
      Keyboard.dismiss();
      setStep(2);
    } catch {
      setVerifyError("인증번호가 일치하지 않아요");
    } finally {
      setVerifying(false);
    }
  };

  const handleSignup = async () => {
    if (!canSubmit) return;
    Keyboard.dismiss();
    setSubmitError("");
    setSubmitting(true);
    try {
      await signUp(email.trim(), password, nickname.trim());
      showToast("회원가입이 완료되었습니다!");
      router.replace("/(tabs)");
    } catch (e) {
      if (isAxiosError(e) && e.response?.status === 409) {
        setSubmitError("이미 가입된 이메일이에요");
      } else if (isAxiosError(e) && e.response?.status === 400) {
        setSubmitError("입력하신 정보를 다시 확인해 주세요");
      } else {
        setSubmitError("가입 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요");
      }
    } finally {
      setSubmitting(false);
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
            <Text style={styles.heroSubtitle}>
              {step === 1
                ? "이메일을 인증해주세요"
                : "KeepEat과 함께 시작하세요"}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.formCard}>
            {step === 1 ? (
              <>
                {/* Email */}
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>이메일</Text>
                  <View
                    style={[
                      styles.inputRow,
                      email.length > 0 &&
                        !isEmailValid &&
                        styles.inputRowError,
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
                        style={[
                          styles.resendText,
                          sending && { opacity: 0.5 },
                        ]}
                      >
                        {sending ? "전송 중..." : "인증번호 재전송"}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </>
            ) : (
              <>
                {/* Email (readonly — fixed after verification) */}
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>이메일</Text>
                  <View style={[styles.inputRow, styles.inputRowReadonly]}>
                    <Ionicons
                      name="mail-outline"
                      size={18}
                      color={Colors.outline}
                      style={{ marginRight: Spacing.sm }}
                    />
                    <Text style={styles.readonlyText} numberOfLines={1}>
                      {email}
                    </Text>
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={Colors.primary}
                    />
                  </View>
                </View>

                {/* Nickname */}
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>닉네임</Text>
                  <View style={styles.inputRow}>
                    <Ionicons
                      name="happy-outline"
                      size={18}
                      color={Colors.outline}
                      style={{ marginRight: Spacing.sm }}
                    />
                    <TextInput
                      value={nickname}
                      onChangeText={setNickname}
                      placeholder="어떻게 불러드릴까요?"
                      placeholderTextColor={Colors.outline}
                      style={styles.input}
                      returnKeyType="next"
                      // onSubmitEditing={() => passwordRef.current?.focus()}
                      blurOnSubmit={false}
                    />
                  </View>
                </View>

                {/* Password */}
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>비밀번호</Text>
                  <View style={styles.inputRow}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={18}
                      color={Colors.outline}
                      style={{ marginRight: Spacing.sm }}
                    />
                    <TextInput
                      ref={passwordRef}
                      value={password}
                      onChangeText={setPassword}
                      placeholder="비밀번호"
                      placeholderTextColor={Colors.outline}
                      style={styles.input}
                      secureTextEntry={!showPassword}
                      returnKeyType="done"
                      onSubmitEditing={handleSignup}
                    />
                    <Pressable onPress={() => setShowPassword((v) => !v)}>
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={18}
                        color={Colors.outline}
                      />
                    </Pressable>
                  </View>

                  {/* Password checklist */}
                  <View style={styles.checkList}>
                    <View style={styles.checkItem}>
                      <Ionicons
                        name={
                          isPwLengthOk ? "checkmark-circle" : "ellipse-outline"
                        }
                        size={16}
                        color={isPwLengthOk ? Colors.primary : Colors.outline}
                      />
                      <Text
                        style={[
                          styles.checkText,
                          isPwLengthOk && styles.checkTextPass,
                        ]}
                      >
                        8자리 이상 16자리 미만
                      </Text>
                    </View>
                    <View style={styles.checkItem}>
                      <Ionicons
                        name={
                          isPwComplexOk
                            ? "checkmark-circle"
                            : "ellipse-outline"
                        }
                        size={16}
                        color={isPwComplexOk ? Colors.primary : Colors.outline}
                      />
                      <Text
                        style={[
                          styles.checkText,
                          isPwComplexOk && styles.checkTextPass,
                        ]}
                      >
                        영문, 숫자, 특수기호 포함
                      </Text>
                    </View>
                  </View>
                </View>

                {submitError !== "" && (
                  <View style={styles.submitErrorRow}>
                    <Ionicons
                      name="alert-circle"
                      size={14}
                      color={Colors.error}
                    />
                    <Text style={styles.submitErrorText}>{submitError}</Text>
                  </View>
                )}

                {/* Signup button */}
                <Pressable
                  onPress={handleSignup}
                  disabled={!canSubmit}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    !canSubmit && styles.primaryBtnDisabled,
                    canSubmit &&
                      pressed && {
                        opacity: 0.85,
                        transform: [{ scale: 0.98 }],
                      },
                  ]}
                >
                  {submitting ? (
                    <ActivityIndicator color={Colors.onPrimary} />
                  ) : (
                    <Text
                      style={[
                        styles.primaryBtnText,
                        !canSubmit && styles.primaryBtnTextDisabled,
                      ]}
                    >
                      가입하기
                    </Text>
                  )}
                </Pressable>
              </>
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
  inputRowReadonly: {
    backgroundColor: Colors.surfaceContainerHigh,
  },
  input: {
    flex: 1,
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
    padding: 0,
    margin: 0,
  },
  readonlyText: {
    flex: 1,
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
  },
  fieldError: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.medium,
    color: Colors.error,
    marginTop: -2,
  },
  submitErrorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  submitErrorText: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.medium,
    color: Colors.error,
  },

  // Checklist
  checkList: {
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  checkItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  checkText: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
  },
  checkTextPass: {
    color: Colors.primary,
    fontWeight: FontWeight.semiBold,
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

  // Resend link (step 1)
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
