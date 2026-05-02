import { Stack } from "expo-router";
import { ErrorScreen } from "@/components/ErrorScreen";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ErrorScreen
        errorCode="404"
        message="페이지를 찾을 수 없어요"
        subMessage="주소가 바뀌었거나 사라진 페이지예요"
      />
    </>
  );
}
