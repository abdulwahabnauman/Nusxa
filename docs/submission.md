# Nusxa — Project Submission

**Project:** Nusxa — AI Medication Companion
**Repository:** github.com/abdulwahabnauman/Nusxa
**Version:** 1.0.0 (`package.json`, `app.json`)
**Document date:** 2026-09-02
**Companion documents:** `readme.md` (developer handoff guide), `docs/` (design and audit notes), `worker/README.md`, `eval/README.md`

---

## 1. Project Overview

Nusxa (pronounced "nukh-sa") is an AI-powered medication companion mobile app. The only thing that requires an internet connection is scanning a prescription (AI extraction); once medicines are saved, everything else — reminders, adherence tracking, backups — runs offline, unless the user opts into the AI chat companion. It scans paper prescriptions with the phone camera, extracts medicine information with a vision model, builds medication schedules with local reminders, and tracks adherence over time — with a bilingual (English/Urdu, LTR/RTL) and accessibility-focused UI aimed at elderly patients.

**Problem solved.** Patients — especially elderly ones — struggle to read handwritten prescriptions, remember dose times, and track whether doses were taken. Nusxa turns a photo of a prescription into a structured, reminder-driven medication plan that lives entirely on the device.

**Main objectives.**

1. Prescription photo → structured medicine data via AI OCR, with human review before saving.
2. Reliable local dose/refill/follow-up reminders, including an Android home-screen widget.
3. Adherence tracking, inventory/refill estimates, and bilingual accessible UI.
4. Privacy by design: all clinical data stays in on-device SQLite; AI keys either stay in the device keystore or live server-side in an optional proxy.

**Target platforms.** Android (primary, fully supported incl. widget/shortcut); iOS supported by the Expo codebase but no iOS native project is committed (see §11).

**Technology summary.** React Native 0.81.5 + Expo SDK 54, TypeScript (strict), Expo Router v6, expo-sqlite, Zustand + TanStack Query, expo-notifications, Cloudflare Workers (optional AI proxy), Gemini/Groq/OpenRouter AI providers.

---

## 2. Implemented Features

All items below exist in the current source tree; file references are given for verification.

### 2.1 Prescription scanning and AI extraction
- Camera capture with a **blur gate** (Laplacian-variance sharpness score; threshold `BLUR_VARIANCE_THRESHOLD = 55` in `src/constants/config.ts`) that asks for a retake before spending an API call (`app/scan.tsx`, `src/utils/sharpness.ts`).
- Up to 3 pages per scan (`MAX_PRESCRIPTION_PAGES`), 10 MB per image (`MAX_IMAGE_SIZE_BYTES`).
- OCR pipeline against Google Gemini vision with a fixed response schema, post-processing, validation and per-field confidence; fields below `LOW_CONFIDENCE_THRESHOLD = 0.6` are flagged for review (`src/ai/pipeline.ts`, `src/ai/prompts.ts`, `src/ai/postprocess.ts`, `src/ai/validation.ts`; `app/processing.tsx`, `app/review.tsx`).
- Review screen lets the user edit/confirm every extracted medicine before it is saved (`app/review.tsx`, `src/utils/savePrescription.ts` with fuzzy duplicate detection).

### 2.2 Medicines, schedules and reminders
- Active medicines list with refill estimates computed from remaining quantity and schedule (`app/(tabs)/medicines.tsx`, `src/utils/inventory.ts`).
- Per-medicine schedules (time, frequency, window, meal instruction) with scheduled local notifications via `expo-notifications`; dose logging into `dose_records`; snooze (configurable, default 10 min) and reminder escalation (`app/schedule.tsx`, `app/medicine/[id].tsx`, `src/utils/notifications.ts`).
- Throttled **refill reminders** (state in `reminders_state` KV table) and **follow-up visit reminders** from prescription visit dates (`src/utils/notifications.ts`).
- 30-second undo window (`UNDO_WINDOW_SECONDS`) for destructive list actions via action toasts (`src/components/ui/GlobalToast.tsx`).
- **Android home-screen widget** showing the next due dose and a **"Today" app shortcut**, injected at prebuild by custom config plugins (`plugins/with-next-dose-widget`, `plugins/with-today-shortcut`).

