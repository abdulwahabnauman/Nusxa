# OCR & Prescription Reading: Enhancement Roadmap

The whole app is built around prescription scanning, so this roadmap tracks every known
improvement to the capture → OCR → review pipeline, what is already done, and what remains.

## Done

| Item | Where | Notes |
| --- | --- | --- |
| On-device blur gate | `src/utils/sharpness.ts`, `app/scan.tsx` | Laplacian-variance sharpness check (jpeg-js pixel decode on a 512px downsample) runs after every capture, gallery pick, and crop. Blurry previews show a retake banner and Process is disabled, with a "process anyway" escape hatch. Threshold: `BLUR_VARIANCE_THRESHOLD` in `src/constants/config.ts`. |
| Multi-page prescriptions | `app/scan.tsx`, `src/ai/pipeline.ts`, `src/ai/client.ts`, `worker/src/index.js` | Up to `MAX_PRESCRIPTION_PAGES` (3) images per scan session. Pages are sent as multiple `inlineData` parts in a single Gemini call; the worker `/vision` endpoint accepts an `images` array while staying backward-compatible with the single `image` field. |
| Urdu / Roman-Urdu handling | `src/ai/prompts.ts` | OCR prompt now handles English, Urdu (Nastaliq), Roman-Urdu and mixes: verbatim Urdu transcription with English transliteration in `name`, Roman-Urdu dosage phrases mapped to structured fields. |
| Low-light EXIF warning | `app/scan.tsx` | Pre-existing: `looksDim()` EXIF heuristic surfaces a non-blocking banner. |
| Full-resolution capture | `app/scan.tsx` | Camera shots are no longer hard-cropped to the focus box (it is a visual guide now); capture and gallery pick run at `quality: 1.0`, re-encodes use 0.95, and crops whose long edge is under 1500px are upscaled toward ~2000px in the same manipulator pass (`MIN_LONG_EDGE` / `TARGET_LONG_EDGE`). |
| Deterministic post-processor | `src/ai/postprocess.ts` | Runs after every OCR parse: fuzzy name correction against the `CATEGORY_KEYWORDS` generics (normalized Levenshtein, accept >= 0.82, never rewrites Urdu/brands), `MEDICAL_ABBREVIATIONS` frequency expansion (AC/PC move to meal_instruction), strength unit normalization (`0.5 g` -> `500 mg`, `500mg` -> `500 mg`, `ug` -> `mcg`). Every change is recorded in `field_sources` as `corrected` vs `ocr`. 22 unit tests in `src/ai/__tests__/postprocess.test.ts`. |
| Stronger extraction schema | `src/ai/prompts.ts`, `src/ai/client.ts`, `src/ai/pipeline.ts`, `worker/src/index.js` | `original_text` (verbatim source line) and per-field `field_confidence` per medicine; diagnosis/clinical notes go to `raw_notes` -> `patient_notes`; Gemini `responseSchema` (controlled generation) + temperature 0 in both the direct call and the worker; one few-shot example in the prompt. |
| Auto-rotate sideways scans | `app/scan.tsx` | Landscape gallery picks are rotated 90° upright before OCR (after EXIF baking). |
| Archive originals | `src/utils/archiveImages.ts` | Saved prescriptions copy their pages to `documentDirectory/prescriptions/` (capped at `MAX_RETAINED_IMAGES = 100`, oldest trimmed first) so `source_image_uri` survives scan cleanup and improved pipelines can re-process old scans. Wired into both save paths (quick approve and schedule confirm). |
| Review thumbnails + original text | `app/review.tsx` | All pages of a multi-page scan render as a thumbnail strip (previously only page 1), and each medicine card shows its verbatim `original_text` ("As written on the prescription", bilingual i18n). |
| Golden-set evaluation harness | `eval/run-eval.ts`, `eval/README.md`, `eval/results.csv` | `npm run eval` runs labeled samples through the same OCR prompt + response schema (direct Gemini or worker proxy) and reports name accuracy (fuzzy >= 0.9), dosage/frequency/duration normalized match, false-medicine and missing-medicine rates; negative samples (blank paper etc.) are first-class hallucination tests. Each run appends per-sample rows to `results.csv`. Needs real anonymized samples in `eval/golden/` (20-40 target). |

## Remaining (priority order)

### 1. Two-pass architecture — HIGH IMPACT, MEDIUM
Split the single shot (image → JSON) into:
1. **Pass 1 (Gemini):** pure verbatim transcription of every visible line.
2. **Pass 2 (Groq gpt-oss-120b, free):** structure the transcript into `PrescriptionJSON`.
   Text-only, so it is cheap, retryable, and never re-uploads the image.
Then:
- **Self-consistency:** run a pass twice; fields that disagree are auto-flagged for review.
  This replaces the model's unreliable self-reported confidence with measured disagreement.
- **Field-level re-query:** in `app/review.tsx`, tapping a low-confidence field sends only
  that field's `original_text` (or a crop) back with a focused prompt instead of re-running
  the whole pipeline.

### 2. On-device fallback with ML Kit — MEDIUM IMPACT, LARGE
Add Google ML Kit Text Recognition via a config plugin (pattern: `plugins/`) as an instant
local pre-pass ("we found 3 medicines" while the cloud call runs) and as the offline
fallback, with results marked lower-trust and `verification_status: 'pending'`. The core
feature currently requires internet.

## Calibration notes

- `BLUR_VARIANCE_THRESHOLD` (55) was set conservatively without device data; after real-world
  testing, tune it with the golden set (raise if good photos get blocked, lower if blur slips
  through). The sharpness score is returned by `measureSharpness()` and can be logged
  temporarily to collect real distributions.
- The blur gate intentionally returns "pass" when measurement fails (unsupported format,
  decode error) so users are never trapped by the heuristic.
