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
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/context/AuthContext";
import {
  changePassword,
  getErrorCode,
  getErrorMessage,
  getErrorStatus,
} from "@/services/api";
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
//
// 서버(PasswordChangeRequest)의 @Pattern이 유일한 기준이며, 규칙 전체는
// utils/passwordPolicy.ts로 옮겼다(비밀번호 찾기 flow와 공유). 체크리스트에
// 개별 피드백을 주기 위해 조각 정규식들을 그대로 가져다 쓴다 — 합치면 서버
// 패턴과 동일하다.
import {
  PW_ALLOWED_CHARSET_REGEX,
  PW_ALLOWED_SPECIALS,
  PW_HAS_DIGIT_REGEX,
  PW_HAS_LETTER_REGEX,
  PW_HAS_SPECIAL_REGEX,
  PW_LENGTH_REGEX,
} from "@/utils/passwordPolicy";

// 서버 @Size(max = 72). 넘겨봐야 400이므로 전송 전에 막는다.
const CURRENT_PW_MAX_LENGTH = 72;

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ChangePasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showTopToast } = useToast();
  const { endLocalSession } = useAuth();

  // One ref per field for "next" focus chaining. This is the same pattern
  // login.tsx uses (email → password). Do NOT replicate signup.tsx's chaining
  // (blurOnSubmit={false} + step-divider focus mess) — that's the broken one.
  // canSubmit의 `!submitting`은 state라 같은 tick에 들어온 두 번째 탭을 막지
  // 못한다(Pressable의 disabled도 리렌더 후에야 반영된다). 성공하면 세션이
  // 날아가므로 두 번째 요청은 401로 끝난다 — ref로 한 번 더 잠근다.
  // mypage.tsx의 logoutAllSubmittingRef와 같은 패턴.
  const submittingRef = useRef(false);
  const currentRef = useRef<TextInput>(null);
  const newRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [currentError, setCurrentError] = useState("");

  const isCurrentOk =
    currentPassword.length > 0 &&
    currentPassword.length <= CURRENT_PW_MAX_LENGTH;
  const isPwLengthOk = PW_LENGTH_REGEX.test(newPassword);
  const isPwComplexOk =
    PW_HAS_LETTER_REGEX.test(newPassword) &&
    PW_HAS_DIGIT_REGEX.test(newPassword) &&
    PW_HAS_SPECIAL_REGEX.test(newPassword);
  const isPwCharsetOk = PW_ALLOWED_CHARSET_REGEX.test(newPassword);
  // 서버도 같은 검사를 하고 400 BAD_REQUEST를 던진다. 왕복 한 번을 아끼고
  // 실패 이유를 필드 옆에 붙여주기 위해 여기서 먼저 막는다.
  const isSameAsCurrent =
    currentPassword.length > 0 && newPassword === currentPassword;
  const isMatched =
    confirmPassword.length > 0 && newPassword === confirmPassword;
  const showMismatch =
    confirmPassword.length > 0 && newPassword !== confirmPassword;

  const canSubmit =
    isCurrentOk &&
    isPwLengthOk &&
    isPwComplexOk &&
    isPwCharsetOk &&
    !isSameAsCurrent &&
    isMatched &&
    !submitting;

  const handleSubmit = async () => {
    if (submittingRef.current || !canSubmit) return;
    Keyboard.dismiss();
    submittingRef.current = true;
    setSubmitting(true);
    setFormError("");
    setCurrentError("");
    try {
      await changePassword(currentPassword, newPassword);
      // 204가 온 시점에 서버는 이미 이 유저의 모든 UserSession과 푸시 토큰을
      // 지운 뒤다. 손에 든 accessToken은 죽은 토큰이라, 그대로 두면 사용자는
      // 잠시 뒤 아무 화면에서나 아무 설명 없이 로그인 화면으로 튕긴다.
      // 그래서 여기서 이유를 알려주고 로컬 세션을 정리한다 —
      // setUser(null) → AuthGate가 /login으로 replace 하므로 back()은 없다.
      // 토스트는 ToastProvider가 AuthGate 바깥에 있어 화면 전환 후에도 남는다.
      showTopToast({
        message: "비밀번호가 변경되어 모든 기기에서 로그아웃되었습니다",
        variant: "success",
      });
      await endLocalSession();
      return;
    } catch (e) {
      const status = getErrorStatus(e);
      const code = getErrorCode(e);

      // code 없는 401 = 토큰 만료/세션 폐기({ error, message } 포맷).
      // 인터셉터가 이미 refresh를 시도했고 실패해 로그아웃을 진행 중이므로,
      // 폼에 에러를 남겨도 화면이 곧 사라진다. 이유만 토스트로 넘긴다.
      if (status === 401 && code === null) {
        showTopToast({
          message: "로그인이 만료되었어요. 다시 로그인해주세요",
          variant: "error",
        });
        return;
      }

      // 현재 비밀번호 불일치. 폼 전체가 아니라 해당 필드에 붙이고 포커스를
      // 돌려준다. 입력값은 지우지 않는다 — 대부분 오타 한 글자다.
      if (status === 401 && code === "INVALID_CREDENTIALS") {
        setCurrentError(
          getErrorMessage(e, "현재 비밀번호가 일치하지 않아요"),
        );
        currentRef.current?.focus();
        return;
      }

      // 404 USER_NOT_FOUND — 세션은 살아있는데 유저가 없는 상태. 이 화면에서
      // 고칠 수 있는 게 없으므로 재로그인을 안내한다.
      if (status === 404) {
        setFormError(
          getErrorMessage(
            e,
            "계정 정보를 찾을 수 없어요. 다시 로그인해주세요",
          ),
        );
        return;
      }

      // 400(BAD_REQUEST: 소셜 계정 / 현재 비밀번호와 동일, INVALID_INPUT),
      // 500, 네트워크 실패. 서버 message가 있으면 그대로, 없으면 폴백.
      setFormError(
        getErrorMessage(
          e,
          status === null
            ? "네트워크 연결을 확인하고 다시 시도해주세요"
            : "비밀번호 변경에 실패했어요. 잠시 후 다시 시도해주세요",
        ),
      );
    } finally {
      submittingRef.current = false;
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
            <Text style={styles.heroTitle}>비밀번호 변경</Text>
            <Text style={styles.heroSubtitle}>
              안전을 위해 새 비밀번호를 입력해주세요
            </Text>
          </View>

          {/* Form */}
          <View style={styles.formCard}>
            {/* Current password */}
            <View style={styles.inputWrap}>
              <Text style={styles.inputLabel}>현재 비밀번호</Text>
              <View style={styles.inputRow}>
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={Colors.outline}
                  style={{ marginRight: Spacing.sm }}
                />
                <TextInput
                  ref={currentRef}
                  value={currentPassword}
                  onChangeText={(next) => {
                    setCurrentPassword(next);
                    setFormError("");
                    setCurrentError("");
                  }}
                  placeholder="현재 비밀번호"
                  placeholderTextColor={Colors.outline}
                  style={styles.input}
                  secureTextEntry={!showCurrent}
                  maxLength={CURRENT_PW_MAX_LENGTH}
                  returnKeyType="next"
                  onSubmitEditing={() => newRef.current?.focus()}
                />
                <Pressable onPress={() => setShowCurrent((v) => !v)}>
                  <Ionicons
                    name={showCurrent ? "eye-off-outline" : "eye-outline"}
                    size={18}
                    color={Colors.outline}
                  />
                </Pressable>
              </View>
              {currentError !== "" && (
                <Text style={styles.fieldError}>{currentError}</Text>
              )}
            </View>

            {/* New password */}
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
                  ref={newRef}
                  value={newPassword}
                  onChangeText={(next) => {
                    setNewPassword(next);
                    setFormError("");
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

              {/* Password checklist — same wording as signup for consistency */}
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
                    {`영문, 숫자, 특수기호(${PW_ALLOWED_SPECIALS}) 포함`}
                  </Text>
                </View>
              </View>

              {/* 서버 화이트리스트 밖의 문자는 체크리스트로 표현할 수 없다
                  (길이·구성은 통과하는데 문자 하나 때문에 400이 난다).
                  그래서 위반했을 때만 필드 에러로 정확히 짚어준다. */}
              {!isPwCharsetOk && (
                <Text style={styles.fieldError}>
                  {`영문, 숫자와 특수기호 ${PW_ALLOWED_SPECIALS} 만 사용할 수 있어요`}
                </Text>
              )}
              {isSameAsCurrent && (
                <Text style={styles.fieldError}>
                  새 비밀번호는 현재 비밀번호와 달라야 해요
                </Text>
              )}
            </View>

            {/* Confirm new password */}
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
                  onChangeText={(next) => {
                    setConfirmPassword(next);
                    setFormError("");
                  }}
                  placeholder="새 비밀번호 다시 입력"
                  placeholderTextColor={Colors.outline}
                  style={styles.input}
                  secureTextEntry={!showConfirm}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
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

            {/* 서버가 비밀번호 변경 트랜잭션에서 모든 UserSession과 푸시 토큰을
                지운다 — 성공하면 이 기기 포함 전 기기가 로그아웃된다.
                누르기 전에 알려주는 편이 낫다. */}
            <View style={styles.noticeRow}>
              <Ionicons
                name="information-circle-outline"
                size={16}
                color={Colors.onSurfaceVariant}
              />
              <Text style={styles.noticeText}>
                비밀번호를 변경하면 모든 기기에서 로그아웃돼요. 변경 후 새
                비밀번호로 다시 로그인해주세요
              </Text>
            </View>

            {formError !== "" && (
              <View style={styles.formErrorRow}>
                <Ionicons
                  name="alert-circle"
                  size={16}
                  color={Colors.error}
                />
                <Text style={styles.formErrorText}>{formError}</Text>
              </View>
            )}

            {/* Submit */}
            <Pressable
              onPress={handleSubmit}
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
                  변경하기
                </Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

// ─── Styles (login.tsx pattern, NOT signup.tsx — avoid the iOS input bug) ────

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
  // login.tsx pattern: paddingVertical (NOT height fix). The fixed-height
  // approach is signup's signature and shipped with the iOS input bug.
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
  noticeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceContainerLow,
  },
  noticeText: {
    flex: 1,
    fontSize: FontSize.bodySm,
    lineHeight: 18,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
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
});
