import { AddMenuSheet } from "@/components/AddMenuSheet";
import {
  Colors,
  FontSize,
  FontWeight,
  Radius,
  Shadows,
  Spacing,
} from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { Tabs, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  mypage: {
    icon: "person-circle-outline" as const,
    activeIcon: "person-circle" as const,
    label: "마이",
  },
};

function FloatingTabBar({
  state,
  navigation,
  onFabPress,
}: BottomTabBarProps & { onFabPress: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.tabBarWrapper} pointerEvents="box-none">
      <LinearGradient
        colors={[
          "rgba(255, 255, 255, 0.8)",
          "rgba(255, 255, 255, 0.9)",
          "rgba(255, 255, 255, 1)",
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[
          styles.tabBarPill,
          { paddingBottom: insets.bottom + Spacing.sm },
        ]}
      >
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
      </LinearGradient>
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
        <Tabs.Screen name="mypage" />
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
  },
  tabBarPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#191C1D",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        borderTopWidth: 1,
        borderTopColor: "rgba(0, 0, 0, 0.06)",
      },
    }),
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
