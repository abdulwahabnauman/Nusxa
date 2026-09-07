# Refill Ordering — Implementation Guide

> **Status:** Refill **estimation + reminders are shipped and live**. Direct
> ordering from a partner pharmacy is **not built** — the entry point opens a
> "coming soon" modal. This document describes exactly what exists in code
> today, its real behavior and edge cases, and the concrete steps to build the
> ordering flow on top of it.
>
> Every claim below is verified against the source (2026-09-01). File paths
> are the authoritative references.

---

## 1. What is shipped today

### 1.1 Data model (columns that drive everything)

`medicines` table (`src/db/schema.ts`, migrated through v19):

| Column | Role |
|---|---|
| `initial_quantity REAL` | Stock at save time (set on the review/schedule screens) |
| `remaining_quantity REAL` | Live stock; decremented best-effort on every "Taken" |
| `frequency TEXT` | Free-text frequency string — the only input to daily-dose parsing |

All three round-trip through export/import automatically (`src/utils/export.ts`
exports the full `medicines` rows; no per-field handling needed).

Inventory decrement happens in two places, both best-effort:
- Home "Taken" tap and notification quick action → `updateInventory(medicineId,
  remaining - 1)` (`src/db/repositories/medicine.ts`, called from
  `app/(tabs)/index.tsx` and `src/hooks/useNotificationHandler.ts`).
- There is **no increment path** other than editing `remaining_quantity`
  manually in the medicine detail Edit modal. (When ordering ships, a delivered
  order should add to `remaining_quantity` here.)

### 1.2 Estimation math — `src/utils/inventory.ts`

The whole estimate is a pure function chain, fully unit-tested
(`src/utils/__tests__/inventory.test.ts`, 6 describe blocks):

```
estimateDaysUntilRefillFromFrequency(remaining, frequency)
  → frequencyToDailyCount(frequency)     // free text → doses/day
  → estimateDaysUntilRefill(remaining, dailyCount)   // floor(remaining / daily)
```

`frequencyToDailyCount` recognizes (case-insensitive substring matches):

| Pattern | Daily count |
|---|---|
| `four` / `qid` / `qds` / `every 6 hour` | 4 |
| `three` / `tid` / `tds` / `every 8 hour` | 3 |
| `twice` / `bid` / `every 12 hour` | 2 |
| `every 4 hour` | 6 |
| `once` / `od` / `bedtime` / `morning` / `night` | 1 |
| `as needed` / `prn` / `sos` | **0** (→ estimate is `null`, see §3) |
| `N times daily`, `N/day`, `Nx daily` | N |
| anything else / null | **1** (documented default, covered by tests) |

`estimateDaysUntilRefill` returns `null` when `dailyCount <= 0` or
`remaining <= 0`; otherwise `Math.floor(remaining / dailyCount)`.

### 1.3 UI surfaces (three, all live)

1. **Medicine detail** (`app/medicine/[id].tsx`) — Inventory card shows
   `remaining / initial`, "Est. days remaining", and the day count colored
   `colors.warning` when `estDays <= 7` (lines ~260, ~424–433). Below it sits
   the **Order refill** row with a `Coming soon` badge → opens the
   `refillComingSoon*` modal (lines ~441–462, modal ~623).
2. **Medicines tab** (`app/(tabs)/medicines.tsx`) — passes `daysUntilRefill`
   into each `MedicineCard`; the screen's low-stock section filters on
   `daysUntilRefill <= 7` (line ~91).
3. **MedicineCard** (`src/components/medicine/MedicineCard.tsx`, lines ~126–151):
   - `<= 0` → `home.outOfStock` badge, `error` variant
   - `<= 3` → `home.daysLeftRefill` badge, `error` variant
   - `<= 7` → same badge, `warning` variant
   - `> 7` → quiet secondary text line

### 1.4 Refill reminders — `syncRefillNotifications()` (`src/utils/notifications.ts`)

Exact algorithm:

