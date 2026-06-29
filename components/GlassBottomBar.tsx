import { BottomGlassSurface } from "@/components/BottomGlassSurface";
import type { ReactNode } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";

type GlassBottomBarProps = {
  children: ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  paddingBottomMin?: number;
  paddingBottomExtra?: number;
  testID?: string;
};

export function GlassBottomBar({
  children,
  containerStyle,
  contentStyle,
  paddingBottomMin,
  paddingBottomExtra = 0,
  testID,
}: GlassBottomBarProps) {
  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, containerStyle]}
      testID={testID}
    >
      <BottomGlassSurface
        contentStyle={contentStyle}
        paddingBottomMin={paddingBottomMin}
        paddingBottomExtra={paddingBottomExtra}
      >
        {children}
      </BottomGlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
});
