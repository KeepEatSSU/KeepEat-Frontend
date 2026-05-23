/**
 * 레시피 목록 카드 — explore(공용 검색)와 recipe(내 레시피) 탭이 공유.
 *
 * 카드 모양 자체(제목 / 메타 행 / 조리법 pill + 좋아요·싫어요)는 두 탭에서
 * 동일하므로 한 컴포넌트로 묶었다. 두 탭 모두 `RecipeListItem` /
 * `MyRecipeListEntryDto` 같이 미묘하게 다른 shape의 행을 다루기 때문에
 * 카드 입력은 그 둘에 공통으로 들어맞는 작은 인터페이스(`RecipeCardItem`)
 * 만 받는다.
 *
 * 좋아요/싫어요 토글 헬퍼(`applyReaction`)도 같이 export한다 — 두 탭의
 * 낙관적 업데이트가 동일 로직이라 분리할 이유가 없다.
 */

import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Colors,
  FontSize,
  FontWeight,
  LetterSpacing,
  Radius,
  Shadows,
  Spacing,
} from "@/constants/theme";
import type { ReactionType } from "@/constants/domain";
import { mapDifficulty } from "@/services/recipes";

/** 카드가 필요로 하는 최소 필드. RecipeListItem / MyRecipeListEntryDto
 *  둘 다 이 모양에 호환된다. */
export interface RecipeCardItem {
  recipeId: number;
  recipeName: string;
  difficulty: string;
  cookingMethod?: string;
  cookingTime: string;
  calories: number;
  likeCount: number;
  dislikeCount: number;
  myReaction: ReactionType | null;
}

interface Props {
  item: RecipeCardItem;
  onPress: () => void;
  onReact: (recipeId: number, type: ReactionType) => void;
  onLongPress?: () => void;
}

export function RecipeListCard({ item, onPress, onReact, onLongPress }: Props) {
  const liked = item.myReaction === "LIKE";
  const disliked = item.myReaction === "DISLIKE";

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={onLongPress ? 320 : undefined}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <Text style={styles.cardTitle} numberOfLines={2}>
        {item.recipeName}
      </Text>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ionicons
            name="speedometer-outline"
            size={14}
            color={Colors.outline}
          />
          <Text style={styles.metaText}>{mapDifficulty(item.difficulty)}</Text>
        </View>
        <View style={styles.metaDot} />
        <View style={styles.metaItem}>
          <Ionicons name="time-outline" size={14} color={Colors.outline} />
          <Text style={styles.metaText}>{item.cookingTime}</Text>
        </View>
        <View style={styles.metaDot} />
        <View style={styles.metaItem}>
          <Ionicons name="flame-outline" size={14} color={Colors.outline} />
          <Text style={styles.metaText}>{item.calories}kcal</Text>
        </View>
      </View>

      <View style={styles.bottomRow}>
        {item.cookingMethod ? (
          <View style={styles.methodPill}>
            <Text style={styles.methodPillText}>{item.cookingMethod}</Text>
          </View>
        ) : (
          <View />
        )}

        <View style={styles.reactionRow}>
          <Pressable
            onPress={() => onReact(item.recipeId, "LIKE")}
            hitSlop={8}
            style={({ pressed }) => [
              styles.reactionBtn,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Ionicons
              name={liked ? "heart" : "heart-outline"}
              size={18}
              color={liked ? Colors.primary : Colors.outline}
            />
            <Text
              style={[
                styles.reactionCount,
                liked && styles.reactionCountActive,
              ]}
            >
              {item.likeCount}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onReact(item.recipeId, "DISLIKE")}
            hitSlop={8}
            style={({ pressed }) => [
              styles.reactionBtn,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Ionicons
              name={disliked ? "thumbs-down" : "thumbs-down-outline"}
              size={18}
              color={disliked ? Colors.error : Colors.outline}
            />
            <Text
              style={[
                styles.reactionCount,
                disliked && styles.reactionCountDislike,
              ]}
            >
              {item.dislikeCount}
            </Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * 좋아요/싫어요 토글 로직 — 두 탭의 낙관적 업데이트에서 공통으로 사용.
 *
 *   current === type → clear  (count-1)
 *   current === null → add    (count+1)
 *   current ≠ type   → swap   (other−1, this+1)
 *
 * 제네릭이라 `RecipeListItem` / `MyRecipeListEntryDto` / 기타 `myReaction +
 * likeCount + dislikeCount`를 가진 어떤 shape에도 그대로 적용 가능.
 */
export function applyReaction<
  T extends {
    myReaction: ReactionType | null;
    likeCount: number;
    dislikeCount: number;
  },
>(item: T, type: ReactionType): T {
  const cur = item.myReaction;
  let { likeCount, dislikeCount } = item;
  let next: ReactionType | null;

  if (cur === type) {
    next = null;
    if (type === "LIKE") likeCount -= 1;
    else dislikeCount -= 1;
  } else if (cur === null) {
    next = type;
    if (type === "LIKE") likeCount += 1;
    else dislikeCount += 1;
  } else {
    next = type;
    if (type === "LIKE") {
      likeCount += 1;
      dislikeCount = Math.max(0, dislikeCount - 1);
    } else {
      dislikeCount += 1;
      likeCount = Math.max(0, likeCount - 1);
    }
  }

  return { ...item, myReaction: next, likeCount, dislikeCount };
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadows.floatingCard,
  },
  cardPressed: {
    opacity: 0.96,
    transform: [{ scale: 0.985 }],
  },
  cardTitle: {
    fontSize: FontSize.bodyLg,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
    letterSpacing: LetterSpacing.tight,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: Colors.outlineVariant,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  methodPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceContainerLow,
  },
  methodPillText: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.medium,
    color: Colors.onSurfaceVariant,
  },
  reactionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.base,
  },
  reactionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  reactionCount: {
    fontSize: FontSize.labelSm,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
    minWidth: 14,
    textAlign: "right",
  },
  reactionCountActive: {
    color: Colors.primary,
    fontWeight: FontWeight.bold,
  },
  reactionCountDislike: {
    color: Colors.error,
    fontWeight: FontWeight.bold,
  },
});
