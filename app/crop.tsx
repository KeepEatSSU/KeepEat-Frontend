import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Image,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as ImageManipulator from "expo-image-manipulator";

import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  Radius,
  Shadows,
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

  // Original image pixel dimensions
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  // Container view layout dimensions
  const [layout, setLayout] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (uri) {
      Image.getSize(
        uri,
        (width, height) => {
          setImageSize({ width, height });
        },
        () => {
          showToast("이미지 크기를 불러오는데 실패했습니다.");
        }
      );
    }
  }, [uri]);

  // Gestures state
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const hasInteracted = useSharedValue(false);

  const pinchGesture = Gesture.Pinch()
    .onBegin(() => {
      hasInteracted.value = true;
    })
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      hasInteracted.value = true;
    })
    .onUpdate((e) => {
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });

  const overlayAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(hasInteracted.value ? 0 : 1, { duration: 200 }),
    };
  });

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
    if (imageSize.width === 0 || layout.width === 0) {
      showToast("이미지 로딩 중입니다. 잠시만 기다려주세요.");
      return;
    }
    if (isProcessing) return;

    setIsProcessing(true);
    setProgress(0);
    setTipIndex(0);

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
      // 1. Calculate Crop Box
      const cw = layout.width;
      const ch = layout.height;
      const W = imageSize.width;
      const H = imageSize.height;

      const coverRatio = Math.max(cw / W, ch / H);
      const imageRenderWidth = W * coverRatio;
      const imageRenderHeight = H * coverRatio;
      const imageContentLeft = (cw - imageRenderWidth) / 2;
      const imageContentTop = (ch - imageRenderHeight) / 2;

      // Crop Window layout defined by styles (top 20%, left 10%, width 80%, height 60%)
      const CROP_LEFT = cw * 0.1;
      const CROP_TOP = ch * 0.2;
      const CROP_WIDTH = cw * 0.8;
      const CROP_HEIGHT = ch * 0.6;

      const tx = translateX.value;
      const ty = translateY.value;
      const s = scale.value;

      const getPixelX = (viewX: number) => {
        const px = viewX - cw / 2;
        const ix = (px - tx) / s + cw / 2;
        return (ix - imageContentLeft) / coverRatio;
      };

      const getPixelY = (viewY: number) => {
        const py = viewY - ch / 2;
        const iy = (py - ty) / s + ch / 2;
        return (iy - imageContentTop) / coverRatio;
      };

      let pixelX = getPixelX(CROP_LEFT);
      let pixelY = getPixelY(CROP_TOP);
      let pixelX_br = getPixelX(CROP_LEFT + CROP_WIDTH);
      let pixelY_br = getPixelY(CROP_TOP + CROP_HEIGHT);

      // Math.round to make it pixel-perfect integer
      const originX = Math.round(Math.max(0, Math.min(W, pixelX)));
      const originY = Math.round(Math.max(0, Math.min(H, pixelY)));
      const endX = Math.round(Math.max(0, Math.min(W, pixelX_br)));
      const endY = Math.round(Math.max(0, Math.min(H, pixelY_br)));

      const cropWidth = endX - originX;
      const cropHeight = endY - originY;

      if (cropWidth <= 0 || cropHeight <= 0) {
        throw new Error("크롭 영역이 유효하지 않습니다.");
      }

      // 2. Manipulate Image
      const manipResult = await ImageManipulator.manipulateAsync(
        uri,
        [{ crop: { originX, originY, width: cropWidth, height: cropHeight } }],
        { format: ImageManipulator.SaveFormat.JPEG, compress: 1.0 }
      );

      // 3. Upload to OCR
      const candidates = await parseReceiptImage(manipResult.uri);
      
      cleanup();
      setProgress(100);
      ocrPending.set(candidates);
      setTimeout(() => {
        setIsProcessing(false);
        setProgress(0);
        setTipIndex(0);
        router.push("/add-confirm" as never);
      }, 300);
    } catch (e: any) {
      cleanup();
      setIsProcessing(false);
      setProgress(0);
      setTipIndex(0);
      const msg =
        e instanceof OcrParseError
          ? e.message
          : e.message || "OCR을 처리하지 못했어요. 잠시 후 다시 시도해주세요";
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
        <View 
          style={styles.imageContainer}
          onLayout={(e) => {
            setLayout({
              width: e.nativeEvent.layout.width,
              height: e.nativeEvent.layout.height,
            });
          }}
        >
          {uri ? (
            <GestureDetector gesture={composedGesture}>
              <Animated.Image
                source={{ uri }}
                style={[styles.image, animatedStyle]}
                resizeMode="cover"
              />
            </GestureDetector>
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
            <Animated.View style={[styles.cropBox, overlayAnimatedStyle]}>
              <View style={styles.gridVertical1} />
              <View style={styles.gridVertical2} />
              <View style={styles.gridHorizontal1} />
              <View style={styles.gridHorizontal2} />
            </Animated.View>

            <CornerHandle position="tl" />
            <CornerHandle position="tr" />
            <CornerHandle position="bl" />
            <CornerHandle position="br" />

            {/* Hint icon only, since pinch applies anywhere */}
            <Animated.View style={[styles.pinchIcon, overlayAnimatedStyle]}>
              <Ionicons name="resize" size={28} color="#FFFFFF" />
            </Animated.View>
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
            styles.ocrButton,
            isProcessing ? styles.ocrButtonDisabled : styles.ocrButtonActive,
            !isProcessing &&
              pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
          ]}
        >
          <Text
            style={[
              styles.ocrButtonText,
              isProcessing && styles.ocrButtonTextDisabled,
            ]}
          >
            OCR 하기
          </Text>
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

  // Crop frame overlay (handles, pinch)
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
    top: 0,
    bottom: 0,
    left: "33.333%",
    width: 1,
    backgroundColor: "rgba(255, 255, 255, 0.45)",
  },
  gridVertical2: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "66.666%",
    width: 1,
    backgroundColor: "rgba(255, 255, 255, 0.45)",
  },
  gridHorizontal1: {
    position: "absolute",
    top: "33.333%",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.45)",
  },
  gridHorizontal2: {
    position: "absolute",
    top: "66.666%",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.45)",
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
  // Matches detail.tsx "수정 완료" (saveBtn) so all primary CTAs share the
  // same flat single-color shape, no gradient/glow.
  ocrButton: {
    height: 56,
    borderRadius: Radius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  ocrButtonActive: {
    backgroundColor: Colors.primary,
    ...Shadows.fab,
  },
  ocrButtonDisabled: {
    backgroundColor: Colors.surfaceContainerHigh,
  },
  ocrButtonText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onPrimary,
    letterSpacing: LetterSpacing.tight,
  },
  ocrButtonTextDisabled: {
    color: Colors.outline,
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
