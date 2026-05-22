import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  Radius,
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

const MAX_RESULTS = 50;

interface IngredientPickerSheetProps {
  visible: boolean;
  /** Currently selected ingredient name (for the active checkmark). */
  selected: string;
  /** Returns the picked master ingredient — id is the value the API needs. */
  onSelect: (entry: { id: number; name: string }) => void;
  onClose: () => void;
  /** 검색 결과 빈 상태에서 "직접 추가하기" 누름. name은 검색어. */
  onPickCustom?: (name: string) => void;
  /** picker 열릴 때 검색창에 자동 입력될 초기값. 빈 문자열이면 prefill 없음. */
  initialQuery?: string;
}

export function IngredientPickerSheet({
  visible,
  selected,
  onSelect,
  onClose,
  onPickCustom,
  initialQuery,
}: IngredientPickerSheetProps) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const inputRef = useRef<TextInput>(null);

  // Prefill query + reload recents whenever the sheet opens. The query is
  // seeded from `initialQuery` (e.g. the calling card's current name) so an
  // UNMATCHED card lands the user straight on the relevant search.
  useEffect(() => {
    if (!visible) {
      setSearch("");
      return;
    }
    setSearch(initialQuery ?? "");
    getRecentIngredients().then(setRecents);
    // Autofocus once the modal has had a chance to render.
    const handle = setTimeout(() => inputRef.current?.focus(), 250);
    return () => clearTimeout(handle);
  }, [visible, initialQuery]);

  const handlePick = useCallback(
    (entry: IngredientMasterEntry | RecentEntry) => {
      const payload = { id: entry.id, name: entry.name };
      // Persist to recents asynchronously; UX should not block on storage.
      pushRecentIngredient(payload).catch(() => {});
      Keyboard.dismiss();
      onClose();
      onSelect(payload);
    },
    [onClose, onSelect],
  );

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const handlePickCustom = useCallback(() => {
    if (!onPickCustom) return;
    const name = search.trim();
    if (name === "") return;
    Keyboard.dismiss();
    onClose();
    onPickCustom(name);
  }, [onClose, onPickCustom, search]);

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
      transparent={false}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={[
            styles.header,
            { paddingTop: Math.max(insets.top, Spacing.lg) },
          ]}
        >
          <Pressable
            onPress={handleClose}
            style={({ pressed }) => [
              styles.backButton,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Ionicons name="chevron-back" size={28} color={Colors.onSurface} />
          </Pressable>
          <Text style={styles.headerTitle}>식재료 선택</Text>
          <View style={styles.headerRight} />
        </View>

        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons
              name="search"
              size={20}
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
                  size={20}
                  color={Colors.outline}
                />
              </Pressable>
            )}
          </View>
        </View>

        <View style={styles.listContainer}>
          <ScrollView
            style={styles.list}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: Math.max(insets.bottom, Spacing.xl) },
            ]}
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
                    size={40}
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
                  size={40}
                  color={Colors.outlineVariant}
                />
                <Text style={styles.placeholderText}>
                  찾으시는 식재료가 없나요?
                </Text>
                {trimmed.length > 0 && onPickCustom && (
                  <Pressable
                    onPress={handlePickCustom}
                    style={({ pressed }) => [
                      styles.customAddButton,
                      pressed && { opacity: 0.8 },
                    ]}
                  >
                    <Text style={styles.customAddText}>
                      "{trimmed}" 직접 추가하기
                    </Text>
                  </Pressable>
                )}
                <Text style={styles.placeholderRequest}>
                  KeepEat 팀에 알리기
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
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
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
  },
  backButton: {
    padding: Spacing.xs,
    justifyContent: "center",
    alignItems: "center",
    width: 48,
    height: 48,
  },
  headerTitle: {
    fontSize: FontSize.titleLg,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
    letterSpacing: LetterSpacing.tight,
  },
  headerRight: {
    width: 48,
  },
  searchContainer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.surface,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
    padding: 0,
    margin: 0,
  },
  listContainer: {
    flex: 1,
    backgroundColor: Colors.surfaceContainerLowest,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
  },
  sectionLabel: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.bold,
    color: Colors.onSurfaceVariant,
    textTransform: "uppercase",
    letterSpacing: LetterSpacing.wide,
    marginBottom: Spacing.sm,
  },
  categoryItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.base,
    borderRadius: Radius.lg,
    minHeight: 56,
    marginBottom: Spacing.xs,
  },
  categoryItemSelected: {
    backgroundColor: "rgba(0, 109, 55, 0.07)",
  },
  categoryText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.medium,
    color: Colors.onSurface,
  },
  categoryTextSelected: {
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  placeholderBlock: {
    alignItems: "center",
    paddingTop: Spacing.xxxl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.sm,
  },
  placeholderText: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.semiBold,
    color: Colors.onSurfaceVariant,
    textAlign: "center",
  },
  placeholderHint: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
    textAlign: "center",
  },
  placeholderRequest: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    textAlign: "center",
    marginTop: Spacing.xs,
  },
  customAddButton: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  customAddText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.bold,
    color: Colors.onPrimary,
  },
});
