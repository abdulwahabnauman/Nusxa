import * as FileSystem from 'expo-file-system/legacy';
import type { ChatMessage } from '../ai/types';

/**
 * Chat history is persisted to a local JSON file so conversations survive
 * app restarts. It is only wiped when the user explicitly taps "Clear".
 */
const HISTORY_FILE = `${FileSystem.documentDirectory}chat_history.json`;
const MAX_MESSAGES = 200; // keep the file small; oldest messages are dropped first

export async function loadChatHistory(): Promise<ChatMessage[]> {
  try {
    const info = await FileSystem.getInfoAsync(HISTORY_FILE);
    if (!info.exists) return [];
    const raw = await FileSystem.readAsStringAsync(HISTORY_FILE);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is ChatMessage =>
        m && typeof m.id === 'string' && typeof m.content === 'string' &&
        (m.role === 'user' || m.role === 'assistant')
    );
  } catch {
    return [];
  }
}

export async function saveChatHistory(messages: ChatMessage[]): Promise<void> {
  try {
    const trimmed = messages.slice(-MAX_MESSAGES);
    await FileSystem.writeAsStringAsync(HISTORY_FILE, JSON.stringify(trimmed));
  } catch {
    // persistence is best-effort — never block the chat UI
  }
}

export async function clearChatHistory(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(HISTORY_FILE);
    if (info.exists) {
      await FileSystem.deleteAsync(HISTORY_FILE, { idempotent: true });
    }
  } catch {
    // ignore
  }
}
