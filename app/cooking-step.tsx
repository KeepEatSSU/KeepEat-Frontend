import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  StyleSheet,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  Radius,
  Shadows,
  LetterSpacing,
} from "@/constants/theme";
import { MOCK_RECIPE_DETAILS } from "@/mocks";
import { ConfirmModal } from "@/components/ConfirmModal";

// ─── Time Parsing ─────────────────────────────────────────────────────────────

const TIME_REGEX = /(\d+분\s*\d*초?|\d+분|\d+초)/g;

interface TextSegment {
  type: "text" | "time";
  value: string;
  seconds?: number;
}

function parseTimeString(raw: string): number {
  let total = 0;
  const minMatch = raw.match(/(\d+)분/);
  const secMatch = raw.match(/(\d+)초/);
  if (minMatch) total += parseInt(minMatch[1], 10) * 60;
  if (secMatch) total += parseInt(secMatch[1], 10);
  return total;
}

function parseInstruction(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  text.replace(TIME_REGEX, (match, _g1, offset) => {
    if (offset > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, offset) });
    }
    segments.push({
      type: "time",
      value: match,
      seconds: parseTimeString(match),
    });
    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }
  return segments;
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ─── Rich Instruction Text ────────────────────────────────────────────────────

function RichInstruction({
  text,
  hasTimer,
  onTimeTap,
}: {
  text: string;
  hasTimer: boolean;
  onTimeTap: (seconds: number) => void;
}) {
  const segments = useMemo(() => parseInstruction(text), [text]);

  return (
    <Text style={styles.instructionText}>
      {segments.map((seg, i) =>
        seg.type === "time" ? (
          <Text
            key={i}
            onPress={
              hasTimer
                ? () => seg.seconds && onTimeTap(seg.seconds)
                : undefined
            }
            style={hasTimer ? styles.timeChipInline : styles.timeChipStatic}
          >
            {seg.value}
          </Text>
        ) : (
          <Text key={i}>{seg.value}</Text>
        ),
      )}
    </Text>
  );
}

// ─── useTimer Hook ────────────────────────────────────────────────────────────

