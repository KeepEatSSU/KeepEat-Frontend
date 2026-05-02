import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  Radius,
  Shadows,
  PrimaryGradient,
  LetterSpacing,
} from "@/constants/theme";
import { OCR_LOADING_TIPS } from "@/mocks";
import {
  parseReceiptImage,
  ocrPending,
  OcrParseError,
} from "@/services/ocr";
import { useToast } from "@/components/Toast";

// ─── Corner Handle ────────────────────────────────────────────────────────────

function CornerHandle({ position }: { position: "tl" | "tr" | "bl" | "br" }) {
  const borderStyle = {
    tl: { borderTopWidth: 4, borderLeftWidth: 4, top: -2, left: -2, borderTopLeftRadius: 4 },
    tr: { borderTopWidth: 4, borderRightWidth: 4, top: -2, right: -2, borderTopRightRadius: 4 },
    bl: { borderBottomWidth: 4, borderLeftWidth: 4, bottom: -2, left: -2, borderBottomLeftRadius: 4 },
    br: { borderBottomWidth: 4, borderRightWidth: 4, bottom: -2, right: -2, borderBottomRightRadius: 4 },
  }[position];

  return <View style={[styles.cornerHandle, borderStyle as any]} />;
}

// ─── Processing Overlay ───────────────────────────────────────────────────────

