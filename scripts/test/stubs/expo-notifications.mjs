// Controllable expo-notifications stub for the push-registration harness.
// Tests drive device state through `__mock`: OS permission status, the token
// the SDK would issue, or an issuance failure.

export const __mock = {
  permissionStatus: "undetermined",
  token: "ExponentPushToken[harness]",
  tokenError: null, // set to an Error to make getExpoPushTokenAsync throw
  channelCalls: [],
  tokenListeners: new Set(),
  reset() {
    this.permissionStatus = "undetermined";
    this.token = "ExponentPushToken[harness]";
    this.tokenError = null;
    this.channelCalls = [];
    this.tokenListeners.clear();
  },
};

export async function getPermissionsAsync() {
  return { status: __mock.permissionStatus };
}

export async function requestPermissionsAsync() {
  return { status: __mock.permissionStatus };
}

export async function setNotificationChannelAsync(id, config) {
  __mock.channelCalls.push({ id, config });
}

export async function getExpoPushTokenAsync() {
  if (__mock.tokenError) throw __mock.tokenError;
  return { data: __mock.token };
}

export function addPushTokenListener(listener) {
  __mock.tokenListeners.add(listener);
  return { remove: () => __mock.tokenListeners.delete(listener) };
}

export const AndroidImportance = { DEFAULT: 3 };
