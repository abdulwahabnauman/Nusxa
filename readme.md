# Nusxa — Developer Handoff Guide

## What Is Nusxa?

Nusxa (pronounced "nukh-sa") is an **AI Medication Companion** mobile app built with React Native + Expo. It scans prescriptions using the phone camera, extracts medicine information with AI, creates medication schedules with reminders, and tracks adherence over time.

**Target users**: Patients managing medications, especially elderly users who need a simple, accessible interface.

---

## Quick Start

### Prerequisites
- **Node.js v20+** (LTS) — https://nodejs.org
- **Expo Go** app on a phone (for quick testing) — Play Store / App Store
- **A free Google Gemini API key** — https://aistudio.google.com/app/apikey (prescription scanning)
- **A free OpenRouter API key** — https://openrouter.ai/keys (chat/explanations, primary)
- **A free Groq API key** — https://console.groq.com/keys (chat/explanations, fallback)

### Run the App
```bash
cd nusxa
npm install
npx expo start
```
Scan the QR code with Expo Go on your phone.

> **Important**: Use `npx expo start --clear` whenever you change `.env` values or make structural changes, to clear the Metro bundler cache.

> **Note on `npm install` warnings**: you may see an `ERESOLVE` peer dependency warning involving `react-dom`. This is harmless — `react-dom` isn't a real dependency of this app, it only gets pulled in transitively by `expo-router`'s web tooling, which we don't use (Nusxa is Android/iOS only). If `npm install` fails outright rather than just warning, run `npm install --legacy-peer-deps` instead.

> **Web mode (`npx expo start` then pressing `w`) is not supported.** `react-native-web` isn't a real pinned dependency here, it resolves to whatever version npm happens to pick, which is usually incompatible. This app targets Android/iOS only — don't chase web bundling errors, they're expected.

### Configure the AI Services
Nusxa uses three separate free-tier AI providers, split by task:

1. **Gemini** (vision/OCR) — get a key from https://aistudio.google.com/app/apikey
2. **OpenRouter** (chat/explanations, primary) — get a key from https://openrouter.ai/keys
3. **Groq** (chat/explanations, fallback when OpenRouter's free quota runs out) — get a key from https://console.groq.com/keys

Enter all three in **Settings**, each has its own card and input field. Keys are stored via `expo-secure-store` (encrypted on-device). Alternatively, set them in `.env`:
```
EXPO_PUBLIC_GEMINI_API_KEY=your_key_here
EXPO_PUBLIC_OPENROUTER_API_KEY=your_key_here
EXPO_PUBLIC_GROQ_API_KEY=your_key_here
```
(then restart with `--clear`)

---

## Tech Stack

| Layer              | Technology                              |
|--------------------|-----------------------------------------|
| Framework          | React Native 0.81.5 + Expo SDK 54       |
| Language           | TypeScript (strict mode)                |
| Navigation         | Expo Router v6 (file-based routing)     |
| State Management   | Zustand v5 (3 stores: auth, theme, settings) |
| Database           | expo-sqlite (SQLite, offline-first)     |
| AI — Vision/OCR    | Google Gemini 2.5 Flash (free tier)     |
| AI — Chat/Explain  | Nemotron 3 Ultra via OpenRouter (free, primary), Groq gpt-oss-120b (free, fallback) |
| Notifications      | expo-notifications (local scheduled)    |
| Secure Storage     | expo-secure-store (3 API keys: Gemini, OpenRouter, Groq) |
| Splash             | expo-splash-screen + custom animated capsule-halves intro |
| Theming            | Custom token system (light/dark/elderly)|
| i18n               | Custom context (English + Urdu/RTL)     |

---

## Project Structure

```
nusxa/
├── app/                          # Screens (Expo Router file-based routing)
│   ├── _layout.tsx               # Root layout — providers, DB init, auth check
│   ├── onboarding.tsx            # First-run flow (name, permissions)
│   ├── scan.tsx                  # Camera + gallery image picker
│   ├── processing.tsx            # AI pipeline progress screen
│   ├── review.tsx                # Prescription review + field editing
│   ├── schedule.tsx              # Schedule confirmation (creates DB records + notifications)
│   ├── chat.tsx                  # AI chat about medicines
│   ├── doctor-visit.tsx          # Doctor visit report generator
│   ├── emergency-card.tsx        # Emergency info card
│   ├── medicine/
│   │   └── [id].tsx              # Medicine detail page (dynamic route)
│   └── (tabs)/                   # Bottom tab navigation
│       ├── _layout.tsx           # Tab bar config (Home, Medicines, History, Settings)
│       ├── index.tsx             # Home — today's schedule, adherence ring, streak, weekly chart
│       ├── medicines.tsx         # Active medicines list with refill estimates
│       ├── history.tsx           # Prescription history with search, archive, delete
│       └── settings.tsx          # Theme, language, API key, data export
│
├── assets/                       # App icons and splash images (all 1024x1024)
│   ├── icon.png                  # App store icon
│   ├── adaptive-icon.png         # Android adaptive icon foreground
│   ├── splash-icon.png           # Native OS splash image (shown before JS loads, set in app.json)
│   ├── notification-icon.png     # Notification bar icon (flat white silhouette, transparent bg)
│   ├── icon-half-navy.png        # Navy half of the capsule, used by the custom animated splash
│   └── icon-half-white.png       # White half of the capsule, used by the custom animated splash
│
├── src/
│   ├── ai/                       # AI integration
│   │   ├── client.ts             # AI clients — Gemini (vision, OCR only) + Nemotron/Groq (text, chat/explain)
│   │   ├── pipeline.ts           # OCR pipeline: image → base64 → Gemini → parse → validate
│   │   ├── prompts.ts            # System prompts for OCR, interpretation, and chat
│   │   └── types.ts              # PrescriptionJSON, MedicineJSON, ValidationResult types
│   │
│   ├── components/
│   │   ├── medicine/             # Medicine-specific components
│   │   │   ├── MedicineCard.tsx  # Card with schedule times + refill info
│   │   │   ├── DoseItem.tsx      # Single dose row (taken/skip/pending)
│   │   │   ├── ScheduleTimeline.tsx  # Vertical timeline of doses
│   │   │   └── VerificationField.tsx # Editable field with confidence indicator
│   │   ├── progress/             # Adherence tracking components
│   │   │   ├── AdherenceRing.tsx # Circular progress ring
│   │   │   ├── StreakCounter.tsx # Non-shaming streak display
│   │   │   └── WeeklyChart.tsx   # 7-day bar chart
│   │   └── ui/                   # Reusable UI primitives
│   │       ├── Badge.tsx, Button.tsx, Card.tsx
│   │       ├── EmptyState.tsx, Input.tsx, Modal.tsx
│   │       ├── ProgressSteps.tsx, Skeleton.tsx, Toast.tsx
│   │       ├── AnimatedSplash.tsx # Custom post-JS splash: capsule halves slide together
│   │
│   ├── constants/
│   │   ├── config.ts             # App-wide constants (API URL, timeouts, thresholds)
│   │   └── medical.ts            # Medical reference data (blood groups, interactions)
│   │
│   ├── db/                       # SQLite database layer
│   │   ├── database.ts           # Connection manager (open, get, close)
│   │   ├── schema.ts             # SQL CREATE statements (v2 schema)
│   │   ├── migrations.ts         # Migration runner (version-based)
│   │   └── repositories/         # Data access layer (one file per table)
│   │       ├── profile.ts        # Profile CRUD (single-row, id=1)
│   │       ├── prescription.ts   # Prescription CRUD + search
│   │       ├── medicine.ts       # Medicine CRUD + inventory update
│   │       ├── schedule.ts       # Schedule CRUD + active queries
│   │       └── dose.ts           # Dose record CRUD + today's records
│   │
│   ├── hooks/
│   │   ├── useNotificationHandler.ts  # Notification tap → navigate to medicine
│   │   └── useReducedMotion.ts        # Reads reduced motion preference
│   │
│   ├── i18n/                     # Internationalization
│   │   ├── index.tsx             # I18nProvider context + useTranslation hook
│   │   ├── en.ts                 # English translations (defines TranslationKeys type)
│   │   └── ur.ts                 # Urdu translations (typed against en.ts)
│   │
│   ├── stores/                   # Zustand state stores
│   │   ├── auth-store.ts         # User profile (loaded from DB on startup)
│   │   ├── theme-store.ts        # Theme preference + elderly mode
│   │   └── settings-store.ts     # Language, notifications, reduced motion
│   │
│   ├── theme/
│   │   ├── provider.tsx          # ThemeProvider (resolves system/light/dark)
│   │   ├── tokens.ts             # Color tokens for light + dark themes
│   │   ├── typography.ts         # Font sizes, weights, line heights
│   │   └── spacing.ts            # Spacing scale (xs, sm, base, md, lg, xl)
│   │
│   ├── types/
│   │   ├── models.ts             # Database model interfaces (Profile, Medicine, etc.)
│   │   └── navigation.ts         # Route param types
│   │
│   └── utils/
│       ├── date.ts               # Date helpers (ISO, getTodayRange, getLast7Days)
│       ├── export.ts             # JSON data export via Share API
│       ├── inventory.ts          # Refill estimation from frequency strings
│       ├── notifications.ts      # Local notification scheduling
│       ├── secureStorage.ts      # expo-secure-store wrapper for all 3 API keys (Gemini, OpenRouter, Groq)
│       └── validation.ts         # Input validation helpers
│
├── .env                          # Environment variables (gitignored)
├── .gitignore
├── app.json                      # Expo configuration
├── package.json
└── tsconfig.json
```

---

## Database Schema (v2)

5 tables with foreign key cascades:

```
profile (id=1, singleton)
├── name, date_of_birth, blood_group, allergies (JSON array)
├── emergency_contact (JSON: {name, phone}), primary_physician
├── elderly_mode (bool), language (text, default 'en')
└── onboarding_complete (bool)

prescriptions
├── id (UUID), doctor_name, hospital, date, follow_up_date
├── source_image_uri, verification_status, overall_confidence
├── treatment_status (active/completed/archived)
└── → medicines (cascade delete)

medicines
├── id (UUID), prescription_id (FK)
├── name, generic_name, brand_name, strength, form
├── dosage, frequency, meal_instruction, duration, purpose
├── side_effects (JSON), food_interactions (JSON), warnings (JSON)
├── confidence, verification_status
├── initial_quantity, remaining_quantity
└── → schedules (cascade delete)

schedules
├── id (UUID), medicine_id (FK)
├── time (HH:MM), timezone, frequency, meal_instruction
├── start_date, end_date, is_active, notification_id
└── → dose_records (cascade delete)

dose_records
├── id (UUID), schedule_id (FK), medicine_id (FK)
├── scheduled_time, actual_time, status (taken/skipped/missed/pending)
└── notes
```

---

## Key Flows

### Prescription Scan Flow
```
scan.tsx (camera/gallery)
  → copies image to persistent storage (fixes Expo Go temp file cleanup)
  → passes URI to processing.tsx
    → pipeline.ts: imageToBase64() → visionCompletion() → parseOCRResponse() → validatePrescription()
  → review.tsx (user verifies/edits extracted fields)
    → schedule.tsx (creates prescription + medicines + schedules + notifications in DB)
      → redirects to home screen
```

### Daily Dose Tracking Flow
```
Home screen loads active schedules from DB
  → maps to TodayScheduleItem[] with status from dose_records
  → "Taken" button: recordDoseTaken() + decrement inventory
  → "Skip" button: recordDoseSkipped()
  → Stats update: AdherenceRing, StreakCounter, WeeklyChart
```

### Notification Flow
```
schedule.tsx → scheduleDoseNotification() (expo-notifications)
  → notification fires at scheduled time
  → user taps notification
  → useNotificationHandler hook → router.push('/medicine/[id]')
```

---

## Important Architectural Decisions

### 1. AI Backend: Split by Task Across Three Free-Tier Providers
Nusxa doesn't use one AI provider — vision and text are split, because no single free model does both well:

- **Vision/OCR** (reading the prescription photo) → **Google Gemini 2.5 Flash**
  - Config: `src/constants/config.ts` → `GEMINI_MODEL`, `GEMINI_API_BASE`
  - Free tier: 1,500 requests/day, 15/min
  - Note: Gemini 1.5 Flash (the original model this app shipped with) was shut down by Google and returns 404 — if you ever see 404s from Gemini, check `GEMINI_MODEL` hasn't drifted back to an old/retired model name
- **Chat/explanations** (medicine info, chat companion) → **Nemotron 3 Ultra via OpenRouter** (primary), falling back to **Groq's gpt-oss-120b** (free, ~1,000 req/day) if OpenRouter's free quota (much lower, ~50 req/day) is exhausted
  - Config: `src/constants/config.ts` → `OPENROUTER_API_BASE`, `NEMOTRON_MODEL`, `GROQ_API_BASE`, `GROQ_MODEL`
  - Client: `src/ai/client.ts` — `callOpenAICompatible()` is the shared caller for both (they're both OpenAI-compatible chat endpoints), `callTextModel()` tries OpenRouter first, then Groq
  - `chatCompletion()` and `multiTurnChat()` both take a `TextProviderKeys` object (`{ openRouterKey, groqKey }`), not a single key

All AI calls go through `src/ai/client.ts`.

### 2. Secure Storage: Three Separate API Keys
- `expo-secure-store` (encrypted on-device) via `src/utils/secureStorage.ts`
- Three independent key pairs: `saveApiKey`/`getApiKey` (Gemini), `saveOpenRouterKey`/`getOpenRouterKey`, `saveGroqKey`/`getGroqKey` — each with matching `delete*` and `resolve*` (checks secure store, falls back to `.env`) functions
- `resolveTextProviderKeys()` resolves both text-provider keys at once, used by every chat/explain call site
- Users enter/remove keys in **Settings** — there are three separate cards, one per provider

### 3. Image Persistence (Expo Go Fix)
- **Problem**: Expo Go's ImagePicker creates temp files that get cleaned up before processing
- **Fix** (in `scan.tsx`): `persistImage()` copies to `FileSystem.documentDirectory` immediately
- Old images auto-cleaned (keeps only 3 most recent)
- Pipeline (`pipeline.ts`) has a `getInfoAsync` existence check before reading

### 4. i18n and RTL (Urdu)
- Translation files: `src/i18n/en.ts` (defines types), `src/i18n/ur.ts` (typed against en)
- Provider: `src/i18n/index.tsx` — wraps app in `_layout.tsx`
- Hooks: `useI18n()` returns `{ t, language, isRTL, setLanguage }`
- `useTranslation()` returns just the `t` object
- Language persisted in DB (`profile.language` column, added in migration v2)
- On app start: language synced from DB → settings store → I18nProvider
- RTL: `I18nManager.forceRTL(true)` when Urdu selected (requires app restart)
- **Tab labels** in `(tabs)/_layout.tsx` use `t.nav.*` translations

### 5. Verification Gate Pattern
- Reminders are only scheduled AFTER the user confirms the prescription on the review screen
- This prevents incorrect AI extractions from generating wrong reminders

### 6. Snake_case DB ↔ camelCase Zustand
- Database columns use snake_case (`onboarding_complete`, `elderly_mode`)
- Zustand auth store imports the `Profile` type directly from `models.ts`
- No intermediate mapping layer — stores use the DB type directly

### 7. Two-Stage Splash Screen
There are two separate splash moments, easy to mix up:
1. **Native OS splash** — shown before JS loads at all, fully static (OS constraint, cannot be animated). Controlled by `app.json`'s `"splash"` key, uses `assets/splash-icon.png`.
2. **Custom animated splash** (`src/components/ui/AnimatedSplash.tsx`) — takes over the instant JS boots. Two separate capsule-half images (`assets/icon-half-navy.png`, `assets/icon-half-white.png`) slide in from opposite corners along the capsule's own diagonal and snap together, then the screen fades into the app. Wired up in `app/_layout.tsx` via `SplashScreen.preventAutoHideAsync()` / `hideAsync()`.

This only renders in a real build (dev client or APK) — Expo Go can't fully replicate custom splash behavior, so don't expect to see it while testing in Expo Go.

---

## Adding a New Screen

1. Create a file in `app/` — Expo Router picks it up automatically
2. For a tab screen, add it in `app/(tabs)/` and register in `(tabs)/_layout.tsx`
3. Import `useTheme()` from `src/theme/provider` for colors/typography
4. Import `useTranslation()` from `src/i18n` for translated strings
5. Add translation keys to both `en.ts` and `ur.ts`

---

## Adding a New Translation String

1. Add the key to `src/i18n/en.ts` (this defines the type)
2. Add the matching key to `src/i18n/ur.ts` (TypeScript enforces completeness)
3. Use it in components: `const t = useTranslation(); <Text>{t.settings.newKey}</Text>`

---

## Building for Production (APK/AAB)

### Option A: EAS Build (Cloud — Recommended)
```bash
npm install -g eas-cli
eas login                                    # Create account at expo.dev
eas build:configure                          # Generates eas.json
eas build --platform android --profile preview   # Builds APK in cloud
```

### Option B: Local Build (Android Studio required)
```bash
npx expo prebuild --platform android --clean
cd android
./gradlew assembleDebug     # fast, self-signed, good for internal testing
# or
./gradlew assembleRelease   # needs a signing keystore first
```
APK output:
- Debug: `android/app/build/outputs/apk/debug/app-debug.apk`
- Release: `android/app/build/outputs/apk/release/app-release.apk`

`android/` is a generated folder (regenerated by `prebuild`, not hand-edited) — keep it in `.gitignore`.

### Publishing an APK via GitHub Releases
Repo → **Releases** tab → **Draft a new release** → choose/create a version tag (e.g. `v1.0.0`) → drag the `.apk` into the binary attachment box → **Publish release**. Anyone can then download it directly from the repo without cloning or building.

### Development Builds vs. Expo Go
Pressing `s` in `npx expo start` toggles Metro to target a dev-client build instead of Expo Go. This only works if `expo-dev-client` is installed **and** you have an actual dev-client build installed on the test device — otherwise you'll see "Unable to determine the default URI scheme," which just means it fell back to Expo Go. Not needed for normal development; only relevant once testing features Expo Go can't run (background push, this app's custom animated splash, etc).

### EAS Configuration (create `eas.json`)
```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  }
}
```

- **preview** profile → generates an installable APK
- **production** profile → generates an AAB for Play Store upload

---

## Known Limitations / Things to Improve

| Area | Status | Notes |
|------|--------|-------|
| Urdu translation coverage | Very partial | Only `app/(tabs)/settings.tsx` and the tab bar labels (`app/(tabs)/_layout.tsx`) actually call `useTranslation()`. Switching to Urdu changes those two things only — every other screen (home, medicines, history, chat, onboarding, scan, processing, review, schedule, doctor visit, emergency card, medicine detail) is hardcoded English regardless of language setting. Full Urdu support needs every screen wired to `t.*` strings, not just a translation-file update. |
| RTL layout | Partial, blocked by the above | `I18nManager.forceRTL` works, but since most screens aren't translated yet, RTL layout has barely been exercised. Some custom components may need manual `flexDirection: 'row-reverse'` adjustments once more screens are actually translated. |
| Notifications in background | Expo Go limitation | Local notifications work, but background execution (when app is fully closed) requires a dev client or production build |
| Web platform | Not supported | `react-native-web` isn't a real pinned dependency; `npx expo start` → `w` will fail to bundle. Android/iOS only, by design |
| Camera focus | Basic | No auto-focus indicator or tap-to-focus in the scanner. The `expo-camera` API supports this if needed. |
| Offline AI | Not implemented | All AI calls require internet. Consider on-device ML models for offline scanning. |
| Data backup | Not implemented | No cloud sync. All data is local SQLite only. |
| Push notifications | Not implemented | Only local scheduled notifications. Firebase/OneSignal needed for true remote push — unrelated to Expo Go's SDK 53+ restriction, which only blocks remote push *inside Expo Go specifically*; a real APK build is unaffected by that particular restriction. |
| Tablet layout | Not optimized | `supportsTablet: true` but no tablet-specific layouts |
| App locking | Not implemented | No biometric/PIN lock. Consider adding for medication privacy. |
| Elderly mode | Minimal — larger text only | `getTypography(elderly)` in `src/theme/typography.ts` is the entire implementation: it swaps to a larger font-size scale, that's it. No larger tap targets, no simplified/reduced-step navigation, no higher-contrast palette, no simplified icons or copy. For the target elderly-user audience this needs real design work, not just a checkbox that bumps font size. |
| Accessibility (general) | Basic | Has reduced motion toggle. Could add screen reader labels to more elements. |
| Theme/settings persistence | In-memory only | Theme store and settings store (except language) don't persist to DB — they reset on app restart. Consider adding DB columns for `notifications_enabled`, `reduced_motion`, `theme_preference`. |

---

## Common Issues and Fixes

### "Image file not found" after scanning
- **Cause**: Expo Go temp file cleanup (fixed in scan.tsx with `persistImage`)
- **If it recurs**: Check that `FileSystem.copyAsync` succeeds, and the document directory has write permission

### Gemini API returns 429 (rate limit)
- Free tier: 15 requests/minute, 1,500/day for vision/OCR. The client auto-retries with exponential backoff (2 retries)
- If frequent, consider caching OCR results

### Chat/explain feature seems slow or fails intermittently
- OpenRouter's free Nemotron tier has a low daily quota (~50 req/day). When exhausted, `callTextModel()` in `client.ts` automatically retries with backoff before falling to Groq — this adds a few seconds of delay right at the point the quota runs out, that's expected, not a bug
- If both OpenRouter and Groq keys are empty/invalid, the chat feature will show a "unable to connect" message rather than crash

### Red "Console Error" screen on Android in Expo Go mentioning expo-notifications
- Expected, not a bug. `expo-notifications` auto-registers for a push token the instant it's imported. On iOS in Expo Go this only logs a soft warning; on Android specifically, Expo Go escalates the same situation to a hard `console.error`, which shows as a red overlay
- Root cause is identical to the iOS warning: Expo Go removed remote push support starting SDK 53. Dismiss the overlay and keep going, local scheduled reminders still work fine in Expo Go
- Goes away entirely once you're testing on a real dev build or APK instead of Expo Go, since that restriction is Expo-Go-specific

### Notifications not showing
- Expo Go: notifications only work when app is foregrounded or recently used
- Production build needed for true background notifications
- Check `expo-notifications` permission was granted in onboarding

### Red console error on Android in Expo Go: "expo-notifications: Android Push notifications..."
- `expo-notifications` auto-registers for a push token the moment it's imported, and this fails on Android specifically in Expo Go (SDK 53+ removed remote push support there). iOS only logs it as a soft warning; Android escalates it to a hard `console.error`, hence the red overlay.
- This is expected, not a bug in this codebase, and doesn't block anything — dismiss it and keep going. Local scheduled reminders still work fine in Expo Go.
- It goes away entirely once you're testing on a real dev build or APK instead of Expo Go.
- Deliberately **not suppressed** with `LogBox.ignoreLogs` — kept visible on purpose so it stays a visible reminder of the Expo Go limitation rather than silently hidden.

### Database migration errors
- Migrations are versioned in `src/db/migrations.ts`
- Current schema version: **2**
- If you get migration errors, delete the app data and restart (or increment `SCHEMA_VERSION` in schema.ts and add a new migration)

### TypeScript errors after pulling changes
```bash
npx tsc --noEmit    # Check for type errors
npx expo start --clear   # Clear cache and restart
```

---

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `EXPO_PUBLIC_GEMINI_API_KEY` | Fallback Gemini key (vision/OCR) if secure store is empty | For scanning |
| `EXPO_PUBLIC_OPENROUTER_API_KEY` | Fallback OpenRouter key (chat/explain, primary) if secure store is empty | For chat/explain |
| `EXPO_PUBLIC_GROQ_API_KEY` | Fallback Groq key (chat/explain, fallback provider) if secure store is empty | For chat/explain fallback |

The `.env` file is gitignored. Users should enter API keys through the Settings screen (secure store) rather than the `.env` file for production use.

---

## Key File Quick Reference

| Want to change... | Edit this file |
|-------------------|---------------|
| App name, icons, splash | `app.json` |
| Tab bar labels/icons | `app/(tabs)/_layout.tsx` |
| Home screen layout | `app/(tabs)/index.tsx` |
| AI models/API URLs (Gemini, OpenRouter, Groq) | `src/constants/config.ts` |
| AI system prompts | `src/ai/prompts.ts` |
| Animated splash (post-JS) | `src/components/ui/AnimatedSplash.tsx` |
| Native splash (pre-JS, static) | `app.json` → `"splash"` key |
| Database tables | `src/db/schema.ts` + add migration in `src/db/migrations.ts` |
| Colors / dark mode | `src/theme/tokens.ts` |
| Font sizes | `src/theme/typography.ts` |
| English strings | `src/i18n/en.ts` |
| Urdu strings | `src/i18n/ur.ts` |
| Notification scheduling | `src/utils/notifications.ts` |
| Profile data model | `src/types/models.ts` |