### 2.3 History, analytics and clinical extras
- Prescription history with archive/restore (soft-delete tombstones) and swipe delete + undo (`app/(tabs)/history.tsx`, `src/db/repositories/prescription.ts`).
- Adherence analytics screen (`app/analytics.tsx`).
- Emergency card and doctor-visit record screens (`app/emergency-card.tsx`, `app/doctor-visit.tsx`).
- Prescription print/PDF and sharing via `expo-print` / `expo-sharing` (`src/utils/pdf*.ts`).

### 2.4 AI chat
- Medicine chat/explanations with provider routing: Groq primary, OpenRouter (Nemotron) fallback; markdown rendering; conversation persisted to `chat_history.json` (`app/chat.tsx`, `src/ai/client.ts`, `src/utils/chatHistory.ts`).

### 2.5 Settings, accessibility and security
- Profile (name per language, DOB, blood group), language switch English/Urdu with **live RTL flip** and Eastern numerals, theme light/dark/system, **elderly mode**, **high contrast**, reduced motion (`app/(tabs)/settings.tsx`, `src/stores/*`, `src/theme/*`, `src/i18n/*`).
- **App lock**: 4-digit PIN in `expo-secure-store` + optional biometric unlock; 5 attempts then 30 s lockout; re-locks on background (`src/utils/appLock.ts`, `src/components/ui/BiometricLock.tsx`).
- **Data portability**: JSON export/import, plus AES-encrypted backup files (`crypto-js`) (`src/utils/export.ts`).
- **Delete all data**: single-transaction children-first wipe of all clinical tables plus reminder state, education user state, chat history and archived scan images; cancels scheduled notifications; returns the app to onboarding (`src/db/repositories/profile.ts`, `app/(tabs)/settings.tsx`).
- Onboarding gate with name/language capture; deterministic re-entry rules (`app/onboarding.tsx`, `app/_layout.tsx`).
- Two-stage splash: icon-less black native boot window handing off to an animated logo/wordmark splash (`app.json`, `src/components/ui/AnimatedSplash.tsx`).

### 2.6 AI key management
- Two modes: **proxy mode** (all AI calls routed through the optional Cloudflare Worker which holds provider keys server-side) or **bring-your-own-key** mode with keys stored in `expo-secure-store` (`src/constants/config.ts`, `worker/src/index.js`, Settings screen).

**Limitations per feature** are consolidated in §11.

---

## 3. Architecture / Project Structure

**Pattern.** Offline-capable client app: the only network-dependent flows are prescription scanning (AI OCR) and, optionally, the AI chat companion; everything else runs against local storage. No traditional backend: persistence is local SQLite; the only server component is an *optional* Cloudflare Worker that proxies AI calls so end users need no API keys.

- **Frontend / navigation:** Expo Router v6 file-based routes under `app/`; four tabs (`(tabs)/`: Home, Medicines, History, Settings) plus modal/card screens for scan → processing → review, chat, schedule, analytics, detail pages.
- **State:** Zustand v5 stores (`auth`, `settings`, `theme`) for session/preferences; TanStack Query caches DB reads (`src/hooks/queries.ts`).
- **Database:** `expo-sqlite` (`nusxa.db`), schema version 19 with sequential migrations, foreign-key cascades, repository layer (`src/db/database.ts`, `schema.ts`, `migrations.ts`, `repositories/`). Tables: `profile`, `prescriptions`, `medicines`, `schedules`, `dose_records`, `reminders_state`, `schema_version`, plus four `education_*` tables.
- **AI layer:** `src/ai/` (client, OCR pipeline, prompts, post-processing, validation, routing) → Gemini (vision), Groq / OpenRouter (text), directly or via `worker/` proxy.
- **Native layer:** `android/` is Expo prebuild output (gitignored, regenerable); custom config plugins inject the widget and shortcut; `MainActivity` registers the native splash.
- **Data flow (core):** scan → blur gate → OCR pipeline (processing screen) → review/edit → save (repositories) → notifications + widget sync → tabs render via react-query → dose logging writes `dose_records` → analytics.

