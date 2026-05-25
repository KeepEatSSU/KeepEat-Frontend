/**
 * KeepEat Design System — "The Digital Curator"
 * Single source of truth extracted from DESIGN_SYSTEM.md
 */

import { Platform } from "react-native";

// ─── Colors: Tonal Architecture ───────────────────────────────────────────────

export const Colors = {
  // Surface Hierarchy (paper-stack model)
  surface: "#F8F9FA",
  surfaceContainerLowest: "#FFFFFF",
  surfaceContainerLow: "#F3F4F5",
  surfaceContainer: "#EDEEEF",
  surfaceContainerHigh: "#E7E8E9",
  surfaceContainerHighest: "#E1E3E4",
  surfaceVariant: "#E1E3E4",

  // Primary (Safety Green heritage)
  primary: "#006D37",
  primaryContainer: "#2ECC71",
  onPrimary: "#FFFFFF",
  onPrimaryContainer: "#005027",

  // Secondary
  secondary: "#336943",
  secondaryContainer: "#B5F1C0",
  onSecondaryContainer: "#396F48",

  // Tertiary (caution / warning)
  tertiary: "#98472A",
  tertiaryContainer: "#FF9875",
  onTertiaryContainer: "#772E14",

  // Error (urgent / expiring)
  error: "#BA1A1A",
  errorContainer: "#FFDAD6",
  onError: "#FFFFFF",

  // Text / On-surface (never pure black)
  onSurface: "#191C1D",
  onSurfaceVariant: "#3D4A3E",

  // Outline
  outline: "#6C7B6D",
  outlineVariant: "#BBCBBB",

  // Glassmorphism
  glassBackground: "rgba(255, 255, 255, 0.82)",

  // Input field surfaces (Task: unified input-field grammar)
  surfaceSubtle: "#F8FAF8",   // very pale mint-white — calendar container
  fieldBackground: "#F1F3F2", // neutral grey-mint — capacity/date input fields
} as const;

// Primary gradient (135deg)
export const PrimaryGradient = {
  colors: [Colors.primary, Colors.primaryContainer] as const,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
} as const;

// ─── Typography: Editorial Authority ──────────────────────────────────────────

export const Fonts = {
  display: "PlusJakartaSans",
  body: "Manrope",
} as const;

export const FontSize = {
  displayMd: 32,
  headlineMd: 24,
  headlineSm: 20,
  titleLg: 18,
  titleSm: 14,
  bodyLg: 16,
  bodyMd: 14,
  bodySm: 13,
  labelMd: 12,
  labelSm: 11,
  labelXs: 10,
} as const;

export const FontWeight = {
  extraBold: "800" as const,
  bold: "700" as const,
  semiBold: "600" as const,
  medium: "500" as const,
  regular: "400" as const,
};

export const LetterSpacing = {
  tight: -0.32,
  wide: 0.5,
} as const;

// ─── Elevation & Depth: Tonal Layering ────────────────────────────────────────

export const Shadows = {
  ambient: {
    shadowColor: "#191C1D",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 32,
    elevation: 4,
  },
  // Soft floating card shadow for list cards.
  // iOS: Gaussian blur shadow tuned for the "Digital Curator" ambient feel.
  // Android: Material z-depth renders more crisply than iOS Gaussian, so the
  // numeric elevation is deliberately lower than the iOS radius to match
  // visual weight rather than raw dimension.
  floatingCard: Platform.select({
    ios: {
      shadowColor: "#191C1D",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06,
      shadowRadius: 12,
    },
    android: {
      elevation: 1,
    },
    default: {},
  }),
  fab: {
    // FAB 본체가 Primary(#006D37 진한 초록)로 통일됨 — 그림자도 동일 톤으로
    // 맞춰 일관된 발광 (이전 #2ECC71 밝은 초록은 본체와 색이 어긋남).
    shadowColor: "#006D37",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

export const GhostBorder = {
  borderWidth: 1,
  borderColor: "rgba(187, 203, 187, 0.15)",
} as const;

export const Glass = {
  backgroundColor: Colors.glassBackground,
  backdropBlur: 20,
} as const;

// ─── Border Radius ────────────────────────────────────────────────────────────

export const Radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 9999,
} as const;

// ─── Spacing ──────────────────────────────────────────────────────────────────

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

// ─── Status Indicator Colors (10% opacity background glow) ───────────────────

export const StatusGlow = {
  fresh: "rgba(46, 204, 113, 0.10)",
  caution: "rgba(255, 152, 117, 0.10)",
  expiring: "rgba(186, 26, 26, 0.10)",
} as const;

// ─── Pill (Task 3) ────────────────────────────────────────────────────────────
// Shared tokens for the <Pill /> component used by quick-action chips.

export const PillTokens = {
  background: "#F1F3F2",
  backgroundPressed: "#E4E8E6",
  text: "#3A3F3B",
  radius: 999,
} as const;
