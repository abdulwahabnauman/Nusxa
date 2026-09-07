# Golden-Set Evaluation Harness

You cannot improve what you do not measure. This folder measures the
prescription OCR pipeline end to end, so every pipeline change can be scored
before and after.

## Layout

```
eval/
├── run-eval.ts                        # the harness (npm run eval)
├── results.csv                        # one row per sample per run (append-only history)
└── golden/                            # the labeled dataset
    ├── blank_paper.jpg                # negative: a photographed blank sheet
    ├── blank_paper.expected.json
    ├── synthetic_typed_rx.jpg         # synthetic typed page, 2100x2997
    ├── synthetic_typed_rx.expected.json
    ├── synthetic_typed_rx_1568.jpg    # same page at the app's upload size
    └── synthetic_typed_rx_1568.expected.json
```

## Adding a sample

1. Drop an anonymized prescription photo into `eval/golden/`
   (`.jpg`, `.jpeg`, `.png` or `.webp`).
2. Create `<same-name>.expected.json` next to it, hand-labeled from the
   paper, in the shape of `PrescriptionJSON` (only the fields below are
   scored; omit any you cannot read yourself):

```json
{
  "medicines": [
    {
      "name": "Amoxicillin",
      "dosage": "1 capsule",
      "frequency": "Three times daily",
      "duration": "7 days"
    }
  ]
}
```

3. **Negative samples** (blank paper, a newspaper page, a photo with no
   prescription) get `"negative": true` and `"medicines": []`. A vision
   model inventing a medicine is the worst failure mode, so these are
   tracked as first-class hallucination tests.

## The synthetic fixtures already in the set

`blank_paper` and the `synthetic_typed_rx*` pair are fabricated, not
photographed: a rendered clinic letterhead with invented doctor and clinic
names and no patient data anywhere. They exist so the harness is runnable and
so two specific things stay guarded:

- `blank_paper` is the hallucination test — any medicine returned here is a
  bug, no exceptions.
- `synthetic_typed_rx` and `synthetic_typed_rx_1568` hold identical content at
  two resolutions: the full-size page, and the copy the app would upload after
  `downscaleForOcr()` (long edge `OCR_MAX_IMAGE_EDGE`, aspect preserved,
  re-encoded). Their two rows in `results.csv` are the before/after comparison
  for any change to upload sizing, so keep the `medicines` arrays of the two
  `.expected.json` files identical.

They say nothing about real-world accuracy. Clean rendered type is far easier
to read than a photographed, handwritten or glare-affected prescription, so
100% on these fixtures is a plumbing check, not a quality figure. That figure
comes only from real anonymized samples (below).

## Running

```bash
npm run eval
```

Credentials come from environment variables or the repo `.env` file:

- `GEMINI_API_KEY` — direct Gemini calls with the same prompt + response
  schema the app uses (preferred), or
- `EXPO_PUBLIC_AI_PROXY_URL` + `EXPO_PUBLIC_AI_PROXY_APP_KEY` — route
  through the worker proxy exactly like the app does.

## Metrics

| Metric | Definition |
| --- | --- |
| Name accuracy | extracted medicine fuzzy-matches an expected name (similarity >= 0.9) |
| Dosage / frequency / duration accuracy | exact or normalized match on matched pairs |
| False-medicine rate | extracted medicines with no expected match |
| Missing-medicine rate | expected medicines that were not extracted |
| Hallucination | a negative sample returning any medicine at all |

Run the harness before and after every pipeline change; `results.csv` keeps
the history so regressions are visible at a glance. Aim for 20-40 real
(anonymized) samples over time, covering typed and handwritten, English and
Urdu, single- and multi-medicine prescriptions.
