/**
 * 비밀번호 찾기 — 이메일 → 인증번호 → 새 비밀번호, 3단계를 한 화면의
 * step state로 진행한다.
 *
 * 정책:
 *   - resetToken/expiresInSeconds는 이 컴포넌트의 메모리(state)에만 둔다.
 *     route param, SecureStore, AsyncStorage에 싣지 않는다 — 화면을 이탈하면
 *     사라지는 것이 의도된 동작이다(10분짜리 일회용 토큰).
 *   - 1단계 성공 응답은 계정 존재/소셜 여부를 알려주지 않는다(서버의 계정
 *     열거 방지 설계). 응답으로 분기하지 않고 서버 문자열을 그대로 보여준다.
 *   - 2단계 실패(400)는 코드 불일치/만료/시도 초과가 message로만 구분된다.
 *     message를 그대로 노출할 뿐, 한국어 문자열로 분기하지 않는다.
 *   - 429(RATE_LIMIT_EXCEEDED)는 서버 message + Retry-After 헤더(초)만큼
 *     해당 제출 버튼을 잠근다. 헤더가 없으면 카운트다운 없이 message만 —
 *     프론트가 임의 대기 시간을 하드코딩하지 않는다.
 *   - 이 플로우는 비로그인 상태다. 성공(204) 후 지울 로컬 세션이 없으므로
 *     clearLocalSession/endLocalSession을 호출하지 않고 /login으로 보낸다.
 */

import { useEffect, useRef, useState } from "react";
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
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useToast } from "@/components/Toast";
import {
  findPassword,
  getErrorCode,
  getErrorMessage,
  getErrorStatus,
  getRetryAfterSeconds,
  resetPassword,
  verifyPasswordResetCode,
} from "@/services/api";
import {
  PW_ALLOWED_CHARSET_REGEX,
  PW_ALLOWED_SPECIALS,
  PW_HAS_DIGIT_REGEX,
  PW_HAS_LETTER_REGEX,
  PW_HAS_SPECIAL_REGEX,
  PW_LENGTH_REGEX,
} from "@/utils/passwordPolicy";
import { createSubmitGuard } from "@/utils/submitGuard";
import {
  Colors,
  FontSize,
  FontWeight,
  LetterSpacing,
  Radius,
  Shadows,
  Spacing,
} from "@/constants/theme";

// signup.tsx와 동일한 기준 — 형식이 아예 아닌 입력의 왕복만 막는 가벼운 검사.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_REGEX = /^\d{6}$/;

type Step = "email" | "code" | "password";

// 429 쿨다운 대상 — 인증번호 발송(step1 제출 + step2 재전송이 같은 API를
// 쓰므로 한 키를 공유), 코드 검증, 비밀번호 확정.
type CooldownKey = "send" | "verify" | "reset";

