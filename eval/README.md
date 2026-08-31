# Golden-Set Evaluation Harness

You cannot improve what you do not measure. This folder measures the
prescription OCR pipeline end to end, so every pipeline change can be scored
before and after.

## Layout

```
eval/
├── run-eval.ts       # the harness (npm run eval)
├── results.csv       # one row per sample per run (append-only history)
└── golden/           # the labeled dataset
    ├── sample01.jpg
    ├── sample01.expected.json
    ├── blank_paper.jpg
    └── blank_paper.expected.json
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
