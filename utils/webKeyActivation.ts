import { Platform } from "react-native";

/**
 * web 전용 키보드 활성화 보강.
 *
 * react-native-web 0.21 Pressable은 role=checkbox에서 Space를, href 없는
 * role=link에서 Enter를 onPress로 연결하지 않는다. 해당 키를 keydown에서 한 번만
 * 처리하고(꾹 누름 반복 무시) 기본 동작(Space 스크롤)을 막는다. native에서는 빈 props.
 */
export function webKeyActivation(
  keys: readonly string[],
  onActivate: () => void,
): object {
  if (Platform.OS !== "web") return {};
  return {
    onKeyDown: (e: { key: string; repeat?: boolean; preventDefault: () => void }) => {
      if (!keys.includes(e.key)) return;
      e.preventDefault();
      if (!e.repeat) onActivate();
    },
  };
}