```
if notifications disabled → cancel all ids starting 'refill-' and return
for each active medicine:
  daysLeft = estimateDaysUntilRefillFromFrequency(remaining, frequency)
  skip if daysLeft === null or daysLeft > 3                 // ≤3-day trigger
  skip if KV 'refill-armed-{med.id}' is < 3 days old        // throttle
  schedule for 09:00 NEXT DAY, identifier 'refill-{med.id}'
    channel REFILL_CHANNEL_ID ('refill-reminders', DEFAULT importance —
    deliberately quieter than the HIGH-importance dose channel)
    data: { type: 'refill', medicineId }
  setKV('refill-armed-{med.id}', today)
```

Plus housekeeping: reminders whose medicine no longer qualifies are cancelled
each sync, and the dose-sync stray-cleanup explicitly skips `refill-` prefixed
ids (they manage their own lifecycle).

**Call sites:** root layout after DB/notification init (`app/_layout.tsx`
line ~256) and on Home focus (`app/(tabs)/index.tsx` line ~208).

**Copy** lives in `REMINDER_COPY` in the same file, bilingual:
en "Running low on medicine" / ur "دوا کم ہو رہی ہے", with the day count
interpolated.

### 1.5 Tap behavior

A refill notification tap falls through to the generic branch in
`src/hooks/useNotificationHandler.ts`: `data.medicineId` is present, so it
opens `router.push('/medicine/{id}')`. No quick actions on refill reminders.

### 1.6 i18n keys (all present in `src/i18n/en.ts` + `ur.ts`)

`t.medicine.estDaysRemaining`, `daysRemaining` (`{n}` placeholder),
`orderRefill`, `orderRefillDesc`, `refillComingSoon`, `refillComingSoonTitle`,
`refillComingSoonDesc`, plus `t.home.outOfStock` and `t.home.daysLeftRefill`.

---

## 2. Threshold table (single source of truth)

| Behavior | Threshold | Where |
|---|---|---|
| Days text turns warning color (detail) | ≤ 7 days | `app/medicine/[id].tsx` |
| Medicines-tab low-stock section | ≤ 7 days | `app/(tabs)/medicines.tsx` |
| Card badge `warning` variant | ≤ 7 days | `MedicineCard.tsx` |
| Card badge `error` variant | ≤ 3 days | `MedicineCard.tsx` |
| "Out of stock" badge | ≤ 0 days | `MedicineCard.tsx` |
| Reminder eligibility | ≤ 3 days supply | `syncRefillNotifications` |
| Reminder throttle | once / 3 days / medicine | `reminders_state` KV (`src/db/repositories/kv.ts`) |
| Reminder fire time | 09:00 next day | `syncRefillNotifications` |

If you change a threshold, change it in **all** listed places — they are
literals, not shared constants.

---

## 3. Real edge cases (current behavior, by design or by test)

- **PRN / as-needed medicines never get refill reminders**: frequency parses
  to 0 daily doses → estimate `null` → skipped. The UI also hides day counts
  for them.
- **Unparseable frequencies assume once daily** — an aggressive frequency like
  "every other day" overestimates consumption and underestimates days left.
  The ordering flow should treat the estimate as advisory, never as a
  committed delivery date.
- **`remaining_quantity` null** (user never entered a quantity) → no estimate,
  no badge, no reminder anywhere. The ordering flow must handle this row shape.
- **Estimate staleness**: it only updates when a dose is logged (decrement) or
  the user edits quantity — there is no calendar-based decay.
- **Throttle is per-medicine, keyed `refill-armed-{id}`**, and survives
  export/import only because the full `reminders_state` KV table is exported.

---

## 4. Building the ordering flow (the not-yet-built part)

### 4.1 Product decisions that gate the code

1. **Fulfilment model** — single partner pharmacy (deepest, simplest) vs.
   pharmacy directory (needs search/selection) vs. hand-off only (deepest link
   / WhatsApp / `tel:` with a prefilled message — same `Linking.openURL`
   pattern as the emergency-card call button; no backend at all).
2. **Payment** — pay-on-delivery (no PCI scope, common in PK) vs. in-app
   payment provider.
3. **Regulatory** — prescription-only items require transmitting the actual
   prescription; confirm PK pharmacy-dispensing rules. `prescriptions.source_image_uri`
   already stores the scan, which can be attached to an order.
4. **Language** — every new string must go into `en.ts` **and** `ur.ts`
   (`ur.ts` is typed against `en.ts`, so missing keys fail the type check).

### 4.2 Database — migration v20

