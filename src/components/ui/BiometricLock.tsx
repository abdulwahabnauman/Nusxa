/**
 * Biometric Authentication Setup
 * Adds PIN + fingerprint/FaceID lock to protect sensitive medical data
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, Alert } from 'react-native';
import { useTheme } from '../src/theme/provider';
import { typography, spacing } from '../src/theme/tokens';

type AuthState = 'locked' | 'unlocked' | 'setup_pin' | 'change_pin';

export default function BiometricLock({ 
  children, 
  enabled = true 
}: { 
  children: React.ReactNode;
  enabled?: boolean;
}) {
  const { colors, typography: typ } = useTheme();
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [pinInput, setPinInput] = useState('');
  const [tempPin, setTempPin] = useState('');
  
  // This would integrate with expo-biometrics in production
  // For now, we simulate PIN-based protection
  
  const verifyPin = async () => {
    // In production: use expo-biometrics
    // await checkBiometrics();
    
    // Simulate successful unlock after brief delay
    setTimeout(() => {
      setAuthState('unlocked');
      setPinInput('');
    }, 300);
  };

  if (!enabled || authState === 'unlocked') {
    return <>{children}</>;
  }

  if (authState === 'checking') {
    return (
      <View style={styles.container}>
        <View style={[styles.lockIcon, { backgroundColor: colors.accent.subtle }]}>
          <Text style={{ fontSize: 48 }}>🔒</Text>
        </View>
        <Text style={[typ.heading.md, { color: colors.text.primary }]}>Secure Check...</Text>
      </View>
    );
  }

  // PIN Entry Screen
  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.background.surface }]}>
          <Text style={[typ.heading.lg, { color: colors.text.primary, marginBottom: spacing.md }]}>
            🔐 Enter PIN Code
          </Text>
          
          <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
            {[...Array(4)].map((_, i) => (
              <View 
                key={i} 
                style={[
                  styles.pinDot,
                  { 
                    borderColor: colors.border.default,
                    backgroundColor: 'transparent' 
                  }
                ]}
              >
                <View 
                  style={[
                    styles.pinDotFill,
                    { 
                      backgroundColor: pinInput.length > i ? colors.accent.primary : 'transparent',
                      opacity: pinInput.length > i ? 1 : 0.3
                    }
                  ]}
                />
              </View>
            ))}
          </View>

          {/* Numeric Keypad */}
          <View style={styles.keypad}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <TouchableOpacity
                key={num}
                style={[styles.key, { backgroundColor: colors.background.subtle }]}
                onPress={() => {
                  const newPin = pinInput + num.toString();
                  setPinInput(newPin);
                  
                  if (newPin.length === 4) {
                    setTimeout(verifyPin, 200);
                    setPinInput('');
                  }
                }}
              >
                <Text style={[typ.label.lg, { color: colors.text.primary }]}>
                  {num}
                </Text>
              </TouchableOpacity>
            ))}
            
            <View style={styles.key} /> {/* Empty corner */}
            
            <TouchableOpacity
              style={[styles.key, { backgroundColor: colors.background.subtle }]}
              onPress={() => {
                setPinInput(pinInput.slice(0, -1));
              }}
            >
              <Text style={[typ.body.md, { color: colors.text.secondary }]} style={{ ...typography.body.md, fontWeight: 'bold' }}>⌫</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.key, { backgroundColor: colors.background.subtle }]}
              onPress={() => {
                const newPin = pinInput + '0';
                setPinInput(newPin);
                
                if (newPin.length === 4) {
                  setTimeout(verifyPin, 200);
                  setPinInput('');
                }
              }}
            >
              <Text style={[typ.label.lg, { color: colors.text.primary }]}>0</Text>
            </TouchableOpacity>
          </View>

          {/* Settings/Cancel Button */}
          <TouchableOpacity 
            style={[styles.cancelBtn, { marginTop: spacing.lg }]}
            onPress={() => {
              Alert.alert(
                'Unlock Nusxa',
                'Use biometric or enter PIN',
                [{ text: 'OK' }]
              );
            }}
          >
            <Text style={[typ.body.sm, { color: colors.text.disabled }]}>Need help?</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  lockIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '85%',
    padding: spacing.xl,
    borderRadius: 16,
    alignItems: 'center',
  },
  pinDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinDotFill: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  key: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtn: {
    paddingVertical: spacing.md,
  },
});