function useTimer() {
  const [remaining, setRemaining] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (isRunning && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            setIsRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, remaining]);

  const setTime = useCallback((seconds: number) => {
    setRemaining(seconds);
    setIsRunning(false);
  }, []);

  const startTime = useCallback((seconds: number) => {
    setRemaining(seconds);
    setIsRunning(true);
  }, []);

  const toggle = useCallback(() => {
    if (remaining > 0) setIsRunning((r) => !r);
  }, [remaining]);

  const adjust = useCallback((delta: number) => {
    setRemaining((r) => Math.max(0, r + delta));
  }, []);

  return { remaining, isRunning, setTime, startTime, toggle, adjust };
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CookingStepScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const recipe = useMemo(
    () => MOCK_RECIPE_DETAILS.find((r) => r.id === id) ?? MOCK_RECIPE_DETAILS[0],
    [id],
  );

  const [stepIndex, setStepIndex] = useState(0);
  const [exitModalVisible, setExitModalVisible] = useState(false);
  const timer = useTimer();

  // RecipeDetail.steps was reshaped to a flat string[] — `currentStep`
  // is now the instruction text itself, no `.instruction` accessor needed.
  const currentStep = recipe.steps[stepIndex];
  const totalSteps = recipe.steps.length;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === totalSteps - 1;

  // Does current step's instruction contain any time patterns?
  const hasTimer = useMemo(
    () => TIME_REGEX.test(currentStep),
    [currentStep],
  );

  // Reset timer when step changes or when step has no timer
  useEffect(() => {
    if (!hasTimer) timer.setTime(0);
  }, [stepIndex, hasTimer]);

  const handleTimeTap = (seconds: number) => {
    timer.startTime(seconds);
  };

  const goNext = () => {
    if (isLast) {
      router.dismissAll();
      setTimeout(() => {
        router.push({
          pathname: "/cooking-complete",
          params: { id: recipe.id },
        });
      }, 10);
      return;
    }
    timer.setTime(0);
    setStepIndex((i) => i + 1);
  };

  const goPrev = () => {
    if (!isFirst) {
      timer.setTime(0);
      setStepIndex((i) => i - 1);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable
          onPress={() => setExitModalVisible(true)}
          style={({ pressed }) => [
            styles.headerBtn,
            pressed && { opacity: 0.6 },
          ]}
        >
          <Ionicons name="close" size={24} color={Colors.primary} />
        </Pressable>
        <Text style={styles.logo}>KeepEat</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* ── Step Counter ── */}
      <View style={styles.stepCounter}>
        <Text style={styles.stepCurrent}>
          {String(stepIndex + 1).padStart(2, "0")}
        </Text>
        <Text style={styles.stepTotal}> / {String(totalSteps).padStart(2, "0")}</Text>
      </View>

      {/* ── Main Content ── */}
      <View style={styles.contentArea}>
        {/* Instruction Glass Card */}
        <View style={styles.glassCard}>
          <RichInstruction
            text={currentStep}
            hasTimer={hasTimer}
            onTimeTap={handleTimeTap}
          />
        </View>

        {hasTimer ? (
          <>
            {/* Timer Display */}
            <View style={styles.timerArea}>
              <Text style={styles.timerLabel}>남은 시간</Text>
              <Text
                style={[
                  styles.timerText,
                  timer.remaining > 0 && timer.isRunning && styles.timerActive,
                  timer.remaining === 0 && styles.timerDimmed,
                ]}
              >
                {formatTimer(timer.remaining)}
              </Text>
            </View>

            {/* Timer Controls */}
            <View style={styles.timerControls}>
              <Pressable
                onPress={() => timer.adjust(-10)}
                style={({ pressed }) => [
                  styles.timerAdjustBtn,
                  pressed && { opacity: 0.6, transform: [{ scale: 0.92 }] },
                ]}
              >
                <Text style={styles.timerAdjustText}>-10초</Text>
              </Pressable>

              <Pressable
                onPress={timer.toggle}
                style={({ pressed }) => [
                  styles.timerPlayBtn,
                  timer.remaining === 0 && styles.timerPlayBtnDisabled,
                  pressed && timer.remaining > 0 && { transform: [{ scale: 0.92 }] },
                ]}
              >
                <Ionicons
                  name={timer.isRunning ? "pause" : "play"}
                  size={28}
                  color={
                    timer.remaining === 0
                      ? Colors.outline
                      : Colors.onPrimary
                  }
                />
              </Pressable>

              <Pressable
                onPress={() => timer.adjust(10)}
                style={({ pressed }) => [
                  styles.timerAdjustBtn,
                  pressed && { opacity: 0.6, transform: [{ scale: 0.92 }] },
            ]}
          >
            <Text style={styles.timerAdjustText}>+10초</Text>
          </Pressable>
        </View>
          </>
        ) : null}
      </View>

      {/* ── Bottom Navigation ── */}
      <View
        style={[
          styles.bottomNav,
          { paddingBottom: Math.max(insets.bottom, 16) + 8 },
        ]}
      >
        <Pressable
          onPress={goPrev}
          disabled={isFirst}
          style={({ pressed }) => [
            styles.navBtn,
            styles.navBtnSecondary,
            isFirst && styles.navBtnDisabled,
            !isFirst && pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons
            name="chevron-back"
            size={18}
            color={isFirst ? Colors.outlineVariant : Colors.onSecondaryContainer}
          />
          <Text
            style={[
              styles.navBtnSecondaryText,
              isFirst && styles.navBtnTextDisabled,
            ]}
          >
            이전
          </Text>
        </Pressable>

        <Pressable
          onPress={goNext}
          style={({ pressed }) => [
            styles.navBtn,
            styles.navBtnPrimary,
            pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
          ]}
        >
          <Text style={styles.navBtnPrimaryText}>
            {isLast ? "요리 완료" : "다음 단계"}
          </Text>
          {!isLast && (
            <Ionicons
              name="chevron-forward"
              size={18}
              color={Colors.onPrimary}
            />
          )}
        </Pressable>
      </View>

      {/* ── Exit Confirm ── */}
      <ConfirmModal
        visible={exitModalVisible}
        title="요리 중단"
        subtitle="요리를 중단하고 나가시겠습니까?"
        confirmLabel="나가기"
        cancelLabel="계속하기"
        destructive
        onConfirm={() => {
          setExitModalVisible(false);
          router.back();
        }}
        onCancel={() => setExitModalVisible(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const COOKING_BG = "#F0FDF4";

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COOKING_BG,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.xl,
    height: 56,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    fontSize: FontSize.titleLg,
    fontWeight: FontWeight.extraBold,
    color: "#166534",
    letterSpacing: LetterSpacing.tight,
  },

  // Step counter
  stepCounter: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    paddingVertical: Spacing.md,
  },
  stepCurrent: {
    fontSize: 48,
    fontWeight: FontWeight.extraBold,
    color: Colors.primary,
    letterSpacing: LetterSpacing.tight,
  },
  stepTotal: {
    fontSize: FontSize.headlineSm,
    fontWeight: FontWeight.medium,
    color: Colors.outlineVariant,
  },

  // Content
  contentArea: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: "center",
  },

  // Glass card
  glassCard: {
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    marginBottom: Spacing.xxl,
    ...Platform.select({
      ios: {
        backgroundColor: "rgba(255, 255, 255, 0.80)",
        shadowColor: "#191C1D",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        backgroundColor: "#FFFFFF",
        elevation: 3,
      },
    }),
  },
  instructionText: {
    fontSize: FontSize.titleLg,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
    lineHeight: 30,
    letterSpacing: LetterSpacing.tight,
  },
  timeChipInline: {
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    backgroundColor: "rgba(0, 109, 55, 0.10)",
    paddingHorizontal: 2,
  },
  timeChipStatic: {
    fontWeight: FontWeight.semiBold,
    color: Colors.onSurfaceVariant,
  },

  // Timer
  timerArea: {
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  timerLabel: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.bold,
    color: Colors.outline,
    textTransform: "uppercase",
    letterSpacing: LetterSpacing.wide,
    marginBottom: Spacing.xs,
  },

  timerText: {
    fontSize: 56,
    fontWeight: FontWeight.extraBold,
    color: Colors.onSurface,
    letterSpacing: 2,
  },
  timerActive: {
    color: Colors.primary,
  },
  timerDimmed: {
    color: Colors.outlineVariant,
  },

  // Timer controls
  timerControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.lg,
  },
  timerAdjustBtn: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  timerAdjustText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.bold,
    color: Colors.onSurfaceVariant,
  },
  timerPlayBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...Shadows.fab,
  },
  timerPlayBtnDisabled: {
    backgroundColor: Colors.surfaceContainerHigh,
    shadowOpacity: 0,
    elevation: 0,
  },

  // Bottom navigation
  bottomNav: {
    flexDirection: "row",
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.base,
    ...Platform.select({
      ios: {
        backgroundColor: "rgba(255,255,255,0.80)",
        shadowColor: "#191C1D",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: {
        backgroundColor: "#FFFFFF",
        elevation: 3,
      },
    }),
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
  },
  navBtn: {
    flex: 1,
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: Radius.xl,
    gap: Spacing.xs,
  },
  navBtnPrimary: {
    backgroundColor: Colors.primary,
    ...Shadows.fab,
  },
  navBtnSecondary: {
    backgroundColor: Colors.secondaryContainer,
  },
  navBtnDisabled: {
    backgroundColor: Colors.surfaceContainerHigh,
    shadowOpacity: 0,
    elevation: 0,
  },
  navBtnPrimaryText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onPrimary,
  },
  navBtnSecondaryText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onSecondaryContainer,
  },
  navBtnTextDisabled: {
    color: Colors.outlineVariant,
  },
});
