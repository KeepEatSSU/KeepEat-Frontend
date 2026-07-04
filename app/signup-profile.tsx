import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/context/AuthContext";
import { ConfirmModal } from "@/components/ConfirmModal";
import { getErrorMessage } from "@/services/api";
import {
  Colors,
  FontSize,
  FontWeight,
  LetterSpacing,
  Radius,
  Shadows,
  Spacing,
} from "@/constants/theme";

// ─── Validation ───────────────────────────────────────────────────────────────

const PW_LENGTH_REGEX = /^.{8,15}$/;
const PW_COMPLEXITY_REGEX =
  /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).+$/;

// ─── Screen ───────────────────────────────────────────────────────────────────
// Step 2 of signup: nickname + password, with the verified email coming in as
// a route param. Lives in its own route specifically to mirror the proven
// shape of login.tsx / change-password.tsx — a single, non-branching form.
// Wrapping the password TextInput in a ternary + Fragment (as in the prior
// step-state version of signup.tsx) reliably broke iOS native input session
// binding; the per-route split is what fixes it.

export default function SignupProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showTopToast } = useToast();
  const { signUp } = useAuth();

  const params = useLocalSearchParams<{ email?: string }>();
  const email = typeof params.email === "string" ? params.email : "";

  // login.tsx pattern: one ref for next-field focus chaining. Same prop
  // surface (returnKeyType + onSubmitEditing). DO NOT replicate the broken
  // signup.tsx step-2 setup (blurOnSubmit={false}, step branching, etc).
  const passwordRef = useRef<TextInput>(null);
  const passwordConfirmRef = useRef<TextInput>(null);

  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  // 가입 그만두기 확인 팝업 — 헤더 ← 와 안드 하드웨어 뒤로가기 양쪽에서
  // 띄움. 확인 시 router.replace("/login")으로 스택 깔끔 정리.
  const [leaveModalVisible, setLeaveModalVisible] = useState(false);

  const isPwLengthOk = PW_LENGTH_REGEX.test(password);
  const isPwComplexOk = PW_COMPLEXITY_REGEX.test(password);
  const isPwMatch =
    passwordConfirm.length > 0 && password === passwordConfirm;
  const showPwMismatch =
    passwordConfirm.length > 0 && password !== passwordConfirm;
  const isNicknameValid = nickname.trim().length > 0;
  const canSubmit =
    isNicknameValid && isPwLengthOk && isPwComplexOk && isPwMatch && !submitting;

  // 안드 하드웨어 뒤로가기 가로채기 — 헤더 ←와 동일하게 leave 모달로 라우팅.
  // 모달이 열려있을 땐 가로채지 않아 모달 자체의 onRequestClose 기본 동작
  // (모달 닫기)이 우선되도록 한다.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (leaveModalVisible) return false;
      setLeaveModalVisible(true);
      return true;
    });
    return () => sub.remove();
  }, [leaveModalVisible]);

  const handleLeaveConfirm = () => {
    setLeaveModalVisible(false);
    router.replace("/login");
  };

  const handleSignup = async () => {
    if (!canSubmit) return;
    Keyboard.dismiss();
    setSubmitError("");
    setSubmitting(true);
    try {
      await signUp(email, password, nickname.trim());
      showTopToast({
        message: "회원가입이 완료되었습니다!",
        variant: "success",
      });
      router.replace("/(tabs)");
    } catch (e) {
      // Prefer the backend's localized message ("이미 사용 중인 이메일입니다"
      // etc.). Only the `message` field is forwarded — never the full body.
      setSubmitError(
        getErrorMessage(
          e,
          "가입 중 문제가 발생했어요. 잠시 후 다시 시도해주세요",
        ),
      );
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
          {/* Header */}
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => setLeaveModalVisible(true)}
              accessibilityLabel="가입 그만두기"
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
              KeepEat과 함께 시작하세요
            </Text>
          </View>

          {/* Form */}
          <View style={styles.formCard}>
            {/* Email (readonly — handed in from step 1 as a route param) */}
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
                  onSubmitEditing={() => passwordRef.current?.focus()}
                />
              </View>
            </View>

            {/* Password — login.tsx prop set verbatim. No extra props. */}
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
                  returnKeyType="next"
                  onSubmitEditing={() => passwordConfirmRef.current?.focus()}
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
                    name={isPwLengthOk ? "checkmark-circle" : "ellipse-outline"}
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
                      isPwComplexOk ? "checkmark-circle" : "ellipse-outline"
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

            {/* Password confirm */}
            <View style={styles.inputWrap}>
              <Text style={styles.inputLabel}>비밀번호 확인</Text>
              <View style={styles.inputRow}>
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={Colors.outline}
                  style={{ marginRight: Spacing.sm }}
                />
                <TextInput
                  ref={passwordConfirmRef}
                  value={passwordConfirm}
                  onChangeText={setPasswordConfirm}
                  placeholder="비밀번호 다시 입력"
                  placeholderTextColor={Colors.outline}
                  style={styles.input}
                  secureTextEntry={!showPasswordConfirm}
                  returnKeyType="done"
                  onSubmitEditing={handleSignup}
                />
                <Pressable
                  onPress={() => setShowPasswordConfirm((v) => !v)}
                >
                  <Ionicons
                    name={
                      showPasswordConfirm ? "eye-off-outline" : "eye-outline"
                    }
                    size={18}
                    color={Colors.outline}
                  />
                </Pressable>
              </View>
              {showPwMismatch && (
                <Text style={styles.fieldError}>
                  비밀번호가 일치하지 않아요
                </Text>
              )}
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
          </View>
        </ScrollView>
        <ConfirmModal
          visible={leaveModalVisible}
          title="가입을 그만두시겠어요?"
          subtitle={"입력하신 정보가 모두 사라져요"}
          confirmLabel="그만두기"
          cancelLabel="계속하기"
          destructive
          onConfirm={handleLeaveConfirm}
          onCancel={() => setLeaveModalVisible(false)}
        />
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

// ─── Styles (login.tsx / change-password.tsx pattern) ────────────────────────

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
  // login.tsx pattern: paddingVertical (NOT height fix).
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
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

  // Inline field error (비밀번호 불일치 등) — submitErrorRow와 톤 분리
  // (필드 단위 안내라 아이콘 없이 텍스트만, signup.tsx의 fieldError와 동일).
  fieldError: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.medium,
    color: Colors.error,
    marginTop: Spacing.xs,
  },

  // Submit error
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
});
