import * as SecureStore from 'expo-secure-store';

const API_KEY_STORAGE_KEY = 'nusxa_gemini_api_key';

/** Save the API key securely (encrypted, device-level) */
export async function saveApiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(API_KEY_STORAGE_KEY, key);
}

/** Retrieve the stored API key */
export async function getApiKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(API_KEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Delete the stored API key */
export async function deleteApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(API_KEY_STORAGE_KEY);
}

/** Get the API key from secure store or fall back to env variable */
export async function resolveApiKey(): Promise<string> {
  const stored = await getApiKey();
  if (stored) return stored;
  return process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? '';
}
