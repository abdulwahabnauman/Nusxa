/**
 * Reusable SpeechButton for Text-to-Speech (TTS) dose instruction readouts.
 * Provides accessible audio playback with instant stop toggle, active visual indicator,
 * and automatic cleanup on unmount.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { TouchableOpacity, StyleSheet, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/provider';
import { useI18n } from '../../i18n';
import { selectionHaptic } from '../../utils/haptics';
import { speakDoseText, stopDoseSpeech } from '../../utils/speech';

interface SpeechButtonProps {
  text: string;
  medicineName?: string;
  size?: number;
  color?: string;
  activeColor?: string;
  style?: ViewStyle;
}

export function SpeechButton({
  text,
  medicineName,
  size = 20,
  color,
  activeColor,
  style,
}: SpeechButtonProps) {
  const { colors } = useTheme();
  const { t, language } = useI18n();
  const [isSpeaking, setIsSpeaking] = useState(false);

  const defaultColor = color ?? colors.text.secondary;
  const highlightColor = activeColor ?? colors.accent.primary;

  // Cleanup on unmount so audio stops if user navigates away
  useEffect(() => {
    return () => {
      stopDoseSpeech();
    };
  }, []);

  const handlePress = useCallback(async () => {
    selectionHaptic();
    if (isSpeaking) {
      setIsSpeaking(false);
      await stopDoseSpeech();
      return;
    }

    setIsSpeaking(true);
    await speakDoseText(text, language, {
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  }, [isSpeaking, text, language]);

  const a11yLabel = isSpeaking
    ? t.dose.stopAudio
    : medicineName
      ? t.dose.listenA11y.replace('{name}', medicineName)
      : t.dose.listenInstructions;

  return (
    <TouchableOpacity
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={isSpeaking ? t.dose.stopAudio : t.dose.listenInstructions}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[
        styles.button,
        isSpeaking && { backgroundColor: highlightColor + '20' },
        style,
      ]}
    >
      <MaterialCommunityIcons
        name={isSpeaking ? 'volume-high' : 'volume-medium'}
        size={size}
        color={isSpeaking ? highlightColor : defaultColor}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 6,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 32,
    minHeight: 32,
  },
});
