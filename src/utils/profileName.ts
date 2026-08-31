import { getProfile, updateProfile } from '../db/repositories/profile';
import { useAuthStore } from '../stores/auth-store';
import { resolveTextProviderKeys } from './secureStorage';
import { isAiProxyConfigured } from '../constants/config';
import {
  NAME_TRANSLITERATION_SYSTEM_PROMPT,
  buildNameTransliterationRequest,
} from '../ai/prompts';
import type { Profile } from '../types/models';

type Language = 'en' | 'ur';

/** Urdu / Arabic script range used to validate AI transliteration output */
const URDU_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_SCRIPT = /[A-Za-z]/;

/**
 * The name to show for the current app language. Urdu mode prefers the
 * Urdu-script column, English mode the Latin one; each falls back to the
 * other column so a user is never greeted with an empty name while the
 * background transliteration sync hasn't run (or failed).
 */
export function getLocalizedName(
  profile: Pick<Profile, 'name' | 'name_ur'> | null | undefined,
  language: Language
): string | null {
  if (!profile) return null;
  if (language === 'ur') return profile.name_ur || profile.name || null;
  return profile.name || profile.name_ur || null;
}

/**
 * Best-effort background sync of the OTHER language's name column after the
 * user saves their name in one language (onboarding or Settings). Uses the
 * AI text provider to transliterate the name; every failure mode (no keys,
 * offline, bad JSON, wrong script in the result) is swallowed silently so a
 * name save never depends on the network.
 */
export async function syncOtherLanguageName(
  savedName: string,
  savedLanguage: Language
): Promise<void> {
  const source = savedName.trim();
  if (!source) return;

  try {
    const keys = await resolveTextProviderKeys();
    if (!isAiProxyConfigured() && !keys.openRouterKey && !keys.groqKey) return;

    // Lazy-load the AI client so name saves never pay for the network stack
    const { chatCompletion } = require('../ai/client') as typeof import('../ai/client');

    const raw = await chatCompletion(
      NAME_TRANSLITERATION_SYSTEM_PROMPT,
      buildNameTransliterationRequest(source, savedLanguage),
      keys
    );

    const parsed = JSON.parse(raw) as { name?: unknown; name_ur?: unknown };

    if (savedLanguage === 'ur') {
      const latin = typeof parsed.name === 'string' ? parsed.name.trim() : '';
      if (!latin || !LATIN_SCRIPT.test(latin)) return;
      // Stale-write guard: skip when the user edited the source name again
      // while the AI call was still in flight.
      const current = await getProfile();
      if (!current || (current.name_ur ?? '') !== source) return;
      await updateProfile({ name: latin });
      useAuthStore.getState().updateProfile({ name: latin });
    } else {
      const urdu = typeof parsed.name_ur === 'string' ? parsed.name_ur.trim() : '';
      if (!urdu || !URDU_SCRIPT.test(urdu)) return;
      const current = await getProfile();
      if (!current || (current.name ?? '') !== source) return;
      await updateProfile({ name_ur: urdu });
      useAuthStore.getState().updateProfile({ name_ur: urdu });
    }
  } catch (error) {
    console.debug('Name transliteration sync skipped:', error);
  }
}

/**
 * Backfill for the selected language: upgrade installs and language switches
 * can leave the current language's column empty while the other language has
 * a name. Transliterates from the populated column so Urdu mode shows an
 * Urdu name (and vice versa). No-op when the column is already filled or
 * both are empty.
 */
export async function ensureNameForLanguage(language: Language): Promise<void> {
  try {
    const profile = await getProfile();
    if (!profile) return;
    if (language === 'ur') {
      if (!profile.name_ur && profile.name) {
        await syncOtherLanguageName(profile.name, 'en');
      }
    } else if (!profile.name && profile.name_ur) {
      await syncOtherLanguageName(profile.name_ur, 'ur');
    }
  } catch (error) {
    console.debug('Name backfill skipped:', error);
  }
}
