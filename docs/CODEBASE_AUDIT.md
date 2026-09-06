# Nusxa — Complete Codebase Audit

> Full scan of every route, module, component, store, util, DB layer, native config and worker.
> TypeScript compiles clean (`npx tsc --noEmit` → 0 errors), so everything below is functional,
> architectural or i18n — not compile errors.
>
> **Sections:** [1. Broken / Left / Left-Out](#1--broken--left--left-out) · [2. Improvements](#2--improvements) · [3. Suggested Features](#3--suggested-features) · [4. UI/UX Improvements](#4--uiux-improvements)
>
> **STATUS UPDATE (Aug 2026):** the items selected for the hardening pass are marked
> ✅ FIXED with the implementing commit. Everything else is still genuinely open —
> do NOT re-report the fixed items in future audits. A third marker, 🔮 FUTURE, covers
> the generic Education Library (browse/search library, categories, bookmarks, reading
> history): that feature was fully built, then intentionally pulled from the UI when
> Learn became "Your Medicines." Its DB layer and routes are still sitting in the
> codebase, dormant, kept in case it gets revived later — that's a shelved feature,
> not an unfinished one, so don't lump it in with genuinely left-out work.

---

## 1. 🔴 Broken / Left / Left-Out

### 1.1 Real bugs

| # | Status | Issue | Location | Impact |
|---|--------|-------|----------|--------|
| B1 | ✅ FIXED `6a3c6f7` | **Streak can never exceed 7 days.** Streak loop only iterated `getLast7Days()`, so the `streak === 30` milestone celebration could never fire. | `app/(tabs)/index.tsx` | Milestone feature dead |
| B2 | ✅ FIXED `6a3c6f7` | **Chat deep-link context silently dropped.** Medicine detail navigated to `/chat` with `{ medicineId, medicineName }`, but `chat.tsx` never read the params. | `app/medicine/[id].tsx` → `app/chat.tsx` | Feature visibly did nothing |
| B3 | ✅ FIXED `3937be1`, `f8dc442` | **Export only backed up TODAY's dose records.** Export now includes the FULL dose history (export v3). | `src/utils/export.ts` | Data loss on restore-to-new-phone |
| B4 | ✅ FIXED `78a2918` | **Tap-to-focus didn't focus.** Scan screen now maps the tap point to real focus coordinates instead of magic offsets. | `app/scan.tsx` | Blurry photo capture |
| B5 | ⬜ OPEN | **Markdown bubbles break dark mode.** `MarkdownText` hardcodes light-only colors (`#1F2937`, `#F3F3F0`, `#686863`) — used by AI chat responses. | `src/components/ui/MarkdownText.tsx` | Unreadable/ugly chat in dark theme |
| B6 | ✅ FIXED `9473d0e` | **Hardcoded `#ccc` border** in History list styles — removed as part of the swipe-actions rewrite (now themed tokens). | `app/(tabs)/history.tsx` | Theme inconsistency |
| B7 | ✅ FIXED `6a3c6f7` | **"All" analytics period was actually 365 days.** Now a real full-range picker over the earliest record. | `app/analytics.tsx` | Misleading stats |
| B8 | ✅ FIXED `3937be1` | **Schema version constants disagreed** (`SCHEMA_VERSION = 3` vs `CURRENT_SCHEMA_VERSION = 15`); migrations now store the real version consistently. | `src/db/schema.ts`, `src/db/migrations.ts` | Future migration risk |
| B9 | ✅ FIXED `3937be1` | **`appVersion` hardcoded `'1.0.0'`** — now read from `expo-constants`. | `src/utils/export.ts` | Wrong version in exports |
| B10 | ✅ FIXED `78a2918` | Onboarding defined a `'done'` step that was never rendered/reached — removed during the health-step rework. | `app/onboarding.tsx` | Dead branch |

### 1.2 Half-built features (infrastructure exists, UI/behavior missing)

| # | Status | Feature | Notes |
|---|--------|---------|-------|
| H1 | 🔮 FUTURE | **Education Library** — full DB layer still in the codebase from the original build; the UI was intentionally pulled when Learn became "Your Medicines." Dormant, not missing — a candidate to revive later, not a gap to close now. |
| H2 | ✅ FIXED `6442a2a` | **Reminder escalation** — Settings toggle shipped + notification backend reads it (escalating reminders when a dose stays untaken past the window). |
| H3 | ⬜ OPEN | **`explainMedicine()`** exported in `src/ai/pipeline.ts` but never called anywhere. |
| H4 | ✅ FIXED `664f8cf` | **Validation toolkit** wired into the review + schedule screens (time format, conflicts, duplicates, missing fields). |
| H5 | ✅ FIXED `fa032f4` | **Medicine edit/delete** — full edit (name/dosage/times/inventory), pause course, delete with Undo on the medicine detail screen. |
| H6 | ✅ FIXED `78a2918`, `f33fd4f` | **`date_of_birth`** collected in onboarding (fully skippable) + Settings, and used wherever required: emergency card, doctor-visit/analytics PDFs (age), medicine detail. |
| H7 | ⬜ OPEN | **Education/[medicineId] context** — route exists but is only reachable via the Learn tab's own-medicine list. |

### 1.3 Dead code & leftovers

- ⬜ OPEN — **dead config constants** in `src/constants/config.ts` (`MAX_IMAGE_SIZE_BYTES`, `SUPPORTED_IMAGE_FORMATS`, `MAX_RETAINED_IMAGES`; `SNOOZE_MINUTES` is now live via the snooze setting, `UNDO_WINDOW_SECONDS` still unused).
- ⬜ PARTIAL — **unused imports**: `deleteMedicine`/`Linking` in `app/medicine/[id].tsx` are now used (H5 + refill); re-audit the rest.
- ⬜ OPEN — **unused type** `MedicineWithSchedule` (`src/types/models.ts`).
- ✅ FIXED `f13dfc8` — **react-query overhead**: now actually adopted for list reads instead of sitting idle.
- ✅ FIXED `e48a4de` — **`env.example` junk line** cleaned; **`improvements.txt`** deleted.
- ⬜ OPEN — `app/review.tsx` stale "Phase 5/6" comment.
- ✅ FIXED `e48a4de` — **root clutter**: all 11 summary markdown files + `project.zip` moved into `docs/`.
- ⬜ OPEN — `console.log`/`warn` leftovers in `notifications.ts`, `kv.ts`, `education.ts`, `database.ts`.

### 1.4 i18n violations (hardcoded English — breaks Urdu/RTL requirement)

⬜ OPEN (out of scope for the hardening pass — still the biggest remaining gap).
`en.ts` still lacks full `chat`, `analytics`, `education` coverage, and hardcoded strings remain in:
`app/chat.tsx`, `app/processing.tsx`, `app/review.tsx`, `app/schedule.tsx`, `app/medicine/[id].tsx`,
`app/analytics.tsx`, `app/emergency-card.tsx`, `app/(tabs)/medicines.tsx`, `app/(tabs)/settings.tsx` (some alert strings),
`src/components/ui/BiometricLock.tsx`, `src/components/medicine/ScheduleTimeline.tsx`.
(Partially improved along the way: history row labels, refill UI, encrypted-backup UI, PDF reports now have an Urdu variant — see UX4.)

### 1.5 Config / native issues

- ✅ FIXED `e48a4de` — `app.json` iOS `UIRequiredDeviceCapabilities` now `["arm64"]`.
- ✅ FIXED `e48a4de` — `NSMicrophoneUsageDescription` removed (no voice feature exists).
- ✅ FIXED `e48a4de` — worker model constants now come from a shared source of truth (`src/constants/ai-models.ts`), no more hand-mirroring in `worker/src/index.js`.
- ✅ FIXED `e48a4de` — `eas.json` now has iOS build sections for all profiles.

---

## 2. 🔧 Improvements

### Performance
1. ✅ FIXED `f13dfc8` — **N+1 queries killed** (batched/JOINed reads in Home, History, weekly chart).
2. ✅ FIXED `f13dfc8` — **react-query adopted** for cached list reads with invalidation on dose actions.
3. ✅ FIXED `f13dfc8` — Home screen loads parallelized.

### Code quality
4. ⬜ PARTIAL — dead-code sweep (see §1.3 for what remains).
5. ✅ FIXED `3937be1` — schema versioning unified (single constant, migrations store the real version).
6. ⬜ OPEN — remove the `as any` casts in `savePrescription.ts` by aligning `MedicineJSON` and `Medicine` types.
7. ✅ FIXED `3937be1` — `appVersion` via `expo-constants`.
8. ✅ FIXED `e48a4de` — single source of truth for AI model constants (`src/constants/ai-models.ts`).
9. ✅ FIXED `b9fddfd` — **tests exist**: Jest + jest-expo configured (`npm test`); 75 unit tests across `validation`, `inventory`, `interactions`, `savePrescription` (fuzzy matching) in `src/utils/__tests__/`. Migration idempotency tests still open.
10. ✅ FIXED `e48a4de` — root `.md` clutter moved to `docs/` (readme slimming still open).
11. ⬜ OPEN — strip `console.log`s / leveled logger disabled in release.
12. ✅ FIXED `e48a4de` — `env.example` junk fixed; `improvements.txt` deleted.

### Data layer
13. ✅ FIXED `f8dc442` — export/import is now **full-state** (v3): profile incl. all preference columns, prescriptions, medicines, schedules, full dose history, KV state, education bookmarks + reading history (slug-keyed), AI chat history. Import re-hydrates the settings store live.
14. ✅ FIXED `fa032f4` — `dose_records.scheduled_time` indexed for analytics range queries.
15. ✅ FIXED `fa032f4` — soft-delete tombstones for medicines/prescriptions (undo + export consistency).

### Native/config
16. ✅ FIXED `e48a4de` — `arm64` capability; mic usage description removed.
17. ✅ FIXED `e48a4de` — iOS profiles added to `eas.json` (builds remain Android-first by design).

---

## 3. 💡 Suggested Features

### Finish what's half-built (highest ROI)
1. 🔮 FUTURE — **Education Library UI** (browse/search, category tabs, bookmarks, reading progress, per-medicine articles) — shipped once, then shelved in favor of Learn = Your Medicines. Only worth reviving if a real content library gets reprioritized.
2. ⬜ OPEN — **`explainMedicine()` wiring** ("Explain in simple words" on medicine detail).
3. ✅ FIXED `6442a2a` — **Reminder escalation toggle + behavior** shipped end-to-end.
4. ✅ FIXED `fa032f4` — **Medicine edit/delete** shipped (edit, pause, delete with Undo).

### New features
5. ⬜ OPEN — Caregiver/family mode (WhatsApp share of weekly PDF is the cheap version).
6. ⬜ OPEN — Voice output (Urdu reminders/chat answers).
7. ⬜ OPEN — Symptom/side-effect journal.
8. ⬜ OPEN — Vitals log appended to the doctor-visit PDF.
9. ✅ FIXED `6442a2a` — **Follow-up reminders**: `follow_up_date` now schedules notifications, synced at app start and after each save.
10. ✅ FIXED `47afa7d` — **Refill ordering**: "Order refill" entry point on medicine detail, clearly marked **coming soon** in-app; full build plan in `docs/REFILL_ORDERING_GUIDE.md` (pharmacy table schema, phases, go-live checklist).
11. ✅ FIXED `ebafec4` — **Android home-screen widget**: next dose + one-tap Taken (`NextDoseWidgetProvider`, survives prebuild via `plugins/with-next-dose-widget.js`).
12. ⬜ OPEN — Push notifications (FCM/Expo) — ROADMAP item D.
13. ⬜ OPEN — Multi-profile.
14. ⬜ OPEN — Prayer-time-aware scheduling.
15. ⬜ OPEN — Pill identifier.
16. ⬜ OPEN — Urdu OCR polish (confidence thresholds).
17. ✅ FIXED `f8dc442` — **Encrypted backup**: password-protected AES backup files (create + restore in Settings → Data). True cloud auto-sync still open.
18. ⬜ OPEN — Cheap generic alternatives.
19. ✅ FIXED `f33fd4f` — **Emergency card one-tap actions** (call contact / call ambulance).
20. ✅ FIXED `6442a2a` + follow-ups — **Chat enhancements**: medicine context injection when opened from a medicine, context banner, quick-question chips, message copy button.

---

## 4. 🎨 UI/UX Improvements

### Localization & accessibility (priority)
1. ⬜ OPEN — Move every §1.4 string into `en.ts`/`ur.ts` (incl. missing `chat`/`analytics`/`education`/`lock` sections).
2. ⬜ OPEN — Full RTL audit (ROADMAP item B).
3. ✅ FIXED `2fc94cc` — dates/numerals localized consistently (Eastern numerals respected app-wide).
4. ✅ FIXED `145dcad` — **Urdu PDF reports**: RTL-capable templates + bundled Noto Nastaliq font for doctor-visit + analytics when language = Urdu.
5. ⬜ OPEN — Accessibility pass (touch targets, scaling).

### Elderly mode & contrast (ROADMAP item C)
6. ⬜ OPEN — Elderly mode as a real layout mode.
7. ⬜ OPEN — High-contrast audit of remaining hardcoded hexes.

### Home & schedule
8. ✅ FIXED `ae07588` — live countdown on the next-dose hero + day-rollover/foreground refresh.
9. ✅ FIXED `6a3c6f7` — streak milestones actually work (7 / 14 / 30-day celebrations).
10. ⬜ OPEN — Group timeline by daypart with localized labels.
11. ⬜ OPEN — Inline Undo on every destructive dose action.

### Scanner flow
12. ✅ FIXED `78a2918`, `2feb7af` — real tap-to-focus, corner guides, flash toggle, blur/low-light hints.
13. ⬜ OPEN — Post-capture "Retake / Use this photo" preview.
14. ⬜ OPEN — OCR confidence per field + in-place correction.

### Screens
15. ✅ PARTIAL — **Chat**: context banner when opened from a medicine + message copy button + quick-question chips shipped; remaining empty-state/illustration polish open.
16. ✅ FIXED `6a3c6f7` — **Analytics**: real date-range picker (B7 fix).
17. ✅ FIXED `9473d0e` — **History**: swipe-to-reveal archive/delete + localized labels.
18. ✅ FIXED `f33fd4f` — **Settings**: grouped sections, reminder-escalation toggle, DOB/blood-group collection, About section.
19. ✅ FIXED `78a2918` — **Onboarding**: DOB + blood group collected in a fully skippable health step; dead `'done'` step removed.
20. ✅ FIXED `f33fd4f` — **Emergency card**: structured inputs (blood-group picker, validated phone inputs).

### Polish
21. ✅ FIXED `709be59` — Skeleton loaders on home + analytics (+ history) while data loads.
22. ✅ FIXED `d6e098e` — Haptics coverage audited: success/error on toasts, selection on toggles/capture, dose actions.
23. ✅ FIXED `6442a2a` — Notification UX: big-text style with Taken / Snooze action buttons.
24. ⬜ OPEN — Localized empty states with CTA everywhere.
25. ⬜ OPEN — Reduce inline style duplication.
26. ✅ FIXED — AI calls have loading/error states with retry (never a dead-end alert).

---

## Summary

**Resolved in the Aug 2026 hardening pass** (do not re-report):
- **Bugs:** B1, B2, B3, B4, B6, B7, B8, B9, B10 (only B5 remains).
- **Half-built:** H2, H4, H5, H6 (H3 explainMedicine, H7 links remain).
- **Shelved for future revival:** H1 Education Library UI + the matching Suggested Feature — built, then intentionally removed from the UI, DB layer and routes still in place.
- **Config/native:** arm64, mic permission removed, worker↔app model-constant drift, eas.json iOS profiles.
- **Performance/data:** N+1 kills, react-query adoption, schema versioning, tests (75), full-state export/import v3, encrypted backups, `scheduled_time` index, soft-delete tombstones, docs consolidation, env cleanup.
- **Features:** escalation, follow-up reminders, refill entry point (+ guide), home-screen widget, encrypted backup, emergency-card calls, chat context/quick questions.
- **UX:** localized dates/numerals, Urdu RTL PDFs, live countdown + rollover, working streak milestones, scanner focus/blur/low-light, analytics range picker, history swipe actions, settings rework, skippable onboarding health step, structured emergency inputs, skeletons, haptics, notification action buttons, AI loading/error/retry states.

**Still open (highest value first):**
1. §1.4 i18n sweep + UX1/UX2 (the bilingual requirement is still only partially met).
2. H7 links + H3 explainMedicine wiring.
3. B5 MarkdownText dark-mode colors; remaining hardcoded hexes (UX7).
4. Dead-code leftovers (§1.3), `console.log` stripping (CQ11), `as any` casts in `savePrescription` (CQ6).
5. Remaining UX polish: Undo everywhere (UX11), capture preview (UX13), OCR confidence editing (UX14), empty states (UX24), daypart grouping (UX10).
6. Features backlog: caregiver mode, voice output, vitals log, multi-profile, push notifications, true cloud sync.

**Shelved, not open (revisit only if reprioritized):**
- H1 / Suggested Feature #1 — the Education Library UI (browse/search, categories, bookmarks, reading progress). Built once, deliberately removed from the UI in favor of Learn = Your Medicines. Code and schema stay in place for a possible future revival.
