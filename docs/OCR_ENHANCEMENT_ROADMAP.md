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

## Remaining (priority order)

### 1. Relax the focus-box crop and raise capture quality — HIGH IMPACT, SMALL
Camera shots are hard-cropped to the 280×320 focus box in `app/scan.tsx` (`handleTakePhoto`):
anything outside the brackets is discarded before OCR, and the near-square frame fights A4
portrait prescriptions. Capture `quality` is 0.8 and crops re-encode at 0.9.
- Stop auto-cropping camera captures (or make the guide frame 3:4 and taller); send the
  full-resolution photo and let the model ignore margins. The new drag-edge crop already
  lets users frame precisely when they want to.
- Raise capture `quality` to 1.0 and avoid double JPEG re-compression.
- If a cropped region's long edge is below ~1500px, upscale it to ~2000px before sending;
  vision models degrade sharply below that on handwriting.

### 2. Deterministic post-processor using the existing dictionaries — HIGH IMPACT, SMALL
`MEDICAL_ABBREVIATIONS`, `CATEGORY_KEYWORDS`, and `FREQUENCY_TO_DAILY_COUNT` in
`src/constants/medical.ts` are defined but never imported. Build `src/ai/postprocess.ts`:
- Fuzzy-match OCR'd names against known generics/brands (normalized Levenshtein, accept
  only ≥ ~0.82 similarity) to fix classic misreads like "Amoxlcillin" → "Amoxicillin".
- Expand frequency abbreviations deterministically instead of trusting the model.
- Normalize strength units (`0.5 g` → `500 mg`).
- Populate `MedicineJSON.field_sources` (currently always `{}`) so the review screen can
  show which fields were OCR'd vs corrected.

### 3. Stronger extraction schema — MEDIUM, SMALL
In `src/ai/prompts.ts` + `src/ai/client.ts`:
- Ask for `original_text` (verbatim line text) per medicine so review can show what was
  actually written, and per-field confidence instead of only per-medicine.
- Use Gemini `responseSchema` instead of only `responseMimeType` for hard-enforced JSON.
- Lower OCR temperature to 0 (currently 0.1) in `callGemini`/`visionCompletion`.
- Add one few-shot example of a correctly extracted medicine row.
- Capture diagnosis notes into `patient_notes` to feed the `purpose` field later.

### 4. Two-pass architecture — HIGH IMPACT, MEDIUM
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

### 5. On-device fallback with ML Kit — MEDIUM IMPACT, LARGE
Add Google ML Kit Text Recognition via a config plugin (pattern: `plugins/`) as an instant
local pre-pass ("we found 3 medicines" while the cloud call runs) and as the offline
fallback, with results marked lower-trust and `verification_status: 'pending'`. The core
feature currently requires internet.

### 6. Capture polish — LOW EFFORT EACH
- **Auto-rotate:** detect sideways A4 gallery scans and rotate before OCR.
- **Archive originals:** keep source images (config already has `MAX_RETAINED_IMAGES = 100`)
  so improved pipelines can re-process old prescriptions.
- **Review screen:** show all page thumbnails for multi-page scans (currently only page 1).

### 7. Golden-set evaluation harness — MEASURES EVERYTHING ABOVE
You cannot improve what you do not measure.
1. `eval/golden/` folder: 20–40 real (anonymized) prescription photos, each with a
   hand-labeled `expected.json` in the same shape as `PrescriptionJSON`.
2. `eval/run-eval.ts` script (Node, calls the same `visionCompletion` or the worker):
   runs every sample through the pipeline and reports field-level metrics:
   - **Name accuracy:** fuzzy match ≥ 0.9 vs expected.
   - **Dosage / frequency / duration accuracy:** exact or normalized match.
   - **False-medicine rate:** extracted medicines with no expected match.
   - **Hallucination rate:** medicines invented from illegible/blank regions.
   - **Missing-medicine rate:** expected medicines not extracted.
3. **Negative tests:** blank paper, a newspaper page, and a photo with no prescription must
   all return zero medicines. A vision model inventing a medicine is the worst failure mode,
   so track it as a first-class metric.
4. Run the harness before/after every pipeline change and record scores in
   `eval/results.csv` so regressions are visible.

## Calibration notes

- `BLUR_VARIANCE_THRESHOLD` (55) was set conservatively without device data; after real-world
  testing, tune it with the golden set (raise if good photos get blocked, lower if blur slips
  through). The sharpness score is returned by `measureSharpness()` and can be logged
  temporarily to collect real distributions.
- The blur gate intentionally returns "pass" when measurement fails (unsupported format,
  decode error) so users are never trapped by the heuristic.
