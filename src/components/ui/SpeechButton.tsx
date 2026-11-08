/**
 * Reusable SpeechButton for Text-to-Speech (TTS) dose instruction readouts.
 * Features an organic dancing 4-bar audio equalizer waveform during active playback,
 * instant stop toggle, and global sync across medicine list cards.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AudioEqualizer } from './AudioEqualizer';
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

  // Global subscription so only one button dances/speaks at any moment
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
    ? (t.dose?.stopAudio ?? 'Stop audio')
    : medicineName
      ? (t.dose?.listenA11y ?? 'Listen to instructions for {name}').replace('{name}', medicineName)
      : (t.dose?.listenInstructions ?? 'Listen to instructions');

  return (
    <TouchableOpacity
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={isSpeaking ? (t.dose?.stopAudio ?? 'Stop audio') : (t.dose?.listenInstructions ?? 'Listen to instructions')}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[
        styles.button,
        isSpeaking && { backgroundColor: highlightColor + '20' },
        style,
      ]}
    >
      {isSpeaking ? (
        <AudioEqualizer color={highlightColor} size={size} isPlaying={true} />
      ) : (
        <MaterialCommunityIcons
          name="volume-medium"
          size={size}
          color={defaultColor}
        />
      )}
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
