/**
 * Golden-set evaluation harness for the prescription OCR pipeline.
 *
 * Runs every sample in eval/golden/ through the same OCR prompt + response
 * schema the app uses (directly against Gemini, or through the proxy worker
 * when configured) and reports field-level metrics:
 *
 *   - Name accuracy:        fuzzy match >= 0.9 vs the hand-labeled name
 *   - Dosage / frequency / duration accuracy: exact or normalized match
 *   - False-medicine rate:  extracted medicines with no expected match
 *   - Missing-medicine rate: expected medicines that were not extracted
 *   - Hallucination:        negative samples (blank paper, newspaper, ...)
 *                           must return ZERO medicines — tracked per sample
 *
 * Every run appends one row per sample to eval/results.csv so regressions
 * are visible across pipeline changes.
 *
 * Usage:
 *   npx tsx eval/run-eval.ts          (or: npm run eval)
 *
 * Credentials (from environment or the repo .env file):
 *   GEMINI_API_KEY                     direct Gemini calls (preferred)
 *   EXPO_PUBLIC_AI_PROXY_URL +         route through the worker proxy
 *   EXPO_PUBLIC_AI_PROXY_APP_KEY       (uses the worker's server-side key)
 */
import * as fs from 'fs';
import * as path from 'path';
import { OCR_SYSTEM_PROMPT, OCR_RESPONSE_SCHEMA } from '../src/ai/prompts';
import { GEMINI_MODEL, GEMINI_API_BASE, MAX_OUTPUT_TOKENS } from '../src/constants/ai-models';
import { levenshteinSimilarity } from '../src/ai/postprocess';

/** Name fuzzy-match acceptance threshold for "this is the same medicine" */
const NAME_MATCH_THRESHOLD = 0.9;

const GOLDEN_DIR = path.join(__dirname, 'golden');
const RESULTS_CSV = path.join(__dirname, 'results.csv');
const CSV_HEADER =
  'timestamp,sample,is_negative,expected,extracted,matched,name_accuracy,dosage_accuracy,frequency_accuracy,duration_accuracy,false_rate,missing_rate,hallucination';

interface ExpectedMedicine {
  name?: string | null;
  dosage?: string | null;
  frequency?: string | null;
  duration?: string | null;
}

interface ExtractedMedicine {
  name: string | null;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
}

interface Sample {
  name: string;
  imagePath: string;
  expected: { medicines: ExpectedMedicine[] };
  isNegative: boolean;
}

// ---- Environment ----------------------------------------------------------

/** Minimal .env loader: never overrides variables already in the environment */
function loadDotEnv(root: string): void {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || !m[1]) continue;
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2]!.replace(/^["']|["']$/g, '');
    }
  }
}

// ---- Sample discovery -----------------------------------------------------

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

function discoverSamples(): Sample[] {
  if (!fs.existsSync(GOLDEN_DIR)) return [];
  const samples: Sample[] = [];
  for (const file of fs.readdirSync(GOLDEN_DIR).sort()) {
    if (!file.endsWith('.expected.json')) continue;
    const base = file.slice(0, -'.expected.json'.length);
    const imagePath = IMAGE_EXTS.map((ext) => path.join(GOLDEN_DIR, base + ext))
      .find((p) => fs.existsSync(p));
    if (!imagePath) {
      console.warn(`  [skip] ${base}: no image found next to ${file}`);
      continue;
    }
    try {
      const expected = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, file), 'utf8'));
      const medicines: ExpectedMedicine[] = Array.isArray(expected.medicines)
        ? expected.medicines
        : [];
      samples.push({
        name: base,
        imagePath,
        expected: { medicines },
        isNegative: expected.negative === true || medicines.length === 0,
      });
    } catch (error) {
      console.warn(`  [skip] ${file}: ${(error as Error).message}`);
    }
  }
  return samples;
}

// ---- OCR call (same prompt + schema as the app) ---------------------------

function toBase64(imagePath: string): string {
  return fs.readFileSync(imagePath).toString('base64');
}