export default function FindPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showTopToast } = useToast();

  // change-password의 submittingRef와 같은 목적 — 같은 tick의 두 번째 탭이
  // 리렌더 전에 들어와도 네트워크 요청이 두 번 나가지 않게 동기 차단한다.
  // 단계별로 하나의 가드를 공유해도 되는 이유: 한 시점에 제출 가능한 요청은
  // 하나뿐이다(재전송 포함 — 발송 중 재전송도 막는 게 맞다).
  const guardRef = useRef(createSubmitGuard());
  const codeInputRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const [step, setStep] = useState<Step>("email");

  // step1
  const [email, setEmail] = useState("");
  // step2
  const [code, setCode] = useState("");
  // step3 — resetToken은 메모리에만. 저장/로그 금지.
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [expiresInSeconds, setExpiresInSeconds] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [stepError, setStepError] = useState("");
  const [cooldowns, setCooldowns] = useState<Record<CooldownKey, number>>({
    send: 0,
    verify: 0,
    reset: 0,
  });

  const cooldownActive =
    cooldowns.send > 0 || cooldowns.verify > 0 || cooldowns.reset > 0;

  useEffect(() => {
    if (!cooldownActive) return;
    const id = setInterval(() => {
      setCooldowns((c) => ({
        send: Math.max(0, c.send - 1),
        verify: Math.max(0, c.verify - 1),
        reset: Math.max(0, c.reset - 1),
      }));
    }, 1000);
    return () => clearInterval(id);
  }, [cooldownActive]);

  /**
   * 429 공통 처리. RATE_LIMIT_EXCEEDED면 서버 message를 스텝 에러로 보여주고
   * Retry-After 헤더가 있을 때만 해당 버튼을 그 초만큼 잠근다. 처리했으면
   * true — 호출부는 나머지 에러 분기를 건너뛴다.
   */
  const handleRateLimit = (error: unknown, key: CooldownKey): boolean => {
    if (
      getErrorStatus(error) !== 429 ||
      getErrorCode(error) !== "RATE_LIMIT_EXCEEDED"
    ) {
      return false;
    }
    setStepError(
      getErrorMessage(error, "요청이 너무 잦아요. 잠시 후 다시 시도해주세요"),
    );
    const seconds = getRetryAfterSeconds(error);
    if (seconds !== null) {
      setCooldowns((c) => ({ ...c, [key]: seconds }));
    }
    return true;
  };

  // ── step1: 인증번호 발송 (step2의 재전송도 이 함수를 쓴다) ────────────────
  const isEmailValid = EMAIL_REGEX.test(email.trim());

  const submitEmail = (isResend: boolean) =>
    guardRef.current(async () => {
      Keyboard.dismiss();
      setSubmitting(true);
      setStepError("");
      try {
        // 성공 200의 plain string을 그대로 토스트 — 서버는 미가입/소셜
        // 계정에도 같은 문구를 준다. 여기서 계정 존재를 추측하지 않는다.
        const message = await findPassword(email.trim());
        showTopToast({
          message: message || "인증번호가 이메일로 발송되었어요",
          variant: "success",
        });
        if (!isResend) {
          setCode("");
          setStep("code");
        }
      } catch (e) {
        if (handleRateLimit(e, "send")) return;
        setStepError(
          getErrorMessage(
            e,
            getErrorStatus(e) === null
              ? "네트워크 연결을 확인하고 다시 시도해주세요"
              : "인증번호 발송에 실패했어요. 잠시 후 다시 시도해주세요",
          ),
        );
      } finally {
        setSubmitting(false);
      }
    });

  // ── step2: 인증번호 검증 ──────────────────────────────────────────────────
  const isCodeValid = CODE_REGEX.test(code);

  const submitCode = () =>
    guardRef.current(async () => {
      Keyboard.dismiss();
      setSubmitting(true);
      setStepError("");
      try {
        const result = await verifyPasswordResetCode(email.trim(), code);
        setResetToken(result.resetToken);
        setExpiresInSeconds(result.expiresInSeconds);
        setNewPassword("");
        setConfirmPassword("");
        setStep("password");
      } catch (e) {
        if (handleRateLimit(e, "verify")) return;
        // 400 BAD_REQUEST — 불일치/만료/시도 초과는 서버 message로만 구분된다.
        // 그대로 보여주고 이 단계에 머문다. 문자열 분기 금지.
        setStepError(
          getErrorMessage(
            e,
            getErrorStatus(e) === null
              ? "네트워크 연결을 확인하고 다시 시도해주세요"
              : "인증에 실패했어요. 인증번호를 확인해주세요",
          ),
        );
      } finally {
        setSubmitting(false);
      }
    });

  // ── step3: 새 비밀번호 확정 ───────────────────────────────────────────────
  // change-password와 같은 체크리스트 구성. trim하지 않는다 — 공백은
  // 화이트리스트 위반으로 사용자에게 지적해야 하는 입력이다.
  const isPwLengthOk = PW_LENGTH_REGEX.test(newPassword);
  const isPwComplexOk =
    PW_HAS_LETTER_REGEX.test(newPassword) &&
    PW_HAS_DIGIT_REGEX.test(newPassword) &&
    PW_HAS_SPECIAL_REGEX.test(newPassword);
  const isPwCharsetOk = PW_ALLOWED_CHARSET_REGEX.test(newPassword);
  const isMatched =
    confirmPassword.length > 0 && newPassword === confirmPassword;
  const showMismatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword;

  const discardTokenAndRestart = () => {
    setResetToken(null);
    setExpiresInSeconds(null);
    setNewPassword("");
    setConfirmPassword("");
    setCode("");
    setStep("email");
  };

  const submitNewPassword = () =>
    guardRef.current(async () => {
      Keyboard.dismiss();
      if (resetToken === null) return;
      setSubmitting(true);
      setStepError("");
      try {
        await resetPassword(resetToken, newPassword);
        // 204 — 비로그인 플로우라 지울 로컬 세션이 없다. 로그인 화면으로.
        showTopToast({
          message: "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요",
          variant: "success",
        });
        router.replace("/login");
      } catch (e) {
        if (handleRateLimit(e, "reset")) return;
        const status = getErrorStatus(e);
        // 401 INVALID_TOKEN — resetToken 만료/사용완료. 토큰을 폐기하고
        // 1단계부터 다시. (이 경로는 refresh 제외 prefix라 원본 에러가 온다.)
        if (status === 401 && getErrorCode(e) === "INVALID_TOKEN") {
          showTopToast({
            message: getErrorMessage(
              e,
              "인증이 만료되었어요. 처음부터 다시 진행해주세요",
            ),
            variant: "error",
          });
          discardTokenAndRestart();
          return;
        }
        // 400 INVALID_INPUT(형식), 500, 네트워크.
        setStepError(
          getErrorMessage(
            e,
            status === null
              ? "네트워크 연결을 확인하고 다시 시도해주세요"
              : "비밀번호 변경에 실패했어요. 잠시 후 다시 시도해주세요",
          ),
        );
      } finally {
        setSubmitting(false);
      }
    });

  // ── back: 단계 내 후퇴. 화면을 벗어나면 토큰은 그대로 소멸한다. ──────────
  const handleBack = () => {
    setStepError("");
    if (step === "email") {
      router.back();
      return;
    }
    if (step === "code") {
      setCode("");
      setStep("email");
      return;
    }
    discardTokenAndRestart();
  };

  const canSubmitEmail = isEmailValid && !submitting && cooldowns.send <= 0;
  const canResend = !submitting && cooldowns.send <= 0;
  const canSubmitCode = isCodeValid && !submitting && cooldowns.verify <= 0;
  const canSubmitPassword =
    isPwLengthOk &&
    isPwComplexOk &&
    isPwCharsetOk &&
    isMatched &&
    !submitting &&
    cooldowns.reset <= 0;

  const expiresInMinutes =
    expiresInSeconds !== null ? Math.ceil(expiresInSeconds / 60) : null;

  const cooldownLabel = (base: string, seconds: number) =>
    seconds > 0 ? `${base} (${seconds}초 후 가능)` : base;

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
              onPress={handleBack}
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
            <Text style={styles.heroTitle}>비밀번호 찾기</Text>
            <Text style={styles.heroSubtitle}>
              {step === "email" &&
                "가입한 이메일로 인증번호를 보내드려요"}
              {step === "code" &&
                `${email.trim()} 으로 발송된\n6자리 인증번호를 입력해주세요`}
              {step === "password" &&
                (expiresInMinutes !== null
                  ? `${expiresInMinutes}분 안에 새 비밀번호를 설정해주세요`
                  : "새 비밀번호를 설정해주세요")}
            </Text>
          </View>

          <View style={styles.formCard}>
            {/* ── step1: email ── */}
            {step === "email" && (
              <>
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>이메일</Text>
                  <View style={styles.inputRow}>
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
                        setStepError("");
                      }}
                      placeholder="가입한 이메일"
                      placeholderTextColor={Colors.outline}
                      style={styles.input}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="done"
                      onSubmitEditing={() => {
                        if (canSubmitEmail) submitEmail(false);
                      }}
                    />
                  </View>
                  {email.length > 0 && !isEmailValid && (
                    <Text style={styles.fieldError}>
                      이메일 형식을 확인해주세요
                    </Text>
                  )}
                </View>

                {stepError !== "" && (
                  <View style={styles.formErrorRow}>
                    <Ionicons
                      name="alert-circle"
                      size={16}
                      color={Colors.error}
                    />
                    <Text style={styles.formErrorText}>{stepError}</Text>
                  </View>
                )}

                <Pressable
                  onPress={() => submitEmail(false)}
                  disabled={!canSubmitEmail}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    !canSubmitEmail && styles.primaryBtnDisabled,
                    canSubmitEmail &&
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
                        !canSubmitEmail && styles.primaryBtnTextDisabled,
                      ]}
                    >
                      {cooldownLabel("인증번호 받기", cooldowns.send)}
                    </Text>
                  )}
                </Pressable>
              </>
            )}

            {/* ── step2: code ── */}
            {step === "code" && (
              <>
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>인증번호</Text>
                  <View style={styles.inputRow}>
                    <Ionicons
                      name="key-outline"
                      size={18}
                      color={Colors.outline}
                      style={{ marginRight: Spacing.sm }}
                    />
                    <TextInput
                      ref={codeInputRef}
                      value={code}
                      onChangeText={(v) => {
                        // 6자리 "숫자"만 — 붙여넣기의 공백/하이픈도 걸러낸다.
                        setCode(v.replace(/\D/g, "").slice(0, 6));
                        setStepError("");
                      }}
                      placeholder="6자리 숫자"
                      placeholderTextColor={Colors.outline}
                      style={styles.input}
                      keyboardType="number-pad"
                      maxLength={6}
                      returnKeyType="done"
                      onSubmitEditing={() => {
                        if (canSubmitCode) submitCode();
                      }}
                    />
                  </View>
                </View>

                {stepError !== "" && (
                  <View style={styles.formErrorRow}>
                    <Ionicons
                      name="alert-circle"
                      size={16}
                      color={Colors.error}
                    />
                    <Text style={styles.formErrorText}>{stepError}</Text>
                  </View>
                )}

                <Pressable
                  onPress={submitCode}
                  disabled={!canSubmitCode}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    !canSubmitCode && styles.primaryBtnDisabled,
                    canSubmitCode &&
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
                        !canSubmitCode && styles.primaryBtnTextDisabled,
                      ]}
                    >
                      {cooldownLabel("확인", cooldowns.verify)}
                    </Text>
                  )}
                </Pressable>

                {/* 재전송 = 1단계 API 재호출. 이메일당 3회/15분 제한이 있어
                    429 쿨다운(send 키 공유)이 이 버튼도 함께 잠근다. */}
                <Pressable
                  onPress={() => submitEmail(true)}
                  disabled={!canResend}
                  style={({ pressed }) => [
                    styles.secondaryBtn,
                    pressed && canResend && { opacity: 0.7 },
                  ]}
                >
                  <Text
                    style={[
                      styles.secondaryBtnText,
                      !canResend && styles.primaryBtnTextDisabled,
                    ]}
                  >
                    {cooldownLabel("인증번호 재전송", cooldowns.send)}
                  </Text>
                </Pressable>
              </>
            )}

            {/* ── step3: new password ── */}
            {step === "password" && (
              <>
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>새 비밀번호</Text>
                  <View style={styles.inputRow}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={18}
                      color={Colors.outline}
                      style={{ marginRight: Spacing.sm }}
                    />
                    <TextInput
                      value={newPassword}
                      onChangeText={(v) => {
                        setNewPassword(v);
                        setStepError("");
                      }}
                      placeholder="새 비밀번호"
                      placeholderTextColor={Colors.outline}
                      style={styles.input}
                      secureTextEntry={!showNew}
                      returnKeyType="next"
                      onSubmitEditing={() => confirmRef.current?.focus()}
                    />
                    <Pressable onPress={() => setShowNew((v) => !v)}>
                      <Ionicons
                        name={showNew ? "eye-off-outline" : "eye-outline"}
                        size={18}
                        color={Colors.outline}
                      />
                    </Pressable>
                  </View>

                  {/* change-password와 같은 체크리스트 구성/문구 */}
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
                        {`영문, 숫자, 특수기호(${PW_ALLOWED_SPECIALS}) 포함`}
                      </Text>
                    </View>
                  </View>

                  {/* 화이트리스트 밖 문자(공백/한글 포함)는 체크리스트로 표현이
                      안 되므로 위반 시에만 정확히 짚어준다. */}
                  {!isPwCharsetOk && (
                    <Text style={styles.fieldError}>
                      {`영문, 숫자와 특수기호 ${PW_ALLOWED_SPECIALS} 만 사용할 수 있어요`}
                    </Text>
                  )}
                </View>

                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>새 비밀번호 확인</Text>
                  <View style={styles.inputRow}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={18}
                      color={Colors.outline}
                      style={{ marginRight: Spacing.sm }}
                    />
                    <TextInput
                      ref={confirmRef}
                      value={confirmPassword}
                      onChangeText={(v) => {
                        setConfirmPassword(v);
                        setStepError("");
                      }}
                      placeholder="새 비밀번호 다시 입력"
                      placeholderTextColor={Colors.outline}
                      style={styles.input}
                      secureTextEntry={!showConfirm}
                      returnKeyType="done"
                      onSubmitEditing={() => {
                        if (canSubmitPassword) submitNewPassword();
                      }}
                    />
                    <Pressable onPress={() => setShowConfirm((v) => !v)}>
                      <Ionicons
                        name={showConfirm ? "eye-off-outline" : "eye-outline"}
                        size={18}
                        color={Colors.outline}
                      />
                    </Pressable>
                  </View>
                  {showMismatch && (
                    <Text style={styles.fieldError}>
                      새 비밀번호가 일치하지 않아요
                    </Text>
                  )}
                </View>

                {stepError !== "" && (
                  <View style={styles.formErrorRow}>
                    <Ionicons
                      name="alert-circle"
                      size={16}
                      color={Colors.error}
                    />
                    <Text style={styles.formErrorText}>{stepError}</Text>
                  </View>
                )}

                <Pressable
                  onPress={submitNewPassword}
                  disabled={!canSubmitPassword}
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    !canSubmitPassword && styles.primaryBtnDisabled,
                    canSubmitPassword &&
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
                        !canSubmitPassword && styles.primaryBtnTextDisabled,
                      ]}
                    >
                      {cooldownLabel("비밀번호 변경", cooldowns.reset)}
                    </Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

// ─── Styles — change-password.tsx와 동일한 login.tsx 계열 패턴 ───────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: 40,
  },

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
    lineHeight: 20,
  },

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
  fieldError: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.medium,
    color: Colors.error,
    marginTop: -2,
  },
  formErrorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.errorContainer,
  },
  formErrorText: {
    flex: 1,
    fontSize: FontSize.bodySm,
    lineHeight: 18,
    fontWeight: FontWeight.semiBold,
    color: Colors.error,
  },

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
  secondaryBtn: {
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  secondaryBtnText: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.semiBold,
    color: Colors.primary,
  },
});
