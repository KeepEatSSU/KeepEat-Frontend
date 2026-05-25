/**
 * Reanimated + gesture-handler 기반 바텀시트 hook.
 *
 * 기존 RN `Animated.Value` + `PanResponder` 조합은 useNativeDriver:true
 * 사용 시 JS `setValue()`가 native shadow에 전달되지 않아 핸들바 드래그가
 * 안 되는 한계가 있었다. 이 hook은 `useSharedValue` + `Gesture.Pan`으로
 * 통일해 애니메이션·제스처 모두 UI thread에서 일관 동작.
 *
 * 노출:
 *   - `pan`            : 핸들 영역에 OPEN_SPRING`<GestureDetector gesture={pan}>`
 *   - `sheetStyle`     : reanimated Animated.View 시트 transform
 *   - `backdropStyle`  : reanimated Animated.View 백드롭 opacity
 *   - `close`          : JS thread에서 닫기 (backdrop press / button 등)
 *
 * 호출처 책임:
 *   - visible prop 변화에 따라 hook 내부에서 open 애니메이션 자동 트리거.
 *   - close 애니메이션이 끝나면 hook이 runOnJS로 `onClose()` 호출 → 부모
 *     setVisible(false)이 그때서야 발생 → Modal close 글리치 없음.
 */

import { useCallback, useEffect } from "react";
import { Dimensions } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from "react-native-reanimated";

// 한 번만 측정 — 시트가 off-screen에서 시작하기에 충분히 큰 값이면 OK.
// 회전 시 약간 부정확하지만 시트 슬라이드 거리는 시각적 영향 없음.
const SLIDE_DISTANCE = Dimensions.get("window").height;

// open spring은 snappier (기존 220/22 → 320/26). 무빙 타겟 시간 단축으로
// "열리는 중 버튼 안 눌림" 증상도 자연 완화.
const OPEN_SPRING = { damping: 50, stiffness: 300 } as const;
const CLOSE_DURATION = 220;
const BACKDROP_OPEN_DURATION = 200;
const BACKDROP_CLOSE_DURATION = 180;

const DRAG_CLOSE_DY = 100; // 100px+ 내리면 닫기
const DRAG_CLOSE_VY = 1000; // 빠른 플릭(>1000 px/s)도 닫기

export function useSheetGesture(visible: boolean, onClose: () => void) {
  const translateY = useSharedValue(SLIDE_DISTANCE);
  const backdropOpacity = useSharedValue(0);

  // visible=true가 되면 open 애니메이션. 재오픈 시 stale 값을 리셋 후 시작.
  useEffect(() => {
    if (visible) {
      translateY.value = SLIDE_DISTANCE;
      backdropOpacity.value = 0;
      backdropOpacity.value = withTiming(1, {
        duration: BACKDROP_OPEN_DURATION,
      });
      translateY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.exp) });
    }
  }, [visible, translateY, backdropOpacity]);

  // JS-callable close. 모든 닫기 경로(backdrop press, button select,
  // onRequestClose) 이걸 호출 → 동일한 닫힘 애니메이션 보장 + 끝나면
  // 부모에게 알림.
  const close = useCallback(() => {
    backdropOpacity.value = withTiming(0, {
      duration: BACKDROP_CLOSE_DURATION,
    });
    translateY.value = withTiming(
      SLIDE_DISTANCE,
      { duration: CLOSE_DURATION },
      (finished) => {
        if (finished) runOnJS(onClose)();
      },
    );
  }, [onClose, translateY, backdropOpacity]);

  // Drag-down-to-close. minDistance(5)로 작은 탭은 무시 (핸들이 클릭형
  // 아니라 단순 시각 표시라 onTap 충돌 걱정 없음).
  const pan = Gesture.Pan()
    .minDistance(5)
    .onUpdate((e) => {
      "worklet";
      // 하향만 따라감. 위로 당기지는 않게 클램프.
      if (e.translationY > 0) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e) => {
      "worklet";
      if (e.translationY > DRAG_CLOSE_DY || e.velocityY > DRAG_CLOSE_VY) {
        runOnJS(close)();
      } else {
        // 임계 미만 → 원위치로 스프링백.
        translateY.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  return { pan, sheetStyle, backdropStyle, close };
}
