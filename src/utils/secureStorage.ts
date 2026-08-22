import * as SecureStore from 'expo-secure-store';

const API_KEY_STORAGE_KEY = 'nusxa_gemini_api_key';
const OPENROUTER_KEY_STORAGE_KEY = 'nusxa_openrouter_api_key';

/** Save the Gemini API key securely (encrypted, device-level) — used for prescription OCR */
export async function saveApiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(API_KEY_STORAGE_KEY, key);
}

/** Retrieve the stored Gemini API key */
export async function getApiKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(API_KEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Delete the stored Gemini API key */
export async function deleteApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(API_KEY_STORAGE_KEY);
}

/** Get the Gemini API key from secure store or fall back to env variable */
export async function resolveApiKey(): Promise<string> {
  const stored = await getApiKey();
  if (stored) return stored;
  return process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';
}

/** Save the OpenRouter API key securely — used for the chat/explain features (Nemotron 3 Ultra) */
export async function saveOpenRouterKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(OPENROUTER_KEY_STORAGE_KEY, key);
}

/** Retrieve the stored OpenRouter API key */
export async function getOpenRouterKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(OPENROUTER_KEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Delete the stored OpenRouter API key */
export async function deleteOpenRouterKey(): Promise<void> {
  await SecureStore.deleteItemAsync(OPENROUTER_KEY_STORAGE_KEY);
}

/** Get the OpenRouter API key from secure store or fall back to env variable */
export async function resolveOpenRouterKey(): Promise<string> {
  const stored = await getOpenRouterKey();
  if (stored) return stored;
  return process.env.EXPO_PUBLIC_OPENROUTER_API_KEY ?? '';
}