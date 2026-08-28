// react-native stub — only Platform, which is all the service modules under
// test import from it (services/pushNotifications.ts).

export const __mock = {
  os: "android",
};

export const Platform = {
  get OS() {
    return __mock.os;
  },
};
