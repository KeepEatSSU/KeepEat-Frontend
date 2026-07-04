import { AppHeaderLogo } from "@/components/AppHeaderLogo";
import { FindPasswordModal } from "@/components/FindPasswordModal";
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
import { findPassword, getErrorMessage } from "@/services/api";
import { startGoogleLogin } from "@/services/googleAuth";
import { useToast } from "@/components/Toast";
import { Ionicons } from "@expo/vector-icons";
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

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const passwordRef = useRef<TextInput>(null);
  const { login, loginWithTokens } = useAuth();
  const { showTopToast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [findPwModalVisible, setFindPwModalVisible] = useState(false);
  const [findPwSubmitting, setFindPwSubmitting] = useState(false);

  const handleFindPassword = async (inputEmail: string) => {
    if (findPwSubmitting) return;
    setFindPwSubmitting(true);
    try {
      // Server returns a plain-string instruction message — surface it
      // verbatim so the user sees exactly what the backend tells them
      // (e.g. "임시 비밀번호가 이메일로 발송되었습니다").
      const message = await findPassword(inputEmail);
      setFindPwModalVisible(false);
      showTopToast({
        message: message || "임시 비밀번호가 이메일로 발송되었어요",
        variant: "success",
      });
    } catch (err) {
      // Keep the modal open so the user can fix the email and retry.
      // getErrorMessage extracts only `message` from the response body —
      // never the raw payload.
      showTopToast({
        message: getErrorMessage(err, "요청에 실패했어요"),
        variant: "error",
      });
    } finally {
      setFindPwSubmitting(false);
    }
  };

  const handleLogin = async () => {
    Keyboard.dismiss();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e) {
      // Surface the server's `message` field when present (e.g.
      // "이메일 또는 비밀번호가 일치하지 않습니다." for a 401, or the
      // backend's own copy for other failures); fall back to a generic
      // line when there's no body to read.
      setError(getErrorMessage(e, "로그인에 실패했어요"));
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = email.length > 0 && password.length > 0 && !submitting;

  const handleGoogleLogin = async () => {
    if (googleSubmitting) return;
    setGoogleSubmitting(true);
    setError("");
    try {
      const tokens = await startGoogleLogin();
      if (!tokens) {
        // Cancel / dismiss / missing tokens — silent. Avoid leaking why.
        return;
      }
      await loginWithTokens(tokens.accessToken, tokens.refreshToken);
      router.replace("/(tabs)");
    } catch (e) {
      showTopToast({
        message: getErrorMessage(
          e,
          "구글 로그인에 실패했어요. 잠시 후 다시 시도해주세요",
        ),
        variant: "error",
      });
    } finally {
      setGoogleSubmitting(false);
    }
  };

  return (
    <>
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        style={[styles.screen, { paddingTop: insets.top }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // iOS: 포커스된 TextInput이 키보드에 가리지 않도록 ScrollView가
          // contentInset을 자동 조정 (RN 0.73+, Android 무시).
          automaticallyAdjustKeyboardInsets
          // 스크롤 시작하면 키보드 dismiss — 입력 후 자연스럽게 닫힘.
          keyboardDismissMode="on-drag"
        >
          {/* Hero */}
          <View style={styles.hero}>
            <View style={styles.logoWrap}>
              <AppHeaderLogo widthRatio={0.4} />
            </View>
            <Text style={styles.heroTitle}>
              오늘도 냉장고를{"\n"}가볍게 비워볼까요?
            </Text>
          </View>

          {/* Form */}
          <View style={styles.formCard}>
            {/* Email */}
            <View style={styles.inputWrap}>
              <Text style={styles.inputLabel}>아이디</Text>
              <View style={styles.inputRow}>
                <Ionicons
                  name="person-outline"
                  size={18}
                  color={Colors.outline}
                  style={{ marginRight: Spacing.sm }}
                />
                <TextInput
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    setError("");
                  }}
                  placeholder="아이디 또는 이메일"
                  placeholderTextColor={Colors.outline}
                  style={styles.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
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
                  onChangeText={(v) => {
                    setPassword(v);
                    setError("");
                  }}
                  placeholder="비밀번호"
                  placeholderTextColor={Colors.outline}
                  style={styles.input}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <Pressable onPress={() => setShowPassword((v) => !v)}>
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={18}
                    color={Colors.outline}
                  />
                </Pressable>
              </View>
            </View>

            {/* Error */}
            {error !== "" && (
              <View style={styles.errorRow}>
                <Ionicons
                  name="alert-circle"
                  size={14}
                  color={Colors.error}
                />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Login button */}
            <Pressable
              onPress={handleLogin}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.primaryBtn,
                !canSubmit && styles.primaryBtnDisabled,
                canSubmit &&
                  pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
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
                  로그인
                </Text>
              )}
            </Pressable>
          </View>

          {/* Sub actions */}
          <View style={styles.subActions}>
            <Pressable
              onPress={() => setFindPwModalVisible(true)}
              style={{ padding: Spacing.xs }}
            >
              <Text style={styles.linkText}>비밀번호 찾기</Text>
            </Pressable>
            <Text style={styles.linkDivider}>|</Text>
            <Pressable
              onPress={() => router.push("/signup" as never)}
              style={{ padding: Spacing.xs }}
            >
              <Text style={styles.linkText}>이메일로 회원가입</Text>
            </Pressable>
          </View>

          {/* Social divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>또는</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social — Google */}
          <View style={styles.socialArea}>
            <Pressable
              onPress={handleGoogleLogin}
              disabled={googleSubmitting}
              style={({ pressed }) => [
                styles.googleBtn,
                googleSubmitting && styles.googleBtnDisabled,
                !googleSubmitting &&
                  pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
              ]}
            >
              {googleSubmitting ? (
                <ActivityIndicator color={Colors.onSurface} />
              ) : (
                <>
                  <Ionicons
                    name="logo-google"
                    size={18}
                    color={Colors.onSurface}
                    style={{ marginRight: Spacing.sm }}
                  />
                  <Text style={styles.googleBtnText}>Google로 계속하기</Text>
                </>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>

    <FindPasswordModal
      visible={findPwModalVisible}
      submitting={findPwSubmitting}
      onSubmit={handleFindPassword}
      onCancel={() => setFindPwModalVisible(false)}
    />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  // KAV가 키보드 시 자기 영역을 줄일 때 ScrollView가 그 줄어든 공간을
  // flex:1로 정확히 채우도록 명시 — 콘텐츠 스크롤이 보장됨.
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 40,
  },

  // Hero
  hero: {
    alignItems: "center",
    marginTop: 48,
    marginBottom: Spacing.xl,
  },
  logoWrap: {
    marginBottom: Spacing.base,
  },
  heroTitle: {
    fontSize: 23,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
    textAlign: "center",
    lineHeight: 32,
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
  input: {
    flex: 1,
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
    padding: 0,
    margin: 0,
  },

  // Error
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  errorText: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.medium,
    color: Colors.error,
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

  // Sub actions
  subActions: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  linkText: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
  },
  linkDivider: {
    fontSize: FontSize.bodySm,
    color: Colors.outlineVariant,
  },

  // Divider
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: Spacing.xxl,
    gap: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  dividerText: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
  },

  // Social
  socialArea: {
    alignItems: "stretch",
    paddingVertical: Spacing.sm,
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    paddingVertical: Spacing.base,
    ...Shadows.ambient,
  },
  googleBtnDisabled: {
    opacity: 0.6,
  },
  googleBtnText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.semiBold,
    color: Colors.onSurface,
  },
});
