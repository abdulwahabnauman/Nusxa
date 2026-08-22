import React from 'react';
import {
  Modal as RNModal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/provider';

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  showClose?: boolean;
}

export function Modal({
  visible,
  onClose,
  title,
  children,
  showClose = true,
}: ModalProps) {
  const { colors, typography, spacing, borderRadius } = useTheme();

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.wrapper}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="none"
        >
          <View style={{ flex: 1 }} />
        </TouchableOpacity>
        <View
          style={[
            styles.content,
            {
              backgroundColor: colors.background.surface,
              borderRadius: borderRadius.xl,
              padding: spacing.xl,
              maxHeight: '80%',
            },
          ]}
        >
          {title && (
            <View style={styles.header}>
              <Text style={[typography.heading.h3, { color: colors.text.primary }]}>
                {title}
              </Text>
              {showClose && (
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeButton}
                  accessibilityLabel="Close dialog"
                  accessibilityRole="button"
                >
                  <MaterialCommunityIcons
                    name="close"
                    size={24}
                    color={colors.text.secondary}
                  />
                </TouchableOpacity>
              )}
            </View>
          )}
          <ScrollView showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  content: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  closeButton: {
    padding: 4,
  },
});
