import { useEffect } from "react";
import { Platform } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { PortalProvider } from "@gorhom/portal";
import * as SplashScreen from "expo-splash-screen";
import * as WebBrowser from "expo-web-browser";
import * as NavigationBar from "expo-navigation-bar";
import { ToastProvider } from "@/components/Toast";
import { PushPermissionPrompt } from "@/components/PushPermissionPrompt";
import { RecipeRecommendationProvider } from "@/context/RecipeRecommendationContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { IngredientMasterProvider } from "@/context/IngredientMasterContext";

// Required for the in-app browser auth session to dismiss cleanly on iOS
// after a redirect back to the app. Must run once at module scope, before
// any WebBrowser.openAuthSessionAsync() call elsewhere in the app.
WebBrowser.maybeCompleteAuthSession();

// Keep the native splash visible until AuthContext finishes its boot-time
// token validation, then hide it from AuthGate below.
SplashScreen.preventAutoHideAsync();

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
      segments[0] === "login" ||
      segments[0] === "signup" ||
      segments[0] === "signup-profile";

    if (!isAuthenticated && !inAuthGroup) {
      router.replace("/login");
    } else if (isAuthenticated && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [isAuthenticated, isLoading, segments, router]);

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  if (isLoading) {
    // Keep returning null while AuthContext boots so the native splash
    // (green background + white wordmark) stays on screen — no flicker.
    return null;
  }

  return <>{children}</>;
}

export default function RootLayout() {
  // Android system navigation bar: match the tab bar's white bottom so the
  // 3-button / gesture area blends into our bar. Under edge-to-edge the OS
  // may keep the bar transparent and only honor button style — that's fine,
  // our gradient already draws opaque white behind the inset area.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    NavigationBar.setBackgroundColorAsync("#FFFFFF").catch(() => {});
    NavigationBar.setButtonStyleAsync("dark").catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* KeyboardProvider — react-native-keyboard-controller가 모든 화면에서
          KeyboardAwareScrollView 등을 쓰려면 루트에 한 번만 설치. New Arch
          호환, GestureHandlerRootView 안쪽에 두는 게 권장 패턴. */}
      <KeyboardProvider>
      <AuthProvider>
        <PortalProvider>
          <ToastProvider>
            <NotificationProvider>
              {/* RecipeRecommendationProvider는 useToast()를 쓰므로 반드시
                  ToastProvider 안쪽이어야 함 — 바깥에 두면 useToast가 기본
                  no-op을 받아 안내/에러 토스트가 무동작이 된다. */}
              <RecipeRecommendationProvider>
              <AuthGate>
                <IngredientMasterProvider>
                  <PushPermissionPrompt />
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
                      name="signup-profile"
                      options={{ animation: "slide_from_right" }}
                    />
                    <Stack.Screen
                      name="change-password"
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
                </IngredientMasterProvider>
              </AuthGate>
              <StatusBar style="dark" />
              </RecipeRecommendationProvider>
            </NotificationProvider>
          </ToastProvider>
        </PortalProvider>
      </AuthProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