Schema versioning today: `CURRENT_SCHEMA_VERSION = 19` in `src/db/schema.ts`,
migrations registered in the `MIGRATIONS` array in `src/db/migrations.ts`.
Follow the established v16+ pattern: defensive `try/catch` around each ALTER,
soft-delete `deleted_at` tombstone, then
`UPDATE schema_version SET version = 20;`.

```sql
CREATE TABLE IF NOT EXISTS pharmacies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  latitude REAL,
  longitude REAL,
  accepts_orders INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS refill_orders (
  id TEXT PRIMARY KEY,
  medicine_id TEXT NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  pharmacy_id TEXT REFERENCES pharmacies(id),
  quantity INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested', -- requested|confirmed|preparing|dispatched|delivered|cancelled
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT                            -- v16 tombstone pattern
);
CREATE INDEX IF NOT EXISTS idx_refill_orders_medicine ON refill_orders(medicine_id);
```

Add `src/db/repositories/pharmacy.ts` and `src/db/repositories/refill-order.ts`
following the existing repo style (parameterized SQL, `deleted_at IS NULL`
filters). On `delivered`, call `updateInventory(medicineId, remaining +
quantity)` — the increment path that is missing today (§1.1).

**Export/import:** decide explicitly whether orders round-trip. If yes, add
them to `exportAsJSON`/`importFromJSON` in `src/utils/export.ts` and bump the
export format version as the existing code does; if no, state that in the
import validation message.

### 4.3 Screens & routing

- Replace the coming-soon handler in `app/medicine/[id].tsx`:
  `setRefillSoonVisible(true)` → `router.push('/refill/' + medicine.id)`.
- New file-based routes:
  - `app/refill/[medicineId].tsx` — item review, quantity stepper prefilled
    from `initial_quantity`, pharmacy picker. Handle `remaining_quantity ===
    null` (§3).
  - `app/refill/status/[orderId].tsx` — status timeline over the state machine
    `requested → confirmed → preparing → dispatched → delivered | cancelled`.
- Low-supply promotion: when `estDays <= 3` (the reminder threshold), promote
  the Order refill row to a primary CTA — reuse the `colors.warning` treatment
  already applied at `estDays <= 7`.
- Loading/feedback: use the existing `Skeleton` and `Toast` components in
  `src/components/ui/`; match the spring press feedback on `Button`.

### 4.4 Backend / sync

Today the only server component is the stateless AI proxy (`worker/src/index.js`,
endpoints `GET /`, `POST /chat`, `POST /vision`, auth via `x-app-key` header).
Ordering needs a **server-side source of truth** — pharmacies must receive
orders, so device-to-device is not an option. If the Worker is extended:

- New endpoints (e.g. `POST /orders`, `GET /orders/:id`) alongside the existing
  ones, reusing `readJson`/`jsonReply` and the `x-app-key` gate.
- Keep the app key model honest: it deters casual abuse; add Cloudflare
  rate-limiting for anything order-related (per `worker/README.md`).
- Orders contain PHI — never log request bodies, and treat them with the same
  care as the rest of the app (keys in `expo-secure-store`, no patient data in
  the bundle).

### 4.5 Notifications

Reuse the refill channel (`REFILL_CHANNEL_ID`) and the `refill-` identifier
prefix convention (e.g. `refill-status-{orderId}`) so the existing stray-cleanup
skip-list keeps working unchanged. Order-status copy goes into `REMINDER_COPY`
in both languages.

---

## 5. Ship checklist (coming soon → live)

- [ ] §4.1 decisions answered and recorded here
- [ ] Migration v20 + `pharmacy`/`refill-order` repositories
- [ ] Pharmacy seed data or remote directory endpoint
- [ ] `app/refill/*` screens, EN + UR, RTL-checked
- [ ] Delivered-order inventory increment wired to `updateInventory`
- [ ] Order-status notifications on `REFILL_CHANNEL_ID`
- [ ] Export/import decision implemented + export format version bumped if included
- [ ] `src/utils/__tests__/` coverage for any new pure logic (order quantity math)
- [ ] Update `readme.md` (structure tree + flows) and this file's status line
- [ ] Remove `refillComingSoon*` i18n keys and the modal from `app/medicine/[id].tsx`
