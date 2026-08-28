// expo-constants stub — only the EAS projectId lookup that
// services/pushNotifications.ts reads. Set `__mock.projectId = undefined`
// to exercise the missing-projectId branch.

export const __mock = {
  projectId: "harness-project-id",
};

const Constants = {
  get expoConfig() {
    return { extra: { eas: { projectId: __mock.projectId } } };
  },
};

export default Constants;
