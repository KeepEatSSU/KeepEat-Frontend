// ExpandableDatePicker
// Task 2 (final unify): calendar container — no shadow, radius 16, bg Colors.surfaceSubtle
// Task 3 (preserved): today/selected hierarchy via dayComponent; quick-select pills unchanged

import { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  Platform,
  StyleSheet,
  LayoutAnimation,
  UIManager,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { Calendar, LocaleConfig } from "react-native-calendars";
import type { DateData } from "react-native-calendars";
import { Pill } from "@/components/Pill";
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  Radius,
  LetterSpacing,
  Fonts,
} from "@/constants/theme";
import { toISODate, fromISODate } from "@/utils/dateUtils";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Korean locale for react-native-calendars ────────────────────────────────

LocaleConfig.locales["ko"] = {
  monthNames: [
    "1월", "2월", "3월", "4월", "5월", "6월",
    "7월", "8월", "9월", "10월", "11월", "12월",
  ],
  monthNamesShort: [
    "1월", "2월", "3월", "4월", "5월", "6월",
    "7월", "8월", "9월", "10월", "11월", "12월",
  ],
  dayNames: ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"],
  dayNamesShort: ["일", "월", "화", "수", "목", "금", "토"],
  today: "오늘",
};
LocaleConfig.defaultLocale = "ko";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(date: Date): string {
  const y = String(date.getFullYear()).slice(2);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const QUICK_ACTIONS: { key: string; label: string; delta: number | "today" }[] =
  [
    { key: "minus1", label: "-1일", delta: -1 },
    { key: "today", label: "오늘", delta: "today" },
    { key: "plus1", label: "+1일", delta: 1 },
    { key: "plus7", label: "+7일", delta: 7 },
  ];

// ─── Calendar theme (mapped to design tokens) ────────────────────────────────

const calendarTheme = {
  backgroundColor: "#FFFFFF",
  calendarBackground: "#FFFFFF",
  textSectionTitleColor: Colors.onSurfaceVariant,
  selectedDayBackgroundColor: Colors.primary,
  selectedDayTextColor: Colors.onPrimary,
  todayTextColor: Colors.primary,
  dayTextColor: Colors.onSurface,
  textDisabledColor: Colors.outlineVariant,
  arrowColor: Colors.primary,
  monthTextColor: Colors.onSurface,
  textDayFontFamily: Fonts.body,
  textMonthFontFamily: Fonts.display,
  textDayHeaderFontFamily: Fonts.body,
  textDayFontWeight: FontWeight.medium,
  textMonthFontWeight: FontWeight.bold,
  textDayHeaderFontWeight: FontWeight.bold,
  textDayFontSize: FontSize.bodyMd,
  textMonthFontSize: FontSize.titleLg,
  textDayHeaderFontSize: FontSize.labelMd,
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface ExpandableDatePickerProps {
  value: Date;
  onChange: (date: Date) => void;
  label?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  disabled?: boolean;
  disabledText?: string;
  suffix?: string;
  /**
   * Visual style of the closed header.
   *  - `"default"` (legacy): boxed, centered field — used everywhere by default.
   *  - `"compact"`: borderless, left-aligned with the label stacked above the
   *    date inside the header. For top-of-screen page anchors where the boxed
   *    look feels too heavy. The expanded calendar is identical for both.
   */
  variant?: "default" | "compact";
}

// ─── Custom day renderer (Task 2: today vs selected hierarchy) ────────────────

type DayState = "selected" | "disabled" | "today" | "";

interface DayComponentProps {
  date?: DateData;
  state?: DayState;
  marking?: { selected?: boolean };
  onPress?: (date: DateData) => void;
}

function DayCell({ date, state, marking, onPress }: DayComponentProps) {
  if (!date) return <View style={dayStyles.cell} />;

  const isSelected = !!marking?.selected;
  const isToday = state === "today";
  const isDisabled = state === "disabled";

  const label = `${date.year}년 ${date.month}월 ${date.day}일`;
  const accessibilityLabel = isSelected
    ? `${label}, 선택됨`
    : isToday
      ? `${label}, 오늘`
      : isDisabled
        ? `${label}, 선택 불가`
        : label;

  return (
    <Pressable
      onPress={() => !isDisabled && onPress?.(date)}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: isSelected, disabled: isDisabled }}
      style={({ pressed }) => [
        dayStyles.cell,
        pressed && !isDisabled && !isSelected && { opacity: 0.6 },
      ]}
    >
      <View
        style={[
          dayStyles.pill,
          isToday && !isSelected && dayStyles.pillToday,
          isSelected && dayStyles.pillSelected,
        ]}
      >
        <Text
          style={[
            dayStyles.text,
            isDisabled && dayStyles.textDisabled,
            isToday && !isSelected && dayStyles.textToday,
            isSelected && dayStyles.textSelected,
          ]}
        >
          {date.day}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExpandableDatePicker({
  value,
  onChange,
  label,
  minimumDate,
  maximumDate,
  disabled = false,
  disabledText,
  suffix,
  variant = "default",
}: ExpandableDatePickerProps) {
  const isCompact = variant === "compact";
  const [expanded, setExpanded] = useState(false);
  const selectedIso = toISODate(value);
  // Separate state so arrow navigation (onMonthChange) does NOT touch `value`.
  const [currentMonth, setCurrentMonth] = useState(selectedIso);

  useEffect(() => {
    setCurrentMonth(selectedIso);
  }, [selectedIso]);

  const toggle = () => {
    if (disabled) return;
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        220,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity,
      ),
    );
    setExpanded((v) => !v);
  };

  const handleDayPress = (day: DateData) => {
    onChange(fromISODate(day.dateString));
    setCurrentMonth(day.dateString);
  };

  const handleQuickAction = (delta: number | "today") => {
    const next = delta === "today" ? startOfToday() : addDays(value, delta);
    onChange(next);
    setCurrentMonth(toISODate(next));
  };

  const handleMonthChange = (month: DateData) => {
    setCurrentMonth(month.dateString);
  };

  const markedDates = useMemo(
    () => ({
      [selectedIso]: {
        selected: true,
        selectedColor: Colors.primary,
        selectedTextColor: Colors.onPrimary,
      },
    }),
    [selectedIso],
  );

  const calendarKey = currentMonth.slice(0, 7);

  return (
    <View style={styles.container}>
      {/* Default mode keeps the label outside (above) the boxed header.
          Compact mode tucks it inside, stacked over the date. */}
      {label && !isCompact && <Text style={styles.label}>{label}</Text>}

      <Pressable
        onPress={toggle}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label ?? "날짜"} ${formatDate(value)} 선택`}
        accessibilityState={{ disabled, expanded }}
        style={({ pressed }) => [
          isCompact ? styles.headerCompact : styles.header,
          expanded && !isCompact && styles.headerExpanded,
          disabled && styles.headerDisabled,
          pressed && !disabled && { opacity: 0.7 },
        ]}
      >
        {isCompact ? (
          <View style={styles.compactTextStack}>
            {label && <Text style={styles.compactLabel}>{label}</Text>}
            <Text
              style={[
                styles.compactDate,
                disabled && styles.headerTextDisabled,
              ]}
            >
              {disabled
                ? (disabledText ?? formatDate(value))
                : `${formatDate(value)}${suffix ? ` ${suffix}` : ""}`}
            </Text>
          </View>
        ) : (
          <Text
            style={[styles.headerText, disabled && styles.headerTextDisabled]}
          >
            {disabled
              ? (disabledText ?? formatDate(value))
              : `${formatDate(value)}${suffix ? ` ${suffix}` : ""}`}
          </Text>
        )}
        {!disabled && (
          <Ionicons
            name={expanded ? "chevron-up" : "calendar-outline"}
            size={isCompact ? 20 : 18}
            color={Colors.onSurfaceVariant}
            style={{ marginLeft: Spacing.sm }}
          />
        )}
      </Pressable>

      {expanded && !disabled && (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(120)}
          layout={LinearTransition.duration(200)}
          style={styles.expandWrap}
        >
          {/* Task 3: quick-action pills */}
          <View style={styles.quickActionsRow}>
            {QUICK_ACTIONS.map((action) => (
              <Pill
                key={action.key}
                label={action.label}
                onPress={() => handleQuickAction(action.delta)}
                style={styles.quickPill}
                accessibilityLabel={
                  action.delta === "today"
                    ? "오늘 날짜로 이동"
                    : `${action.label} 이동`
                }
              />
            ))}
          </View>

          <View style={styles.calendarWrap}>
            <Calendar
              key={calendarKey}
              current={currentMonth}
              onDayPress={handleDayPress}
              onMonthChange={handleMonthChange}
              markedDates={markedDates}
              minDate={minimumDate ? toISODate(minimumDate) : undefined}
              maxDate={maximumDate ? toISODate(maximumDate) : undefined}
              theme={calendarTheme}
              enableSwipeMonths
              firstDay={0}
              dayComponent={DayCell}
            />
          </View>
        </Animated.View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CELL_SIZE = 36;

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  label: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    letterSpacing: LetterSpacing.wide,
    marginBottom: Spacing.xs,
  },
  // Task 2: input-field grammar — radius 16, fieldBackground, no border/shadow
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.fieldBackground,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  headerExpanded: {
    backgroundColor: Colors.fieldBackground,
  },
  headerDisabled: {
    backgroundColor: Colors.surfaceContainerHigh,
    opacity: 0.6,
  },
  headerText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.semiBold,
    color: Colors.onSurface,
  },
  headerTextDisabled: {
    color: Colors.outline,
    fontStyle: "italic",
  },
  // Compact variant: page-anchor header. No background fill, no box —
  // label sits above the date inside the row, icon trails on the right.
  headerCompact: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    paddingVertical: Spacing.xs,
  },
  compactTextStack: {
    flex: 1,
  },
  compactLabel: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    letterSpacing: LetterSpacing.wide,
    marginBottom: 2,
  },
  compactDate: {
    fontSize: FontSize.titleLg,
    fontWeight: FontWeight.extraBold,
    color: Colors.onSurface,
    letterSpacing: LetterSpacing.tight,
  },
  // Task: expanded panel floats ABOVE the sheet (surfaceSubtle) via pure white bg.
  // No shadow, no border — contrast alone creates the "lift."
  expandWrap: {
    marginTop: Spacing.sm,
    backgroundColor: "#FFFFFF",
    borderRadius: Radius.xl,
    padding: Spacing.base,
    gap: Spacing.md,
    shadowOpacity: 0,
    elevation: 0,
  },
  quickActionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: Spacing.xs,
  },
  quickPill: {
    flex: 1,
  },
  calendarWrap: {
    borderRadius: Radius.lg,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
  },
});

// ─── Day cell styles (Task 2) ─────────────────────────────────────────────────

const dayStyles = StyleSheet.create({
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  // borderRadius: 999 + overflow: 'hidden' forces perfect circle on Android.
  // Android's sub-pixel measurement can make half-size radius render as a rounded
  // square; 999 guarantees a circle regardless of measured size, and explicit
  // overflow clip ensures consistent rounding across devices/OS versions.
  pill: {
    width: CELL_SIZE - 4,
    height: CELL_SIZE - 4,
    borderRadius: 999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  // Unselected-today: soft primary-container halo, dark green text
  pillToday: {
    backgroundColor: Colors.secondaryContainer,
  },
  // Selected takes priority over today (Task 2 rule)
  pillSelected: {
    backgroundColor: Colors.primary,
  },
  text: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    fontFamily: Fonts.body,
    color: Colors.onSurface,
  },
  textToday: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  textSelected: {
    color: Colors.onPrimary,
    fontWeight: FontWeight.bold,
  },
  textDisabled: {
    color: Colors.outlineVariant,
  },
});