```text
nusxa/
├── app/                    # Expo Router screens
│   ├── (tabs)/             #   index (Home), medicines, history, settings (education route exists in code, not yet shipped)
│   ├── _layout.tsx         #   boot sequence, splash handoff, lock/onboarding gates
│   ├── onboarding.tsx  scan.tsx  processing.tsx  review.tsx  chat.tsx
│   ├── schedule.tsx  analytics.tsx  emergency-card.tsx  doctor-visit.tsx
│   ├── medicine/[id].tsx  prescription/[id].tsx  education/
├── src/
│   ├── ai/                 # OCR + chat clients, prompts, postprocess, validation (+__tests__)
│   ├── components/ui/      # AnimatedSplash, BiometricLock, PinKeypad, PillIcon, toasts…
│   ├── constants/          # config.ts, ai-models.ts (shared verbatim with worker)
│   ├── db/                 # database.ts, schema.ts, migrations.ts, repositories/
│   ├── hooks/              # queries.ts (react-query), useReducedMotion, …
│   ├── i18n/               # en.ts, ur.ts
│   ├── stores/             # zustand: auth-store, settings-store, theme-store
│   ├── theme/              # colors, typography, spacing, provider
│   ├── types/              # models.ts
│   └── utils/              # notifications, export, appLock, chatHistory, archiveImages, …
├── plugins/                # with-next-dose-widget, with-today-shortcut (Android native)
├── worker/                 # optional Cloudflare Worker AI proxy (src/index.js, wrangler.toml)
├── eval/                   # golden-set OCR eval harness (run-eval.ts, golden/, results.csv)
├── docs/                   # design/audit notes + this submission document
├── assets/                 # icons, splash images, fonts (Inter, Noto Nastaliq Urdu)
├── android/                # Expo prebuild output — gitignored, regenerated by prebuild
├── app.json                # Expo config (plugins, splash, permissions)
├── eas.json                # EAS build profiles (development / preview / production)
├── env.example             # documented environment variables (no secrets)
├── package.json  tsconfig.json  eslint.config.js  babel.config.js  metro.config.js
└── readme.md               # developer handoff guide
```

---

## 4. Technology Stack

Versions taken from `package.json` (and `app.json`/`eas.json` where noted).

| Technology | Version | Purpose |
| ---------- | ------- | ------- |
| Expo SDK | ~54.0.0 | React Native framework & tooling |
| React Native | 0.81.5 | Mobile runtime |
| React | 19.1.0 | UI library |
| TypeScript | ~5.9.2 | Language (strict mode) |
| Expo Router | ~6.0.24 | File-based navigation |
| expo-sqlite | ~16.0.10 | On-device relational database |
| Zustand | ^5.0.0 | Client state (auth/settings/theme stores) |
| TanStack Query | ^5.60.0 | Cached DB reads, invalidation |
| react-native-reanimated | ~4.1.1 | Splash/tab/toast animations |
| react-native-svg | 15.12.1 | Pill icon and vector graphics |
| expo-notifications | ~0.32.17 | Dose/refill/follow-up reminders |
| expo-secure-store | ~15.0.8 | PIN and API-key storage (device keystore) |
| expo-local-authentication | ~17.0.9 | Biometric unlock |
| expo-camera / expo-image-picker | ~17.0.10 / ~17.0.11 | Prescription capture |
| expo-print / expo-sharing | ~15.0.8 / ~14.0.8 | Prescription PDF/print/share |
| crypto-js | ^4.2.0 | Encrypted backup files |
| date-fns | ^4.1.0 | Date handling |
| Jest + jest-expo | ^29.7.0 / ~54.0.0 | Unit testing |
| ESLint + eslint-config-expo | ^9.0.0 / ~10.0.0 | Linting |
| tsx | ^4.23.13 | Runs the OCR eval harness |
| EAS CLI (eas.json) | >= 12.0.0 | Cloud builds (APK/AAB) |
| Cloudflare Workers | — | Optional server-side AI key proxy (`worker/`) |
| Google Gemini / Groq / OpenRouter | — | External AI providers (vision OCR / text) |