async function callDirectGemini(apiKey: string, imageB64: string): Promise<string> {
  const body = {
    systemInstruction: { parts: [{ text: OCR_SYSTEM_PROMPT }] },
    contents: [
      {
        role: 'user',
        parts: [
          { text: 'Please extract all prescription information from this image. Return structured JSON.' },
          { inlineData: { mimeType: 'image/jpeg', data: imageB64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      responseMimeType: 'application/json',
      responseSchema: OCR_RESPONSE_SCHEMA,
    },
  };
  const response = await fetch(
    `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!response.ok) {
    throw new Error(`Gemini API error ${response.status}: ${await response.text()}`);
  }
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

async function callProxy(proxyUrl: string, appKey: string, imageB64: string): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (appKey) headers['x-app-key'] = appKey;
  const response = await fetch(`${proxyUrl}/vision`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      system: OCR_SYSTEM_PROMPT,
      text: 'Please extract all prescription information from this image. Return structured JSON.',
      image: imageB64,
      images: [imageB64],
      temperature: 0,
      responseSchema: OCR_RESPONSE_SCHEMA,
    }),
  });
  if (!response.ok) {
    throw new Error(`Proxy error ${response.status}: ${await response.text()}`);
  }
  const data = (await response.json()) as { content?: string; error?: string };
  if (!data.content) throw new Error(data.error ?? 'Empty response from proxy');
  return data.content;
}

async function extractMedicines(sample: Sample): Promise<ExtractedMedicine[]> {
  const imageB64 = toBase64(sample.imagePath);
  const proxyUrl = (process.env.EXPO_PUBLIC_AI_PROXY_URL ?? '').replace(/\/+$/, '');
  const geminiKey = process.env.GEMINI_API_KEY ?? '';

  let raw: string;
  if (proxyUrl) {
    raw = await callProxy(proxyUrl, process.env.EXPO_PUBLIC_AI_PROXY_APP_KEY ?? '', imageB64);
  } else if (geminiKey) {
    raw = await callDirectGemini(geminiKey, imageB64);
  } else {
    throw new Error(
      'No credentials: set GEMINI_API_KEY or EXPO_PUBLIC_AI_PROXY_URL (+EXPO_PUBLIC_AI_PROXY_APP_KEY)'
    );
  }

  const parsed = JSON.parse(raw) as { medicines?: Array<Record<string, unknown>> };
  return (parsed.medicines ?? []).map((m) => ({
    name: typeof m.name === 'string' ? m.name : null,
    dosage: typeof m.dosage === 'string' ? m.dosage : null,
    frequency: typeof m.frequency === 'string' ? m.frequency : null,
    duration: typeof m.duration === 'string' ? m.duration : null,
  }));
}

// ---- Metrics ---------------------------------------------------------------

const compact = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Fuzzy name similarity: normalized Levenshtein plus a containment rule for
 * brand/generic pairs like "amoxicillin" inside "amoxicillintrihydrate" */
function nameSimilarity(a: string | null, b: string | null): number {
  const ca = compact(a);
  const cb = compact(b);
  if (!ca || !cb) return 0;
  if (ca === cb) return 1;
  if (Math.min(ca.length, cb.length) >= 8 && (ca.includes(cb) || cb.includes(ca))) return 0.95;
  return levenshteinSimilarity(ca, cb);
}

/** Exact-or-normalized field match ("500 mg" and "500mg" compare equal) */
function fieldMatch(actual: string | null, expected: string | null | undefined): boolean {
  if (!expected) return true; // not labeled -> nothing to check
  return compact(actual) === compact(expected);
}

interface SampleResult {
  sample: Sample;
  extractedCount: number;
  matched: number;
  nameAccuracy: number | null;
  dosageAccuracy: number | null;
  frequencyAccuracy: number | null;
  durationAccuracy: number | null;
  falseRate: number;
  missingRate: number;
  hallucination: boolean;
}

function evaluateSample(sample: Sample, extracted: ExtractedMedicine[]): SampleResult {
  const expected = sample.expected.medicines;

  if (sample.isNegative) {
    return {
      sample,
      extractedCount: extracted.length,
      matched: 0,
      nameAccuracy: null,
      dosageAccuracy: null,
      frequencyAccuracy: null,
      durationAccuracy: null,
      falseRate: extracted.length > 0 ? 1 : 0,
      missingRate: 0,
      hallucination: extracted.length > 0,
    };
  }

  // Greedy best-first pairing between extracted and expected medicines
  const pairs: Array<{ exp: number; ext: number; score: number }> = [];
  for (let i = 0; i < expected.length; i++) {
    for (let j = 0; j < extracted.length; j++) {
      const score = nameSimilarity(expected[i]!.name ?? null, extracted[j]!.name);
      if (score >= NAME_MATCH_THRESHOLD) pairs.push({ exp: i, ext: j, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  const usedExp = new Set<number>();
  const usedExt = new Set<number>();
  const matches: Array<{ exp: number; ext: number }> = [];
  for (const pair of pairs) {
    if (usedExp.has(pair.exp) || usedExt.has(pair.ext)) continue;
    usedExp.add(pair.exp);
    usedExt.add(pair.ext);
    matches.push({ exp: pair.exp, ext: pair.ext });
  }

  const fieldScores = { dosage: 0, frequency: 0, duration: 0 };
  for (const { exp, ext } of matches) {
    if (fieldMatch(extracted[ext]!.dosage, expected[exp]!.dosage)) fieldScores.dosage++;
    if (fieldMatch(extracted[ext]!.frequency, expected[exp]!.frequency)) fieldScores.frequency++;
    if (fieldMatch(extracted[ext]!.duration, expected[exp]!.duration)) fieldScores.duration++;
  }

  const n = matches.length;
  return {
    sample,
    extractedCount: extracted.length,
    matched: n,
    nameAccuracy: expected.length > 0 ? n / expected.length : null,
    dosageAccuracy: n > 0 ? fieldScores.dosage / n : null,
    frequencyAccuracy: n > 0 ? fieldScores.frequency / n : null,
    durationAccuracy: n > 0 ? fieldScores.duration / n : null,
    falseRate: extracted.length > 0 ? (extracted.length - n) / extracted.length : 0,
    missingRate: expected.length > 0 ? (expected.length - n) / expected.length : 0,
    hallucination: false,
  };
}

// ---- CSV -------------------------------------------------------------------

function appendResults(results: SampleResult[]): void {
  const timestamp = new Date().toISOString();
  const rows = results.map((r) =>
    [
      timestamp,
      r.sample.name,
      r.sample.isNegative,
      r.sample.isNegative ? 0 : r.sample.expected.medicines.length,
      r.extractedCount,
      r.matched,
      r.nameAccuracy ?? '',
      r.dosageAccuracy ?? '',
      r.frequencyAccuracy ?? '',
      r.durationAccuracy ?? '',
      r.falseRate,
      r.missingRate,
      r.hallucination,
    ].join(',')
  );
  const isNew = !fs.existsSync(RESULTS_CSV);
  fs.appendFileSync(RESULTS_CSV, (isNew ? CSV_HEADER + '\n' : '') + rows.join('\n') + '\n');
}

// ---- Main ------------------------------------------------------------------

const pct = (v: number | null) => (v === null ? '  n/a ' : `${(v * 100).toFixed(1).padStart(5)}%`);

async function main(): Promise<void> {
  loadDotEnv(path.join(__dirname, '..'));
  const samples = discoverSamples();
  if (samples.length === 0) {
    console.log('No golden samples found in eval/golden/.');
    console.log('Add a photo plus a hand-labeled <name>.expected.json — see eval/README.md.');
    return;
  }

  console.log(`Running ${samples.length} golden sample(s) through the OCR pipeline...\n`);
  const results: SampleResult[] = [];
  for (const sample of samples) {
    try {
      const extracted = await extractMedicines(sample);
      const result = evaluateSample(sample, extracted);
      results.push(result);
      console.log(
        `${sample.isNegative ? '[NEGATIVE] ' : ''}${sample.name}: ` +
          `extracted=${result.extractedCount} matched=${result.matched} ` +
          `name=${pct(result.nameAccuracy)} dosage=${pct(result.dosageAccuracy)} ` +
          `freq=${pct(result.frequencyAccuracy)} dur=${pct(result.durationAccuracy)} ` +
          (sample.isNegative
            ? result.hallucination
              ? 'HALLUCINATED (worst failure mode)'
              : 'clean'
            : `false=${(result.falseRate * 100).toFixed(0)}% missing=${(result.missingRate * 100).toFixed(0)}%`)
      );
    } catch (error) {
      console.error(`${sample.name}: FAILED - ${(error as Error).message}`);
    }
  }

  if (results.length > 0) {
    appendResults(results);
    const positives = results.filter((r) => !r.sample.isNegative);
    const negatives = results.filter((r) => r.sample.isNegative);
    const mean = (vals: number[]) =>
      vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0) / vals.length;
    console.log('\n--- Run summary ---');
    console.log(`Name accuracy (mean):      ${pct(mean(positives.map((r) => r.nameAccuracy).filter((v): v is number => v !== null)))}`);
    console.log(`Dosage accuracy (mean):    ${pct(mean(positives.map((r) => r.dosageAccuracy).filter((v): v is number => v !== null)))}`);
    console.log(`Frequency accuracy (mean): ${pct(mean(positives.map((r) => r.frequencyAccuracy).filter((v): v is number => v !== null)))}`);
    console.log(`Duration accuracy (mean):  ${pct(mean(positives.map((r) => r.durationAccuracy).filter((v): v is number => v !== null)))}`);
    console.log(`False-medicine rate:       ${pct(mean(positives.map((r) => r.falseRate)))}`);
    console.log(`Missing-medicine rate:     ${pct(mean(positives.map((r) => r.missingRate)))}`);
    console.log(
      `Negative tests:            ${negatives.filter((r) => !r.hallucination).length}/${negatives.length} clean`
    );
    console.log('\nAppended per-sample rows to eval/results.csv');
  }
}

main().catch((error) => {
  console.error('Eval run failed:', error);
  process.exit(1);
});
