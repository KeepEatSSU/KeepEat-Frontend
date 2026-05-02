import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  Animated,
  StyleSheet,
} from "react-native";
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
import {
  INGREDIENT_MASTER,
  type IngredientMasterEntry,
} from "@/constants/ingredients-master";
import {
  getRecentIngredients,
  pushRecentIngredient,
  type RecentEntry,
} from "@/services/recentIngredients";

const SHEET_HEIGHT = 500;
const MAX_RESULTS = 50;

interface IngredientPickerSheetProps {
  visible: boolean;
  /** Currently selected ingredient name (for the active checkmark). */
  selected: string;
  /** Returns the picked master ingredient — id is the value the API needs. */
  onSelect: (entry: { id: number; name: string }) => void;
  onClose: () => void;
}

export function IngredientPickerSheet({
  visible,
  selected,
  onSelect,
  onClose,
}: IngredientPickerSheetProps) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const inputRef = useRef<TextInput>(null);

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;

  // Reset query + reload recents whenever the sheet opens.
  useEffect(() => {
    if (!visible) {
      setSearch("");
      return;
    }
    getRecentIngredients().then(setRecents);
    // Autofocus once the open animation has had a chance to start.
    const handle = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(handle);
  }, [visible]);

  useEffect(() => {
    if (visible) {
      backdropOpacity.setValue(0);
      sheetTranslateY.setValue(SHEET_HEIGHT);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(sheetTranslateY, {
          toValue: 0,
          damping: 20,
          stiffness: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const animateOut = useCallback(
    (callback?: () => void) => {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslateY, {
          toValue: SHEET_HEIGHT,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onClose();
        callback?.();
      });
    },
    [onClose, backdropOpacity, sheetTranslateY],
  );

  const handlePick = useCallback(
    (entry: IngredientMasterEntry | RecentEntry) => {
      const payload = { id: entry.id, name: entry.name };
      // Persist to recents asynchronously; UX should not block on storage.
      pushRecentIngredient(payload).catch(() => {});
      animateOut(() => onSelect(payload));
    },
    [animateOut, onSelect],
  );

  const trimmed = search.trim();

  // Substring match against the full master. 613 entries is fine to scan on
  // every keystroke; we cap the rendered results at MAX_RESULTS.
  const searchResults = useMemo<IngredientMasterEntry[]>(() => {
    if (trimmed === "") return [];
    const q = trimmed.toLowerCase();
    const hits: IngredientMasterEntry[] = [];
    for (const entry of INGREDIENT_MASTER) {
      if (entry.name.toLowerCase().includes(q)) {
        hits.push(entry);
        if (hits.length >= MAX_RESULTS) break;
      }
    }
    return hits;
  }, [trimmed]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => animateOut()}
    >
      <View style={styles.container}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => animateOut()}
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 20) },
            { transform: [{ translateY: sheetTranslateY }] },
          ]}
        >
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>

          <Text style={styles.sheetTitle}>식재료 선택</Text>

          <View style={styles.searchBar}>
            <Ionicons
              name="search"
              size={18}
              color={Colors.outline}
              style={{ marginRight: Spacing.sm }}
            />
            <TextInput
              ref={inputRef}
              value={search}
              onChangeText={setSearch}
              placeholder="식재료 이름을 검색해 보세요"
              placeholderTextColor={Colors.outline}
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")}>
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={Colors.outline}
                />
              </Pressable>
            )}
          </View>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {trimmed === "" ? (
              recents.length > 0 ? (
                <>
                  <Text style={styles.sectionLabel}>최근 검색</Text>
                  {recents.map((entry) => (
                    <PickerRow
                      key={`recent-${entry.id}`}
                      name={entry.name}
                      isSelected={selected === entry.name}
                      onPress={() => handlePick(entry)}
                    />
                  ))}
                </>
              ) : (
                <View style={styles.placeholderBlock}>
                  <Ionicons
                    name="bookmark-outline"
                    size={28}
                    color={Colors.outlineVariant}
                  />
                  <Text style={styles.placeholderText}>
                    자주 쓰는 식재료가 여기에 모여요
                  </Text>
                  <Text style={styles.placeholderHint}>
                    한 번 검색하면 다음부터 빠르게 선택할 수 있어요
                  </Text>
                </View>
              )
            ) : searchResults.length > 0 ? (
              searchResults.map((entry) => (
                <PickerRow
                  key={`hit-${entry.id}`}
                  name={entry.name}
                  isSelected={selected === entry.name}
                  onPress={() => handlePick(entry)}
                />
              ))
            ) : (
              <View style={styles.placeholderBlock}>
                <Ionicons
                  name="leaf-outline"
                  size={28}
                  color={Colors.outlineVariant}
                />
                <Text style={styles.placeholderText}>
                  찾으시는 식재료가 없나요?
                </Text>
                <Text style={styles.placeholderRequest}>
                  KeepEat 팀에게 추가 요청하기
                </Text>
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function PickerRow({
  name,
  isSelected,
  onPress,
}: {
  name: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.categoryItem,
        isSelected && styles.categoryItemSelected,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text
        style={[
          styles.categoryText,
          isSelected && styles.categoryTextSelected,
        ]}
      >
        {name}
      </Text>
      {isSelected && (
        <Ionicons
          name="checkmark-circle"
          size={22}
          color={Colors.primary}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(25, 28, 29, 0.35)",
  },
  sheet: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingHorizontal: Spacing.xl,
    maxHeight: "75%",
    ...Shadows.ambient,
  },
  handleRow: { alignItems: "center", paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  handle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceContainerHighest,
  },
  sheetTitle: {
    fontSize: FontSize.titleLg,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
    letterSpacing: LetterSpacing.tight,
    marginBottom: Spacing.base,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.base,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
    padding: 0,
    margin: 0,
  },
  list: { flexGrow: 0 },
  listContent: { paddingBottom: Spacing.lg },
  sectionLabel: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.bold,
    color: Colors.onSurfaceVariant,
    textTransform: "uppercase",
    letterSpacing: LetterSpacing.wide,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  categoryItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.base,
    borderRadius: Radius.lg,
    minHeight: 52,
    marginBottom: Spacing.xs,
  },
  categoryItemSelected: { backgroundColor: "rgba(0, 109, 55, 0.07)" },
  categoryText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
  },
  categoryTextSelected: { fontWeight: FontWeight.bold, color: Colors.primary },
  placeholderBlock: {
    alignItems: "center",
    paddingTop: Spacing.xxl + Spacing.sm,
    paddingBottom: Spacing.xxl,
    gap: Spacing.sm,
  },
  placeholderText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.semiBold,
    color: Colors.onSurfaceVariant,
    textAlign: "center",
  },
  placeholderHint: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
    textAlign: "center",
  },
  placeholderRequest: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
});
