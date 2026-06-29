import { Glass, Spacing } from "@/constants/theme";
import type { ReactNode } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { GlassBottomBar } from "@/components/GlassBottomBar";

type BottomGlassActionsProps = {
  children: ReactNode;
  secondaryAction?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  secondaryContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

export function BottomGlassActions({
  children,
  secondaryAction,
  contentStyle,
  secondaryContainerStyle,
  testID,
}: BottomGlassActionsProps) {
  return (
    <GlassBottomBar
      contentStyle={[styles.content, contentStyle]}
      paddingBottomMin={Glass.bottomBarPaddingBottomMin}
      testID={testID}
    >
      {children}
      {secondaryAction ? (
        <View style={[styles.secondarySlot, secondaryContainerStyle]}>
          {secondaryAction}
        </View>
      ) : null}
    </GlassBottomBar>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Glass.bottomBarContentPaddingTop,
    alignItems: "center",
  },
  secondarySlot: {
    minHeight: Glass.bottomBarSecondaryActionMinHeight,
    marginTop: Glass.bottomBarSecondaryActionGap,
    marginBottom: -Glass.bottomBarSecondaryActionOverlap,
    alignItems: "center",
    justifyContent: "center",
  },
});