---

## 5. Setup & Installation

1. **Prerequisites.** Node.js 20+ (LTS) and npm; Android Studio + SDK for local Android builds; EAS CLI (`npm i -g eas-cli`) for cloud builds; `wrangler` only if deploying the optional proxy.
2. **Dependencies.** `npm install` (if peer-dependency resolution fails: `npm install --legacy-peer-deps` — see `readme.md`).
3. **Environment variables (all optional).** Copy `env.example` → `.env`:
   - `EXPO_PUBLIC_AI_PROXY_URL` — URL of the deployed Cloudflare proxy; when set, all AI calls route through it and no user keys are needed.
   - `EXPO_PUBLIC_AI_PROXY_APP_KEY` — shared secret the app sends with proxied requests.
   - Commented dev-only fallbacks `EXPO_PUBLIC_GEMINI_API_KEY`, `EXPO_PUBLIC_OPENROUTER_API_KEY`, `EXPO_PUBLIC_GROQ_API_KEY` (never put real shared keys here; `EXPO_PUBLIC_*` is baked into the bundle).
   Without any env config the app runs fully in bring-your-own-key mode via Settings.
4. **Backend setup.** None required. Optional: deploy the AI proxy per `worker/README.md` (`wrangler secret put GEMINI_API_KEY / OPENROUTER_API_KEY / GROQ_API_KEY / APP_KEY`, then `wrangler deploy`).
5. **Database setup.** None — `nusxa.db` is created on first launch and migrated automatically to schema v19 (`src/db/database.ts`, `src/db/migrations.ts`).
6. **Frontend setup.** A **development build** is required (the app uses native modules: sqlite, secure-store, biometrics, custom widget plugins): `npm run android` (or `eas build --profile development`). Expo Go cannot host these modules.
7. **Build instructions.** See §8.
8. **Run instructions.** See §6.

---

## 6. Running the Project

| Goal | Command | Notes |
| ---- | ------- | ----- |
| Metro dev server | `npm start` | Use `npx expo start --clear` after `.env` changes |
| Build + run on Android device/emulator | `npm run android` | Local debug build via Gradle |
| iOS (macOS only) | `npm run ios` | No iOS project committed; runs prebuild first |
| Cloud dev-client build | `eas build --platform android --profile development` | APK, internal distribution |
| Release APK for testers | `eas build --platform android --profile preview` | Internal distribution |
| Store build | `eas build --platform android --profile production` | AAB, auto-incremented version |
| Local release APK | `npm run prebuild:android` then `cd android && ./gradlew assembleRelease` | Output: `android/app/build/outputs/apk/release/` |
| OCR eval harness | `npm run eval` | Needs Gemini key or deployed proxy |

Web mode is **not supported** (no pinned `react-native-web`; see `readme.md`).

---

## 7. Testing & Verification

Automated checks present in the repository and their **actual results, executed on 2026-09-02** in this workspace (Windows, Node v24.18.0):

| Check | Command | Result |
| ----- | ------- | ------ |
| Unit tests (Jest + jest-expo, 13 suites / 136 tests) | `npm test` | **PASS** — 13/13 suites, 136/136 tests, 20.5 s |
| Static type checking (strict TS) | `npx tsc --noEmit` | **PASS** — no diagnostics |
| Lint (ESLint 9 + eslint-config-expo) | `npm run lint` | **PASS** — 0 errors, 0 warnings (app/ + src/ scope) |
| OCR golden-set evaluation | `npm run eval` | Not run here — requires Gemini credentials or a deployed proxy and network access |
| Android APK/AAB build | see §8 | Not verified in this environment — no build artifacts present in the repository |

Unit test scope (`src/**/__tests__/`): prescription validation, inventory/refill math, drug-interaction checking, dose/save duplicate matching, blur-sharpness scoring, PDF page/layout helpers, AI provider routing and OCR post-processing, markdown rendering, pill-icon rendering, tab events.

