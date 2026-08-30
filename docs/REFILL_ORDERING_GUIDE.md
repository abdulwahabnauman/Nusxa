# Refill Ordering — Implementation Guide

> **Status:** COMING SOON (UI placeholder shipped). This document is the
> build plan for turning the "Order refill" entry point into a real
> direct-ordering flow from a partner pharmacy / medical store.

The UI entry point already exists on the medicine detail screen
(`app/medicine/[id].tsx`, in the **Inventory** card). It currently opens a
"coming soon" sheet. This guide explains how to replace that sheet with a real
ordering flow.

---

## 1. What is already in place

These pieces exist today and should be **reused, not rebuilt**:

| Piece | Location | Notes |
|-------|----------|-------|
| Entry-point UI | `app/medicine/[id].tsx` → Inventory card | "Order refill" row + `Coming soon` badge + modal |
| Days-until-refill estimate | `src/utils/inventory.ts` → `estimateDaysUntilRefillFromFrequency()` | Drives the low-supply warning (≤ 7 days) |
| Refill reminders | `src/utils/notifications.ts` → `syncRefillNotifications()` | Quiet channel, fires at ≤ 3 days of supply, throttled |
| Inventory fields | `medicines.remaining_quantity`, `medicines.initial_quantity`, `frequency` | All round-trip through export/import |
| i18n keys | `src/i18n/en.ts` + `ur.ts` | `medicine.orderRefill`, `orderRefillDesc`, `refillComingSoon*` |
| Modal / Button / Badge / Input | `src/components/ui/*` | Match existing styling |

---

## 2. Product decisions to make first

Before writing code, lock these down (they drive the architecture):

1. **Who fulfils the order?**
   - A single partner pharmacy (deepest integration, simplest), or
   - A marketplace of pharmacies (needs search + selection), or
   - A "send my prescription to a pharmacy" hand-off (lightest).
2. **Payment model** — pay in-app, or cash/pay-on-delivery? In-app payment
   adds PCI scope; pay-on-delivery avoids it entirely and is common in PK.
3. **Regulatory** — prescription-only medicines need the actual prescription
   transmitted/verified. Confirm local (PK) pharmacy-dispensing rules.
4. **Region/language** — Urdu-first. All new strings go into `en.ts` **and**
   `ur.ts` (typed against `TranslationKeys`).

---

## 3. Recommended phased rollout

Ship in small, reversible steps so each phase is independently useful.

### Phase 0 — Hand-off link (lowest risk, fastest to ship)
Replace the coming-soon sheet with an action that hands the user's medicine
context to a pharmacy channel:
- Deep link / WhatsApp / tel: call to a chosen pharmacy with a prefilled
  message: medicine name, strength, dosage, remaining count.
- Uses `Linking.openURL` (same pattern as the emergency-card call button).
- No backend, no payment, no regulatory lift.

### Phase 1 — Pharmacy selection + order request (no payment)
- New table `pharmacies` (id, name, phone, address, location, accepts_orders).
- Order flow: pick pharmacy → confirm items + quantity → create `refill_orders`
  row with status `requested` → pharmacy confirms out-of-band.
- Surface order status back on the medicine detail card.

### Phase 2 — Payment + delivery tracking
- Integrate a payment provider (or keep pay-on-delivery).
- Status state machine: `requested → confirmed → preparing → dispatched →
  delivered / cancelled`.
- Notifications on each transition (reuse the notification toolkit).

---

## 4. Suggested schema (Phase 1+)

Add via a **versioned migration** in `src/db/migrations.ts` (bump
`SCHEMA_VERSION`; keep export/import in sync in `src/utils/export.ts`).

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
  medicine_id TEXT NOT NULL REFERENCES medicines(id),
  pharmacy_id TEXT REFERENCES pharmacies(id),
  quantity INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested', -- requested|confirmed|preparing|dispatched|delivered|cancelled
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT                            -- follow the soft-delete tombstone pattern
);
CREATE INDEX IF NOT EXISTS idx_refill_orders_medicine ON refill_orders(medicine_id);
```

Follow the existing repository pattern in `src/db/repositories/` (one file per
entity, parameterized SQL, `deleted_at IS NULL` filters).

---

## 5. Backend / sync considerations

- Today the app is fully local (SQLite) with an optional Cloudflare Worker for
  the AI proxy. Ordering needs a **server-side source of truth** so pharmacies
  can receive orders — do **not** rely on device-to-device.
- Reuse the Worker (`worker/src/index.js`) pattern for any new endpoint, and
  keep model/config constants in one place (import, don't hand-mirror).
- Treat pharmacy/PHI data with the same care as the rest of the app: never log
  patient data, encrypt at rest where feasible, and keep keys in
  `expo-secure-store`.

---

## 6. Where the UI changes happen

- **Entry point** (already there): `app/medicine/[id].tsx` → replace
  `setRefillSoonVisible(true)` with `router.push('/refill/' + medicine.id)`.
- **New screens** (file-based routing under `app/`):
  - `app/refill/[medicineId].tsx` — review item, quantity, pick pharmacy.
  - `app/refill/status/[orderId].tsx` — live order status.
- **Low-supply nudge**: when `estDays <= 3`, promote the Order refill row to a
  primary CTA (reuse the `colors.warning` treatment already used for the
  days-remaining text).
- **Skeletons & haptics**: follow the existing UX21/UX22 patterns for loading
  and feedback.

---

## 7. Checklist to flip "coming soon" → live

- [ ] Product decisions in §2 answered
- [ ] Migration + repositories added
- [ ] Pharmacy seed data or remote directory
- [ ] `app/refill/*` screens built (Urdu + English)
- [ ] Order status surfaced on medicine detail + notifications
- [ ] Export/import round-trips new tables (or intentionally excludes them)
- [ ] Update `readme.md` and this file's status line
- [ ] Remove the `refillComingSoon*` copy once live
