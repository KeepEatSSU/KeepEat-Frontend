import { useState } from "react";
import { View, Text, Pressable, Alert, Platform, StyleSheet } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as ImagePicker from "expo-image-picker";
import { AddMenuSheet } from "@/components/AddMenuSheet";
import {
  Colors,
  Shadows,
  Radius,
  Spacing,
  FontSize,
  FontWeight,
} from "@/constants/theme";

// ─── Custom Floating Tab Bar ──────────────────────────────────────────────────

const TAB_CONFIG = {
  index: {
    icon: "cube-outline" as const,
    activeIcon: "cube" as const,
    label: "냉장고",
  },
  explore: {
    icon: "book-outline" as const,
    activeIcon: "book" as const,
    label: "레시피",
  },
  recipe: {
    icon: "receipt-outline" as const,
    activeIcon: "receipt" as const,
    label: "내 레시피",
  },
};

function FloatingTabBar({
  state,
  navigation,
  onFabPress,
}: BottomTabBarProps & { onFabPress: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.tabBarWrapper,
        { paddingBottom: Math.max(insets.bottom, 16) },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.tabBarPill}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          // Center FAB — intercept to show menu sheet
          if (route.name === "add") {
            return (
              <Pressable
                key={route.key}
                onPress={onFabPress}
                style={({ pressed }) => [
                  styles.fab,
                  pressed && styles.fabPressed,
                ]}
              >
                <Ionicons name="add" size={26} color={Colors.onPrimary} />
              </Pressable>
            );
          }

          // Regular tab item
          const tab = TAB_CONFIG[route.name as keyof typeof TAB_CONFIG];
          if (!tab) return null;

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={({ pressed }) => [
                styles.tabItem,
                isFocused && styles.tabItemActive,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons
                name={isFocused ? tab.activeIcon : tab.icon}
                size={21}
                color={isFocused ? Colors.primary : Colors.outline}
              />
              <Text
                style={[
                  styles.tabLabel,
                  isFocused && styles.tabLabelActive,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function TabLayout() {
  const [isAddMenuVisible, setIsAddMenuVisible] = useState(false);
  const router = useRouter();

  return (
    <>
      <Tabs
        tabBar={(props) => (
          <FloatingTabBar
            {...props}
            onFabPress={() => setIsAddMenuVisible(true)}
          />
        )}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="explore" />
        <Tabs.Screen name="add" />
        <Tabs.Screen name="recipe" />
      </Tabs>

      <AddMenuSheet
        visible={isAddMenuVisible}
        onClose={() => setIsAddMenuVisible(false)}
        onGallery={() => {
          setIsAddMenuVisible(false);
          setTimeout(async () => {
            try {
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                allowsMultipleSelection: false,
                allowsEditing: false,
                quality: 1,
              });
              if (!result.canceled && result.assets[0]) {
                router.push({
                  pathname: "/crop",
                  params: { uri: result.assets[0].uri },
                } as never);
              }
            } catch (e) {
              // onCamera의 Alert와 일관되게 사용자에게 안내. 권한 거부나
              // 시스템 오류 어느 쪽이든 사용자가 무반응을 의아해하지 않게.
              console.log("Gallery picker error:", e);
              Alert.alert(
                "알림",
                "갤러리를 열 수 없어요. 권한 설정을 확인해 주세요.",
              );
            }
          }, 400);
        }}
        onCamera={() => {
          setIsAddMenuVisible(false);
          setTimeout(async () => {
            try {
              // Check camera availability (simulators don't have cameras)
              if (Platform.OS === "ios") {
                const available =
                  await ImagePicker.getCameraPermissionsAsync();
                if (
                  available.status === "denied" &&
                  !available.canAskAgain
                ) {
                  Alert.alert(
                    "알림",
                    "카메라 접근 권한이 거부되었습니다. 설정에서 권한을 허용해 주세요.",
                  );
                  return;
                }
              }
              const { status } =
                await ImagePicker.requestCameraPermissionsAsync();
              if (status !== "granted") {
                Alert.alert(
                  "알림",
                  "카메라를 실행할 수 없는 기기이거나 권한이 없습니다.",
                );
                return;
              }
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ["images"],
                allowsEditing: false,
                quality: 1,
              });
              if (!result.canceled && result.assets[0]) {
                router.push({
                  pathname: "/crop",
                  params: { uri: result.assets[0].uri },
                } as never);
              }
            } catch (e) {
              console.log("Camera picker error:", e);
              Alert.alert(
                "알림",
                "카메라를 실행할 수 없는 기기이거나 권한이 없습니다.",
              );
            }
          }, 400);
        }}
        onManual={() => {
          setIsAddMenuVisible(false);
          router.push({
            pathname: "/add-confirm",
            params: { mode: "manual" },
          } as never);
        }}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tabBarWrapper: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
  },
  tabBarPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: Colors.glassBackground,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    width: "100%",
    maxWidth: 400,
    ...Shadows.ambient,
  },
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    gap: 2,
  },
  tabItemActive: {
    backgroundColor: "rgba(0, 109, 55, 0.07)",
  },
  tabLabel: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
  },
  tabLabelActive: {
    color: Colors.primary,
    fontWeight: FontWeight.semiBold,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primaryContainer,
    alignItems: "center",
    justifyContent: "center",
    ...Shadows.fab,
  },
  fabPressed: {
    transform: [{ scale: 0.92 }],
    opacity: 0.9,
  },
});