```text
TypeScript: PASS
Tests:      PASS (136/136)
Lint:       PASS (0 errors, 0 warnings)
Build:      Not verified in the current environment
```

---

## 8. Build / APK / Executable Information

- **Artifact types.** Android APK (development & preview profiles) and Android App Bundle (production profile), defined in `eas.json`; iOS builds are defined but no iOS native project is committed.
- **Build commands.** `eas build --platform android --profile {development|preview|production}`; or locally `npm run android` (debug) / `npm run prebuild:android` + `cd android && ./gradlew assembleRelease` (release APK at `android/app/build/outputs/apk/release/`).
- **Variants.** `development` = debug dev-client APK for iterating; `preview` = release-mode internal-distribution APK for testers/evaluators (choose this one for manual evaluation); `production` = signed AAB for store submission with auto-incremented build numbers.
- **Repository state.** No build artifacts are committed (`android/` itself is gitignored prebuild output; `android/app/build/outputs/` does not exist in this workspace). Evaluators must produce an artifact with one of the commands above.
- **Architecture.** Default Gradle/EAS Android output (universal APK unless split per EAS defaults); not further specified in the repository.

---

## 9. User Guide

1. Install a development or preview build and launch the app; the animated splash hands off to **onboarding**.
2. Enter your name (English or Urdu), pick the language, optionally add date of birth and blood group, and finish setup.
3. **Home tab** shows today's doses with take/snooze actions; the Android widget mirrors the next due dose.
4. Tap the scan action, photograph a prescription (up to 3 pages; blurry shots are rejected with a retake prompt), and wait for AI extraction on the processing screen.
5. On the **review screen**, correct any flagged fields and save; medicines and schedules appear under **Medicines**.
6. Dose reminders fire at scheduled times; tapping a notification opens the medicine detail where doses can be logged, edited or snoozed.
7. **History** lists past prescriptions (archive/restore, swipe-delete with 30 s undo); **Analytics** shows adherence.
8. **Chat** answers medicine questions using the configured AI provider.
9. **Settings** manages profile, language/RTL, theme, elderly mode, high contrast, notification preferences, app lock (PIN/biometric), AI keys or proxy mode, JSON export / encrypted backup / import, and Delete all data.
10. Verify persistence by restarting the app: profile, medicines, schedules and preferences reload from the local database.

---

## 10. Important Configuration

| File | Controls |
| ---- | -------- |
| `app.json` | Expo project config: name/scheme, permissions (camera, notifications, boot-completed, exact alarms), `expo-splash-screen` plugin (icon-less black boot window), adaptive icon, notification icon/color, plugin list incl. the two custom widget/shortcut plugins |
| `eas.json` | EAS build profiles: development (APK dev client), preview (internal APK), production (AAB, autoIncrement) |
| `env.example` / `.env` | Optional AI proxy URL/app key and commented dev-only provider keys. `.env` is gitignored (`.gitignore` line 11); never commit real values |
| `package.json` | Scripts (`start`, `android`, `ios`, `lint`, `test`, `eval`, `prebuild:android`), dependency pins, Jest preset `jest-expo` with `src/**/__tests__/**/*.test.ts` match |
| `tsconfig.json`, `eslint.config.js`, `babel.config.js`, `metro.config.js` | Strict TypeScript, Expo lint rules, Babel/Metro bundling |
| `android/` (generated) | Gradle project produced by `expo prebuild`; splash theme, manifest permissions, widget/shortcut native code. Gitignored — regenerate with `npm run prebuild:android` |
| `worker/wrangler.toml` | Cloudflare Worker deployment config for the optional AI proxy |
| `src/constants/config.ts`, `src/constants/ai-models.ts` | Runtime thresholds (blur, confidence, page/image limits, snooze, undo window, DB name) and AI model/endpoint constants shared verbatim with the worker |

No secret values are stored in any of these files.

---

## 11. Known Limitations

