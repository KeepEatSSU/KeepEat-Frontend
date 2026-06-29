import { Glass } from "@/constants/theme";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type BottomGlassSurfaceProps = {
  children: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  paddingBottomMin?: number;
  paddingBottomExtra?: number;
  testID?: string;
};

export function BottomGlassSurface({
  children,
  containerStyle,
  contentStyle,
  paddingBottomMin = Glass.bottomBarPaddingBottomMin,
  paddingBottomExtra = 0,
  testID,
}: BottomGlassSurfaceProps) {
  const insets = useSafeAreaInsets();
  const paddingBottom =
    Math.max(insets.bottom, paddingBottomMin) + paddingBottomExtra;

  return (
    <View style={[styles.container, containerStyle]} testID={testID}>
      <LinearGradient
        colors={Glass.bottomBarGradient}
        start={Glass.bottomBarGradientStart}
        end={Glass.bottomBarGradientEnd}
        style={[styles.surface, { paddingBottom }, contentStyle]}
      >
        {children}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...Glass.bottomBarSurfaceShadow,
  },
  surface: {
    borderTopLeftRadius: Glass.bottomBarTopRadius,
    borderTopRightRadius: Glass.bottomBarTopRadius,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: "hidden",
    backgroundColor: Glass.backgroundColor,
    ...Glass.bottomBarSurfaceHighlight,
  },
});
