/**
 * KeepEat — first-run push permission prompt.
 *
 * 친절한 사전 안내(soft ask) 후 사용자 동의가 있을 때만 OS 권한 팝업을
 * 띄운다. OS 팝업은 권한 상태가 'undetermined'일 때 단 한 번만 띄울 수
 * 있으므로 — 한 번 거부되면 코드로 다시 못 띄움 — 이 단계를 신중하게
 * 보여줘야 한다.
 *
 * 발화 조건 (셋 다 만족):
 *   1) 사용자가 인증된 상태
 *   2) AsyncStorage에 "물어봤음" 플래그 없음
 *   3) OS 권한 상태가 'undetermined'
 *
 * "허용" → requestPermissionsAsync로 OS 시스템 다이얼로그 → granted면
 * syncPushTokenWithServer로 토큰 발급/등록까지 자연 이어짐.
 * "나중에" → 아무 동작 안 함. 플래그는 두 버튼 모두에서 저장되어 다음
 * 부팅부터는 자동으로 안 뜬다.
 *
 * 마이페이지의 토글 ON 시도 / 보조 경고 행은 별개 진입점 — 이 컴포넌트는
 * 첫 진입(soft ask)만 책임진다.
 */

import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useAuth } from "@/context/AuthContext";
import { syncPushTokenWithServer } from "@/services/pushNotifications";

const ASKED_KEY = "keepeat:askedPushPermission";

export function PushPermissionPrompt() {
  const { isAuthenticated } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const asked = await AsyncStorage.getItem(ASKED_KEY);
        if (asked === "true") return;
        const { status } = await Notifications.getPermissionsAsync();
        // 이미 granted/denied면 사전 안내 의미 없음. undetermined만 진행.
        if (status !== "undetermined") return;
        if (!cancelled) setVisible(true);
      } catch {
        // 권한 API 없는 환경(웹 등) — 사전 안내 자체를 생략.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const markAsked = async () => {
    try {
      await AsyncStorage.setItem(ASKED_KEY, "true");
    } catch {
      // 플래그 저장 실패는 치명적이지 않음 — 다음 부팅에 한 번 더 뜨는
      // 정도가 최악. 사용자 흐름 막지 않는다.
    }
  };

  const handleAllow = async () => {
    setVisible(false);
    await markAsked();
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === "granted") {
        // 권한 획득 → 로그인 시점엔 토큰을 발급 못했으므로 (registerForPush…가
        // granted 아닐 땐 null 반환) 여기서 새로 sync. 실패해도 swallow.
        syncPushTokenWithServer();
      }
    } catch {
      // OS 다이얼로그 호출 실패 — 무시. 이후 토글에서 다시 시도 가능.
    }
  };

  const handleLater = async () => {
    setVisible(false);
    await markAsked();
  };

  return (
    <ConfirmModal
      visible={visible}
      title="알림을 받아볼까요?"
      subtitle={"소비기한이 임박한 식재료와\n레시피 완성 소식을 바로 알려드려요"}
      confirmLabel="허용"
      cancelLabel="나중에"
      onConfirm={handleAllow}
      onCancel={handleLater}
    />
  );
}
