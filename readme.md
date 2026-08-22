# Nusxa — Developer Handoff Guide

## What Is Nusxa?

Nusxa (pronounced "nukh-sa") is an **AI Medication Companion** mobile app built with React Native + Expo. It scans prescriptions using the phone camera, extracts medicine information with AI, creates medication schedules with reminders, and tracks adherence over time.

**Target users**: Patients managing medications, especially elderly users who need a simple, accessible interface.

---

## Quick Start

### Prerequisites
- **Node.js v20+** (LTS) — https://nodejs.org
- **Expo Go** app on a phone (for quick testing) — Play Store / App Store
- **A free Google Gemini API key** — https://aistudio.google.com/app/apikey

### Run the App
```bash
cd nusxa
npm install
npx expo start
```
Scan the QR code with Expo Go on your phone.

> **Important**: Use `npx expo start --clear` whenever you change `.env` values or make structural changes, to clear the Metro bundler cache.

### Configure the AI (Gemini)
1. Get a free API key from https://aistudio.google.com/app/apikey
2. Inside the app, go to **Settings > AI Service** and paste the key
3. The key is stored securely via `expo-secure-store` (encrypted on-device)
4. Alternatively, add it to the `.env` file: `EXPO_PUBLIC_GEMINI_API_KEY=your_key_here` (then restart with `--clear`)

---

## Tech Stack

| Layer              | Technology                              |
|--------------------|-----------------------------------------|
| Framework          | React Native 0.76 + Expo SDK 52        |
| Language           | TypeScript (strict mode)                |
| Navigation         | Expo Router v4 (file-based routing)     |
| State Management   | Zustand v5 (3 stores: auth, theme, settings) |
| Database           | expo-sqlite (SQLite, offline-first)     |
| AI Backend         | Google Gemini 1.5 Flash (free tier)     |
| Notifications      | expo-notifications (local scheduled)    |
| Secure Storage     | expo-secure-store (API key encryption)  |
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
├── assets/                       # App icons and splash images
│   ├── icon.png                  # App store icon (1024x1024)
│   ├── adaptive-icon.png         # Android adaptive icon foreground
│   ├── splash-icon.png           # Splash screen logo
│   └── notification-icon.png     # Notification bar icon
│
├── src/
│   ├── ai/                       # AI integration
│   │   ├── client.ts             # Gemini API client (vision, chat, multi-turn)
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
│       ├── secureStorage.ts      # expo-secure-store wrapper for API key
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

### 1. AI Backend: Google Gemini 1.5 Flash (Free Tier)
- Config: `src/constants/config.ts` → `GEMINI_MODEL`, `GEMINI_API_BASE`
- Client: `src/ai/client.ts` — all API calls go through this
- **Free tier**: 15 requests/min, 1M tokens/context, supports vision
- Get key: https://aistudio.google.com/app/apikey

### 2. Secure API Key Storage
- Primary: `expo-secure-store` (encrypted on-device) via `src/utils/secureStorage.ts`
- Fallback: `.env` file (`EXPO_PUBLIC_GEMINI_API_KEY`)
- Resolution order: secure store → env variable (see `resolveApiKey()`)
- Users enter/remove keys in Settings > AI Service

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

### Option B: Local Build
```bash
npx expo run:android --variant release
# APK at: android/app/build/outputs/apk/release/
```

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
| RTL layout | Partial | `I18nManager.forceRTL` works, but some custom components may need manual `flexDirection: 'row-reverse'` adjustments. Full RTL needs visual QA pass. |
| Notifications in background | Expo Go limitation | Local notifications work, but background execution (when app is fully closed) requires a dev client or production build |
| Camera focus | Basic | No auto-focus indicator or tap-to-focus in the scanner. The `expo-camera` API supports this if needed. |
| Offline AI | Not implemented | All AI calls require internet. Consider on-device ML models for offline scanning. |
| Data backup | Not implemented | No cloud sync. All data is local SQLite only. |
| Push notifications | Not implemented | Only local scheduled notifications. Firebase/OneSignal needed for remote push. |
| Tablet layout | Not optimized | `supportsTablet: true` but no tablet-specific layouts |
| App locking | Not implemented | No biometric/PIN lock. Consider adding for medication privacy. |
| Accessibility | Basic | Has reduced motion toggle and elderly mode (larger text). Could add screen reader labels to more elements. |
| Theme/settings persistence | In-memory only | Theme store and settings store (except language) don't persist to DB — they reset on app restart. Consider adding DB columns for `notifications_enabled`, `reduced_motion`, `theme_preference`. |

---

## Common Issues and Fixes

### "Image file not found" after scanning
- **Cause**: Expo Go temp file cleanup (fixed in scan.tsx with `persistImage`)
- **If it recurs**: Check that `FileSystem.copyAsync` succeeds, and the document directory has write permission

### Gemini API returns 429 (rate limit)
- Free tier: 15 requests/minute. The client auto-retries with exponential backoff (2 retries)
- If frequent, consider caching OCR results

### Notifications not showing
- Expo Go: notifications only work when app is foregrounded or recently used
- Production build needed for true background notifications
- Check `expo-notifications` permission was granted in onboarding

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
| `EXPO_PUBLIC_GEMINI_API_KEY` | Fallback API key (if secure store is empty) | For AI features |

The `.env` file is gitignored. Users should enter the API key through the Settings screen (secure store) rather than the `.env` file for production use.

---

## Key File Quick Reference

| Want to change... | Edit this file |
|-------------------|---------------|
| App name, icons, splash | `app.json` |
| Tab bar labels/icons | `app/(tabs)/_layout.tsx` |
| Home screen layout | `app/(tabs)/index.tsx` |
| AI model or API URL | `src/constants/config.ts` |
| AI system prompts | `src/ai/prompts.ts` |
| Database tables | `src/db/schema.ts` + add migration in `src/db/migrations.ts` |
| Colors / dark mode | `src/theme/tokens.ts` |
| Font sizes | `src/theme/typography.ts` |
| English strings | `src/i18n/en.ts` |
| Urdu strings | `src/i18n/ur.ts` |
| Notification scheduling | `src/utils/notifications.ts` |
| Profile data model | `src/types/models.ts` |
