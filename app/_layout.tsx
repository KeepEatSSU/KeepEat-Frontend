import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { PortalProvider } from "@gorhom/portal";
import { ToastProvider } from "@/components/Toast";
import { RecipeRecommendationProvider } from "@/context/RecipeRecommendationContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Colors } from "@/constants/theme";
import { registerForPushNotificationsAsync } from "@/services/pushNotifications";

// ─── Routing guard ────────────────────────────────────────────────────────────
// Mounted under <AuthProvider> so it can react to auth state changes
// (boot-time token validation, login, logout, 401 forced logout).
function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup =
      segments[0] === "login" || segments[0] === "signup";

    if (!isAuthenticated && !inAuthGroup) {
      router.replace("/login");
    } else if (isAuthenticated && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, isLoading, segments, router]);

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: Colors.surface,
        }}
      >
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  // One-shot push-token registration on app boot. Server upload comes later;
  // for now we just log so we can verify the issuance pipeline end-to-end.
  useEffect(() => {
    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        console.log("🔔 Expo Push Token:", token);
      }
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <RecipeRecommendationProvider>
          <PortalProvider>
            <ToastProvider>
              <AuthGate>
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen
                    name="login"
                    options={{ animation: "fade" }}
                  />
                  <Stack.Screen
                    name="signup"
                    options={{ animation: "slide_from_right" }}
                  />
                  <Stack.Screen
                    name="detail"
                    options={{
                      presentation: "fullScreenModal",
                      gestureEnabled: false,
                      animation: "slide_from_bottom",
                    }}
                  />
                  <Stack.Screen
                    name="crop"
                    options={{
                      presentation: "fullScreenModal",
                      gestureEnabled: false,
                      animation: "slide_from_bottom",
                    }}
                  />
                  <Stack.Screen
                    name="recipe-detail"
                    options={{
                      animation: "slide_from_right",
                    }}
                  />
                  <Stack.Screen
                    name="cooking-ready"
                    options={{
                      presentation: "fullScreenModal",
                      gestureEnabled: false,
                      animation: "slide_from_bottom",
                    }}
                  />
                  <Stack.Screen
                    name="cooking-step"
                    options={{
                      presentation: "fullScreenModal",
                      gestureEnabled: false,
                      animation: "slide_from_right",
                    }}
                  />
                  <Stack.Screen
                    name="cooking-complete"
                    options={{
                      presentation: "card",
                      animation: "slide_from_right",
                    }}
                  />
                  <Stack.Screen
                    name="recipe-swipe"
                    options={{
                      presentation: "card",
                      animation: "slide_from_right",
                      gestureEnabled: false,
                    }}
                  />
                  <Stack.Screen
                    name="add-confirm"
                    options={{
                      presentation: "fullScreenModal",
                      gestureEnabled: false,
                      animation: "slide_from_bottom",
                    }}
                  />
                </Stack>
              </AuthGate>
              <StatusBar style="dark" />
            </ToastProvider>
          </PortalProvider>
        </RecipeRecommendationProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
