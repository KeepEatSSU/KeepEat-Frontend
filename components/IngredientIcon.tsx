/**
 * Circular avatar for an ingredient.
 *
 *  - Master ingredient (`ingredientId` present in INGREDIENT_ICONS):
 *      Renders the matching webp from assets/ingredient-icons/, clipped to a
 *      circle with a white background (icons are designed on transparency).
 *
 *  - Custom "내 재료" (isCustom or no ingredientId, or id missing from the
 *      icon map): Renders a mint disc with a pencil glyph — communicates
 *      "user-created, not from the catalog" at a glance.
 *
 * All four consuming screens (fridge grid, detail, picker, edit card) call
 * this with the same prop shape so the affordance reads identically across
 * surfaces; only `size` varies.
 */

import { View, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { INGREDIENT_ICONS } from "@/assets/ingredient-icons/iconMap";
import { Colors } from "@/constants/theme";

interface IngredientIconProps {
  /** Master ingredient ID. Null/undefined for custom items. */
  ingredientId?: number | null;
  /** Explicit override — true forces the pencil avatar even if id is set. */
  isCustom?: boolean;
  /** Outer diameter in pt. Inner glyph scales to ~45%. */
  size?: number;
}

export function IngredientIcon({
  ingredientId,
  isCustom,
  size = 44,
}: IngredientIconProps) {
  const source =
    !isCustom && ingredientId != null
      ? INGREDIENT_ICONS[ingredientId]
      : undefined;

  if (source == null) {
    // The custom branch draws a filled mint disc, which has no built-in
    // transparent ring like the master webps do (those have a 6% padding
    // baked in by the convert script). To match their *visible* size when
    // the two appear side-by-side, the disc itself is inset to 88% of the
    // outer footprint — the surrounding 12% is transparent so the card
    // background shows through and layout (`size`) is unchanged.
    const disc = Math.round(size * 0.88);
    const glyph = Math.round(disc * 0.45);
    return (
      <View
        style={[
          styles.customOuter,
          { width: size, height: size },
        ]}
      >
        <View
          style={[
            styles.customDisc,
            { width: disc, height: disc, borderRadius: disc / 2 },
          ]}
        >
          <Ionicons name="pencil" size={glyph} color={Colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <Image
      source={source}
      resizeMode="contain"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: Colors.surfaceContainerLowest,
      }}
    />
  );
}

const styles = StyleSheet.create({
  // Transparent footprint that takes up `size × size` so the icon's slot
  // is identical to the master <Image> case — only the disc inside is inset.
  customOuter: {
    alignItems: "center",
    justifyContent: "center",
  },
  customDisc: {
    backgroundColor: Colors.secondaryContainer,
    alignItems: "center",
    justifyContent: "center",
  },
});
