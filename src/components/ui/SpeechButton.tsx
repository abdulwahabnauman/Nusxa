/**
 * Reusable SpeechButton for Text-to-Speech (TTS) dose instruction readouts.
 * Provides accessible audio playback with instant stop toggle, active visual indicator,
 * and automatic cleanup on unmount.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/provider';
import { useI18n } from '../../i18n';
import { selectionHaptic } from '../../utils/haptics';
import { speakDoseText, stopDoseSpeech, subscribeSpeech } from '../../utils/speech';

interface SpeechButtonProps {
  text: string;
  medicineName?: string;
  size?: number;
  color?: string;
  activeColor?: string;
  style?: StyleProp<ViewStyle>;
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
  const [activeSpeechText, setActiveSpeechText] = useState<string | null>(null);

  const defaultColor = color ?? colors.text.secondary;
  const highlightColor = activeColor ?? colors.accent.primary;
  const isSpeaking = activeSpeechText === text;

  // Subscribe to global TTS playback to stay in sync across list items
  useEffect(() => {
    const unsubscribe = subscribeSpeech((currentlySpeaking) => {
      setActiveSpeechText(currentlySpeaking);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const handlePress = useCallback(async () => {
    selectionHaptic();
    if (isSpeaking) {
      await stopDoseSpeech();
      return;
    }

    await speakDoseText(text, language);
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