- **iOS is code-supported but not shipped:** no `ios/` directory is committed; the widget and Today shortcut are Android-only native plugins.
- **Expo Go cannot run the app:** native modules (sqlite, secure-store, biometrics, widget plugins) require a development build, despite the readme's quick-start mentioning Expo Go for orientation.
- **AI features need network + credentials:** scanning, chat and explanations require either the deployed proxy or user-provided Gemini/Groq/OpenRouter keys; without them the rest of the app (data, reminders) works fully offline.
- **No cross-device sync:** data is device-local by design; transfer is via JSON export/import or encrypted backup files.
- **App-scope lint is clean** (`app/` + `src/`: 0 errors, 0 warnings). Two issues remain *outside* `npm run lint`'s scope: a genuine duplicate-declaration parse error in `worker/src/index.js` (`Identifier 'text' has already been declared`) and a `no-undef` false positive for `__dirname` in `plugins/with-next-dose-widget.js` (a Node config plugin). Neither affects the app bundle.
- **SQLite journal mode is DELETE, not WAL** (`src/db/database.ts`), chosen for compatibility; write-heavy operations are therefore slower than WAL would allow.
- **Delete-all-data does not shrink the SQLite file** (standard SQLite behavior; freed pages are reused). App-lock credentials and AI keys intentionally survive the wipe.
- **Urdu wordmark limitation:** the splash wordmark always renders in Latin Inter because Nastaliq shaping mangles Latin brand text.
- **Eval harness requires credentials/network** and is not part of CI; `eval/results.csv` tracks runs manually.
- **No CI pipeline** is configured in the repository; verification commands must be run manually.

---

## 12. Submission Contents

- [x] Source code (complete repository: `app/`, `src/`, `plugins/`, `worker/`, `eval/`)
- [x] `docs/submission.md` (this document)
- [x] `readme.md` (developer handoff guide) and `docs/` design/audit notes
- [x] Configuration: `app.json`, `eas.json`, `env.example`, `package.json`, TS/ESLint/Babel/Metro configs
- [x] Required assets: icons, splash images, bundled fonts (Inter, Noto Nastaliq Urdu)
- [x] Unit test suites (13 files, 136 tests) and OCR eval harness with golden set
- [ ] APK / AAB artifact — **not committed**; produce with `eas build --platform android --profile preview` (evaluator APK) or the local Gradle release command in §8
- [ ] `.env` — intentionally excluded (gitignored); provide values per `env.example` at build time

---

## 13. Security & Secrets

- A repository-wide scan for key patterns (`AIza…`, `gsk_…`, `sk-…`, private-key blocks, bearer tokens) returned **no matches** in tracked files.
- `.env` exists only on developer machines and is gitignored; it may contain a proxy URL and app key. Its values are **not** reproduced here or anywhere in the repository. Where credentials are required, use placeholders: `EXPO_PUBLIC_AI_PROXY_URL=<YOUR_PROXY_URL>`, `EXPO_PUBLIC_AI_PROXY_APP_KEY=<YOUR_APP_KEY>`.
- User-entered AI keys and the app-lock PIN live in `expo-secure-store` (hardware-backed keystore), never in the database or bundle; backup rules exclude them from Android backups (`android/app/src/main/res/xml/secure_store_backup_rules.xml`).
- Encrypted backups use `crypto-js` with a user-supplied passphrase; plain JSON exports contain clinical data and should be shared deliberately.
- The optional proxy holds provider keys as Cloudflare Worker secrets (`wrangler secret put …`), so no key ships in the app bundle in proxy mode.

---

## Verification Summary

- **Documented from source:** every feature, path, version, command and limitation above was read from repository files (`package.json`, `app.json`, `eas.json`, `env.example`, `src/`, `app/`, `plugins/`, `worker/`, `eval/`, `readme.md`).
- **Executed and verified here (2026-09-02):** `npm test` (136/136 pass), `npx tsc --noEmit` (clean), `npm run lint` (0 errors / 0 warnings), secrets scan (clean).
- **Not verified in this environment:** Android/iOS artifact builds (no SDK build run; no artifacts in repo), `npm run eval` (needs AI credentials/network), on-device UI behavior.
- **Known documentation inconsistency:** `readme.md`'s quick start suggests Expo Go, which cannot host the app's native modules; a development build is required (noted in §5/§11).
