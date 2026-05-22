/**
 * KeepEat — wordmark image.
 *
 * Width scales with screen width so iOS and Android render at the same visual
 * proportion. 3.45 mirrors the source PNG's intrinsic aspect ratio
 * (1508 × 437). Default ratio (0.24) suits tab headers; pass a larger
 * `widthRatio` for hero placements like the login screen.
 */

import { Dimensions } from "react-native";
import { Image } from "expo-image";

const SCREEN_WIDTH = Dimensions.get("window").width;
const ASPECT_RATIO = 3.45;

export function AppHeaderLogo({ widthRatio = 0.24 }: { widthRatio?: number }) {
  const width = SCREEN_WIDTH * widthRatio;
  const height = width / ASPECT_RATIO;
  return (
    <Image
      source={require("@/assets/images/keepeat-wordmark.png")}
      style={{ width, height }}
      contentFit="contain"
      accessible
      accessibilityLabel="KeepEat"
    />
  );
}
