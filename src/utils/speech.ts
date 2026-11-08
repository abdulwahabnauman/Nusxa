/**
 * On-device Text-to-Speech (TTS) utility for dose instructions.
 * Uses expo-speech to speak medication names, dosages, and instructions
 * in Urdu or English at an accessible, elderly-friendly pace with zero API latency.
 */

import * as Speech from 'expo-speech';

export interface DoseSpeechOptions {
  medicineName: string;
  dosage?: string | null;
  mealInstruction?: string | null;
  time?: string | null;
  language: 'en' | 'ur';
}

/**
 * Builds clear, grammatically natural spoken instructions in Urdu or English.
 * Strictly adheres to verified prescription data without hallucinating unverified claims.
 */
export function buildDoseSpeechText({
  medicineName,
  dosage,
  mealInstruction,
  time,
  language,
}: DoseSpeechOptions): string {
  if (language === 'ur') {
    let mealPhrase = '';
    if (mealInstruction === 'before') {
      mealPhrase = 'کھانے سے پہلے';
    } else if (mealInstruction === 'with') {
      mealPhrase = 'کھانے کے ساتھ';
    } else if (mealInstruction === 'after') {
      mealPhrase = 'کھانے کے بعد';
    }

    const dosagePart = dosage ? `، ${dosage}` : '';
    const mealPart = mealPhrase ? ` یہ دوا ${mealPhrase} لیں۔` : ' یہ دوا لیں۔';
    const timePart = time ? ` وقت: ${time}۔` : '';
    return `${medicineName}${dosagePart}۔${mealPart}${timePart}`.trim();
  }

  // English formatting
  let mealPhrase = '';
  if (mealInstruction === 'before') {
    mealPhrase = ' before meals';
  } else if (mealInstruction === 'with') {
    mealPhrase = ' with meals';
  } else if (mealInstruction === 'after') {
    mealPhrase = ' after meals';
  }

  const doseTarget = dosage ? `${dosage} of ${medicineName}` : medicineName;
  const timePart = time ? ` at ${time}` : '';
  return `Take ${doseTarget}${mealPhrase}${timePart}.`.trim();
}

/**
 * Speaks text using on-device TTS.
 * Safely stops any ongoing speech first.
 */
export async function speakDoseText(
  text: string,
  language: 'en' | 'ur',
  callbacks?: {
    onDone?: () => void;
    onStopped?: () => void;
    onError?: (error: Error) => void;
  }
): Promise<void> {
  try {
    const isSpeaking = await Speech.isSpeakingAsync().catch(() => false);
    if (isSpeaking) {
      await Speech.stop().catch(() => {});
    }

    const langTag = language === 'ur' ? 'ur-PK' : 'en-US';

    Speech.speak(text, {
      language: langTag,
      pitch: 1.0,
      rate: 0.85, // clear, accessible pacing for elderly patients
      onDone: () => {
        callbacks?.onDone?.();
      },
      onStopped: () => {
        callbacks?.onStopped?.();
      },
      onError: (err) => {
        callbacks?.onError?.(err instanceof Error ? err : new Error(String(err)));
      },
    });
  } catch (err) {
    callbacks?.onError?.(err instanceof Error ? err : new Error(String(err)));
  }
}

/**
 * Stops any active text-to-speech immediately.
 */
export async function stopDoseSpeech(): Promise<void> {
  try {
    await Speech.stop();
  } catch {
    // ignore
  }
}
