# Nusxa — Complete Codebase Audit

> Full scan of every route, module, component, store, util, DB layer, native config and worker.
> TypeScript compiles clean (`npx tsc --noEmit` → 0 errors), so everything below is functional,
> architectural or i18n — not compile errors.
>
> **Sections:** [1. Broken / Left / Left-Out](#1--broken--left--left-out) · [2. Improvements](#2--improvements) · [3. Suggested Features](#3--suggested-features) · [4. UI/UX Improvements](#4--uiux-improvements)

---

## 1. 🔴 Broken / Left / Left-Out

### 1.1 Real bugs

| # | Issue | Location | Impact |
|---|-------|----------|--------|
| B1 | **Streak can never exceed 7 days.** Streak loop only iterates `getLast7Days()`, so the `streak === 30` milestone celebration can never fire. | `app/(tabs)/index.tsx` | Milestone feature dead |
| B2 | **Chat deep-link context silently dropped.** Medicine detail navigates to `/chat` with `{ medicineId, medicineName }` ("Ask AI about this medicine"), but `chat.tsx` never calls `useLocalSearchParams` — the params are ignored. | `app/medicine/[id].tsx` → `app/chat.tsx` | Feature visibly does nothing special |
| B3 | **Export only backs up TODAY's dose records.** `exportAsJSON()` calls `getTodayDoseRecords(getTodayISO())` instead of full history — a "backup" that loses all historical adherence data. Import can restore history, but export never contains it. | `src/utils/export.ts` | Data loss on restore-to-new-phone |
| B4 | **Tap-to-focus doesn't focus.** Scan screen shows a focus ring and calls `focusAsync?.()` via a cast, but never maps the tap point to focus coordinates; magic offsets (`layout.y + 100`, `-40`) instead. | `app/scan.tsx` | Blurry photo capture on some devices |
| B5 | **Markdown bubbles break dark mode.** `MarkdownText` hardcodes light-only colors (`#1F2937`, `#F3F3F0`, `#686863`) — used by AI chat responses. | `src/components/ui/MarkdownText.tsx` | Unreadable/ugly chat in dark theme |
| B6 | **Hardcoded `#ccc` border** in History list styles — wrong color in dark theme. | `app/(tabs)/history.tsx` | Theme inconsistency |
| B7 | **"All" analytics period is actually 365 days.** `daysBack = ... : 365` — users picking "All" get a year, not everything. | `app/analytics.tsx` | Misleading stats |
| B8 | **Schema version constants disagree.** `SCHEMA_VERSION = 3` (schema.ts) vs `CURRENT_SCHEMA_VERSION = 15` (migrations.ts); migrations v2/v3 never update the stored `schema_version` row; migration_v5 is a no-op. Works, but fragile and confusing. | `src/db/schema.ts`, `src/db/migrations.ts` | Future migration risk |
| B9 | **`appVersion` hardcoded `'1.0.0'`** in export payload instead of reading from app config. | `src/utils/export.ts` | Wrong version in exports |
| B10 | Onboarding defines a `'done'` step that is never rendered/reached. | `app/onboarding.tsx` | Dead branch |

### 1.2 Half-built features (infrastructure exists, UI/behavior missing)

| # | Feature | What exists | What's missing |
|---|---------|-------------|----------------|
| H1 | **Education Library** | Full DB layer: `src/db/repositories/education.ts`, `src/db/schemas/education.ts`, migrations v4–v8, content seeds, bookmarks, reading-progress infra. | **Zero UI consumers.** Learn tab only lists the user's own medicines. No browse/search/bookmark screens, no nav entry. ROADMAP.md confirms ~30% done. |
| H2 | **Reminder escalation** | `reminderEscalation` persisted in settings store + DB column. | No settings toggle, and nothing in the notification system reads it. Feature is inert. |
| H3 | **`explainMedicine()`** | Exported in `src/ai/pipeline.ts`. | Never called anywhere — intended for medicine-detail AI explanations. |
| H4 | **Validation toolkit** | `isValidTimeFormat`, `findScheduleConflicts`, `findDuplicateMedicines`, `isMedicineComplete`, `getMissingFields` in `src/utils/validation.ts`. | **None are used.** Schedule screen accepts free-text `HH:MM` with no validation. |
| H5 | **Medicine edit/delete** | `deleteMedicine` imported in `app/medicine/[id].tsx`. | Import unused — there's no edit or delete action in the medicine detail UI. |
| H6 | **`date_of_birth`** | Column on `Profile`, restored by import. | Never collected in onboarding or settings; never displayed. |
| H7 | **Education/[medicineId] context** | Route exists. | Reachable only via Learn tab's own-medicine list; not linked from medicine detail or chat. |

### 1.3 Dead code & leftovers

- **5 dead config constants** (zero usages): `MAX_IMAGE_SIZE_BYTES`, `SUPPORTED_IMAGE_FORMATS`, `SNOOZE_MINUTES`, `UNDO_WINDOW_SECONDS`, `MAX_RETAINED_IMAGES` — `src/constants/config.ts`.
- **Unused imports**: `deleteMedicine`, `cancelAllNotifications`, `Linking` in `app/medicine/[id].tsx`; `Switch` in `app/emergency-card.tsx`.
- **Unused type**: `MedicineWithSchedule` — `src/types/models.ts`.
- **`@tanstack/react-query`** installed and `QueryClientProvider` wired in root layout, but **zero** `useQuery`/`useMutation` usage anywhere — pure overhead.
- **`env.example` line 11**: stray garbage `// nov 30 to dec 4 , sep 10`.
- **`improvements.txt`**: leftover one-liner ("Adding dark mode auto-detection for medicine cards...").
- **`app/review.tsx`** stale comment: "Save to database (will be connected in Phase 5/6)" — phase is long done.
- **Root clutter**: 11 summary markdown files (`APPLIED_FIXES.md`, `APP_UPDATE_SUMMARY.md`, `BACKEND_MIGRATION.md`, `CRITICAL_FIXES_APPLIED.md`, `EDUCATION_LIBRARY_COMPLETE.md`, `FEATURE_IMPLEMENTATION_SUMMARY.md`, `FINAL_FIXES_SUMMARY.md`, `FIXES_SUMMARY.md`, `IMPLEMENTATION_COMPLETE.md`, `SESSION_SUMMARY.md`, `WHAT_WE_BUILT_TODAY.md`) + `project.zip` + 67 KB `readme.md`.
- `console.log`/`warn` leftovers in `notifications.ts`, `kv.ts`, `education.ts`, `database.ts`.

### 1.4 i18n violations (hardcoded English — breaks Urdu/RTL requirement)

`en.ts` has **no** `chat`, `analytics` or `education` sections at all. Hardcoded strings found in:

| Screen / file | Hardcoded content |
|---|---|
| `app/chat.tsx` | Header "Nusxa Companion", welcome text, placeholders, error messages |
| `app/processing.tsx` | Nearly all labels/status text |
| `app/review.tsx` | Headers, field labels, buttons, alerts |
| `app/schedule.tsx` | Headers, labels, time placeholders, buttons |
| `app/medicine/[id].tsx` | 'Generic name', 'Details', 'Inventory', 'Remaining', etc. |
| `app/analytics.tsx` | Weekday labels via `toLocaleDateString('en-US', ...)` |
| `app/emergency-card.tsx` | Placeholders ("e.g. O+", "Comma-separated"), "Discard Changes?" alert |
| `app/(tabs)/history.tsx` | "Archive", "Delete", toast messages |
| `app/(tabs)/medicines.tsx` | Interaction/low-stock banners, empty state |
| `app/(tabs)/settings.tsx` | Alert strings ("Delete all data", "Import data"), "Enter your name" |
| `src/components/ui/BiometricLock.tsx` | "Unlock Nusxa", "Nusxa is locked", "Enter your PIN to continue" |
| `src/components/medicine/ScheduleTimeline.tsx` | 'Morning' / 'Afternoon' / 'Night' labels |
| `src/utils/export.ts` + `src/utils/pdf.ts` | Entire text/PDF reports are English-only (no Urdu variant, no RTL PDF) |

### 1.5 Config / native issues

- `app.json` iOS: `UIRequiredDeviceCapabilities: ["armv7"]` — wrong/outdated (modern iOS is arm64).
- `app.json` iOS: `NSMicrophoneUsageDescription` present though **no voice feature exists** (App Store friction).
- `worker/src/index.js` mirrors model constants from `src/constants/config.ts` by hand ("keep in sync" comment) — drift risk.
- `eas.json`: no iOS profiles at all (Android-only builds configured).

---

## 2. 🔧 Improvements

### Performance
1. **Kill N+1 queries.** Home screen `await getMedicine(...)` sequentially per schedule; History `getMedicinesByPrescription` per prescription; weekly chart calls `getAdherenceStats` 7× sequentially. Use SQL JOINs / batch queries or at minimum `Promise.all`.
2. **Actually use react-query** (already installed + provider wired): cache medicines/schedules/doses, invalidate on dose actions — eliminates manual `loadData()` everywhere.
3. Home screen fires several independent loads sequentially — parallelize.

### Code quality
4. Delete all dead code listed in §1.3 (explainMedicine or wire it, dead constants, unused imports/types, react-query or adopt it).
5. Unify schema versioning: single `SCHEMA_VERSION` constant, make v2/v3/v5 migrations consistent, store real version.
6. Remove the `as any` casts in `savePrescription.ts` (`meal_instruction`, `form`) by aligning `MedicineJSON` and `Medicine` types.
7. Use `expo-constants` for `appVersion` instead of hardcoded `'1.0.0'`.
8. Single source of truth for AI model constants (generate worker config or share a JSON).
9. Add tests — **none exist** (no test runner configured in `package.json`). At minimum: `savePrescription` fuzzy matching, `interactions.ts`, `inventory.ts`, `validation.ts`, migration idempotency.
10. Move the 11 root summary `.md` files + `project.zip` into `docs/` (or delete) and slim the 67 KB `readme.md`.
11. Strip `console.log`s or route through a leveled logger that's disabled in release.
12. Fix `env.example` junk line; delete `improvements.txt`.

### Data layer
13. Export should include **full dose history**, settings/KV state, bookmarks — and import should restore them (chat history file is also never backed up).
14. `getTodayDoseRecords` uses `LIKE '${date}%'` — fine, but index `dose_records.scheduled_time` for range queries used by analytics.
15. Consider soft-delete + tombstones for medicines/prescriptions so undo and export stay consistent.

### Native/config
16. Fix `armv7` → `arm64`; remove mic usage description until voice exists.
17. Add iOS build profiles to `eas.json` if iOS is ever a target (currently Android-only by design — document that).

---

## 3. 💡 Suggested Features

### Finish what's half-built (highest ROI)
1. **Education Library UI** — browse/search all seeded content, category tabs, bookmarks, reading progress, per-medicine articles linked from medicine detail + chat answers ("Learn more").
2. **`explainMedicine()` wiring** — "Explain in simple words" button on medicine detail (Urdu + English), cached locally.
3. **Reminder escalation toggle + behavior** — repeat notification if dose stays untaken past window.
4. **Medicine edit/delete** — edit name/dosage/times/inventory, pause course, delete with Undo.

### New features
5. **Caregiver/family mode** — share adherence dashboard/report with a family member (WhatsApp share of weekly PDF is the cheap version).
6. **Voice output** — read reminders and chat answers aloud in Urdu (elderly-first audience; the mic permission is already there).
7. **Symptom/side-effect journal** — log how you feel per day; show correlations with medicines at doctor visits.
8. **Vitals log** — BP/glucose/weight entries with trends, appended to the doctor-visit PDF.
9. **Follow-up reminders** — `follow_up_date` already exists on prescriptions; schedule a notification/calendar event.
10. **Refill ordering flow** — low-stock detection exists; add "call pharmacy" / reminder to buy.
11. **Android home-screen widget** — next dose + quick "Taken" action (shortcut plugin already sets the pattern).
12. **Push notifications (FCM/Expo)** — ROADMAP item D; reliable channel vs local-only.
13. **Multi-profile** — manage parents' medicines from one phone (very common in the target market).
14. **Prayer-time-aware scheduling** — align default dose times with local prayer times.
15. **Pill identifier** — photo of a loose pill → identify it (reuses existing vision pipeline).
16. **Urdu OCR polish** — confidence threshold with a clear "needs your review" flag on low-confidence fields.
17. **Encrypted cloud backup** — even a user-owned Google Drive file beats JSON-on-device for the elderly audience.
18. **Cheap generic alternatives** — show common cheaper generics per medicine (educational, with disclaimer).
19. **Emergency card one-tap actions** — call emergency contact / call ambulance directly from the card.
20. **Chat enhancements** — context injection when opened from a medicine (fix B2 + suggested quick questions), conversation topics per medicine.

---

## 4. 🎨 UI/UX Improvements

### Localization & accessibility (priority)
1. **Move every string in §1.4 into `en.ts`/`ur.ts`** and add missing `chat`, `analytics`, `education`, `lock` key sections.
2. **Full RTL audit** (ROADMAP item B) — after strings are localized, verify every screen mirrored (esp. timeline, charts, tab bar).
3. **Localize dates/numerals consistently** — analytics weekday labels use `en-US` hardcoded; eastern-numeral util exists but apply it everywhere or nowhere.
4. **Urdu PDF reports** — RTL-capable PDF template + Noto Nastaliq font (already bundled in `assets/fonts/`).
5. **Accessibility pass** — `accessibilityLabel`s on icon buttons, minimum 44–48dp touch targets (elderly mode should go to 56dp+), font scaling checks.

### Elderly mode & contrast (ROADMAP item C)
6. Redesign elderly mode as a real layout mode: simplified home (only next dose + big Taken button), larger type, fewer actions per screen.
7. High-contrast audit: replace every hardcoded hex (`#ccc`, MarkdownText colors, Badge palette) with theme tokens so both themes + contrast mode work.

### Home & schedule
8. Live **countdown** to next dose on the hero card; auto-refresh when the day rolls over.
9. Streak milestones that actually work (fix B1): 7 / 14 / 30-day celebrations.
10. Group timeline by daypart with localized labels (Morning/Afternoon/Night already computed, just hardcoded).
11. Inline Undo on every destructive dose action (UndoToast exists — use it everywhere).

### Scanner flow
12. Real tap-to-focus + corner guides + blur/low-light detection hint.
13. Post-capture preview with "Retake / Use this photo" before burning an AI call.
14. Show OCR confidence per field on review; tap a field to correct it in-place (currently review-only).

### Screens
15. **Chat**: empty-state quick-question chips, context banner when opened from a medicine, message copy button, loading indicator with stages.
16. **Analytics**: real date-range picker (fix the 365-day "All"), reuse `AdherenceRing` instead of the duplicated bar-chart ring code.
17. **History**: archive/delete labels localized; swipe actions instead of visible buttons for a cleaner list.
18. **Settings**: grouped sections, add the missing reminder-escalation toggle, DOB/blood-group collection, "About/privacy" section.
19. **Onboarding**: collect date of birth + blood group (fields exist but are never asked for); kill the dead `'done'` step.
20. **Emergency card**: structured inputs (blood-group picker, phone input with validation) instead of free-text placeholders.

### Polish
21. Skeleton loaders on all data-driven screens (Skeleton component exists — use it in home/history/analytics).
22. Consistent haptics on take/skip/snooze/save (util exists; audit coverage).
23. Notification UX: big-text style with **action buttons (Taken / Snooze)** directly in the notification.
24. Empty states everywhere localized + friendly illustration, with a clear primary CTA ("Scan your first prescription").
25. Reduce inline `style={{...}}` duplication in screens — lean on `theme/tokens`, `spacing`, `typography` consistently.
26. Loading/error states for AI calls with retry button (never a dead-end alert).

---

## Summary

- **TypeScript:** clean. **Real bugs:** 10 (B1–B10), most severe: export loses dose history (B3), streak cap (B1), chat deep-link dropped (B2).
- **Half-built:** Education Library UI, reminder escalation, explainMedicine, validation toolkit, medicine edit/delete, DOB collection.
- **Systemic issues:** hardcoded English across ~13 files vs the bilingual requirement; hardcoded colors vs theming; N+1 DB queries; dead code/react-query overhead.
- **Quick wins (≤1 session):** fix B1–B3, delete dead code, add i18n sections for chat/analytics, wire validation to schedule screen, clean root clutter.
