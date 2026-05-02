import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  Radius,
  Shadows,
} from "@/constants/theme";

interface ProfileModalProps {
  visible: boolean;
  onClose: () => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
}

export function ProfileModal({
  visible,
  onClose,
  onLogout,
  onDeleteAccount,
}: ProfileModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          {/* Close button */}
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeBtn,
              pressed && { opacity: 0.5 },
            ]}
          >
            <Ionicons name="close" size={20} color={Colors.outline} />
          </Pressable>

          {/* Avatar */}
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={28} color={Colors.onSecondaryContainer} />
          </View>

          {/* Name */}
          <Text style={styles.userName}>admin</Text>

          {/* Account info */}
          <Text style={styles.accountInfo}>admin@keepeat.com</Text>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Logout */}
          <Pressable
            onPress={onLogout}
            style={({ pressed }) => [
              styles.logoutBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.logoutText}>로그아웃</Text>
          </Pressable>

          {/* Delete account */}
          <Pressable
            onPress={onDeleteAccount}
            style={({ pressed }) => [
              styles.deleteBtn,
              pressed && { opacity: 0.5 },
            ]}
          >
            <Text style={styles.deleteText}>회원 탈퇴</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing.xxl,
  },
  card: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radius.xxl,
    paddingHorizontal: Spacing.xxl,
    paddingTop: Spacing.xxl + 8,
    paddingBottom: Spacing.xl,
    width: "100%",
    maxWidth: 320,
    alignItems: "center",
    ...Shadows.ambient,
  },
  closeBtn: {
    position: "absolute",
    top: Spacing.md,
    right: Spacing.md,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },

  // Avatar
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.secondaryContainer,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.md,
  },
  avatarText: {
    fontSize: FontSize.headlineMd,
    fontWeight: FontWeight.bold,
    color: Colors.onSecondaryContainer,
  },

  // Info
  userName: {
    fontSize: FontSize.headlineSm,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
    marginBottom: Spacing.xs,
  },
  accountInfo: {
    fontSize: FontSize.bodySm,
    fontWeight: FontWeight.medium,
    color: Colors.outline,
    marginBottom: Spacing.lg,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: Colors.surfaceContainerHigh,
    width: "100%",
    marginBottom: Spacing.lg,
  },

  // Actions
  logoutBtn: {
    width: "100%",
    paddingVertical: Spacing.md + 2,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: "center",
  },
  logoutText: {
    fontSize: FontSize.bodyMd,
    fontWeight: FontWeight.bold,
    color: Colors.onSurface,
  },
  deleteBtn: {
    marginTop: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  deleteText: {
    fontSize: FontSize.labelMd,
    fontWeight: FontWeight.regular,
    color: Colors.outline,
    textDecorationLine: "underline",
  },
});