function ProcessingOverlay({
  progress,
  tipIndex,
}: {
  progress: number;
  tipIndex: number;
}) {
  return (
    <View style={styles.overlayProcessing}>
      <View style={styles.overlayContent}>
        <ActivityIndicator size="large" color={Colors.primaryContainer} />
        <Text style={styles.progressText}>{Math.round(progress)}% 완료</Text>
        <View style={styles.progressBarTrack}>
          <View
            style={[styles.progressBarFill, { width: `${progress}%` }]}
          />
        </View>
        <View style={styles.tipBlock}>
          <Text style={styles.tipTitle}>그거 아셨나요?</Text>
          <Text style={styles.tipBody}>
            {OCR_LOADING_TIPS[tipIndex % OCR_LOADING_TIPS.length]}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Crop Screen ──────────────────────────────────────────────────────────────

export default function CropScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { uri } = useLocalSearchParams<{ uri: string }>();

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tipRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (progressRef.current) clearInterval(progressRef.current);
    if (tipRef.current) clearInterval(tipRef.current);
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const startProcessing = async () => {
    if (!uri) {
      showToast("사진을 다시 선택해주세요");
      return;
    }
    if (isProcessing) return;

    setIsProcessing(true);
    setProgress(0);
    setTipIndex(0);

    // Simulated progress curve runs in parallel with the actual upload.
    // Caps at 95% until the response lands; jumps to 100% on success.
    const startTime = Date.now();
    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      let next: number;
      if (elapsed < 3000) {
        next = 80 * (1 - Math.pow(1 - elapsed / 3000, 2));
      } else {
        const slow = ((elapsed - 3000) / 7000) * 15;
        next = 80 + Math.min(slow, 15);
      }
      setProgress(Math.min(next, 95));
    }, 100);

    tipRef.current = setInterval(() => {
      setTipIndex((i) => (i + 1) % OCR_LOADING_TIPS.length);
    }, 3000);

    try {
      const candidates = await parseReceiptImage(uri);
      cleanup();
      setProgress(100);
      ocrPending.set(candidates);
      // Brief 100% beat before navigating so the bar fill reads as success.
      setTimeout(() => {
        setIsProcessing(false);
        setProgress(0);
        setTipIndex(0);
        router.push("/add-confirm" as never);
      }, 300);
    } catch (e) {
      cleanup();
      setIsProcessing(false);
      setProgress(0);
      setTipIndex(0);
      const msg =
        e instanceof OcrParseError
          ? e.message
          : "OCR을 처리하지 못했어요. 잠시 후 다시 시도해주세요";
      showToast(msg);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* ── Top Bar ── */}
      <View style={styles.topBar}>
        <Pressable
          onPress={() => {
            if (isProcessing) {
              cleanup();
              setIsProcessing(false);
              setProgress(0);
            }
            router.back();
          }}
          style={({ pressed }) => [
            styles.cancelBtn,
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text style={styles.cancelText}>취소</Text>
        </Pressable>
      </View>

      {/* ── Main area ── */}
      <View style={styles.mainArea}>
        <View style={styles.imageContainer}>
          {/* Single source image */}
          {uri ? (
            <Image source={{ uri }} style={styles.image} resizeMode="cover" />
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]}>
              <Ionicons name="image-outline" size={48} color={Colors.outline} />
            </View>
          )}

          {/* 4-panel dimmed overlay — center is transparent */}
          <View style={styles.dimTop} pointerEvents="none" />
          <View style={styles.dimMiddleRow} pointerEvents="none">
            <View style={styles.dimLeft} />
            <View style={styles.cropWindow} />
            <View style={styles.dimRight} />
          </View>
          <View style={styles.dimBottom} pointerEvents="none" />

          {/* Crop frame (handles + grid + pinch icon) */}
          <View style={styles.cropRegion} pointerEvents="none">
            <View style={styles.cropBox}>
              <View style={styles.gridVertical1} />
              <View style={styles.gridVertical2} />
              <View style={styles.gridHorizontal1} />
              <View style={styles.gridHorizontal2} />
            </View>

            <CornerHandle position="tl" />
            <CornerHandle position="tr" />
            <CornerHandle position="bl" />
            <CornerHandle position="br" />

            <View style={styles.pinchIcon}>
              <Ionicons name="resize" size={28} color="#FFFFFF" />
            </View>
          </View>
        </View>

        <View style={styles.helpBubble}>
          <Text style={styles.helpText}>
            영역을 맞추세요 (핀치로 확대/축소)
          </Text>
        </View>
      </View>

      {/* ── Bottom CTA ── */}
      <View
        style={[
          styles.bottomArea,
          { paddingBottom: Math.max(insets.bottom, 16) + 8 },
        ]}
      >
        <Pressable
          onPress={startProcessing}
          disabled={isProcessing}
          style={({ pressed }) => [
            styles.ocrPressable,
            !isProcessing &&
              pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
          ]}
        >
          <LinearGradient
            colors={[...PrimaryGradient.colors]}
            start={PrimaryGradient.start}
            end={PrimaryGradient.end}
            style={[styles.ocrButton, isProcessing && { opacity: 0.5 }]}
          >
            <Text style={styles.ocrButtonText}>OCR 하기</Text>
          </LinearGradient>
        </Pressable>
      </View>

      {/* ── Processing Overlay ── */}
      {isProcessing && (
        <ProcessingOverlay progress={progress} tipIndex={tipIndex} />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const GRID_LINE_COLOR = "rgba(255, 255, 255, 0.25)";

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  topBar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
    zIndex: 60,
  },
  cancelBtn: {
    paddingVertical: Spacing.sm,
    paddingRight: Spacing.base,
  },
  cancelText: {
    fontSize: FontSize.titleLg,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  mainArea: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    justifyContent: "center",
    alignItems: "center",
  },
  imageContainer: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: Radius.xl,
    overflow: "hidden",
    backgroundColor: Colors.surfaceContainerLow,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.surfaceContainerLow,
  },
  // 4-panel dimmed overlay (top 20%, middle sides 10% each, bottom 20%)
  dimTop: {
    ...StyleSheet.absoluteFillObject,
    bottom: "80%",
    backgroundColor: "rgba(0, 0, 0, 0.50)",
  },
  dimBottom: {
    ...StyleSheet.absoluteFillObject,
    top: "80%",
    backgroundColor: "rgba(0, 0, 0, 0.50)",
  },
  dimMiddleRow: {
    position: "absolute",
    top: "20%",
    left: 0,
    right: 0,
    height: "60%",
    flexDirection: "row",
  },
  dimLeft: {
    width: "10%",
    backgroundColor: "rgba(0, 0, 0, 0.50)",
  },
  cropWindow: {
    flex: 1, // transparent center — shows image through
  },
  dimRight: {
    width: "10%",
    backgroundColor: "rgba(0, 0, 0, 0.50)",
  },

  // Crop frame overlay (handles, grid, pinch)
  cropRegion: {
    position: "absolute",
    top: "20%",
    left: "10%",
    width: "80%",
    height: "60%",
  },
  cropBox: {
    flex: 1,
    borderRadius: Radius.md,
    overflow: "hidden",
  },
  gridVertical1: {
    position: "absolute",
    left: "33.33%",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: GRID_LINE_COLOR,
  },
  gridVertical2: {
    position: "absolute",
    left: "66.66%",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: GRID_LINE_COLOR,
  },
  gridHorizontal1: {
    position: "absolute",
    top: "33.33%",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: GRID_LINE_COLOR,
  },
  gridHorizontal2: {
    position: "absolute",
    top: "66.66%",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: GRID_LINE_COLOR,
  },
  cornerHandle: {
    position: "absolute",
    width: 24,
    height: 24,
    borderColor: "#FFFFFF",
  },
  pinchIcon: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -28,
    marginLeft: -28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255, 255, 255, 0.20)",
    justifyContent: "center",
    alignItems: "center",
  },
  helpBubble: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.xl,
  },
  helpText: {
    fontSize: FontSize.titleSm,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
  },
  bottomArea: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.base,
  },
  ocrPressable: {
    borderRadius: Radius.xl,
    overflow: "hidden",
  },
  ocrButton: {
    paddingVertical: Spacing.lg,
    borderRadius: Radius.xl,
    alignItems: "center",
    justifyContent: "center",
    ...Shadows.ambient,
  },
  ocrButtonText: {
    fontSize: FontSize.titleLg,
    fontWeight: FontWeight.bold,
    color: Colors.onPrimary,
  },
  overlayProcessing: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
    elevation: 9999,
  },
  overlayContent: {
    alignItems: "center",
    paddingHorizontal: Spacing.xxl,
    gap: Spacing.lg,
  },
  progressText: {
    fontSize: FontSize.headlineMd,
    fontWeight: FontWeight.extraBold,
    color: "#FFFFFF",
    letterSpacing: LetterSpacing.tight,
  },
  progressBarTrack: {
    width: 200,
    height: 6,
    borderRadius: Radius.full,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: Radius.full,
    backgroundColor: Colors.primaryContainer,
  },
  tipBlock: {
    marginTop: Spacing.xl,
    alignItems: "center",
    gap: Spacing.sm,
  },
  tipTitle: {
    fontSize: FontSize.titleSm,
    fontWeight: FontWeight.bold,
    color: "rgba(255, 255, 255, 0.70)",
    letterSpacing: LetterSpacing.wide,
  },
  tipBody: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.medium,
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 24,
  },
});
